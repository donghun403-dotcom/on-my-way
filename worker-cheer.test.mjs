/* 무료 치어링(축하·위로) 하루 각 1회 상한의 회계·부수효과 불변식.
 *
 * 이 상한이 묶는 것은 크레딧이 아니라 provider 호출이다. 그래서 회계 불변식만으로는
 * 부족하고 반드시 짝으로 단언한다(CONTRIBUTING.md의 테스트 규칙):
 *
 *   회계 불변식   — 하루에 종류별로 자리가 한 번만 잡힌다
 *   부수효과 불변식 — provider가 그만큼만 불린다 (호출 카운터로 센다)
 *
 * 상한이 KV(모듈 스코프 락)에서 EnergyLedger DO로 옮겨졌으므로 이 파일의 테스트는
 * 전부 원장을 통해 판정한다. KV의 user.cheerLog는 더 이상 근거가 아니다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSessionToken } from "./auth-service.mjs";
import worker from "./worker.mjs";
import { memoryKv, durableObjectNamespace } from "./test-helpers/worker-env.mjs";
import { createEnergyLedgerClient } from "./energy-ledger-client.mjs";
import { CHEER_SLOTS, normalizeLedgerState } from "./energy-ledger.mjs";
import { CHEER_EVENT_TYPES } from "./ai-companion-chat.mjs";

const TEST_SECRET = "worker-cheer-test-secret-that-is-long-enough";

async function authenticatedWorker({ plan = "pro", userId = `cheer-${plan}`, ledger = durableObjectNamespace() } = {}) {
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
    ledger,
    env: {
      APP_ENV: "test",
      SESSION_SECRET: TEST_SECRET,
      USERS_KV: kv,
      ...(ledger ? { ENERGY_LEDGER: ledger } : {}),
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

function ledgerClient(context) {
  return createEnergyLedgerClient({ ENERGY_LEDGER: context.ledger });
}

/* 상한의 근거는 이제 원장 상태다. 잔량이나 KV 레코드로 재면 "안 썼을 뿐"과
   "자리를 잡았다"를 구분하지 못한다. */
async function cheerClaim(context, eventType, { plan = "pro" } = {}) {
  return ledgerClient(context).cheerClaim(context.userId, { plan, eventType });
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

/* ---------- 상한 자체 (원장 연산) ---------- */

test("치어링 상한은 종류별로 따로 세고 같은 날 두 번째를 거부한다", async () => {
  const context = await authenticatedWorker({ userId: "cheer-slots" });

  assert.equal((await cheerClaim(context, "celebrate")).claimed, true);
  assert.equal((await cheerClaim(context, "celebrate")).claimed, false, "같은 날 두 번째 축하가 통과했다");
  // 위로는 축하와 독립적인 슬롯이다
  assert.equal((await cheerClaim(context, "comfort")).claimed, true);
  assert.equal((await cheerClaim(context, "comfort")).claimed, false);
});

test("잡은 자리를 되돌리면 같은 날에도 다시 잡을 수 있다", async () => {
  const context = await authenticatedWorker({ userId: "cheer-release" });
  const client = ledgerClient(context);

  assert.equal((await cheerClaim(context, "celebrate")).claimed, true);
  assert.equal((await client.cheerRelease(context.userId, { plan: "pro", eventType: "celebrate" })).released, true);
  assert.equal((await cheerClaim(context, "celebrate")).claimed, true);

  // 되돌릴 것이 없으면 아무 일도 하지 않는다 (멱등)
  await client.cheerRelease(context.userId, { plan: "pro", eventType: "celebrate" });
  assert.equal((await client.cheerRelease(context.userId, { plan: "pro", eventType: "celebrate" })).released, false);
});

/* 슬롯은 KST 자정에 다시 열린다. 경계를 안 보면 한 번 쓴 유저가 영영 막히고,
   버킷 키를 안 쓰면 상한이 하루가 아니라 요청마다가 된다. */
test("치어링 슬롯은 KST 자정을 경계로 다시 열린다", async () => {
  const context = await authenticatedWorker({ userId: "cheer-midnight" });
  const client = ledgerClient(context);
  const beforeMidnight = Date.UTC(2026, 6, 27, 14, 59, 0); // KST 2026-07-27 23:59
  const afterMidnight = Date.UTC(2026, 6, 27, 15, 1, 0); // KST 2026-07-28 00:01

  assert.equal((await client.cheerClaim(context.userId, { plan: "pro", eventType: "celebrate", now: beforeMidnight })).claimed, true);
  assert.equal((await client.cheerClaim(context.userId, { plan: "pro", eventType: "celebrate", now: beforeMidnight + 30_000 })).claimed, false);
  assert.equal(
    (await client.cheerClaim(context.userId, { plan: "pro", eventType: "celebrate", now: afterMidnight })).claimed,
    true,
    "자정이 지나도 자리가 열리지 않았다 — 한 번 쓴 유저가 영영 막힌다",
  );
});

test("지원하지 않는 응원 종류는 슬롯을 만들지 않고 400으로 막힌다", async () => {
  const context = await authenticatedWorker({ userId: "cheer-bad-slot" });
  await assert.rejects(
    () => cheerClaim(context, "applause"),
    (error) => error.code === "INVALID_CHEER_EVENT" && error.status === 400,
  );
});

/* 원장이 아는 슬롯과 워커가 정규화하는 이벤트 종류가 갈라지면, 새 종류가 상한 없이
   provider를 부르거나 정상 요청이 400으로 막힌다. 양쪽 다 조용히 벌어진다. */
test("원장의 치어링 슬롯과 채팅 모듈의 이벤트 종류가 같다", () => {
  assert.deepEqual([...CHEER_SLOTS].sort(), [...CHEER_EVENT_TYPES].sort());
});

/* ---------- 기존 레코드 호환 ---------- */

/* dailyCheer가 없던 시절의 상태 레코드가 그대로 읽힌다. 필드가 없다고 상한이 걸리면
   기존 유저가 전부 막히고, 반대로 정규화가 빠지면 undefined에 쓰다가 터진다. */
test("dailyCheer가 없는 기존 레코드도 빈 값으로 읽힌다", () => {
  const legacy = {
    schemaVersion: 1,
    balance: 40,
    reserved: 0,
    daily: { key: "2026-07-30", spent: 3, reserved: 0 },
    requests: {},
    purchases: {},
  };
  const state = normalizeLedgerState(legacy, Date.UTC(2026, 6, 30, 3, 0, 0));
  assert.deepEqual(state.dailyCheer, { key: "", celebrate: 0, comfort: 0 });
  // 기존 필드는 그대로 살아 있어야 한다 — 정규화가 다른 값을 덮어쓰면 안 된다.
  assert.equal(state.balance, 40);
  assert.equal(state.daily.spent, 3);

  /* 빈 값만 단언하면 "정규화가 통째로 빠진" 경우와 구분되지 않는다 — 그때도 기본값이
     나온다. 저장된 값이 살아 돌아오는 것까지 봐야 왕복이 고정된다. */
  const carried = normalizeLedgerState(
    { ...legacy, dailyCheer: { key: "2026-07-30", celebrate: 1_700_000_000_000, comfort: 0 } },
    Date.UTC(2026, 6, 30, 3, 0, 0),
  );
  assert.deepEqual(carried.dailyCheer, { key: "2026-07-30", celebrate: 1_700_000_000_000, comfort: 0 });

  // 망가진 값은 조용히 통과시키지 않고 "안 썼다"로 떨어뜨린다.
  const corrupt = normalizeLedgerState(
    { ...legacy, dailyCheer: { key: 42, celebrate: "yes", comfort: -5 } },
    Date.UTC(2026, 6, 30, 3, 0, 0),
  );
  assert.deepEqual(corrupt.dailyCheer, { key: "42", celebrate: 0, comfort: 0 });
});

test("기존 레코드로 시작해도 오늘의 자리는 정상적으로 잡히고 한 번만 잡힌다", async () => {
  const context = await authenticatedWorker({ userId: "cheer-legacy" });
  const client = ledgerClient(context);
  // 원장을 한 번 깨워 dailyCheer 없이 저장된 상태를 만든다 — usage는 상태를 쓰고 나온다.
  await client.usage(context.userId, { plan: "pro" });

  assert.equal((await cheerClaim(context, "celebrate")).claimed, true);
  assert.equal((await cheerClaim(context, "celebrate")).claimed, false);
});

/* ---------- 플랜 전환 경계 ---------- */

/* 상한 보장이 플랜 전환 이벤트에 의존해서는 안 된다. state.daily 안에 뒀다면
   resetLedgerForPlan이 통째로 비워서 전환 한 번에 오늘 치어링이 되살아났을 것이다. */
test("정당한 플랜 전환은 오늘 쓴 치어링을 되살리지 않는다", async () => {
  const context = await authenticatedWorker({ userId: "cheer-plan-switch" });
  assert.equal((await cheerClaim(context, "celebrate")).claimed, true);

  await ledgerClient(context).reset(context.userId, { plan: "pro", reason: "plan_change" });

  assert.equal(
    (await cheerClaim(context, "celebrate")).claimed,
    false,
    "전환 뒤 자리가 다시 열렸다 — 전환을 반복하면 상한이 사라진다",
  );
});

/* ---------- 라우트: 회계 + 부수효과 ---------- */

test("자동 치어링은 크레딧을 쓰지 않고 하루 각 1회만 provider를 부른다", { concurrency: false }, async () => {
  const context = await authenticatedWorker({ userId: "cheer-limit-user" });
  const calls = [];
  await withMockFetch(companionReplyMock((call) => calls.push(call)), async () => {
    const celebrate = await callCheer(context, { eventType: "celebrate", requestId: "cheer:1" });
    assert.equal(celebrate.response.status, 200);
    assert.equal(celebrate.body.chargedCredits, 0);
    assert.equal(celebrate.body.eventType, "celebrate");
    assert.equal(celebrate.body.headline, "오늘 전부 해냈어요");
    // 무료 치어링은 usage를 돌려주지 않는다 — 클라이언트 잔량 표시가 흔들리면 안 된다.
    assert.equal(celebrate.body.usage, undefined);

    const repeated = await callCheer(context, { eventType: "celebrate", requestId: "cheer:2" });
    assert.equal(repeated.response.status, 429);
    assert.equal(repeated.body.code, "CHEER_LIMIT_REACHED");

    // 위로는 별도 슬롯이라 같은 날에도 한 번 더 받을 수 있다
    const comfort = await callCheer(context, { eventType: "comfort", requestId: "cheer:3" });
    assert.equal(comfort.response.status, 200);
    assert.equal(comfort.body.eventType, "comfort");
  });

  // 부수효과: 상한 초과 요청은 provider를 부르지 않는다 (실제 AI 비용이 걸린 자리다)
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.requestBody.input.split("\n")[0]), ["상황: celebrate", "상황: comfort"]);
  // 이벤트별 지침이 실제로 프롬프트에 들어간다
  assert.match(calls[0].requestBody.instructions, /오늘 완료 축하/);
  assert.match(calls[1].requestBody.instructions, /놓친 일정 위로/);

  // 회계: 두 슬롯 모두 소진돼 있다
  assert.equal((await cheerClaim(context, "celebrate")).claimed, false);
  assert.equal((await cheerClaim(context, "comfort")).claimed, false);
  // 크레딧 원장은 자동 치어링으로 줄지 않는다
  assert.equal((await ledgerClient(context).usage(context.userId, { plan: "pro" })).daily.used, 0);
});

test("AI 실패는 오늘의 무료 치어링을 소진하지 않는다", { concurrency: false }, async () => {
  const context = await authenticatedWorker({ userId: "cheer-retry-user" });
  let providerCalls = 0;
  await withMockFetch(companionReplyMock(() => { providerCalls += 1; }, { fail: true }), async () => {
    const failed = await callCheer(context, { eventType: "celebrate", requestId: "cheer-retry:1" });
    assert.equal(failed.response.ok, false);
  });
  assert.equal(providerCalls, 1);

  await withMockFetch(companionReplyMock(() => { providerCalls += 1; }), async () => {
    const retried = await callCheer(context, { eventType: "celebrate", requestId: "cheer-retry:2" });
    assert.equal(retried.response.status, 200, "실패 뒤 자리가 되돌려지지 않아 재시도가 막혔다");
    assert.equal(retried.body.chargedCredits, 0);
  });
  assert.equal(providerCalls, 2);
  assert.equal((await cheerClaim(context, "celebrate")).claimed, false, "성공한 재시도가 자리를 소진하지 않았다");
});

/* 확인만 하고 AI를 부른 뒤 기록하면 겹친 요청이 전부 통과해 provider 비용이 중복된다.
   자리를 먼저 잡아야 하고, 그 잡기가 직렬화돼야 한다 — 그것이 DO로 옮긴 이유다. */
test("동시에 들어온 치어링 요청 중 하나만 200을 받고 provider도 한 번만 불린다", { concurrency: false }, async () => {
  const context = await authenticatedWorker({ userId: "cheer-race-route-user" });
  let providerCalls = 0;
  const responses = await withMockFetch(companionReplyMock(() => { providerCalls += 1; }), () =>
    Promise.all(Array.from({ length: 4 }, (_, index) =>
      callCheer(context, { eventType: "celebrate", requestId: `race:${index}` }))));

  const ok = responses.filter(({ response }) => response.status === 200);
  const limited = responses.filter(({ response }) => response.status === 429);
  assert.equal(ok.length, 1);
  assert.equal(limited.length, 3);
  assert.ok(limited.every(({ body }) => body.code === "CHEER_LIMIT_REACHED"));
  assert.equal(providerCalls, 1);
});

/* 자리잡기는 AI 호출보다 먼저다. 그 호출이 원장 오류로 던지면 예외가 try 밖으로
   빠져나가 워커가 형식 없는 500을 내보낸다. 크레딧 예약이 실패했을 때와 같은
   모양이어야 클라이언트가 같은 경로로 처리한다. */
test("자리잡기가 원장 오류로 실패해도 형식을 갖춘 AI 오류로 응답한다", { concurrency: false }, async () => {
  const failing = durableObjectNamespace();
  const realGet = failing.get.bind(failing);
  failing.get = (name) => ({
    async fetch(input, init) {
      const request = input instanceof Request ? input : new Request(input, init);
      if (new URL(request.url).pathname === "/cheer-claim") throw new Error("ledger unreachable");
      return realGet(name).fetch(request);
    },
  });
  const context = await authenticatedWorker({ userId: "cheer-ledger-fail-user", ledger: failing });

  let providerCalls = 0;
  const originalConsoleError = console.error;
  console.error = () => {};
  let outcome;
  try {
    outcome = await withMockFetch(companionReplyMock(() => { providerCalls += 1; }), () =>
      callCheer(context, { eventType: "celebrate", requestId: "cheer-ledger-fail:1" }));
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(outcome.response.status, 500);
  assert.equal(outcome.body.ok, false);
  assert.equal(outcome.body.code, "AI_REQUEST_FAILED");
  // 자리를 잡지 못했으면 provider도 부르지 않는다 — 비용이 발생하면 안 된다.
  assert.equal(providerCalls, 0);
});

/* ---------- 원장 없이는 치어링도 열리지 않는다 ---------- */

/* 원장 장애 때 유료 대화만 503으로 막고 상한 없는 무료 AI를 열어 두면 최악의 조합이다.
   AI를 부르는 모든 경로는 원장을 통과한다. */
test("원장 바인딩이 없으면 무료 치어링도 503으로 막힌다", { concurrency: false }, async () => {
  const context = await authenticatedWorker({ userId: "cheer-no-ledger", ledger: null });
  let providerCalls = 0;
  const originalConsoleError = console.error;
  console.error = () => {};
  let outcome;
  try {
    outcome = await withMockFetch(companionReplyMock(() => { providerCalls += 1; }), () =>
      callCheer(context, { eventType: "celebrate", requestId: "cheer-no-ledger:1" }));
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(outcome.response.status, 503);
  assert.equal(outcome.body.code, "ENERGY_LEDGER_UNAVAILABLE");
  assert.equal(providerCalls, 0, "원장이 없는데 provider가 불렸다 — 상한 없이 비용이 난다");
});

/* 막힘 문구는 올리 목소리다(캐릭터 바이블 7장): 짧고 솔직하게, 위로로만 끝내지 않는다.
   raw 에러 문자열이 유저에게 그대로 나가는 회귀를 막는다. */
test("원장 장애 문구는 올리 목소리이고 사실로 끝난다", { concurrency: false }, async () => {
  const context = await authenticatedWorker({ userId: "cheer-voice", ledger: null });
  const originalConsoleError = console.error;
  console.error = () => {};
  let outcome;
  try {
    outcome = await withMockFetch(companionReplyMock(), () =>
      callCheer(context, { eventType: "celebrate", requestId: "cheer-voice:1" }));
  } finally {
    console.error = originalConsoleError;
  }

  const message = outcome.body.error;
  assert.match(message, /올리/, "올리를 주어로 말하지 않는다");
  assert.match(message, /다시 시도/, "할 수 있는 일이 없다");
  assert.match(message, /에너지는 하나도 쓰지 않았어요/, "위로만 남고 사실이 없다");
  assert.doesNotMatch(message, /실패|오류|에러|unavailable|Error/i, "raw 에러 표현이 그대로 나갔다");
});

/* ---------- 경계: 대화는 상한과 무관하다 ---------- */

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
  // 대화는 치어링 슬롯을 건드리지 않는다
  assert.equal((await cheerClaim(context, "celebrate")).claimed, true);
  assert.equal((await cheerClaim(context, "comfort")).claimed, true);
});

/* ---------- 되돌아가지 않게 고정 ---------- */

/* KV 경로가 되살아나면 colo 간 상호배제가 없는 상태로 조용히 돌아간다.
   폐지한 구현의 이름이 worker에 다시 나타나지 않는지 본다. */
test("worker는 KV 기반 치어링 상한으로 돌아가지 않는다", () => {
  const source = readFileSync(new URL("./worker.mjs", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /claimDailyCheer|releaseDailyCheer|checkDailyCheerAllowance/, "KV 상한 구현이 되살아났다");
  assert.doesNotMatch(code, /cheerLog/, "cheerLog를 다시 읽는다");
  assert.doesNotMatch(code, /withAiCreditUserLock/, "아이솔레이트 스코프 락이 되살아났다");
  assert.match(code, /ledger\.cheerClaim\(/, "원장 상한을 쓰지 않는다");
});
