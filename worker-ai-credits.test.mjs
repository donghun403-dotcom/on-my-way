import test from "node:test";
import assert from "node:assert/strict";
import { createSessionToken } from "./auth-service.mjs";
import worker from "./worker.mjs";
import { durableObjectNamespace } from "./test-helpers/worker-env.mjs";
import { createEnergyLedgerClient } from "./energy-ledger-client.mjs";
import { PLAN_CONFIG, resolveTrialEndsAt } from "./plan-policy.mjs";

const TEST_SECRET = "worker-ai-credit-test-secret-that-is-long-enough";

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
      const keys = [...values.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: "" };
    },
  };
}

async function authenticatedWorker({ plan = "expired", userId = `user-${plan}` } = {}) {
  const kv = memoryKv();
  const ledger = durableObjectNamespace();
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
    lastLoginAt: now,
  };
  const session = {
    id: sessionId,
    userId,
    createdAt: now,
    expiresAt: now + 60 * 60 * 1_000,
    revokedAt: null,
  };
  await kv.put(`user:${userId}`, JSON.stringify(user));
  await kv.put(`session:${sessionId}`, JSON.stringify(session));
  const token = await createSessionToken(
    { sid: sessionId, sub: userId, role: "member", iat: now, exp: session.expiresAt },
    TEST_SECRET,
  );
  return {
    kv,
    userId,
    cookie: `omw_session=${token}`,
    /* 차감 경로에 KV 폴백이 없어졌으므로 worker.fetch를 부르는 테스트는 원장을 가져야
       한다. 스텁은 test-helpers/worker-env.mjs 한 벌만 쓴다 — 파일마다 다시 쓰면
       그중 하나가 실제 DO와 다르게 동작해도 아무도 모른다. */
    ledger,
    env: {
      APP_ENV: "test",
      SESSION_SECRET: TEST_SECRET,
      USERS_KV: kv,
      ENERGY_LEDGER: ledger,
      OPENAI_API_KEY: "test-openai-key",
      OPENAI_MODEL: "test-model",
    },
  };
}

function apiRequest(path, { cookie, method = "GET", body, requestId } = {}) {
  const headers = new Headers();
  if (cookie) headers.set("Cookie", cookie);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (requestId) headers.set("X-Request-ID", requestId);
  return new Request(`https://onmyway.example.test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function callApi(context, path, options = {}) {
  const response = await worker.fetch(apiRequest(path, { cookie: context.cookie, ...options }), context.env);
  return { response, body: await response.json() };
}

async function storedUser(context) {
  return context.kv.get(`user:${context.userId}`, "json");
}

/* 차감이 KV에서 원장으로 옮겨간 뒤로 회계의 진실은 user.aiCredits가 아니라 DO의
   거래 기록이다. 예전에는 usage.metrics.successfulCalls와 aiCredits.requests[id].status를
   봤는데, 원장의 usage 뷰에는 metrics가 없고 요청 상태는 거래로 표현된다:
     성공 커밋 → type "spend", reason = action
     제공자 실패 후 원복 → type "refund"
   그래서 같은 사실을 거래에서 읽는다. */
async function ledgerTransactions(context) {
  const client = createEnergyLedgerClient({ ENERGY_LEDGER: context.ledger });
  const result = await client.transactions(context.userId, { limit: 200 });
  return result?.transactions || [];
}

async function spendCount(context) {
  return (await ledgerTransactions(context)).filter((txn) => txn.type === "spend").length;
}

function successfulOpenAiResponse(schemaName) {
  if (schemaName === "companion_reply") {
    return { headline: "좋은 출발이에요", reply: "지금 한 걸음부터 시작해 봐요." };
  }
  if (schemaName === "bounded_goal_plan_revision") {
    return {
      revisionSummary: {
        goalAlignment: "테스트 목표의 실행을 이어갑니다.",
        resourcePlan: "기존 자료와 진행 상태를 유지합니다.",
        timePlan: "하루 20분 안에서 실행합니다.",
        weeklyRule: "월요일부터 일요일까지 한 번씩 확인합니다.",
        assumptions: [],
      },
      taskTemplates: [
        { time: "저녁", durationMinutes: 20, task: "목표에 맞는 행동 실행", completionRule: "한 번 실행하면 완료", sourceReference: "", quantityOrRange: "" },
        { time: "실행 직후", durationMinutes: 5, task: "진행 상태 한 줄 기록", completionRule: "한 줄 기록하면 완료", sourceReference: "", quantityOrRange: "" },
        { time: "아침", durationMinutes: 5, task: "다음 행동 준비", completionRule: "준비물을 놓으면 완료", sourceReference: "", quantityOrRange: "" },
        { time: "주말", durationMinutes: 20, task: "주간 결과 확인", completionRule: "완료 횟수를 확인하면 완료", sourceReference: "", quantityOrRange: "" },
      ],
      days: [
        { isRestDay: false, taskIndexes: [0, 1] },
        { isRestDay: false, taskIndexes: [0] },
        { isRestDay: false, taskIndexes: [0] },
        { isRestDay: false, taskIndexes: [0] },
        { isRestDay: false, taskIndexes: [0] },
        { isRestDay: false, taskIndexes: [2] },
        { isRestDay: false, taskIndexes: [3] },
      ],
      changes: ["실행 시간을 20분으로 조정"],
      ollieMessage: "요청한 조건으로 변경안을 준비했어요.",
    };
  }
  return { summary: "수정안", changes: ["일정을 조정했어요."] };
}

function openAiFixtureResponse(schemaName) {
  const value = successfulOpenAiResponse(schemaName);
  const payload = schemaName === "companion_reply"
    ? { output_text: JSON.stringify(value) }
    : {
        status: "completed",
        output: [{
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "{not-reparsed", parsed: value }],
        }],
      };
  return new Response(JSON.stringify({
    ...payload,
    usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json", "X-Request-ID": "openai-test-request" },
  });
}

function openAiSuccessMock(onCall = () => {}) {
  return async (url, options = {}) => {
    const requestBody = JSON.parse(options.body || "{}");
    const schemaName = requestBody.text?.format?.name;
    onCall({ url: String(url), requestBody, schemaName });
    return openAiFixtureResponse(schemaName);
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

test("인증된 사용자는 usage를 조회하고 무료 체험을 명시적으로 한 번만 시작한다", { concurrency: false }, async () => {
  const context = await authenticatedWorker({ plan: "expired", userId: "usage-trial-user" });

  const initial = await callApi(context, "/api/ai/usage");
  assert.equal(initial.response.status, 200);
  assert.equal(initial.body.ok, true);
  // 체험을 시작한 적이 없는 계정이므로 "끝난 것"이 아니라 "아직 시작 전"이다.
  assert.equal(initial.body.plan, "trial_pending");
  assert.equal(initial.body.daily.limit, 4);
  assert.equal(initial.body.monthly.limit, 10);
  assert.equal(initial.body.trial.eligible, true);

  const first = await callApi(context, "/api/ai/trial/start", { method: "POST" });
  assert.equal(first.response.status, 200);
  assert.equal(first.body.started, true);
  assert.equal(first.body.user.plan, "trial");
  assert.equal(first.body.usage.trial.remainingCredits, 15);
  assert.equal(first.body.user.trialExpiresAt, resolveTrialEndsAt(first.body.user.trialStartedAt));

  const second = await callApi(context, "/api/ai/trial/start", { method: "POST" });
  assert.equal(second.response.status, 200);
  assert.equal(second.body.started, false);
  assert.equal(second.body.idempotent, true);
  assert.equal(second.body.user.trialExpiresAt, first.body.user.trialExpiresAt);
  assert.equal((await storedUser(context)).aiCredits.trial.creditsGranted, 15);
});

test("AI 경로는 고정 비용을 사용하고 클라이언트 plan·creditCost 위조를 무시한다", { concurrency: false }, async () => {
  const context = await authenticatedWorker({ plan: "pro", userId: "route-cost-user" });
  const calls = [];
  const revisionInput = { goal: "테스트 목표", currentPlanText: "기존 계획", revisionRequest: "시간을 줄여 주세요" };
  const routeCases = [
    ["/api/ai/companion-chat", 1, { message: "오늘 무엇부터 할까요?" }],
    ["/api/ai/plan-revision", 2, revisionInput],
    ["/api/ai/recovery-plan", 3, { goal: "테스트 목표", currentPlanText: "기존 계획", revisionRequest: "회복 계획을 주세요" }],
    ["/api/ai/reschedule-plan", 4, { goal: "테스트 목표", currentPlanText: "기존 계획", revisionRequest: "전체 일정을 바꿔 주세요" }],
  ];

  await withMockFetch(openAiSuccessMock((call) => calls.push(call)), async () => {
    for (const [index, [path, expectedCost, input]] of routeCases.entries()) {
      const result = await callApi(context, path, {
        method: "POST",
        requestId: `fixed-route-${index}`,
        body: { ...input, plan: "free", creditCost: 0, cost: 0 },
      });
      assert.equal(result.response.status, 200, path);
      assert.equal(result.body.ok, true, path);
      assert.equal(result.body.chargedCredits, expectedCost, path);
      assert.equal(Object.hasOwn(result.body, "diagnostics"), false, path);
    }

    // Free 하루 한도는 4. 위조한 plan이 통했다면 3번째(누적 6크레딧)도 통과했을 것이다.
    const freeContext = await authenticatedWorker({ plan: "expired", userId: "spoofed-expired-user" });
    for (const attempt of [1, 2]) {
      const charged = await callApi(freeContext, "/api/ai/plan-revision", {
        method: "POST",
        requestId: `spoofed-plan-and-cost-${attempt}`,
        body: { ...revisionInput, plan: "pro", creditCost: 0, cost: 0 },
      });
      assert.equal(charged.response.status, 200);
      assert.equal(charged.body.chargedCredits, 2);
    }

    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const blocked = await callApi(freeContext, "/api/ai/plan-revision", {
        method: "POST",
        requestId: "spoofed-plan-and-cost-retry",
        body: { ...revisionInput, plan: "pro", creditCost: 0, cost: 0 },
      });
      assert.equal(blocked.response.status, 429);
      assert.equal(blocked.body.code, "DAILY_AI_CREDIT_LIMIT_EXCEEDED");
    } finally {
      console.error = originalConsoleError;
    }
  });

  assert.equal(calls.length, routeCases.length + 2);
  const usage = await callApi(context, "/api/ai/usage");
  assert.equal(usage.body.plan, "pro");
  assert.equal(usage.body.daily.used, 10);
  assert.equal(usage.body.monthly.used, 10);
  assert.equal(await spendCount(context), 4);
});

test("AI 요청 제한은 클라이언트 userId가 아니라 인증된 세션 사용자 ID를 사용한다", { concurrency: false }, async () => {
  const context = await authenticatedWorker({ plan: "pro", userId: "authenticated-user" });
  const keys = [];
  context.env.AI_RATE_LIMITER = {
    async limit({ key }) {
      keys.push(key);
      return { success: false };
    },
  };

  const result = await callApi(context, "/api/ai/companion-chat", {
    method: "POST",
    requestId: "spoofed-user-id",
    body: { message: "사용자 ID 위조 시도", userId: "attacker-selected-user" },
  });

  assert.equal(result.response.status, 429);
  assert.equal(result.body.code, "AI_RATE_LIMITED");
  assert.deepEqual(keys, ["ai:companion_chat:authenticated-user:unknown"]);
});

test("올리 개인화 문맥은 실제 Pro·체험 사용자에게만 공급자로 전달한다", { concurrency: false }, async () => {
  const proContext = await authenticatedWorker({ plan: "pro", userId: "personalized-pro-user" });
  const freeContext = await authenticatedWorker({ plan: "expired", userId: "personalization-spoof-user" });
  const calls = [];
  const input = {
    message: "내 방식에 맞춰 알려 주세요",
    context: {
      goal: "매일 글쓰기",
      personalization: { mbti: "INTJ", planningStyle: "저녁 집중형", preferenceSummary: "작은 체크리스트 선호" },
    },
  };

  await withMockFetch(openAiSuccessMock((call) => calls.push(call)), async () => {
    const pro = await callApi(proContext, "/api/ai/companion-chat", {
      method: "POST",
      requestId: "personalization-pro",
      body: input,
    });
    const free = await callApi(freeContext, "/api/ai/companion-chat", {
      method: "POST",
      requestId: "personalization-free",
      body: input,
    });
    assert.equal(pro.response.status, 200);
    assert.equal(free.response.status, 200);
  });

  assert.match(calls[0].requestBody.input, /INTJ|저녁 집중형|작은 체크리스트 선호/);
  assert.doesNotMatch(calls[1].requestBody.input, /INTJ|저녁 집중형|작은 체크리스트 선호/);
});

test("성공 응답은 chargedCredits를 반환하고 같은 X-Request-ID를 다시 차감하지 않는다", { concurrency: false }, async () => {
  const context = await authenticatedWorker({ plan: "pro", userId: "duplicate-request-user" });
  let providerCalls = 0;

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await withMockFetch(openAiSuccessMock(() => { providerCalls += 1; }), async () => {
      const request = {
        method: "POST",
        requestId: "same-client-request",
        body: { message: "작은 행동을 알려 주세요", plan: "free", creditCost: 99 },
      };
      const first = await callApi(context, "/api/ai/companion-chat", request);
      assert.equal(first.response.status, 200);
      assert.equal(first.body.ok, true);
      assert.equal(first.body.chargedCredits, 1);
      assert.equal(first.body.idempotent, undefined);

      const duplicate = await callApi(context, "/api/ai/companion-chat", request);
      assert.equal(duplicate.response.status, 409);
      assert.equal(duplicate.body.ok, false);
      assert.equal(duplicate.body.code, "AI_REQUEST_ALREADY_COMMITTED");
      assert.equal(duplicate.body.details.status, "committed");
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(providerCalls, 1);
  const usage = await callApi(context, "/api/ai/usage");
  assert.equal(usage.body.daily.used, 1);
  assert.equal(usage.body.daily.reserved, 0);
  assert.equal(await spendCount(context), 1);
  assert.equal(usage.body.monthly.used, 1);
});

test("처리 중인 같은 X-Request-ID는 409로 거부하고 원래 예약을 해제하지 않는다", { concurrency: false }, async () => {
  const context = await authenticatedWorker({ plan: "pro", userId: "in-progress-request-user" });
  let providerCalls = 0;
  let releaseProvider;
  let markProviderStarted;
  const providerStarted = new Promise((resolve) => { markProviderStarted = resolve; });
  const providerGate = new Promise((resolve) => { releaseProvider = resolve; });
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await withMockFetch(async (url, options = {}) => {
      providerCalls += 1;
      markProviderStarted();
      await providerGate;
      const requestBody = JSON.parse(options.body || "{}");
      const schemaName = requestBody.text?.format?.name;
      return openAiFixtureResponse(schemaName);
    }, async () => {
      const request = {
        method: "POST",
        requestId: "request-still-running",
        body: { message: "처리 중인 요청" },
      };
      const firstPromise = callApi(context, "/api/ai/companion-chat", request);
      await providerStarted;
      const duplicate = await callApi(context, "/api/ai/companion-chat", request);
      assert.equal(duplicate.response.status, 409);
      assert.equal(duplicate.body.code, "AI_REQUEST_IN_PROGRESS");
      releaseProvider();
      const first = await firstPromise;
      assert.equal(first.response.status, 200);
      assert.equal(first.body.chargedCredits, 1);
    });
  } finally {
    releaseProvider?.();
    console.error = originalConsoleError;
  }

  assert.equal(providerCalls, 1);
  const usage = await callApi(context, "/api/ai/usage");
  assert.equal(usage.body.daily.used, 1);
  assert.equal(usage.body.daily.reserved, 0);
  assert.equal(await spendCount(context), 1);
});

test("일정 재조정과 대화가 겹쳐도 사용자 기록과 총 5크레딧을 모두 보존한다", { concurrency: false }, async () => {
  const context = await authenticatedWorker({ plan: "pro", userId: "reschedule-chat-race-user" });
  let releaseReschedule;
  let markRescheduleStarted;
  const rescheduleStarted = new Promise((resolve) => { markRescheduleStarted = resolve; });
  const rescheduleGate = new Promise((resolve) => { releaseReschedule = resolve; });

  try {
    await withMockFetch(async (url, options = {}) => {
      const requestBody = JSON.parse(options.body || "{}");
      const schemaName = requestBody.text?.format?.name;
      if (schemaName === "bounded_goal_plan_revision") {
        markRescheduleStarted();
        await rescheduleGate;
      }
      return openAiFixtureResponse(schemaName);
    }, async () => {
      const reschedulePromise = callApi(context, "/api/ai/reschedule-plan", {
        method: "POST",
        requestId: "race-reschedule",
        body: { goal: "동시성 목표", currentPlanText: "기존 계획", revisionRequest: "전체 일정을 바꿔 주세요" },
      });
      await rescheduleStarted;
      const chat = await callApi(context, "/api/ai/companion-chat", {
        method: "POST",
        requestId: "race-chat",
        body: { message: "동시에 대화해요" },
      });
      assert.equal(chat.response.status, 200);
      assert.equal(chat.body.chargedCredits, 1);
      releaseReschedule();
      const reschedule = await reschedulePromise;
      assert.equal(reschedule.response.status, 200);
      assert.equal(reschedule.body.chargedCredits, 4);
    });
  } finally {
    releaseReschedule?.();
  }

  // 두 요청 모두 커밋됐다 = 원장에 각 action의 spend가 하나씩 남는다.
  const reasons = (await ledgerTransactions(context))
    .filter((txn) => txn.type === "spend").map((txn) => txn.reason).sort();
  assert.deepEqual(reasons, ["companion_chat", "reschedule_plan"]);
  const usage = await callApi(context, "/api/ai/usage");
  assert.equal(usage.body.daily.used, 5);
  assert.equal(usage.body.daily.reserved, 0);
  assert.equal(await spendCount(context), 2);
});

test("Content-Length가 없는 실제 5KB 초과 본문도 제공자 호출 전에 거부한다", { concurrency: false }, async () => {
  const context = await authenticatedWorker({ plan: "pro", userId: "oversized-body-user" });
  let providerCalls = 0;
  await withMockFetch(openAiSuccessMock(() => { providerCalls += 1; }), async () => {
    const request = apiRequest("/api/ai/companion-chat", {
      cookie: context.cookie,
      method: "POST",
      requestId: "oversized-without-header",
      body: { message: "가".repeat(6_000) },
    });
    assert.equal(request.headers.get("content-length"), null);
    const response = await worker.fetch(request, context.env);
    const body = await response.json();
    assert.equal(response.status, 413);
    assert.equal(body.code, "AI_REQUEST_TOO_LARGE");
  });
  assert.equal(providerCalls, 0);
  const usage = await callApi(context, "/api/ai/usage");
  assert.equal(usage.body.daily.used, 0);
  assert.equal(usage.body.daily.reserved, 0);
  // 예약 전에 거부됐으므로 원장에 거래가 하나도 남지 않는다(월 지급 제외).
  assert.equal(await spendCount(context), 0);
  assert.equal((await ledgerTransactions(context)).some((t) => t.type === "refund"), false);
});

test("AI 제공자 실패는 예약 크레딧을 환불한다", { concurrency: false }, async () => {
  const context = await authenticatedWorker({ plan: "pro", userId: "provider-failure-user" });
  let providerCalls = 0;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await withMockFetch(async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ error: { message: "provider failed" } }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }, async () => {
      const request = {
        method: "POST",
        requestId: "provider-failure",
        body: { message: "실패해도 환불해 주세요" },
      };
      const failed = await callApi(context, "/api/ai/companion-chat", request);
      assert.equal(failed.response.status, 500);
      assert.equal(failed.body.ok, false);
      assert.equal(failed.body.usage.daily.used, 0);
      assert.equal(failed.body.usage.daily.reserved, 0);
      assert.equal(failed.body.usage.daily.remaining, 30);
      const sameIdRetry = await callApi(context, "/api/ai/companion-chat", request);
      assert.equal(sameIdRetry.response.status, 409);
      assert.equal(sameIdRetry.body.code, "AI_REQUEST_PREVIOUSLY_RELEASED");
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(providerCalls, 1);
  const usage = await callApi(context, "/api/ai/usage");
  assert.equal(usage.body.daily.used, 0);
  assert.equal(usage.body.monthly.used, 0);
  /* 커밋 전 예약을 되돌리는 것은 거래를 남기지 않는다 — 원장은 확정된 것만 기록한다.
     그래서 "환불됐다"는 잔량이 그대로라는 사실로 확인한다. */
  assert.equal(usage.body.daily.reserved, 0);
  assert.equal(usage.body.available, PLAN_CONFIG.pro.monthlyCredits);
  assert.equal(await spendCount(context), 0);
});

test("제공자 호출 전 입력 오류는 크레딧을 복구하고 실제 API 호출 통계에 포함하지 않는다", { concurrency: false }, async () => {
  const context = await authenticatedWorker({ plan: "pro", userId: "validation-failure-user" });
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const failed = await callApi(context, "/api/ai/companion-chat", {
      method: "POST",
      requestId: "validation-failure",
      body: { message: "" },
    });
    assert.equal(failed.response.status, 400);
    assert.equal(failed.body.usage.daily.remaining, 30);
  } finally {
    console.error = originalConsoleError;
  }
  const usage = await callApi(context, "/api/ai/usage");
  assert.equal(await spendCount(context), 0);
  assert.equal(usage.body.daily.reserved, 0);
  assert.equal(usage.body.available, PLAN_CONFIG.pro.monthlyCredits);
});
