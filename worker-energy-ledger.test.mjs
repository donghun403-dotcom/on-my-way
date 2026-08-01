// worker → EnergyLedger DO 통합 테스트.
//
// energy-ledger.test.mjs가 원장 로직을 보는 반면 여기서는 실제 라우트가 DO를 거쳐
// 차감·원복·조회하는지, 그리고 동시 요청이 이중 차감되지 않는지를 본다.
import test from "node:test";
import assert from "node:assert/strict";
import { createSessionToken } from "./auth-service.mjs";
import worker from "./worker.mjs";
import { EnergyLedgerObject } from "./energy-ledger-object.mjs";
import { AI_CREDIT_COSTS, PAYMENT_FAILURE_GRACE_MS, PAYWALL_OFF_EXPIRED_GRANT, PLAN_CONFIG } from "./plan-policy.mjs";

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

async function harness({ plan = "pro", userId = "energy-user", aiHandler, paywall = false, user: userOverrides } = {}) {
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
    ...userOverrides,
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
    // 차단 동작 전체가 이 플래그 뒤에 있다. 기본값은 꺼짐이다.
    HARD_PAYWALL_ENABLED: paywall ? "true" : "false",
    AI_RATE_LIMITER: { async limit() { return { success: true }; } },
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
    // 임의의 라우트를 같은 세션으로 부른다. 차단 게이트가 라우트별로 어떻게 도는지 보려고 쓴다.
    call(path, { method = "POST", body = {}, requestId = "req" } = {}) {
      return worker.fetch(new Request(`https://app.example${path}`, {
        method,
        headers: { "content-type": "application/json", cookie: `omw_session=${token}`, "x-request-id": requestId },
        ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
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
    plan: "expired",
    aiHandler: async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({
        output: [{ content: [{ type: "output_text", text: JSON.stringify({ headline: "h", reply: "r" }) }] }],
        usage: {},
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  try {
    const limit = PAYWALL_OFF_EXPIRED_GRANT.dailyCreditLimit;
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

/* ---------- 다이어리 북 — PRO 전용 · 항상 에너지 10 ---------- */

test("PRO의 다이어리 북은 몇 권째든 에너지 10을 차감한다", async () => {
  const app = await harness({ plan: "pro", aiHandler: bookAiHandler() });
  try {
    const body = await (await app.book("book-1")).json();
    assert.equal(body.ok, true);
    assert.equal(body.chargedCredits, AI_CREDIT_COSTS.diary_book);
    assert.equal(body.entitlement, undefined, "무료 자격은 폐지됐다");
    assert.equal(body.title, "작게 시작한 달");
    assert.equal(body.letter, "그 달의 편지예요.");
    assert.equal(body.usage.balance, PLAN_CONFIG.pro.monthlyCredits - 10);

    const second = await (await app.book("book-2")).json();
    assert.equal(second.chargedCredits, AI_CREDIT_COSTS.diary_book);
    assert.equal(second.usage.balance, PLAN_CONFIG.pro.monthlyCredits - 20);

    const after = await (await app.usage()).json();
    assert.equal(after.balance, second.usage.balance, "조회 잔량과 응답 잔량이 일치해야 한다");
    assert.equal(after.diaryBook.cost, 10);
    assert.equal(after.diaryBook.allowed, true);
  } finally {
    app.restore();
  }
});

/* 보고 항목 4: 북 실패 시 10이 소비되지 않는다는 것을 원장 잔량으로 확인한다. */
test("북 생성이 실패하면 에너지 10이 소비되지 않는다", async () => {
  const app = await harness({ plan: "pro", aiHandler: bookAiHandler({ failLetter: true }) });
  try {
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

/* ---------- PRO 전용 게이트 (§E) ----------
   trial과 expired 모두 서버에서 거절되고, provider 호출 0회·원장 무변경이어야 한다.
   이 게이트는 HARD_PAYWALL_ENABLED와 무관하다 — 아래 harness는 플래그를 켜지 않는다. */

test("체험 계정은 북 라우트에서 403이고 에너지 15가 그대로다", async () => {
  const handler = bookAiHandler();
  // 판정은 저장된 라벨이 아니라 살아 있는 trialExpiresAt을 본다.
  const startedAt = Date.now();
  const app = await harness({
    plan: "trial",
    userId: "trial-book-user",
    aiHandler: handler,
    user: { trialStartedAt: startedAt, trialUsedAt: startedAt, trialExpiresAt: startedAt + 60 * 60 * 1_000 },
  });
  try {
    const before = await (await app.usage()).json();
    assert.equal(before.balance, PLAN_CONFIG.pro.trial.credits, "체험 지급은 15다");
    assert.equal(before.diaryBook.allowed, false);
    assert.equal(before.diaryBook.proOnly, true);

    const response = await app.book("trial-book");
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.code, "PRO_ONLY_ACTION");
    assert.equal(body.plan, "trial");
    assert.equal(handler.callCount(), 0, "provider를 부르면 안 된다");

    const after = await (await app.usage()).json();
    assert.equal(after.balance, PLAN_CONFIG.pro.trial.credits, "에너지 15가 그대로여야 한다");
    assert.equal(after.available, PLAN_CONFIG.pro.trial.credits);
    assert.equal(after.reserved, 0);
    assert.equal(after.daily.used, 0);
  } finally {
    app.restore();
  }
});

test("만료 계정은 차단이 꺼져 있어도 북 라우트에서 403이고 AI를 부르지 않는다", async () => {
  const handler = bookAiHandler();
  const app = await harness({ plan: "expired", userId: "expired-book-user", aiHandler: handler });
  try {
    const response = await app.book("book-expired");
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "PRO_ONLY_ACTION");
    assert.equal(handler.callCount(), 0, "provider 비용을 만들지 않는다");

    const after = await (await app.usage()).json();
    assert.equal(after.balance, PAYWALL_OFF_EXPIRED_GRANT.monthlyCredits, "원장이 움직이면 안 된다");
    assert.equal(after.reserved, 0);
  } finally {
    app.restore();
  }
});

test("달 표기가 틀린 요청은 AI를 부르지 않고 에너지도 그대로 둔다", async () => {
  const handler = bookAiHandler();
  const app = await harness({ plan: "pro", userId: "bad-month-user", aiHandler: handler });
  try {
    const response = await app.book("book-bad", "2026-13");
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "INVALID_DIARY_BOOK_MONTH");
    assert.equal(handler.callCount(), 0, "형식 오류는 provider에 닿지 않는다");

    const after = await (await app.usage()).json();
    assert.equal(after.balance, PLAN_CONFIG.pro.monthlyCredits, "형식 오류는 재화를 먹지 않는다");
    assert.equal(after.reserved, 0);
  } finally {
    app.restore();
  }
});

/* ---------- 하드 페이월 (P1) ----------
   차단 동작 전체가 HARD_PAYWALL_ENABLED 뒤에 있다. 기본값은 꺼짐이고, 꺼져 있으면
   만료 계정도 폐지 전 Free와 같은 한도로 계속 쓴다 — 실결제가 검증되기 전에 잠기는
   사람이 없어야 하기 때문이다. */

const AI_ROUTES = [
  ["/api/ai/companion-chat", { message: "안녕", context: { goal: "테스트" } }],
  ["/api/ai/plan-revision", { goal: "목표", currentPlanText: "계획", revisionRequest: "줄여 주세요" }],
  ["/api/ai/recovery-plan", { goal: "목표", currentPlanText: "계획", revisionRequest: "회복" }],
  ["/api/ai/reschedule-plan", { goal: "목표", currentPlanText: "계획", revisionRequest: "재조정" }],
  ["/api/ai/diary-book", { monthKey: "2026-07", goal: "목표", summary: { entryCount: 3 } }],
];

test("차단이 켜지면 만료 계정은 모든 AI 라우트에서 402로 막히고 provider를 부르지 않는다", async () => {
  let providerCalls = 0;
  const app = await harness({
    plan: "expired",
    userId: "paywall-expired-user",
    /* 진짜 만료 계정은 체험을 겪은 흔적이 있다. 흔적 없이 plan만 expired인 레코드는
       resolveEffectivePlan이 trial_pending으로 읽는다 — 그것도 402로 막히지만
       이 테스트가 말하는 상태는 아니다. 아래에 따로 있다. */
    user: { trialStartedAt: Date.now() - 300_000_000, trialUsedAt: Date.now() - 300_000_000, trialExpiresAt: Date.now() - 200_000_000 },
    paywall: true,
    aiHandler: async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ output_text: "{}", usage: {} }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  try {
    for (const [path, body] of AI_ROUTES) {
      const response = await app.call(path, { body, requestId: `blocked-${path.split("/").at(-1)}` });
      const payload = await response.json();
      assert.equal(response.status, 402, `${path}는 402로 막혀야 한다`);
      assert.equal(payload.code, "PLAN_EXPIRED", `${path}의 거절 사유가 만료여야 한다`);
      assert.equal(payload.plan, "expired");
    }
    assert.equal(providerCalls, 0, "거절할 요청이 provider 비용을 만들면 안 된다");

    // 원장도 건드리지 않는다 — 잔량과 예약이 그대로여야 재시도가 안전하다.
    const usage = await (await app.usage()).json();
    assert.equal(usage.plan, "expired");
    assert.equal(usage.balance, 0, "차단이 켜지면 만료 계정에는 월 지급이 없다");
    assert.equal(usage.reserved, 0);
    assert.equal(usage.paywallEnabled, true);
  } finally {
    app.restore();
  }
});

/* 체험을 시작한 적 없는 계정(trial_pending)도 차단 대상이다. 오늘 이 값을 갖는 계정은
   어제까지 expired였으므로 막는 것이 동작 유지다. 새 플랜 값을 402 게이트에서 빠뜨리면
   크레딧 0인 계정이 게이트를 통과해 provider를 부르게 된다 — 조용히, 우리 비용으로. */
test("차단이 켜지면 체험 시작 전 계정도 402로 막히고 provider를 부르지 않는다", async () => {
  let providerCalls = 0;
  const app = await harness({
    plan: "expired",
    userId: "paywall-pending-user",
    user: { trialStartedAt: null, trialUsedAt: null, trialExpiresAt: null },
    paywall: true,
    aiHandler: async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ output_text: "{}", usage: {} }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  try {
    for (const [path, body] of AI_ROUTES) {
      const response = await app.call(path, { body, requestId: `pending-${path.split("/").at(-1)}` });
      const payload = await response.json();
      assert.equal(response.status, 402, `${path}는 402로 막혀야 한다`);
      assert.equal(payload.plan, "trial_pending", "만료가 아니라 시작 전으로 보고돼야 퍼널에서 구분된다");
    }
    assert.equal(providerCalls, 0, "막힌 요청이 provider를 불렀다");
  } finally {
    app.restore();
  }
});

test("차단이 꺼져 있으면 만료 계정은 폐지 전 Free와 같은 한도로 그대로 쓴다", async () => {
  const app = await harness({ plan: "expired", userId: "paywall-off-user", paywall: false });
  try {
    const usage = await (await app.usage()).json();
    assert.equal(usage.paywallEnabled, false);
    assert.equal(usage.balance, PAYWALL_OFF_EXPIRED_GRANT.monthlyCredits);
    assert.equal(usage.daily.limit, PAYWALL_OFF_EXPIRED_GRANT.dailyCreditLimit);

    // 실제로 대화가 되고 차감된다 — 즉 아무도 잠기지 않는다.
    const response = await app.chat("paywall-off-chat");
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.chargedCredits, AI_CREDIT_COSTS.companion_chat);
    assert.equal(body.usage.balance, PAYWALL_OFF_EXPIRED_GRANT.monthlyCredits - AI_CREDIT_COSTS.companion_chat);
  } finally {
    app.restore();
  }
});

test("차단이 켜져도 체험 중·PRO 계정은 그대로 통과한다", async () => {
  /* 체험 계정에는 살아 있는 trialExpiresAt이 있어야 한다. plan 문자열만 "trial"이고 기간이
     없으면 판정은 만료다 — 저장된 라벨이 아니라 사실을 본다는 뜻이다. */
  const cases = [
    { plan: "pro", user: {} },
    { plan: "trial", user: { trialStartedAt: Date.now(), trialUsedAt: Date.now(), trialExpiresAt: Date.now() + 60 * 60 * 1_000 } },
  ];
  for (const { plan, user } of cases) {
    const app = await harness({ plan, userId: `paywall-${plan}-user`, paywall: true, user });
    try {
      const response = await app.chat(`paywall-${plan}-chat`);
      assert.equal(response.status, 200, `${plan}은 차단 대상이 아니다`);
    } finally {
      app.restore();
    }
  }

  // 라벨만 남고 기간이 없는 계정은 막힌다.
  const stale = await harness({ plan: "trial", userId: "paywall-stale-trial", paywall: true });
  try {
    assert.equal((await stale.chat("stale-trial-chat")).status, 402);
  } finally {
    stale.restore();
  }
});

/* 해지·결제 실패는 저장된 plan이 아니라 판정으로 막혀야 한다. 크론이 늦게 돌아도
   PRO 권한이 남지 않는지를 라우트 수준에서 확인한다. */
test("해지된 PRO는 기간이 끝나면 크론을 기다리지 않고 라우트에서 막힌다", async () => {
  const app = await harness({
    plan: "pro",
    userId: "canceled-pro-user",
    paywall: true,
    user: { subscriptionStatus: "canceled", currentPeriodEnd: Date.now() - 1 },
  });
  try {
    const response = await app.chat("canceled-chat");
    assert.equal(response.status, 402);
    assert.equal((await response.json()).code, "PLAN_EXPIRED");
  } finally {
    app.restore();
  }
});

test("결제 실패는 3일 유예 동안 통과하고 유예가 끝나면 막힌다", async () => {
  const now = Date.now();
  const inGrace = await harness({
    plan: "pro",
    userId: "past-due-in-grace",
    paywall: true,
    user: { subscriptionStatus: "past_due", currentPeriodEnd: now - 1, paymentGraceUntil: now + PAYMENT_FAILURE_GRACE_MS },
  });
  try {
    assert.equal((await inGrace.chat("grace-chat")).status, 200, "유예 중에는 PRO 권한이 유지된다");
  } finally {
    inGrace.restore();
  }

  const afterGrace = await harness({
    plan: "pro",
    userId: "past-due-after-grace",
    paywall: true,
    user: { subscriptionStatus: "past_due", currentPeriodEnd: now - 1, paymentGraceUntil: now - 1 },
  });
  try {
    const response = await afterGrace.chat("after-grace-chat");
    assert.equal(response.status, 402);
    assert.equal((await response.json()).code, "PLAN_EXPIRED");
  } finally {
    afterGrace.restore();
  }
});

/* 체험 종료 편지는 폐지됐다. 라우트가 살아 있으면 만료 계정이 차단을 지나 AI를 부를 수
   있는 유일한 구멍이 되므로, 사라졌다는 것을 라우트 수준에서 고정한다. */
test("체험 종료 편지 라우트는 남아 있지 않다", async () => {
  let providerCalls = 0;
  const app = await harness({
    plan: "expired",
    userId: "no-letter-user",
    paywall: true,
    aiHandler: async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ output_text: "{}", usage: {} }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  try {
    const response = await app.call("/api/ai/trial-letter", { body: { goal: "목표", summary: { dayCount: 1 } }, requestId: "letter-gone" });
    assert.equal(response.status, 404, "폐지된 라우트는 존재하지 않아야 한다");
    assert.equal(providerCalls, 0);
  } finally {
    app.restore();
  }
});

/* ---------- 만료 계정에 항상 열려 있어야 하는 것 (§G, 법적 요건) ----------
   차단이 켜져 있고 에너지가 0인 계정에서도 탈퇴와 결제 화면은 닿을 수 있어야 한다.
   .md 내보내기는 서버를 거치지 않으므로(클라이언트 직렬화) e2e에서 확인한다. */
test("차단이 켜진 만료 계정도 탈퇴와 결제 경로에 닿는다", async () => {
  const app = await harness({ plan: "expired", userId: "locked-out-user", paywall: true });
  try {
    const usage = await (await app.usage()).json();
    assert.equal(usage.balance, 0, "에너지가 0인 상태에서 확인해야 의미가 있다");

    // 결제 상태 조회 — 잠긴 계정이 낼 방법을 찾을 수 있어야 한다.
    const billing = await app.call("/api/account/billing", { method: "GET" });
    assert.notEqual(billing.status, 402, "결제 경로가 잠기면 나갈 길이 없다");
    assert.notEqual(billing.status, 403);

    // 탈퇴 요청 — 개인정보 자기결정권이라 플랜으로 막을 수 없다.
    const remove = await app.call("/api/account/delete", { body: { confirm: "삭제" } });
    assert.notEqual(remove.status, 402, "탈퇴가 결제 뒤에 있으면 안 된다");
    assert.notEqual(remove.status, 403);
  } finally {
    app.restore();
  }
});
