import test from "node:test";
import assert from "node:assert/strict";
import { createSessionToken } from "./auth-service.mjs";
import { memoryDurableObjectNamespace } from "./guest-plan-draft-fixture.mjs";
import worker, { guestGoalInputHash } from "./worker.mjs";

const TEST_SECRET = "guest-preview-test-secret-that-is-long-enough";
const TEST_IP = "203.0.113.17";

function memoryKv() {
  const values = new Map();
  const options = new Map();
  return {
    values,
    options,
    async get(key, type) {
      const value = values.get(key);
      if (value === undefined) return null;
      if (type === "json" || type?.type === "json") return JSON.parse(value);
      return value;
    },
    async put(key, value, putOptions = {}) {
      values.set(key, String(value));
      options.set(key, putOptions);
    },
    async delete(key) {
      values.delete(key);
      options.delete(key);
    },
    async list({ prefix = "" } = {}) {
      return {
        keys: [...values.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })),
        list_complete: true,
        cursor: "",
      };
    },
  };
}

function goalInput(goal = "90일 안에 첫 유료 고객 10명 만들기") {
  return {
    draftPlanId: "guest-draft-fixture",
    goal,
    periodDays: 90,
    currentState: "아이디어가 있고 평일 한 시간과 주말 세 시간을 쓸 수 있어요.",
    routine: {
      readiness: "바로 실행할 수 있어요",
      preferredTime: "저녁",
      existingRoutine: "저녁 식사 후 노트북을 열어요.",
    },
    material: { hasMaterial: false },
    availability: {
      availableDays: ["월", "화", "수", "목", "금", "토", "일"],
      sessionMinutes: 60,
      difficultDays: [],
      excludedDates: [],
      weeklyFrequency: 7,
      intensity: "균형 있게",
      bufferDays: 0,
      notificationTime: "19:00",
    },
    planningPreferences: [],
  };
}

function generatedPlan(planId = "guest-draft-fixture") {
  const dayLabels = ["월", "화", "수", "목", "금", "토", "일"];
  return {
    personalitySummary: "짧은 고객 대화부터 실행하면 추진력을 만들 수 있어요.",
    planningStyle: "고객 검증 실행형 계획",
    firstAction: "잠재 고객 한 명에게 문제 인터뷰를 요청하기",
    weekTitle: "첫 주에는 고객 문제를 직접 확인해요.",
    weekPlan: ["고객 후보 5명 적기", "인터뷰 1명 요청하기", "질문 5개 정리하기", "응답 기록하기", "가설 한 줄 수정하기"],
    coachMessage: "완벽한 제품보다 실제 고객의 말을 먼저 모아 봐요.",
    dashboard: { goal: "첫 유료 고객 만들기", progress: 0, pace: "첫 주 고객 검증" },
    fullSchedule: [
      { phase: "탐색", days: "1~7일", focus: "고객 문제 확인", successMetric: "인터뷰 3명" },
      { phase: "제안", days: "8~30일", focus: "작은 해결안 제안", successMetric: "제안 5회" },
      { phase: "판매", days: "31~90일", focus: "유료 전환", successMetric: "고객 10명" },
    ],
    todaySchedule: [
      { time: "저녁", durationMinutes: 15, task: "잠재 고객 한 명에게 문제 인터뷰를 요청하기", completionRule: "메시지 한 건을 보내면 완료" },
      { time: "요청 직후", durationMinutes: 5, task: "보낸 문구와 반응 기록하기", completionRule: "기록 한 줄을 남기면 완료" },
    ],
    firstWeekSchedule: dayLabels.map((dayLabel, index) => ({
      dayNumber: index + 1,
      dayLabel,
      isRestDay: false,
      items: [{
        id: `guest-action-${index + 1}`,
        planId,
        type: "ACTION",
        title: index ? "잠재 고객 반응 한 줄 정리" : "잠재 고객 한 명에게 문제 인터뷰 요청",
        sourceReference: "고객 인터뷰 노트",
        quantityOrRange: "고객 1명",
        durationMinutes: 15,
        completionRule: "메시지 또는 기록 한 건을 남기면 완료",
        scheduledAt: `2026-07-${String(index + 20).padStart(2, "0")}T19:00:00+09:00`,
        status: "pending",
        recurrenceGroupId: "guest-customer-interview",
      }],
    })),
    assumptions: ["자료가 정해지지 않아 고객 인터뷰 노트를 기준으로 구성했어요."],
    checkInRules: ["요청 수를 기록해요.", "답이 없으면 대상만 바꿔요.", "주말에 질문을 조정해요."],
    fallbackPlan: "어려운 날에는 고객 후보 이름 한 명만 적어요.",
  };
}

function previewRequest(input = goalInput()) {
  return new Request("https://preview.example/api/ai/goal-preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": TEST_IP,
      "User-Agent": "guest-preview-test-browser",
    },
    body: JSON.stringify(input),
  });
}

function testEnv(overrides = {}) {
  const kv = Object.hasOwn(overrides, "USERS_KV") ? overrides.USERS_KV : memoryKv();
  const drafts = Object.hasOwn(overrides, "GUEST_PLAN_DRAFTS") ? overrides.GUEST_PLAN_DRAFTS : memoryDurableObjectNamespace();
  return {
    APP_ENV: "test",
    USERS_KV: kv,
    SESSION_SECRET: TEST_SECRET,
    OPENAI_API_KEY: "fixture-openai-key",
    OPENAI_MODEL: "fixture-model",
    AI_RATE_LIMITER: { async limit() { return { success: true }; } },
    GUEST_PLAN_DRAFTS: drafts,
    ASSETS: { async fetch() { return new Response("asset"); } },
    ...overrides,
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

function generatedPlanForProviderRequest(init) {
  const providerBody = JSON.parse(init.body);
  const normalizedInput = JSON.parse(providerBody.input.slice(providerBody.input.indexOf("{")));
  return generatedPlan(normalizedInput.draftPlanId);
}

function constrainedPlanForProviderRequest(init) {
  const providerBody = JSON.parse(init.body);
  const normalizedInput = JSON.parse(providerBody.input.slice(providerBody.input.indexOf("{")));
  const result = generatedPlan(normalizedInput.draftPlanId);
  const available = new Set(normalizedInput.availability.availableDays);
  result.firstWeekSchedule = result.firstWeekSchedule.map((day) => {
    if (!available.has(day.dayLabel)) return { ...day, isRestDay: true, items: [] };
    return {
      ...day,
      isRestDay: false,
      items: day.items.map((item) => ({
        ...item,
        sourceReference: normalizedInput.material.name,
        quantityOrRange: normalizedInput.material.targetRange,
        durationMinutes: normalizedInput.availability.sessionMinutes,
      })),
    };
  });
  return result;
}

function cookiePair(response, name) {
  const setCookie = response.headers.get("set-cookie") || "";
  const match = setCookie.match(new RegExp(`(?:^|,\\s*)${name}=([^;]+)`));
  return match ? `${name}=${match[1]}` : "";
}

async function createGuestDraft(env, input = goalInput()) {
  let providerCalls = 0;
  const response = await withMockFetch(async (_url, init) => {
    providerCalls += 1;
    return new Response(JSON.stringify({
      output_text: JSON.stringify(generatedPlanForProviderRequest(init)),
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Request-ID": "fixture-request" },
    });
  }, () => worker.fetch(previewRequest(input), env));
  const body = await response.clone().json();
  return {
    body,
    draftCookie: cookiePair(response, "omw_guest_goal_draft"),
    providerCalls,
  };
}

async function createAuthenticatedFixture(kv, id) {
  const now = Date.now();
  const user = { id, provider: "google", name: "초안 사용자", role: "member", status: "active", plan: "free", createdAt: now, lastLoginAt: now };
  const session = { id: `${id}-session`, userId: user.id, createdAt: now, expiresAt: now + 60_000, revokedAt: null };
  await kv.put(`user:${user.id}`, JSON.stringify(user));
  await kv.put(`session:${session.id}`, JSON.stringify(session));
  const sessionToken = await createSessionToken({ sid: session.id, sub: user.id, role: "member", iat: now, exp: session.expiresAt }, TEST_SECRET);
  return { user, sessionToken };
}

function claimRequest({ draft = null, draftPlanId = draft?.draftPlanId, activeRevision = draft?.activeRevision, activeInputHash = draft?.activeInputHash, sessionToken = "", draftCookie = "" }) {
  const cookies = [sessionToken && `omw_session=${sessionToken}`, draftCookie].filter(Boolean).join("; ");
  return new Request("https://preview.example/api/ai/goal-draft/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookies ? { Cookie: cookies } : {}) },
    body: JSON.stringify({ draftPlanId, expectedRevision: activeRevision, expectedInputHash: activeInputHash }),
  });
}

function revisionRequest({ draft, draftCookie, input, idempotencyKey = "revision:test-network-retry-0001" }) {
  return new Request("https://preview.example/api/ai/goal-draft/revise", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": TEST_IP,
      "User-Agent": "guest-preview-test-browser",
      Cookie: draftCookie,
    },
    body: JSON.stringify({
      draftPlanId: draft.draftPlanId,
      expectedRevision: draft.activeRevision,
      expectedInputHash: draft.activeInputHash,
      idempotencyKey,
      input,
    }),
  });
}

test("guest input hash는 key 순서에 안정적이고 prompt/schema version 변경을 분리한다", async () => {
  const left = { goal: "운동", availability: { sessionMinutes: 20, availableDays: ["월", "수"] } };
  const reordered = { availability: { availableDays: ["월", "수"], sessionMinutes: 20 }, goal: "운동" };
  const baseline = await guestGoalInputHash(left);
  assert.equal(await guestGoalInputHash(reordered), baseline);
  assert.notEqual(await guestGoalInputHash(left, { promptVersion: "next-prompt" }), baseline);
  assert.notEqual(await guestGoalInputHash(left, { inputSchemaVersion: 2 }), baseline);
  assert.notEqual(await guestGoalInputHash(left, { outputSchemaVersion: "typed-plan-items-v2" }), baseline);
});

test("비회원은 실제 AI 계획의 일부만 하루 한 번 받고 같은 입력은 저장된 미리보기를 재사용한다", async () => {
  const kv = memoryKv();
  const env = testEnv({ USERS_KV: kv });
  let providerCalls = 0;
  let firstDraftCookie = "";

  await withMockFetch(async (_url, init) => {
    providerCalls += 1;
    return new Response(JSON.stringify({
      output_text: JSON.stringify(generatedPlanForProviderRequest(init)),
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Request-ID": "fixture-request" },
    });
  }, async () => {
    const firstResponse = await worker.fetch(previewRequest(), env);
    const first = await firstResponse.json();
    assert.equal(firstResponse.status, 200);
    assert.equal(first.ok, true);
    assert.equal(first.cached, false);
    assert.equal(first.preview.firstAction, generatedPlan().firstAction);
    assert.equal(first.preview.weekPlan.length, 5);
    assert.equal(first.preview.firstWeekSchedule.length, 7);
    assert.equal(first.preview.todaySchedule.length, 1);
    assert.equal(typeof first.draftPlanId, "string");
    assert.notEqual(first.draftPlanId, "guest-draft-fixture");
    assert.match(first.draftPlanId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal("draftPlan" in first, false);
    assert.equal("fullSchedule" in first.preview, false);
    assert.equal("dashboard" in first.preview, false);
    assert.equal("checkInRules" in first.preview, false);
    firstDraftCookie = cookiePair(firstResponse, "omw_guest_goal_draft");
    assert.match(firstDraftCookie, /^omw_guest_goal_draft=[a-f0-9]{64}$/);
    assert.match(firstResponse.headers.get("set-cookie") || "", /HttpOnly; Secure; SameSite=Lax/);

    const secondResponse = await worker.fetch(previewRequest(), env);
    const second = await secondResponse.json();
    assert.equal(secondResponse.status, 200);
    assert.equal(second.cached, true);
    assert.deepEqual(second.preview, first.preview);
    assert.equal(cookiePair(secondResponse, "omw_guest_goal_draft"), firstDraftCookie);
  });

  assert.equal(providerCalls, 1);
  assert.equal(kv.values.size, 2);
  for (const [key, value] of kv.values) {
    assert.match(key, /^guest-ai-preview(?:-day)?:[a-f0-9]{64}(?::[a-f0-9]{64})?$/);
    assert.equal(value.includes(TEST_IP), false);
    assert.equal(value.includes("fullSchedule"), false);
    assert.equal(value.includes(goalInput().goal), false);
  }
  assert.match(firstDraftCookie, /^omw_guest_goal_draft=[a-f0-9]{64}$/);
  const storage = env.GUEST_PLAN_DRAFTS.storages.get((await worker.fetch(previewRequest(), env).then((response) => response.json())).draftPlanId);
  const storedDraft = await storage.get("draft");
  assert.equal(JSON.stringify(storedDraft).includes(TEST_IP), false);
  assert.equal(JSON.stringify(storedDraft).includes(firstDraftCookie.split("=")[1]), false);
  assert.equal(storedDraft.status, "READY");
  assert.equal(storedDraft.activePlanInputHash, storedDraft.activeInputHash);
  assert.ok(storage.alarmAt > Date.now());

  const changedResponse = await worker.fetch(previewRequest(goalInput("30일 안에 운동 습관 만들기")), env);
  const changed = await changedResponse.json();
  assert.equal(changedResponse.status, 429);
  assert.equal(changed.code, "GUEST_PREVIEW_ALREADY_USED");
  assert.equal(providerCalls, 1);
});

test("서로 다른 Worker isolate의 동시 최초 요청도 같은 actor와 input을 한 Durable Object로 모은다", async () => {
  const kv = memoryKv();
  const env = testEnv({ USERS_KV: kv });
  let providerCalls = 0;
  let releaseProvider;
  const providerGate = new Promise((resolve) => { releaseProvider = resolve; });

  await withMockFetch(async (_url, init) => {
    providerCalls += 1;
    await providerGate;
    return new Response(JSON.stringify({
      output_text: JSON.stringify(generatedPlanForProviderRequest(init)),
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }, async () => {
    const firstPromise = worker.fetch(previewRequest(), env);
    const secondPromise = worker.fetch(previewRequest(), env);
    await new Promise((resolve) => setImmediate(resolve));
    releaseProvider();
    const responses = await Promise.all([firstPromise, secondPromise]);
    assert.ok(responses.every((response) => response.status === 200 || response.status === 409));
    assert.ok(responses.some((response) => response.status === 200));
    const successfulBodies = await Promise.all(
      responses.filter((response) => response.status === 200).map((response) => response.json()),
    );
    const first = successfulBodies[0];
    assert.match(first.draftPlanId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.ok(successfulBodies.every((body) => body.draftPlanId === first.draftPlanId));

    const retry = await worker.fetch(previewRequest(), env);
    assert.equal(retry.status, 200);
    const retried = await retry.json();
    assert.equal(retried.cached, true);
    assert.equal(retried.draftPlanId, first.draftPlanId);
  });

  assert.equal(providerCalls, 1);
  assert.equal(env.GUEST_PLAN_DRAFTS.storages.size, 1);
});

test("비회원 AI 미리보기는 rate limiter, 저장소, API key, pseudonymous identity가 없으면 호출 전에 닫힌다", async () => {
  const cases = [
    testEnv({ AI_RATE_LIMITER: null }),
    testEnv({ USERS_KV: null }),
    testEnv({ GUEST_PLAN_DRAFTS: null }),
    testEnv({ OPENAI_API_KEY: "" }),
    testEnv({ SESSION_SECRET: "" }),
    testEnv({ SESSION_SECRET: "short" }),
  ];
  let providerCalls = 0;

  await withMockFetch(async () => {
    providerCalls += 1;
    throw new Error("provider must not be called");
  }, async () => {
    for (const env of cases) {
      const healthResponse = await worker.fetch(new Request("https://preview.example/api/health"), env);
      assert.equal((await healthResponse.json()).services.ai, false);
      const response = await worker.fetch(previewRequest(), env);
      assert.equal(response.status, 503);
      const revisionResponse = await worker.fetch(new Request("https://preview.example/api/ai/goal-draft/revise", {
        method: "POST",
      }), env);
      assert.equal(revisionResponse.status, 503);
    }
    const readyHealth = await worker.fetch(new Request("https://preview.example/api/health"), testEnv());
    assert.equal((await readyHealth.json()).services.ai, true);
    const noIpRequest = previewRequest();
    noIpRequest.headers.delete("CF-Connecting-IP");
    const noIpResponse = await worker.fetch(noIpRequest, testEnv());
    assert.equal(noIpResponse.status, 503);
  });

  assert.equal(providerCalls, 0);
});

test("로그인 뒤 같은 익명 초안을 추가 AI 호출과 크레딧 차감 없이 한 계정에 확정한다", async () => {
  const kv = memoryKv();
  const env = testEnv({ USERS_KV: kv });
  const { body: draft, draftCookie, providerCalls } = await createGuestDraft(env);
  const { user, sessionToken } = await createAuthenticatedFixture(kv, "guest-claim-user");
  const request = () => claimRequest({ draft, sessionToken, draftCookie });

  const firstResponse = await worker.fetch(request(), env);
  const first = await firstResponse.json();
  assert.equal(firstResponse.status, 200);
  assert.equal(first.chargedCredits, 0);
  assert.equal(first.plan.firstWeekSchedule.length, 7);
  const secondResponse = await worker.fetch(request(), env);
  assert.equal(secondResponse.status, 200);
  assert.equal((await secondResponse.json()).chargedCredits, 0);
  assert.equal(providerCalls, 1);
  assert.ok((await kv.get(`user:${user.id}`, "json")).goalPlanGeneratedAt);
  const storedDraft = await env.GUEST_PLAN_DRAFTS.storages.get(draft.draftPlanId).get("draft");
  assert.equal(storedDraft.claimedBy, user.id);
  assert.equal(storedDraft.status, "CLAIMED");
  const appState = await kv.get(`appstate:${user.id}`, "json");
  assert.equal(JSON.parse(appState.state.omwExecutionPlan).planId, draft.draftPlanId);
});

test("익명 전체 초안은 인증과 원래 브라우저의 HttpOnly capability가 모두 있어야 조회된다", async () => {
  const kv = memoryKv();
  const env = testEnv({ USERS_KV: kv });
  const { body: draft, draftCookie } = await createGuestDraft(env);
  const { sessionToken } = await createAuthenticatedFixture(kv, "claim-boundary-user");

  const unauthenticated = await worker.fetch(claimRequest({ draft, draftCookie }), env);
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).code, "AUTH_REQUIRED");

  const missingCapability = await worker.fetch(claimRequest({ draft, sessionToken }), env);
  assert.equal(missingCapability.status, 403);
  assert.equal((await missingCapability.json()).code, "DRAFT_PLAN_ACCESS_DENIED");

  const wrongCapability = await worker.fetch(claimRequest({
    draft,
    sessionToken,
    draftCookie: `omw_guest_goal_draft=${"0".repeat(64)}`,
  }), env);
  assert.equal(wrongCapability.status, 403);
  assert.equal((await wrongCapability.json()).code, "DRAFT_PLAN_ACCESS_DENIED");
});

test("이미 claim된 초안은 같은 계정의 네트워크 재시도에는 멱등이고 다른 계정에는 닫힌다", async () => {
  const kv = memoryKv();
  const env = testEnv({ USERS_KV: kv });
  const { body: draft, draftCookie } = await createGuestDraft(env);
  const firstUser = await createAuthenticatedFixture(kv, "claim-owner");
  const otherUser = await createAuthenticatedFixture(kv, "claim-other-user");

  const first = await worker.fetch(claimRequest({ draft, sessionToken: firstUser.sessionToken, draftCookie }), env);
  assert.equal(first.status, 200);
  const retry = await worker.fetch(claimRequest({ draft, sessionToken: firstUser.sessionToken, draftCookie }), env);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).chargedCredits, 0);

  const other = await worker.fetch(claimRequest({ draft, sessionToken: otherUser.sessionToken, draftCookie }), env);
  assert.equal(other.status, 409);
  assert.equal((await other.json()).code, "DRAFT_PLAN_ALREADY_CLAIMED");
});

test("같은 isolate에서 동시에 claim하면 draft 단위 잠금으로 한 계정만 확정된다", async () => {
  const kv = memoryKv();
  const env = testEnv({ USERS_KV: kv });
  const { body: draft, draftCookie } = await createGuestDraft(env);
  const firstUser = await createAuthenticatedFixture(kv, "concurrent-owner-a");
  const secondUser = await createAuthenticatedFixture(kv, "concurrent-owner-b");

  const [first, second] = await Promise.all([
    worker.fetch(claimRequest({ draft, sessionToken: firstUser.sessionToken, draftCookie }), env),
    worker.fetch(claimRequest({ draft, sessionToken: secondUser.sessionToken, draftCookie }), env),
  ]);
  assert.deepEqual([first.status, second.status].sort(), [200, 409]);
  const storedDraft = await env.GUEST_PLAN_DRAFTS.storages.get(draft.draftPlanId).get("draft");
  assert.ok([firstUser.user.id, secondUser.user.id].includes(storedDraft.claimedBy));
});

test("만료되거나 존재하지 않는 초안은 claim되지 않는다", async () => {
  const kv = memoryKv();
  const env = testEnv({ USERS_KV: kv });
  const { body: draft, draftCookie } = await createGuestDraft(env);
  const { sessionToken } = await createAuthenticatedFixture(kv, "expired-claim-user");
  const storage = env.GUEST_PLAN_DRAFTS.storages.get(draft.draftPlanId);
  const storedDraft = await storage.get("draft");
  await storage.put("draft", { ...storedDraft, expiresAt: Date.now() - 1 });

  const expired = await worker.fetch(claimRequest({ draft, sessionToken, draftCookie }), env);
  assert.equal(expired.status, 410);
  assert.equal((await expired.json()).code, "DRAFT_PLAN_EXPIRED");
  assert.equal(await storage.get("draft"), undefined);

  const missing = await worker.fetch(claimRequest({ draftPlanId: "00000000-0000-4000-8000-000000000000", activeRevision: draft.activeRevision, activeInputHash: draft.activeInputHash, sessionToken, draftCookie }), env);
  assert.equal(missing.status, 410);
  assert.equal((await missing.json()).code, "DRAFT_PLAN_EXPIRED");
});

test("명시적 revision 성공 뒤에만 active input과 plan이 함께 교체되고 stale claim은 거부된다", async () => {
  const kv = memoryKv();
  const env = testEnv({ USERS_KV: kv });
  const { body: original, draftCookie, providerCalls: initialCalls } = await createGuestDraft(env);
  const changedInput = goalInput("30일 동안 주 3회 운동 습관 만들기");
  let revisionCalls = 0;
  let revisedResponse;
  let lostResponseRetry;
  await withMockFetch(async (_url, init) => {
    revisionCalls += 1;
    return new Response(JSON.stringify({
      output_text: JSON.stringify(generatedPlanForProviderRequest(init)),
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }, async () => {
    revisedResponse = await worker.fetch(revisionRequest({ draft: original, draftCookie, input: changedInput }), env);
    lostResponseRetry = await worker.fetch(revisionRequest({ draft: original, draftCookie, input: changedInput }), env);
  });
  const revised = await revisedResponse.json();
  const retried = await lostResponseRetry.json();
  assert.equal(revisedResponse.status, 200);
  assert.equal(lostResponseRetry.status, 200);
  assert.equal(revised.activeRevision, 2);
  assert.equal(retried.activeRevision, 2);
  assert.equal(retried.cached, true);
  assert.notEqual(revised.activeInputHash, original.activeInputHash);
  assert.equal(revised.activeInput.goal, changedInput.goal);
  assert.equal(retried.activeInputHash, revised.activeInputHash);
  assert.equal(revisionCalls, 1);
  assert.equal(initialCalls + revisionCalls, 2);

  const { sessionToken } = await createAuthenticatedFixture(kv, "revision-claim-user");
  const stale = await worker.fetch(claimRequest({ draft: original, sessionToken, draftCookie }), env);
  assert.equal(stale.status, 412);
  assert.equal((await stale.json()).code, "DRAFT_REVISION_CONFLICT");
  const current = await worker.fetch(claimRequest({ draft: revised, sessionToken, draftCookie }), env);
  assert.equal(current.status, 200);
  const activatedPlan = (await current.json()).activatedPlan;
  assert.equal(activatedPlan.goal, changedInput.goal);
  assert.equal(activatedPlan.planId, original.draftPlanId);
});

test("DO claim 뒤 회원 저장이 한 번 실패해도 같은 사용자의 재시도가 stable planId로 복구한다", async () => {
  const kv = memoryKv();
  const env = testEnv({ USERS_KV: kv });
  const { body: draft, draftCookie } = await createGuestDraft(env);
  const { user, sessionToken } = await createAuthenticatedFixture(kv, "member-upsert-retry-user");
  const originalPut = kv.put.bind(kv);
  let failAppStateOnce = true;
  kv.put = async (key, value, options) => {
    if (failAppStateOnce && key === `appstate:${user.id}`) {
      failAppStateOnce = false;
      throw new Error("fixture member storage failure");
    }
    return originalPut(key, value, options);
  };

  const first = await worker.fetch(claimRequest({ draft, sessionToken, draftCookie }), env);
  assert.equal(first.status, 503);
  assert.equal((await first.json()).code, "DRAFT_MEMBER_SAVE_RETRY");
  assert.equal((await env.GUEST_PLAN_DRAFTS.storages.get(draft.draftPlanId).get("draft")).claimedBy, user.id);
  assert.equal((await kv.get(`user:${user.id}`, "json")).goalPlanGeneratedAt, undefined);

  const retry = await worker.fetch(claimRequest({ draft, sessionToken, draftCookie }), env);
  assert.equal(retry.status, 200);
  const result = await retry.json();
  assert.equal(result.activatedPlan.planId, draft.draftPlanId);
  assert.equal(JSON.parse((await kv.get(`appstate:${user.id}`, "json")).state.omwExecutionPlan).planId, draft.draftPlanId);
  assert.ok((await kv.get(`user:${user.id}`, "json")).goalPlanGeneratedAt);
});

test("revision은 자료·요일·시간·범위를 새 schedule에 함께 반영한다", async () => {
  const env = testEnv();
  const { body: original, draftCookie } = await createGuestDraft(env);
  const changedInput = goalInput("영어 원서 6장까지 읽기");
  changedInput.material = {
    hasMaterial: true,
    name: "영어 원서 A",
    targetRange: "1장~6장",
    currentProgress: "1장 시작 전",
    completionRule: "핵심 문장 3개 기록",
    unit: "장",
  };
  changedInput.availability = {
    ...changedInput.availability,
    availableDays: ["수", "토"],
    weeklyFrequency: 2,
    sessionMinutes: 25,
  };
  const response = await withMockFetch(async (_url, init) => new Response(JSON.stringify({
    output_text: JSON.stringify(constrainedPlanForProviderRequest(init)),
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
  }), { status: 200, headers: { "Content-Type": "application/json" } }), () => worker.fetch(revisionRequest({
    draft: original,
    draftCookie,
    input: changedInput,
    idempotencyKey: "revision:material-schedule-0001",
  }), env));
  assert.equal(response.status, 200);
  const revised = await response.json();
  const stored = await env.GUEST_PLAN_DRAFTS.storages.get(original.draftPlanId).get("draft");
  const actionDays = stored.activePlan.firstWeekSchedule.filter((day) => day.items.some((item) => item.type === "ACTION"));
  assert.deepEqual(actionDays.map((day) => day.dayLabel), ["수", "토"]);
  assert.ok(actionDays.flatMap((day) => day.items).every((item) => item.sourceReference === "영어 원서 A"));
  assert.ok(actionDays.flatMap((day) => day.items).every((item) => item.quantityOrRange === "1장~6장"));
  assert.ok(actionDays.flatMap((day) => day.items).every((item) => item.durationMinutes === 25));
  assert.equal(stored.activeInputHash, revised.activeInputHash);
  assert.equal(stored.activePlanInputHash, revised.activeInputHash);
});

test("revision의 잘못된 JSON과 validator 실패는 이전 active revision을 그대로 유지한다", async () => {
  const variants = [
    { name: "invalid-json", output: () => "{not-json" },
    {
      name: "validation-failure",
      output: (init) => {
        const invalid = generatedPlanForProviderRequest(init);
        invalid.firstWeekSchedule = invalid.firstWeekSchedule.map((day) => ({ ...day, items: [] }));
        return JSON.stringify(invalid);
      },
    },
  ];
  for (const variant of variants) {
    const env = testEnv();
    const { body: original, draftCookie } = await createGuestDraft(env);
    const response = await withMockFetch(async (_url, init) => new Response(JSON.stringify({
      output_text: variant.output(init),
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }), () => worker.fetch(revisionRequest({
      draft: original,
      draftCookie,
      input: goalInput(`실패 fixture ${variant.name}`),
      idempotencyKey: `revision:${variant.name}-0001`,
    }), env));
    assert.equal(response.status, 502, variant.name);
    const stored = await env.GUEST_PLAN_DRAFTS.storages.get(original.draftPlanId).get("draft");
    assert.equal(stored.status, "READY", variant.name);
    assert.equal(stored.activeRevision, 1, variant.name);
    assert.equal(stored.activeInputHash, original.activeInputHash, variant.name);
    assert.equal(stored.activePlanInputHash, original.activeInputHash, variant.name);
  }
});
