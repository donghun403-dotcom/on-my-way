// worker → EnergyLedger DO 통합 테스트.
//
// energy-ledger.test.mjs가 원장 로직을 보는 반면 여기서는 실제 라우트가 DO를 거쳐
// 차감·원복·조회하는지, 그리고 동시 요청이 이중 차감되지 않는지를 본다.
import test from "node:test";
import assert from "node:assert/strict";
import { createSessionToken } from "./auth-service.mjs";
import worker from "./worker.mjs";
import { EnergyLedgerObject } from "./energy-ledger-object.mjs";
import { AI_CREDIT_COSTS, PLAN_CONFIG } from "./plan-policy.mjs";

const TEST_SECRET = "worker-energy-ledger-test-secret-that-is-long-enough";

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
    async put(key, value) { values.set(key, String(value)); },
    async delete(key) { values.delete(key); },
    async list({ prefix = "" } = {}) {
      return { keys: [...values.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true, cursor: "" };
    },
  };
}

/* 실제 DO를 흉내 낸다. 중요한 성질 두 가지를 지킨다:
   ① id마다 인스턴스가 하나다   ② 그 인스턴스의 요청은 직렬로 처리된다.
   이 두 가지가 이중 차감을 막는 근거이므로 스텁도 반드시 이렇게 동작해야 한다. */
function durableObjectNamespace() {
  const instances = new Map();
  const queues = new Map();

  function instanceFor(name) {
    if (!instances.has(name)) {
      const values = new Map();
      const storage = {
        async get(key) { const v = values.get(key); return v === undefined ? undefined : structuredClone(v); },
        async put(key, value) { values.set(key, structuredClone(value)); },
        async delete(key) { values.delete(key); },
        async list({ prefix = "" } = {}) {
          const out = new Map();
          for (const [k, v] of [...values.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
            if (k.startsWith(prefix)) out.set(k, structuredClone(v));
          }
          return out;
        },
        // 트랜잭션: 콜백이 던지면 변경을 되돌린다.
        async transaction(callback) {
          const snapshot = new Map([...values.entries()].map(([k, v]) => [k, structuredClone(v)]));
          try {
            return await callback(storage);
          } catch (error) {
            values.clear();
            for (const [k, v] of snapshot) values.set(k, v);
            throw error;
          }
        },
      };
      instances.set(name, new EnergyLedgerObject({ storage }, {}));
    }
    return instances.get(name);
  }

  return {
    idFromName(name) { return name; },
    get(name) {
      return {
        // 실제 DO stub과 같은 시그니처: fetch(url, init) 또는 fetch(Request).
        async fetch(input, init) {
          const request = input instanceof Request ? input : new Request(input, init);
          // 인스턴스당 단일 실행: 앞선 요청이 끝나야 다음이 시작된다.
          const previous = queues.get(name) || Promise.resolve();
          const current = previous.catch(() => {}).then(() => instanceFor(name).fetch(request));
          queues.set(name, current.catch(() => {}));
          return current;
        },
      };
    },
  };
}

async function harness({ plan = "pro", userId = "energy-user", aiHandler } = {}) {
  const kv = memoryKv();
  const now = Date.now();
  const sessionId = `session-${userId}`;
  const user = {
    id: userId,
    provider: "google",
    name: "테스트 회원",
    email: `${userId}@example.test`,
    role: "member",
    status: "active",
    plan,
    createdAt: now - 1_000,
  };
  const session = { id: sessionId, userId, createdAt: now, expiresAt: now + 60 * 60 * 1_000, revokedAt: null };
  await kv.put(`user:${userId}`, JSON.stringify(user));
  await kv.put(`session:${sessionId}`, JSON.stringify(session));
  const token = await createSessionToken(
    { sid: sessionId, sub: userId, role: "member", iat: now, exp: session.expiresAt },
    TEST_SECRET,
  );

  const env = {
    USERS_KV: kv,
    SESSION_SECRET: TEST_SECRET,
    OPENAI_API_KEY: "fixture-key",
    OPENAI_MODEL: "gpt-5.4-mini",
    APP_ENV: "test",
    PAYMENTS_ENABLED: "false",
    AI_RATE_LIMITER: { async limit() { return { success: true }; } },
    GUEST_PLAN_DRAFTS: durableObjectNamespace(),
    ENERGY_LEDGER: durableObjectNamespace(),
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = aiHandler || (async () => new Response(JSON.stringify({
    output: [{ content: [{ type: "output_text", text: JSON.stringify({ headline: "좋아요", reply: "오늘도 한 걸음!" }) }] }],
    usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
  }), { status: 200, headers: { "content-type": "application/json" } }));

  return {
    env,
    restore() { globalThis.fetch = originalFetch; },
    chat(requestId, message = "안녕") {
      return worker.fetch(new Request("https://app.example/api/ai/companion-chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `omw_session=${token}`,
          "x-request-id": requestId,
        },
        body: JSON.stringify({ message, context: { goal: "테스트" } }),
      }), env);
    },
    book(requestId, monthKey = "2026-07") {
      return worker.fetch(new Request("https://app.example/api/ai/diary-book", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `omw_session=${token}`,
          "x-request-id": requestId,
        },
        body: JSON.stringify({ monthKey, goal: "테스트 목표", summary: { entryCount: 3, averageCompletion: 50 } }),
      }), env);
    },
    usage() {
      return worker.fetch(new Request("https://app.example/api/ai/usage", {
        headers: { cookie: `omw_session=${token}` },
      }), env);
    },
  };
}

/* 다이어리 북은 머리말과 편지 두 번을 부른다. 두 응답 모두 같은 mock으로 돌려준다 —
   스키마 이름으로 갈라 주지 않아도 두 필드가 다 있으면 각자 필요한 것만 읽는다. */
function bookAiHandler({ failLetter = false } = {}) {
  let calls = 0;
  const handler = async (url, options = {}) => {
    calls += 1;
    const body = JSON.parse(options?.body || "{}");
    const isLetter = body.text?.format?.name === "diary_book_letter";
    if (isLetter && failLetter) return new Response("letter boom", { status: 500 });
    const payload = isLetter ? { letter: "그 달의 편지예요." } : { title: "작게 시작한 달", foreword: "둥실, 이 달의 이야기예요." };
    return new Response(JSON.stringify({ output_text: JSON.stringify(payload), usage: { input_tokens: 10, output_tokens: 10 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  handler.callCount = () => calls;
  return handler;
}

test("에너지 조회는 DO 원장의 잔량을 돌려준다", async () => {
  const app = await harness({ plan: "pro" });
  try {
    const body = await (await app.usage()).json();
    assert.equal(body.ok, true);
    assert.equal(body.balance, PLAN_CONFIG.pro.monthlyCredits, "첫 조회에 lazy-grant가 일어나야 한다");
    assert.equal(body.monthly.remaining, PLAN_CONFIG.pro.monthlyCredits);
    assert.ok("available" in body, "지갑 모델의 가용 잔량이 응답에 있어야 한다");
  } finally {
    app.restore();
  }
});

test("AI 호출 성공이 원장에서 차감되고 응답에 최신 잔량이 실린다", async () => {
  const app = await harness({ plan: "pro" });
  try {
    const response = await app.chat("req-success");
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.chargedCredits, AI_CREDIT_COSTS.companion_chat);
    assert.equal(body.usage.balance, PLAN_CONFIG.pro.monthlyCredits - AI_CREDIT_COSTS.companion_chat);

    const after = await (await app.usage()).json();
    assert.equal(after.balance, body.usage.balance, "조회 잔량과 응답 잔량이 일치해야 한다");
  } finally {
    app.restore();
  }
});

test("AI 실패 시 원장이 원복되어 잔량이 그대로다", async () => {
  const app = await harness({
    plan: "pro",
    aiHandler: async () => new Response("upstream boom", { status: 500 }),
  });
  try {
    const response = await app.chat("req-fail");
    assert.notEqual(response.status, 200);

    const after = await (await app.usage()).json();
    assert.equal(after.balance, PLAN_CONFIG.pro.monthlyCredits, "실패한 호출은 재화를 먹지 않아야 한다");
    assert.equal(after.daily.used, 0);
  } finally {
    app.restore();
  }
});

/* 스펙 6장: 위기 신호에는 고정 응답을 주고 에너지를 차감하지 않는다.
   힘든 말을 꺼낸 대가로 잔량이 줄면 안 되고, 그 답을 모델에 맡겨서도 안 된다. */
test("위기 신호는 AI를 부르지 않고 에너지도 차감하지 않는다", async () => {
  let providerCalls = 0;
  const app = await harness({
    plan: "pro",
    aiHandler: async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({
        output: [{ content: [{ type: "output_text", text: JSON.stringify({ headline: "h", reply: "r" }) }] }],
        usage: {},
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  try {
    const response = await app.chat("req-crisis", "요즘 그냥 죽고 싶어");
    const body = await response.json();

    assert.equal(response.status, 200, "위기 응답도 정상 응답으로 내려간다");
    assert.equal(body.chargedCredits, 0);
    assert.equal(body.safety, "crisis");
    assert.match(body.reply, /109/, "전문가 도움을 안내한다");
    assert.equal(providerCalls, 0, "고정 응답이므로 provider를 부르지 않는다");

    const after = await (await app.usage()).json();
    assert.equal(after.balance, PLAN_CONFIG.pro.monthlyCredits, "잔량이 그대로여야 한다");
    assert.equal(after.reserved, 0, "예약 자체를 잡지 않는다");
    assert.equal(after.daily.used, 0);
  } finally {
    app.restore();
  }
});

test("동시 요청이 이중 차감되지 않는다", async () => {
  // 같은 유저가 서로 다른 requestId로 동시에 8건을 던진다.
  // DO가 직렬화하므로 차감 총합은 정확히 성공 건수 × 단가여야 한다.
  const concurrency = 8;
  const app = await harness({ plan: "pro" });
  try {
    const responses = await Promise.all(
      Array.from({ length: concurrency }, (_, index) => app.chat(`race-${index}`)),
    );
    const succeeded = responses.filter((response) => response.status === 200).length;

    const after = await (await app.usage()).json();
    const spent = PLAN_CONFIG.pro.monthlyCredits - after.balance;
    assert.equal(
      spent,
      succeeded * AI_CREDIT_COSTS.companion_chat,
      "차감 총액이 성공 건수와 정확히 일치해야 한다 (이중 차감·누락 없음)",
    );
    assert.equal(after.reserved, 0, "모든 예약이 확정되거나 풀려야 한다");
    assert.ok(after.balance >= 0, "잔량이 음수가 되면 안 된다");
  } finally {
    app.restore();
  }
});

test("같은 requestId를 동시에 던져도 한 번만 차감된다", async () => {
  const app = await harness({ plan: "pro" });
  try {
    await Promise.all([app.chat("same-id"), app.chat("same-id"), app.chat("same-id")]);
    const after = await (await app.usage()).json();
    const spent = PLAN_CONFIG.pro.monthlyCredits - after.balance;
    assert.ok(
      spent <= AI_CREDIT_COSTS.companion_chat,
      `같은 requestId는 최대 1회만 차감되어야 하는데 ${spent} 차감됨`,
    );
  } finally {
    app.restore();
  }
});

test("잔량이 바닥나면 AI를 부르지 않고 거절한다", async () => {
  let providerCalls = 0;
  const app = await harness({
    plan: "free",
    aiHandler: async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({
        output: [{ content: [{ type: "output_text", text: JSON.stringify({ headline: "h", reply: "r" }) }] }],
        usage: {},
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  try {
    const limit = PLAN_CONFIG.free.dailyCreditLimit;
    const attempts = limit + 4;
    for (let index = 0; index < attempts; index += 1) {
      await app.chat(`drain-${index}`);
    }
    const after = await (await app.usage()).json();
    assert.ok(after.balance >= 0);
    assert.ok(
      providerCalls <= limit,
      `한도를 넘은 요청은 provider를 부르면 안 되는데 ${providerCalls}회 호출됨`,
    );
  } finally {
    app.restore();
  }
});

/* ---------- 다이어리 북 (C5) ---------- */

test("PRO의 첫 다이어리 북은 무료로 나가고 잔량이 그대로다", async () => {
  const app = await harness({ plan: "pro", aiHandler: bookAiHandler() });
  try {
    const body = await (await app.book("book-free")).json();
    assert.equal(body.ok, true);
    assert.equal(body.chargedCredits, 0);
    assert.equal(body.entitlement, "monthly_diary_book");
    assert.equal(body.title, "작게 시작한 달");
    assert.equal(body.letter, "그 달의 편지예요.");
    assert.equal(body.usage.balance, PLAN_CONFIG.pro.monthlyCredits, "무료 권은 잔량을 건드리지 않는다");
    assert.equal(body.usage.diaryBook.freeAvailable, false);
  } finally {
    app.restore();
  }
});

test("무료 권을 쓴 뒤 두 번째 북은 에너지 10을 차감한다", async () => {
  const app = await harness({ plan: "pro", aiHandler: bookAiHandler() });
  try {
    await app.book("book-1");
    const body = await (await app.book("book-2")).json();
    assert.equal(body.chargedCredits, AI_CREDIT_COSTS.diary_book);
    assert.equal(body.usage.balance, PLAN_CONFIG.pro.monthlyCredits - 10);

    const after = await (await app.usage()).json();
    assert.equal(after.balance, body.usage.balance, "조회 잔량과 응답 잔량이 일치해야 한다");
  } finally {
    app.restore();
  }
});

test("북 생성이 실패하면 에너지도 무료 권도 원복된다", async () => {
  const app = await harness({ plan: "pro", aiHandler: bookAiHandler({ failLetter: true }) });
  try {
    // 무료 권을 먼저 소진해서 이번 실패가 에너지 10짜리 요청이 되게 한다.
    const okHandler = bookAiHandler();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = okHandler;
    await app.book("book-warmup");
    globalThis.fetch = originalFetch;

    const before = await (await app.usage()).json();
    assert.equal(before.balance, PLAN_CONFIG.pro.monthlyCredits);

    const response = await app.book("book-boom");
    assert.notEqual(response.status, 200);

    const after = await (await app.usage()).json();
    assert.equal(after.balance, PLAN_CONFIG.pro.monthlyCredits, "실패한 발급은 에너지를 먹지 않는다");
    assert.equal(after.reserved, 0, "예약이 남아 있으면 안 된다");
    assert.equal(after.daily.used, 0);
  } finally {
    app.restore();
  }
});

test("실패한 무료 발급은 그 달의 무료 권을 태우지 않는다", async () => {
  const app = await harness({ plan: "pro", aiHandler: bookAiHandler({ failLetter: true }) });
  try {
    const response = await app.book("book-fail-free");
    assert.notEqual(response.status, 200);
    const after = await (await app.usage()).json();
    assert.equal(after.diaryBook.freeAvailable, true, "쓰지 못한 무료 권은 남아 있어야 한다");
  } finally {
    app.restore();
  }
});

test("Free는 하루 상한에 걸려 북을 만들 수 없고 AI도 부르지 않는다", async () => {
  const handler = bookAiHandler();
  const app = await harness({ plan: "free", userId: "free-book-user", aiHandler: handler });
  try {
    const response = await app.book("book-free-plan");
    assert.equal(response.status, 429);
    const body = await response.json();
    assert.equal(body.code, "DAILY_AI_CREDIT_LIMIT_EXCEEDED");
    assert.equal(handler.callCount(), 0, "재화가 모자라면 provider 비용을 만들지 않는다");
  } finally {
    app.restore();
  }
});

test("달 표기가 틀린 요청은 AI를 부르지 않고 에너지도 그대로 둔다", async () => {
  const handler = bookAiHandler();
  const app = await harness({ plan: "pro", userId: "bad-month-user", aiHandler: handler });
  try {
    // 무료 권을 먼저 쓴다 — 남아 있으면 비용이 0이라 "에너지가 그대로"가 아무것도 증명하지 못한다.
    await app.book("book-warmup");
    const response = await app.book("book-bad", "2026-13");
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "INVALID_DIARY_BOOK_MONTH");
    assert.equal(handler.callCount(), 2, "머리말·편지 호출이 늘지 않아야 한다(정상 1권 = 2회)");

    const after = await (await app.usage()).json();
    assert.equal(after.balance, PLAN_CONFIG.pro.monthlyCredits, "형식 오류는 재화를 먹지 않는다");
    assert.equal(after.reserved, 0);
  } finally {
    app.restore();
  }
});
