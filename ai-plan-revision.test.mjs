import test from "node:test";
import assert from "node:assert/strict";
import { createAiPlanRevision } from "./ai-plan-revision.mjs";

const revisionOutput = {
  summary: "토익 900점 목표에 맞춰 교재 완주와 단어 학습 시간을 다시 배치했습니다.",
  revisionSummary: {
    goalAlignment: "독해 속도와 어휘 보강을 우선합니다.",
    materialPlan: "기출문제집 10회분을 모두 풀고 오답을 2회 복습합니다.",
    timePlan: "평일 90분, 주말 180분 안에서 배치합니다.",
    weeklyRule: "월~토 학습하고 일요일에 실전 1회를 풉니다.",
    assumptions: ["교재별 회차 분량은 사용자가 입력한 범위를 기준으로 합니다."],
  },
  weeklySchedule: ["월", "화", "수", "목", "금", "토", "일"].map((day) => ({
    day,
    isRestDay: day === "토",
    tasks: day === "토" ? [] : [{ time: "저녁", durationMinutes: 40, task: "단어 40개 암기", completionRule: "테스트 90% 이상" }],
  })),
  revisedTasks: [
    "월~금 저녁에 단어장 40개를 40분 동안 암기하고 테스트 90% 이상이면 완료합니다.",
    "월·수·금에는 RC 기출 1세트를 50분 안에 풀고 오답 이유를 기록합니다.",
    "화·목에는 LC 기출 1세트를 40분 동안 풀고 틀린 문장만 20분 복습합니다.",
    "일요일에는 실전 모의고사 1회를 제한 시간에 풀고 오답을 분류합니다.",
  ],
  changes: ["단어 학습을 20분에서 40분으로 늘림", "LC 쉐도잉을 주 3회로 조정"],
  ollieMessage: "입력한 교재와 가능한 시간을 기준으로 다시 맞췄어요.",
};

test("상세 교재·시간·분량 조건을 Responses API 구조화 입력으로 전달한다", async () => {
  let requestBody;
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ output_text: JSON.stringify(revisionOutput), usage: { total_tokens: 100 } }), {
      status: 200,
      headers: { "Content-Type": "application/json", "x-request-id": "req_detail" },
    });
  };

  const result = await createAiPlanRevision(
    {
      goal: "토익 900점",
      periodDays: 60,
      currentPlanText: "- 매일 단어 20분\n- 주 5회 LC 쉐도잉\n- 주 3회 RC 문제 풀이",
      revisionRequest: "Part 7 독해 비중을 높여줘.",
      revisionDetails: {
        materials: "ETS 기출문제집 LC·RC, 해커스 노랭이",
        targetCoverage: "기출 10회분 전체와 오답 2회 복습",
        schedule: { weekdayMinutes: 90, weekendMinutes: 180, preferredTime: "저녁", availableDays: ["월", "화", "수", "목", "금", "토", "일"] },
        focusAdjustment: { increase: "단어 20분에서 40분", decrease: "LC 쉐도잉 주 5회에서 3회", keepRules: "일요일 실전 1회" },
        constraints: "화요일은 야근이라 30분만 가능",
      },
    },
    { apiKey: "test-key", fetchImpl },
  );

  const sentInput = requestBody.input;
  assert.match(sentInput, /ETS 기출문제집/);
  assert.match(sentInput, /weekdayMinutes/);
  assert.match(sentInput, /화요일은 야근/);
  assert.equal(requestBody.text.format.strict, true);
  assert.ok(requestBody.text.format.schema.properties.revisionSummary);
  assert.equal(requestBody.text.format.schema.properties.weeklySchedule.minItems, 7);
  assert.equal(result.revision.revisionSummary.timePlan, revisionOutput.revisionSummary.timePlan);
  assert.equal(result.revision.weeklySchedule.length, 7);
  assert.equal(result.requestId, "req_detail");
});

test("자유 입력이 없어도 상세 조건이 있으면 변경안을 만들 수 있다", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ output_text: JSON.stringify(revisionOutput) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const result = await createAiPlanRevision(
    {
      goal: "교재 완주",
      currentPlanText: "- 매일 30분 공부",
      revisionDetails: { materials: "보유 교재 2권", targetCoverage: "두 권 모두 1회독" },
    },
    { apiKey: "test-key", fetchImpl },
  );

  assert.equal(result.revision.revisedTasks.length, 4);
});

test("수정 조건이 전혀 없으면 API를 호출하지 않는다", async () => {
  let called = false;
  await assert.rejects(
    createAiPlanRevision(
      { goal: "토익 900점", currentPlanText: "- 매일 단어 공부" },
      {
        apiKey: "test-key",
        fetchImpl: async () => {
          called = true;
          return new Response();
        },
      },
    ),
    (error) => error.status === 400,
  );
  assert.equal(called, false);
});
