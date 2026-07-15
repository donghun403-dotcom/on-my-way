import test from "node:test";
import assert from "node:assert/strict";
import { createSessionToken } from "./auth-service.mjs";
import worker from "./worker.mjs";

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

async function authenticatedWorker({ plan = "free", userId = `user-${plan}` } = {}) {
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
    env: {
      APP_ENV: "test",
      SESSION_SECRET: TEST_SECRET,
      USERS_KV: kv,
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

function successfulOpenAiResponse(schemaName) {
  if (schemaName === "companion_reply") {
    return { headline: "좋은 출발이에요", reply: "지금 한 걸음부터 시작해 봐요." };
  }
  if (schemaName === "personalized_goal_plan") {
    return { goal: "테스트 목표", firstAction: "첫 행동" };
  }
  return { summary: "수정안", changes: ["일정을 조정했어요."] };
}

function openAiSuccessMock(onCall = () => {}) {
  return async (url, options = {}) => {
    const requestBody = JSON.parse(options.body || "{}");
    const schemaName = requestBody.text?.format?.name;
    onCall({ url: String(url), requestBody, schemaName });
    return new Response(JSON.stringify({
      output_text: JSON.stringify(successfulOpenAiResponse(schemaName)),
      usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Request-ID": "openai-test-request" },
    });
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

test("인증된 사용자는 usage를 조회하고 Pro 체험을 명시적으로 한 번만 시작한다", { concurrency: false }, async () => {
  const context = await authenticatedWorker({ plan: "free", userId: "usage-trial-user" });

  const initial = await callApi(context, "/api/ai/usage");
  assert.equal(initial.response.status, 200);
  assert.equal(initial.body.ok, true);
  assert.equal(initial.body.plan, "free");
  assert.equal(initial.body.daily.limit, 2);
  assert.equal(initial.body.monthly.limit, 5);
  assert.equal(initial.body.trial.eligible, true);

  const first = await callApi(context, "/api/ai/trial/start", { method: "POST" });
  assert.equal(first.response.status, 200);
  assert.equal(first.body.started, true);
  assert.equal(first.body.user.plan, "trial");
  assert.equal(first.body.usage.trial.remainingCredits, 15);
  assert.equal(first.body.user.trialExpiresAt - first.body.user.trialStartedAt, 24 * 60 * 60 * 1_000);

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
  const routeCases = [
    ["/api/ai/companion-chat", 1, { message: "오늘 무엇부터 할까요?" }],
    ["/api/ai/goal-plan", 4, { goal: "테스트 목표", routine: { readiness: "준비됨", preferredTime: "저녁" } }],
    ["/api/ai/plan-revision", 2, { goal: "테스트 목표", currentPlanText: "기존 계획", revisionRequest: "시간을 줄여 주세요" }],
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
    }

    const freeContext = await authenticatedWorker({ plan: "free", userId: "spoofed-free-user" });
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const blocked = await callApi(freeContext, "/api/ai/goal-plan", {
        method: "POST",
        requestId: "spoofed-plan-and-cost",
        body: {
          goal: "비용 위조 목표",
          routine: { readiness: "준비됨", preferredTime: "저녁" },
          plan: "pro",
          creditCost: 0,
          cost: 0,
        },
      });
      assert.equal(blocked.response.status, 429);
      assert.equal(blocked.body.code, "DAILY_AI_CREDIT_LIMIT_EXCEEDED");
    } finally {
      console.error = originalConsoleError;
    }
  });

  assert.equal(calls.length, routeCases.length);
  const usage = await callApi(context, "/api/ai/usage");
  assert.equal(usage.body.plan, "pro");
  assert.equal(usage.body.daily.used, 14);
  assert.equal(usage.body.monthly.used, 14);
  assert.equal(usage.body.metrics.successfulCalls, 5);
});

test("올리 개인화 문맥은 실제 Pro·체험 사용자에게만 공급자로 전달한다", { concurrency: false }, async () => {
  const proContext = await authenticatedWorker({ plan: "pro", userId: "personalized-pro-user" });
  const freeContext = await authenticatedWorker({ plan: "free", userId: "personalization-spoof-user" });
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
  assert.equal(usage.body.metrics.chargedCredits, 1);
  assert.equal(usage.body.metrics.successfulCalls, 1);
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
      return new Response(JSON.stringify({
        output_text: JSON.stringify(successfulOpenAiResponse(schemaName)),
        usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
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
  assert.equal(usage.body.metrics.chargedCredits, 1);
});

test("목표 생성과 대화가 겹쳐도 사용자 기록과 총 5크레딧을 모두 보존한다", { concurrency: false }, async () => {
  const context = await authenticatedWorker({ plan: "pro", userId: "goal-chat-race-user" });
  let releaseGoal;
  let markGoalStarted;
  const goalStarted = new Promise((resolve) => { markGoalStarted = resolve; });
  const goalGate = new Promise((resolve) => { releaseGoal = resolve; });

  try {
    await withMockFetch(async (url, options = {}) => {
      const requestBody = JSON.parse(options.body || "{}");
      const schemaName = requestBody.text?.format?.name;
      if (schemaName === "personalized_goal_plan") {
        markGoalStarted();
        await goalGate;
      }
      return new Response(JSON.stringify({
        output_text: JSON.stringify(successfulOpenAiResponse(schemaName)),
        usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async () => {
      const goalPromise = callApi(context, "/api/ai/goal-plan", {
        method: "POST",
        requestId: "race-goal",
        body: { goal: "동시성 목표", routine: { readiness: "준비됨", preferredTime: "저녁" } },
      });
      await goalStarted;
      const chat = await callApi(context, "/api/ai/companion-chat", {
        method: "POST",
        requestId: "race-chat",
        body: { message: "동시에 대화해요" },
      });
      assert.equal(chat.response.status, 200);
      assert.equal(chat.body.chargedCredits, 1);
      releaseGoal();
      const goal = await goalPromise;
      assert.equal(goal.response.status, 200);
      assert.equal(goal.body.chargedCredits, 4);
    });
  } finally {
    releaseGoal?.();
  }

  const user = await storedUser(context);
  assert.ok(user.goalPlanGeneratedAt);
  assert.equal(user.aiCredits.requests["race-goal"].status, "committed");
  assert.equal(user.aiCredits.requests["race-chat"].status, "committed");
  const usage = await callApi(context, "/api/ai/usage");
  assert.equal(usage.body.daily.used, 5);
  assert.equal(usage.body.daily.reserved, 0);
  assert.equal(usage.body.metrics.successfulCalls, 2);
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
  assert.equal(usage.body.metrics.apiCalls, 0);
  assert.equal(usage.body.metrics.reservationCount, 0);
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
      const failed = await callApi(context, "/api/ai/companion-chat", {
        method: "POST",
        requestId: "provider-failure",
        body: { message: "실패해도 환불해 주세요" },
      });
      assert.equal(failed.response.status, 500);
      assert.equal(failed.body.ok, false);
      assert.equal(failed.body.usage.daily.used, 0);
      assert.equal(failed.body.usage.daily.reserved, 0);
      assert.equal(failed.body.usage.daily.remaining, 30);
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(providerCalls, 1);
  const usage = await callApi(context, "/api/ai/usage");
  assert.equal(usage.body.daily.used, 0);
  assert.equal(usage.body.monthly.used, 0);
  assert.equal(usage.body.metrics.failedCalls, 1);
  assert.equal(usage.body.metrics.releasedCredits, 1);
  assert.equal(usage.body.metrics.chargedCredits, 0);
  const user = await storedUser(context);
  assert.equal(user.aiCredits.requests["provider-failure"].status, "released");
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
  assert.equal(usage.body.metrics.apiCalls, 0);
  assert.equal(usage.body.metrics.failedCalls, 0);
  assert.equal(usage.body.metrics.releasedCredits, 1);
});
