import test from "node:test";
import assert from "node:assert/strict";
import { createSessionToken } from "./auth-service.mjs";
import worker, { checkDailyCheerAllowance } from "./worker.mjs";

const TEST_SECRET = "worker-cheer-test-secret-that-is-long-enough";
const KST_NOON = Date.UTC(2026, 6, 27, 3, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1_000;

function memoryKv() {
  const values = new Map();
  return {
    values,
    async get(key, type) {
      const value = values.get(key);
      if (value === undefined) return null;
      if (type === "json" || type?.type === "json") return JSON.parse(value);
      return value;
    },
    async put(key, value) {
      values.set(key, String(value));
    },
    async delete(key) {
      values.delete(key);
    },
    async list({ prefix = "" } = {}) {
      return { keys: [...values.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })), list_complete: true, cursor: "" };
    },
  };
}

async function authenticatedWorker({ plan = "pro", userId = `cheer-${plan}` } = {}) {
  const kv = memoryKv();
  const now = Date.now();
  const sessionId = `session-${userId}`;
  await kv.put(`user:${userId}`, JSON.stringify({
    id: userId,
    provider: "google",
    name: "치어링 테스터",
    email: `${userId}@example.test`,
    role: "member",
    status: "active",
    plan,
    createdAt: now - 1_000,
    lastLoginAt: now,
  }));
  await kv.put(`session:${sessionId}`, JSON.stringify({ id: sessionId, userId, createdAt: now, expiresAt: now + 60 * 60 * 1_000, revokedAt: null }));
  const token = await createSessionToken({ sid: sessionId, sub: userId, role: "member", iat: now, exp: now + 60 * 60 * 1_000 }, TEST_SECRET);
  return {
    kv,
    userId,
    cookie: `omw_session=${token}`,
    env: {
      APP_ENV: "test",
      SESSION_SECRET: TEST_SECRET,
      USERS_KV: kv,
      OPENAI_API_KEY: "test-openai-key",
      OPENAI_MODEL: "test-model",
    },
  };
}

async function callCheer(context, { eventType, message = "오늘 계획을 전부 완료했어요!", requestId } = {}) {
  const headers = new Headers({ Cookie: context.cookie, "Content-Type": "application/json" });
  if (requestId) headers.set("X-Request-ID", requestId);
  const response = await worker.fetch(
    new Request("https://onmyway.example.test/api/ai/companion-chat", {
      method: "POST",
      headers,
      body: JSON.stringify(eventType === undefined ? { message } : { message, eventType }),
    }),
    context.env,
  );
  return { response, body: await response.json() };
}

function companionReplyMock(onCall = () => {}, { fail = false } = {}) {
  return async (url, options = {}) => {
    onCall({ url: String(url), requestBody: JSON.parse(options.body || "{}") });
    if (fail) return new Response(JSON.stringify({ error: { message: "upstream down" } }), { status: 500, headers: { "Content-Type": "application/json" } });
    return new Response(
      JSON.stringify({ output_text: JSON.stringify({ headline: "오늘 전부 해냈어요", reply: "이 흐름 올리가 기억할게요." }), usage: { input_tokens: 5, output_tokens: 2 } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
}

async function withMockFetch(mock, operation) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await operation();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("치어링 하루 상한은 같은 날 두 번째를 거부하고, 종류별로 따로 세며, 다음 날 리셋된다", () => {
  const first = checkDailyCheerAllowance({ id: "u" }, "celebrate", KST_NOON);
  assert.equal(first.allowed, true);
  assert.equal(first.user.cheerLog.date, "2026-07-27");

  // 같은 날 두 번째 축하는 거부되고, 유저 레코드도 바뀌지 않는다
  const second = checkDailyCheerAllowance(first.user, "celebrate", KST_NOON + 60_000);
  assert.equal(second.allowed, false);
  assert.deepEqual(second.user, first.user);

  // 위로는 축하와 독립적으로 하루 1회를 쓴다
  const comfort = checkDailyCheerAllowance(first.user, "comfort", KST_NOON + 60_000);
  assert.equal(comfort.allowed, true);
  assert.equal(checkDailyCheerAllowance(comfort.user, "comfort", KST_NOON + 120_000).allowed, false);
  assert.equal(checkDailyCheerAllowance(comfort.user, "celebrate", KST_NOON + 120_000).allowed, false);

  // 날짜 버킷이 바뀌면 두 종류 모두 다시 열린다
  const nextDay = checkDailyCheerAllowance(comfort.user, "celebrate", KST_NOON + DAY_MS);
  assert.equal(nextDay.allowed, true);
  assert.equal(nextDay.user.cheerLog.date, "2026-07-28");
  assert.equal(nextDay.user.cheerLog.comfort, undefined);
  assert.equal(checkDailyCheerAllowance(comfort.user, "comfort", KST_NOON + DAY_MS).allowed, true);
});

test("상한은 KST 자정을 경계로 바뀐다", () => {
  const beforeMidnight = Date.UTC(2026, 6, 27, 14, 59, 0); // KST 2026-07-27 23:59
  const afterMidnight = Date.UTC(2026, 6, 27, 15, 1, 0); // KST 2026-07-28 00:01
  const used = checkDailyCheerAllowance({ id: "u" }, "celebrate", beforeMidnight);
  assert.equal(used.allowed, true);
  assert.equal(checkDailyCheerAllowance(used.user, "celebrate", beforeMidnight + 30_000).allowed, false);
  assert.equal(checkDailyCheerAllowance(used.user, "celebrate", afterMidnight).allowed, true);
});

test("자동 치어링은 크레딧을 차감하지 않고 하루 각 1회만 AI를 호출한다", { concurrency: false }, async () => {
  const context = await authenticatedWorker({ userId: "cheer-limit-user" });
  const calls = [];
  await withMockFetch(companionReplyMock((call) => calls.push(call)), async () => {
    const celebrate = await callCheer(context, { eventType: "celebrate", requestId: "cheer:1" });
    assert.equal(celebrate.response.status, 200);
    assert.equal(celebrate.body.ok, true);
    assert.equal(celebrate.body.chargedCredits, 0);
    assert.equal(celebrate.body.eventType, "celebrate");
    assert.equal(celebrate.body.headline, "오늘 전부 해냈어요");
    // 무료 치어링은 usage를 돌려주지 않는다 — 클라이언트 잔량 표시가 흔들리면 안 된다.
    assert.equal(celebrate.body.usage, undefined);

    const repeated = await callCheer(context, { eventType: "celebrate", requestId: "cheer:2" });
    assert.equal(repeated.response.status, 429);
    assert.equal(repeated.body.code, "CHEER_LIMIT_REACHED");

    // 위로는 별도 카운터라 같은 날에도 한 번 더 받을 수 있다
    const comfort = await callCheer(context, { eventType: "comfort", requestId: "cheer:3" });
    assert.equal(comfort.response.status, 200);
    assert.equal(comfort.body.eventType, "comfort");
  });

  // 상한 초과 요청은 AI를 부르지 않는다 (비용이 발생하면 안 된다)
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.requestBody.input.split("\n")[0]), ["상황: celebrate", "상황: comfort"]);
  // 이벤트별 지침이 실제로 프롬프트에 들어간다
  assert.match(calls[0].requestBody.instructions, /오늘 완료 축하/);
  assert.match(calls[1].requestBody.instructions, /놓친 일정 위로/);

  const stored = await context.kv.get(`user:${context.userId}`, "json");
  assert.equal(typeof stored.cheerLog.celebrate, "number");
  assert.equal(typeof stored.cheerLog.comfort, "number");
  // 에너지(크레딧) 원장은 자동 치어링으로 열리지 않는다
  assert.equal(stored.aiCredits, undefined);
});

test("AI 실패는 오늘의 무료 치어링을 소진하지 않는다", { concurrency: false }, async () => {
  const context = await authenticatedWorker({ userId: "cheer-retry-user" });
  await withMockFetch(companionReplyMock(() => {}, { fail: true }), async () => {
    const failed = await callCheer(context, { eventType: "celebrate", requestId: "cheer-retry:1" });
    assert.equal(failed.response.ok, false);
  });
  assert.equal((await context.kv.get(`user:${context.userId}`, "json")).cheerLog, undefined);

  await withMockFetch(companionReplyMock(), async () => {
    const retried = await callCheer(context, { eventType: "celebrate", requestId: "cheer-retry:2" });
    assert.equal(retried.response.status, 200);
    assert.equal(retried.body.chargedCredits, 0);
  });
  assert.equal(typeof (await context.kv.get(`user:${context.userId}`, "json")).cheerLog.celebrate, "number");
});

test("유저가 먼저 말 거는 대화는 치어링 상한과 무관하게 크레딧을 쓴다", { concurrency: false }, async () => {
  const context = await authenticatedWorker({ userId: "cheer-chat-user" });
  await withMockFetch(companionReplyMock(), async () => {
    for (const eventType of [undefined, "chat", "unknown-event"]) {
      const chat = await callCheer(context, { eventType, message: "오늘 무엇부터 할까요?", requestId: `chat:${eventType}` });
      assert.equal(chat.response.status, 200);
      assert.equal(chat.body.chargedCredits, 1);
      assert.ok(chat.body.usage);
    }
  });
  // 대화는 치어링 로그를 건드리지 않는다
  assert.equal((await context.kv.get(`user:${context.userId}`, "json")).cheerLog, undefined);
});
