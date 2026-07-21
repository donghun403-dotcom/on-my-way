import test from "node:test";
import assert from "node:assert/strict";

import { createAiGoalPlan } from "./ai-goal-plan.mjs";

function validPlan(overrides = {}) {
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
  };
}

function responseFor(plan) {
  return Response.json({ output_text: JSON.stringify(plan), usage: { input_tokens: 10, output_tokens: 20 } }, {
    headers: { "x-request-id": "req_goal_context" },
  });
}

test("목표·현재 상태·가능 시간·기존 루틴을 OpenAI 요청에 전달하고 표시용 스타일을 제한한다", async () => {
  let outbound;
  const result = await createAiGoalPlan(input(), {
    apiKey: "fixture-key",
    fetchImpl: async (url, options) => {
      outbound = { url: String(url), body: JSON.parse(options.body) };
      return responseFor(validPlan());
    },
  });

  assert.equal(outbound.url, "https://api.openai.com/v1/responses");
  assert.equal(outbound.body.store, false);
  assert.match(outbound.body.input, /첫 유료 고객 10명/);
  assert.match(outbound.body.input, /아이디어만 있고 평일 1시간, 주말 3시간 가능/);
  assert.match(outbound.body.input, /저녁 식사 후 노트북 열기/);
  assert.match(outbound.body.instructions, /다른 목표 분야의 예시나 템플릿 문구를 재사용하지 마세요/);
  assert.equal(result.plan.planningStyle, "유연 조정형 계획");
});

test("비시험 목표에 시험용 일정이 섞이면 계획을 반환하지 않는다", async () => {
  await assert.rejects(
    createAiGoalPlan(input(), {
      apiKey: "fixture-key",
      fetchImpl: async () => responseFor(validPlan({ firstAction: "오답 정리 20분" })),
    }),
    (error) => error.code === "AI_PLAN_GOAL_MISMATCH" && error.status === 502 && error.providerCalled === true,
  );
});

test("시험 목표에는 목표와 일치하는 오답 정리를 허용한다", async () => {
  const result = await createAiGoalPlan(input("3개월 안에 토익 900점 달성하기"), {
    apiKey: "fixture-key",
    fetchImpl: async () => responseFor(validPlan({ firstAction: "오답 정리 20분" })),
  });
  assert.equal(result.plan.firstAction, "오답 정리 20분");
});
