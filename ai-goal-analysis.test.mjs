import test from "node:test";
import assert from "node:assert/strict";

import {
  TARGET_DATE_QUESTION_ID,
  createGoalAnalysis,
  normalizeConditions,
  normalizeGoalAnalysis,
} from "./ai-goal-analysis.mjs";

function analysisPayload(overrides = {}) {
  return {
    goal: "10월 말까지 토익 900점 달성",
    currentState: ["현재 점수: 650점 정도"],
    availableTime: ["평일 저녁 30분"],
    questions: [
      { id: "target_date", question: "정확한 시험일이 정해졌나요?", type: "date", options: [], defaultValue: "2025-10-31" },
      { id: "weekend", question: "주말에도 공부할 수 있나요?", type: "choice", options: ["가능해요", "어려워요", "상황에 따라 달라요"], defaultValue: "" },
    ],
    ...overrides,
  };
}

function fetchStub(outputText, { ok = true, body } = {}) {
  return async () => ({
    ok,
    status: ok ? 200 : 502,
    headers: { get: () => "req-analysis" },
    json: async () => body || { output_text: outputText, usage: { total_tokens: 120 } },
  });
}

test("자연어 목표를 이해한 내용과 확인 질문으로 정리한다", () => {
  const result = normalizeGoalAnalysis(analysisPayload());
  assert.equal(result.goal, "10월 말까지 토익 900점 달성");
  assert.deepEqual(result.currentState, ["현재 점수: 650점 정도"]);
  assert.deepEqual(result.availableTime, ["평일 저녁 30분"]);
  assert.equal(result.questions.length, 2);
  assert.equal(result.questions[0].type, "date");
  assert.deepEqual(result.questions[1].options, ["가능해요", "어려워요", "상황에 따라 달라요"]);
});

test("기간은 2단계에서만 받으므로 날짜 질문이 없으면 항상 보강한다", () => {
  const result = normalizeGoalAnalysis(analysisPayload({
    questions: [
      { id: "weekend", question: "주말에도 가능한가요?", type: "choice", options: ["가능해요", "어려워요"], defaultValue: "" },
    ],
  }));
  assert.equal(result.questions[0].id, TARGET_DATE_QUESTION_ID);
  assert.equal(result.questions[0].type, "date");
  assert.ok(result.questions.some((item) => item.id === "weekend"));
});

test("선택지가 부족한 choice 질문과 빈 질문은 버린다", () => {
  const result = normalizeGoalAnalysis(analysisPayload({
    questions: [
      { id: "a", question: "선택지가 하나뿐인 질문", type: "choice", options: ["가능해요"], defaultValue: "" },
      { id: "b", question: "   ", type: "choice", options: ["가능해요", "어려워요"], defaultValue: "" },
      { id: "target_date", question: "언제까지 끝내고 싶나요?", type: "date", options: [], defaultValue: "" },
    ],
  }));
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].type, "date");
});

test("확인 질문은 최대 3개까지만 남긴다", () => {
  const many = Array.from({ length: 6 }, (_, index) => ({
    id: `q${index}`,
    question: `질문 ${index}`,
    type: "choice",
    options: ["예", "아니오"],
    defaultValue: "",
  }));
  const result = normalizeGoalAnalysis(analysisPayload({ questions: many }));
  assert.ok(result.questions.length <= 3);
});

test("구조화된 조건을 그대로 반환하고 범위를 벗어난 값은 자른다", () => {
  const result = normalizeConditions({
    availableDays: ["월", "화", "수", "목", "금", "토", "일"],
    sessionMinutes: 20,
    weeklyFrequency: 7,
    periodDays: 30,
  });
  assert.deepEqual(result, {
    availableDays: ["월", "화", "수", "목", "금", "토", "일"],
    sessionMinutes: 20,
    weeklyFrequency: 7,
    periodDays: 30,
  });

  const clamped = normalizeConditions({ availableDays: ["화"], sessionMinutes: 999, weeklyFrequency: 12, periodDays: 9000 });
  assert.equal(clamped.sessionMinutes, 180);
  assert.equal(clamped.weeklyFrequency, 7);
  assert.equal(clamped.periodDays, 730);
});

test("요일이 아닌 값은 버리고 순서는 월~일로 정규화한다", () => {
  const result = normalizeConditions({ availableDays: ["일", "monday", "월", "밤", "수"], sessionMinutes: 0, weeklyFrequency: 0, periodDays: 0 });
  assert.deepEqual(result.availableDays, ["월", "수", "일"]);
});

test("횟수를 말하지 않았으면 나열한 요일 수가 주당 횟수다", () => {
  const result = normalizeConditions({ availableDays: ["화", "목"], sessionMinutes: 45, weeklyFrequency: 0, periodDays: 0 });
  assert.equal(result.weeklyFrequency, 2);
});

test("조건이 아예 없어도(구버전 응답) 빈 조건으로 계약을 지킨다", () => {
  const result = normalizeGoalAnalysis(analysisPayload());
  assert.deepEqual(result.conditions, { availableDays: [], sessionMinutes: 0, weeklyFrequency: 0, periodDays: 0 });

  const withConditions = normalizeGoalAnalysis(analysisPayload({
    conditions: { availableDays: ["월", "수", "금"], sessionMinutes: 30, weeklyFrequency: 3, periodDays: 90 },
  }));
  assert.deepEqual(withConditions.conditions, { availableDays: ["월", "수", "금"], sessionMinutes: 30, weeklyFrequency: 3, periodDays: 90 });
});

test("원문에 명시된 요일·시간·기간은 모델이 빠뜨려도 원문이 이긴다", async () => {
  const { reconcileConditionsWithGoalText } = await import("./ai-goal-analysis.mjs");
  // Staging에서 실제 관측된 실패: 목 누락, "두 달" → 30일
  const repaired = reconcileConditionsWithGoalText(
    { availableDays: ["화"], sessionMinutes: 30, weeklyFrequency: 1, periodDays: 30 },
    "잠들기 전에 꾸준히 책 읽는 사람이 되고 싶어요. 화요일이랑 목요일 밤에 한 시간 정도는 낼 수 있을 것 같아요. 두 달 정도 해보고 싶습니다.",
  );
  assert.deepEqual(repaired.availableDays, ["화", "목"]);
  assert.equal(repaired.sessionMinutes, 60);
  assert.equal(repaired.weeklyFrequency, 2);
  assert.equal(repaired.periodDays, 60);

  // 원문에 없는 요일을 모델이 지어냈다면(프롬프트 예시에서 샌 "금" 등) 버린다
  const hallucinated = reconcileConditionsWithGoalText(
    { availableDays: ["화", "금"], sessionMinutes: 60, weeklyFrequency: 2, periodDays: 60 },
    "화요일이랑 목요일 밤에 한 시간 정도는 낼 수 있을 것 같아요. 두 달 정도 해보고 싶습니다.",
  );
  assert.deepEqual(hallucinated.availableDays, ["화", "목"]);

  // 부정 표현: 언급됐어도 "안 되는" 요일은 넣지 않고, 모델이 넣었으면 뺀다
  const negated = reconcileConditionsWithGoalText(
    { availableDays: ["월", "수"], sessionMinutes: 0, weeklyFrequency: 2, periodDays: 0 },
    "월요일과 금요일에 할 수 있어요. 수요일은 안 돼요.",
  );
  assert.deepEqual(negated.availableDays, ["월", "금"]);

  // 원문에 없는 조건은 건드리지 않는다
  const untouched = reconcileConditionsWithGoalText(
    { availableDays: [], sessionMinutes: 0, weeklyFrequency: 0, periodDays: 0 },
    "그냥 꾸준히 하고 싶어요.",
  );
  assert.deepEqual(untouched, { availableDays: [], sessionMinutes: 0, weeklyFrequency: 0, periodDays: 0 });

  // 매일 + 숫자 기간 + 분 단위
  const daily = reconcileConditionsWithGoalText(
    { availableDays: ["월", "수", "금"], sessionMinutes: 25, weeklyFrequency: 3, periodDays: 90 },
    "30일 동안 매일 자기 전 20분 독서하기",
  );
  assert.equal(daily.availableDays.length, 7);
  assert.equal(daily.sessionMinutes, 20);
  assert.equal(daily.periodDays, 30);
});

test("목표를 이해하지 못하면 성공으로 처리하지 않는다", () => {
  assert.throws(() => normalizeGoalAnalysis({ goal: "  ", questions: [] }), /목표를 이해하지 못했어요/);
});

test("API 키가 없으면 provider를 호출하지 않고 503으로 실패한다", async () => {
  let called = false;
  await assert.rejects(
    () => createGoalAnalysis({ goalText: "토익 900점" }, { apiKey: "", fetchImpl: () => { called = true; } }),
    (error) => error.status === 503,
  );
  assert.equal(called, false);
});

test("빈 목표 입력은 provider 호출 전에 400으로 막는다", async () => {
  let called = false;
  await assert.rejects(
    () => createGoalAnalysis({ goalText: "   " }, { apiKey: "key", fetchImpl: () => { called = true; } }),
    (error) => error.status === 400,
  );
  assert.equal(called, false);
});

test("일정표 없이 이해 내용만 반환한다", async () => {
  const { analysis, requestId } = await createGoalAnalysis(
    { goalText: "10월까지 토익 900점 받고 싶어요. 현재 650점이고 평일 저녁 30분 가능합니다." },
    { apiKey: "key", fetchImpl: fetchStub(JSON.stringify(analysisPayload())) },
  );
  assert.equal(analysis.goal, "10월 말까지 토익 900점 달성");
  assert.equal(requestId, "req-analysis");
  assert.equal(analysis.firstWeekSchedule, undefined);
  assert.equal(analysis.questions.length, 2);
});

test("해석할 수 없는 응답은 502와 providerCalled로 보고한다", async () => {
  await assert.rejects(
    () => createGoalAnalysis({ goalText: "토익 900점" }, { apiKey: "key", fetchImpl: fetchStub("not-json") }),
    (error) => error.status === 502 && error.providerCalled === true,
  );
});
