import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.mjs";

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
    goal,
    periodDays: 90,
    currentState: "아이디어가 있고 평일 한 시간과 주말 세 시간을 쓸 수 있어요.",
    routine: {
      readiness: "바로 실행할 수 있어요",
      preferredTime: "저녁",
      existingRoutine: "저녁 식사 후 노트북을 열어요.",
    },
  };
}

function generatedPlan() {
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
  const kv = overrides.USERS_KV || memoryKv();
  return {
    APP_ENV: "test",
    USERS_KV: kv,
    SESSION_SECRET: TEST_SECRET,
    OPENAI_API_KEY: "fixture-openai-key",
    OPENAI_MODEL: "fixture-model",
    AI_RATE_LIMITER: { async limit() { return { success: true }; } },
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

test("비회원은 실제 AI 계획의 일부만 하루 한 번 받고 같은 입력은 저장된 미리보기를 재사용한다", async () => {
  const kv = memoryKv();
  const env = testEnv({ USERS_KV: kv });
  let providerCalls = 0;

  await withMockFetch(async () => {
    providerCalls += 1;
    return new Response(JSON.stringify({
      output_text: JSON.stringify(generatedPlan()),
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
    assert.equal(first.preview.weekPlan.length, 3);
    assert.equal(first.preview.todaySchedule.length, 1);
    assert.equal("fullSchedule" in first.preview, false);
    assert.equal("dashboard" in first.preview, false);
    assert.equal("checkInRules" in first.preview, false);

    const secondResponse = await worker.fetch(previewRequest(), env);
    const second = await secondResponse.json();
    assert.equal(secondResponse.status, 200);
    assert.equal(second.cached, true);
    assert.deepEqual(second.preview, first.preview);
  });

  assert.equal(providerCalls, 1);
  assert.equal(kv.values.size, 1);
  const [[storageKey, storedValue]] = kv.values;
  assert.match(storageKey, /^guest-ai-preview:[a-f0-9]{64}$/);
  assert.equal(storageKey.includes(TEST_IP), false);
  assert.equal(storedValue.includes(TEST_IP), false);
  assert.equal(kv.options.get(storageKey).expirationTtl, 24 * 60 * 60);

  const changedResponse = await worker.fetch(previewRequest(goalInput("30일 안에 운동 습관 만들기")), env);
  const changed = await changedResponse.json();
  assert.equal(changedResponse.status, 429);
  assert.equal(changed.code, "GUEST_PREVIEW_ALREADY_USED");
  assert.equal(providerCalls, 1);
});

test("비회원 AI 미리보기는 rate limiter, 저장소, API key, pseudonymous identity가 없으면 호출 전에 닫힌다", async () => {
  const cases = [
    testEnv({ AI_RATE_LIMITER: null }),
    testEnv({ USERS_KV: null }),
    testEnv({ OPENAI_API_KEY: "" }),
    testEnv({ SESSION_SECRET: "short" }),
  ];
  let providerCalls = 0;

  await withMockFetch(async () => {
    providerCalls += 1;
    throw new Error("provider must not be called");
  }, async () => {
    for (const env of cases) {
      const response = await worker.fetch(previewRequest(), env);
      assert.equal(response.status, 503);
    }
    const noIpRequest = previewRequest();
    noIpRequest.headers.delete("CF-Connecting-IP");
    const noIpResponse = await worker.fetch(noIpRequest, testEnv());
    assert.equal(noIpResponse.status, 503);
  });

  assert.equal(providerCalls, 0);
});
