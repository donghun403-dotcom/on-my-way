import test from "node:test";
import assert from "node:assert/strict";

import { createAiGoalPlan, validateGeneratedPlan } from "./ai-goal-plan.mjs";
import {
  AI_OUTPUT_BUDGET_VERSION,
  GOAL_PLAN_MAX_OUTPUT_TOKENS,
} from "./ai-plan-output-policy.mjs";

function validPlan(overrides = {}) {
  const planId = "draft-fixture-plan";
  const dayLabels = ["월", "화", "수", "목", "금", "토", "일"];
  return {
    personalitySummary: "작은 실행을 반복할 때 강점이 살아나요.",
    planningStyle: "유연 조정형: 하루 컨디션에 따라 세 단계로 조절하는 긴 설명",
    firstAction: "잠재 고객 인터뷰 질문 5개 작성",
    weekTitle: "첫 고객 문제를 확인하는 주",
    weekPlan: ["고객 후보 정리", "인터뷰 요청", "인터뷰 진행", "문제 패턴 정리", "첫 제안 작성"],
    coachMessage: "평일 한 시간 안에서 고객 대화부터 시작해요.",
    dashboard: { goal: "첫 유료 고객 10명", progress: 10, pace: "고객 문제 확인 중" },
    fullSchedule: [
      { phase: "탐색", days: "1–7일", focus: "고객 문제 확인", successMetric: "인터뷰 3회" },
      { phase: "제안", days: "8–30일", focus: "첫 제안 검증", successMetric: "제안 10회" },
      { phase: "판매", days: "31–90일", focus: "유료 전환", successMetric: "유료 고객 10명" },
    ],
    todaySchedule: [
      { time: "저녁", durationMinutes: 20, task: "인터뷰 질문 작성", completionRule: "질문 5개를 쓰면 완료" },
      { time: "저녁", durationMinutes: 20, task: "고객 후보 찾기", completionRule: "후보 3명을 적으면 완료" },
    ],
    firstWeekSchedule: dayLabels.map((dayLabel, index) => ({
      dayNumber: index + 1,
      dayLabel,
      isRestDay: false,
      items: [{
        id: `fixture-action-${index + 1}`,
        planId,
        type: "ACTION",
        title: index ? "잠재 고객 인터뷰 결과 정리" : "잠재 고객 인터뷰 질문 5개 작성",
        sourceReference: "고객 인터뷰 노트",
        quantityOrRange: index ? "응답 1건" : "질문 5개",
        durationMinutes: 20,
        completionRule: index ? "핵심 문장 한 줄을 적으면 완료" : "질문 5개를 쓰면 완료",
        scheduledAt: `2026-07-${String(index + 20).padStart(2, "0")}T19:00:00+09:00`,
        status: "pending",
        recurrenceGroupId: "fixture-interview",
      }],
    })),
    assumptions: ["입력하지 않은 정보는 임의로 단정하지 않았어요."],
    checkInRules: ["실행 직후 체크", "막히면 5분으로 축소", "주말에 다음 주 조정"],
    fallbackPlan: "어려운 날에는 고객 후보 한 명만 적어요.",
    ...overrides,
  };
}

function input(goal = "90일 안에 첫 유료 고객 10명 만들기") {
  return {
    goal,
    periodDays: 90,
    currentState: "아이디어만 있고 평일 1시간, 주말 3시간 가능",
    routine: {
      readiness: "바로 실행하는 편이에요",
      preferredTime: "저녁",
      existingRoutine: "저녁 식사 후 노트북 열기",
    },
    birth: {},
    mbti: "",
    manseoryeok: {},
    recommendedPlanningStyle: "유연 조정형",
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

function validBlueprint(overrides = {}) {
  return {
    personalitySummary: "작은 실행을 반복할 때 강점이 살아나요.",
    planningStyle: "유연 조정형: 하루 컨디션에 따라 세 단계로 조절하는 긴 설명",
    weekTitle: "첫 고객 문제를 확인하는 주",
    coachMessage: "평일 한 시간 안에서 고객 대화부터 시작해요.",
    feasibility: "첫 주 고객 문제 확인 중",
    phases: [
      { phase: "탐색", days: "1–7일", focus: "고객 문제 확인", successMetric: "인터뷰 3회" },
      { phase: "제안", days: "8–30일", focus: "첫 제안 검증", successMetric: "제안 10회" },
      { phase: "판매", days: "31–90일", focus: "유료 전환", successMetric: "유료 고객 10명" },
    ],
    taskTemplates: [
      { type: "ACTION", title: "잠재 고객 인터뷰 질문 5개 작성", sourceReference: "고객 인터뷰 노트", quantityOrRange: "질문 5개", durationMinutes: 20, completionRule: "질문 5개를 쓰면 완료", time: "저녁" },
      { type: "ACTION", title: "잠재 고객 인터뷰 요청", sourceReference: "고객 인터뷰 노트", quantityOrRange: "고객 1명", durationMinutes: 20, completionRule: "요청 한 건을 보내면 완료", time: "저녁" },
      { type: "ACTION", title: "잠재 고객 응답 정리", sourceReference: "고객 인터뷰 노트", quantityOrRange: "응답 1건", durationMinutes: 20, completionRule: "핵심 문장 한 줄을 적으면 완료", time: "저녁" },
      { type: "REVIEW", title: "고객 문제 패턴 점검", sourceReference: "고객 인터뷰 노트", quantityOrRange: "응답 전체", durationMinutes: 0, completionRule: "반복 문제 한 줄을 고르면 완료", time: "주말" },
      { type: "TIP", title: "고객 표현을 그대로 기록하기", sourceReference: "", quantityOrRange: "", durationMinutes: 0, completionRule: "", time: "" },
    ],
    days: [
      { isRestDay: false, taskIndexes: [0, 4] },
      { isRestDay: false, taskIndexes: [1] },
      { isRestDay: false, taskIndexes: [2] },
      { isRestDay: false, taskIndexes: [1] },
      { isRestDay: false, taskIndexes: [2] },
      { isRestDay: false, taskIndexes: [3] },
      { isRestDay: false, taskIndexes: [0] },
    ],
    assumptions: ["입력하지 않은 정보는 임의로 단정하지 않았어요."],
    checkInRules: ["실행 직후 체크", "막히면 5분으로 축소", "주말에 다음 주 조정"],
    fallbackPlan: "어려운 날에는 고객 후보 한 명만 적어요.",
    ...overrides,
  };
}

function responseFor(plan) {
  return Response.json({
    status: "completed",
    output: [{
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: JSON.stringify(plan), parsed: plan }],
    }],
    usage: { input_tokens: 10, output_tokens: 20 },
  }, {
    headers: { "x-request-id": "req_goal_context" },
  });
}

test("목표·현재 상태·가능 시간·기존 루틴을 OpenAI 요청에 전달하고 표시용 스타일을 제한한다", async () => {
  let outbound;
  const result = await createAiGoalPlan(input(), {
    apiKey: "fixture-key",
    fetchImpl: async (url, options) => {
      outbound = { url: String(url), body: JSON.parse(options.body) };
      return responseFor(validBlueprint());
    },
  });

  assert.equal(outbound.url, "https://api.openai.com/v1/responses");
  assert.equal(outbound.body.store, false);
  assert.match(outbound.body.input, /첫 유료 고객 10명/);
  assert.match(outbound.body.input, /아이디어만 있고 평일 1시간, 주말 3시간 가능/);
  assert.match(outbound.body.input, /저녁 식사 후 노트북 열기/);
  assert.match(outbound.body.instructions, /다른 목표 분야의 예시나 템플릿 문구를 재사용하지 마세요/);
  assert.equal(outbound.body.max_output_tokens, GOAL_PLAN_MAX_OUTPUT_TOKENS);
  assert.equal(outbound.body.reasoning.effort, "none");
  assert.equal(outbound.body.text.verbosity, "low");
  assert.equal(result.contract.budgetVersion, AI_OUTPUT_BUDGET_VERSION);
  assert.equal(result.plan.planningStyle, "유연 조정형 계획");
  assert.equal(result.plan.firstWeekSchedule[0].items[0].planId, result.plan.firstWeekSchedule[1].items[0].planId);
  assert.equal(result.plan.firstWeekSchedule[0].items[0].status, "pending");
  assert.equal(result.plan.dashboard.goal, input().goal);
});

test("비시험 목표에 시험용 일정이 섞이면 계획을 반환하지 않는다", async () => {
  await assert.rejects(
    createAiGoalPlan(input(), {
      apiKey: "fixture-key",
      fetchImpl: async () => {
        const blueprint = validBlueprint();
        blueprint.taskTemplates[0] = { ...blueprint.taskTemplates[0], title: "오답 정리 20분" };
        return responseFor(blueprint);
      },
    }),
    (error) => (
      error.code === "AI_OUTPUT_DOMAIN_INVALID"
      && error.diagnostics.domainValidationCode === "GOAL_FIELD_MISMATCH"
      && error.status === 502
      && error.providerCalled === true
    ),
  );
});

test("시험 목표에는 목표와 일치하는 오답 정리를 허용한다", async () => {
  const result = await createAiGoalPlan(input("3개월 안에 토익 900점 달성하기"), {
    apiKey: "fixture-key",
    fetchImpl: async () => {
      const blueprint = validBlueprint();
      blueprint.taskTemplates[0] = { ...blueprint.taskTemplates[0], title: "오답 정리 20분" };
      return responseFor(blueprint);
    },
  });
  assert.equal(result.plan.firstAction, "오답 정리 20분");
});

test("첫 7일 검증은 휴식일 ACTION, 가능 시간 초과, 자료 미반영을 활성화 전에 거부한다", () => {
  const normalizedInput = input();
  normalizedInput.material = { hasMaterial: true, name: "고객 인터뷰 노트", targetRange: "10명", currentProgress: "0명", completionRule: "기록 완료", unit: "명" };
  normalizedInput.availability.sessionMinutes = 15;
  const plan = validPlan();
  plan.firstWeekSchedule[0].isRestDay = true;
  plan.firstWeekSchedule[0].items[0].durationMinutes = 30;
  plan.firstWeekSchedule.forEach((day) => { day.items[0].sourceReference = ""; });

  const errors = validateGeneratedPlan(normalizedInput, plan);
  assert.ok(errors.some((message) => message.includes("휴식일에 ACTION")));
  assert.ok(errors.some((message) => message.includes("회당 가능 시간을 초과")));
  assert.ok(errors.some((message) => message.includes("자료와 범위")));
});

test("첫 7일 ACTION의 stable id 충돌과 현재 draft planId 불일치를 거부한다", () => {
  const normalizedInput = input();
  normalizedInput.draftPlanId = "expected-draft-plan";
  const plan = validPlan();
  plan.firstWeekSchedule.forEach((day) => { day.items[0].planId = "expected-draft-plan"; });
  plan.firstWeekSchedule[1].items[0].id = plan.firstWeekSchedule[0].items[0].id;
  plan.firstWeekSchedule[2].items[0].planId = "other-plan";

  const errors = validateGeneratedPlan(normalizedInput, plan);
  assert.ok(errors.some((message) => message.includes("식별자가 중복")));
  assert.ok(errors.some((message) => message.includes("현재 계획 ID와 일치하지 않아요")));
});

test("제외 날짜와 완료 기준 누락은 계획 활성화 전에 거부한다", () => {
  const normalizedInput = input();
  normalizedInput.availability.excludedDates = ["2026-07-20"];
  const plan = validPlan();
  plan.firstWeekSchedule[1].items[0].completionRule = "";

  const errors = validateGeneratedPlan(normalizedInput, plan);
  assert.ok(errors.some((message) => message.includes("제외 날짜")));
  assert.ok(errors.some((message) => message.includes("완료 기준")));
});

test("잘못된 JSON과 필드가 빠진 AI 계획은 성공으로 처리하지 않는다", async () => {
  await assert.rejects(
    createAiGoalPlan(input(), {
      apiKey: "fixture-key",
      fetchImpl: async () => Response.json({
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "{broken-json" }] }],
      }),
    }),
    (error) => error.code === "AI_OUTPUT_PARSE_FAILED" && error.status === 502 && error.providerCalled === true,
  );

  const incomplete = validBlueprint();
  delete incomplete.days;
  await assert.rejects(
    createAiGoalPlan(input(), {
      apiKey: "fixture-key",
      fetchImpl: async () => responseFor(incomplete),
    }),
    (error) => error.code === "AI_OUTPUT_SCHEMA_INVALID" && error.status === 502,
  );
});

test("generation은 incomplete max tokens를 JSON parse error와 구분한다", async () => {
  await assert.rejects(
    createAiGoalPlan(input(), {
      apiKey: "fixture-key",
      fetchImpl: async () => Response.json({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [{ type: "message", content: [{ type: "output_text", text: '{"partial":' }] }],
        usage: { output_tokens: 3000 },
      }),
    }),
    (error) => (
      error.code === "AI_OUTPUT_INCOMPLETE_MAX_TOKENS"
      && error.diagnostics.outputTokens === 3000
      && error.providerCalled === true
    ),
  );
});
