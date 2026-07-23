import test from "node:test";
import assert from "node:assert/strict";
import { createAiPlanRevision, validateRevisionOutput } from "./ai-plan-revision.mjs";

const revisionOutput = {
  summary: "토익 900점 목표에 맞춰 교재 완주와 단어 학습 시간을 다시 배치했습니다.",
  revisionSummary: {
    goalAlignment: "독해 속도와 어휘 보강을 우선합니다.",
    resourcePlan: "기출문제집 10회분을 모두 풀고 오답을 2회 복습합니다.",
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
        adjustmentScope: "week",
        goalType: "study",
        resources: "ETS 기출문제집 LC·RC, 해커스 노랭이",
        targetOutcome: "기출 10회분 전체와 오답 2회 복습",
        schedule: { weekdayMinutes: 90, weekendMinutes: 180, preferredTime: "저녁", availableDays: ["월", "화", "수", "목", "금", "토", "일"] },
        priorityAdjustment: { increase: "단어 20분에서 40분", decrease: "LC 쉐도잉 주 5회에서 3회", keepRules: "일요일 실전 1회" },
        constraints: "화요일은 야근이라 30분만 가능",
      },
    },
    { apiKey: "test-key", fetchImpl },
  );

  const sentInput = requestBody.input;
  assert.match(sentInput, /ETS 기출문제집/);
  assert.match(sentInput, /"adjustmentScope": "week"/);
  assert.match(sentInput, /weekdayMinutes/);
  assert.match(sentInput, /화요일은 야근/);
  assert.equal(requestBody.text.format.strict, true);
  assert.ok(requestBody.text.format.schema.properties.revisionSummary);
  assert.equal(requestBody.text.format.schema.properties.weeklySchedule.minItems, 7);
  assert.match(requestBody.instructions, /지정 범위 밖 일정과 완료 기록은 그대로 유지/);
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
      goal: "토익 교재 2권 완주",
      currentPlanText: "- 매일 30분 공부",
      revisionDetails: { goalType: "study", resources: "보유 교재 2권", targetOutcome: "두 권 모두 1회독" },
    },
    { apiKey: "test-key", fetchImpl },
  );

  assert.equal(result.revision.revisedTasks.length, 4);
});

test("창업 목표의 고객·MVP·매출 조건을 공부 계획으로 바꾸지 않고 전달한다", async () => {
  let requestBody;
  const startupOutput = {
    ...revisionOutput,
    summary: "고객 문제 검증부터 첫 결제까지 이어지는 4주 계획입니다.",
    revisionSummary: {
      goalAlignment: "기능 개발 전에 고객 문제와 결제 의사를 검증합니다.",
      resourcePlan: "인터뷰 후보 20명과 노코드 도구, 광고비 50만원을 활용합니다.",
      timePlan: "평일 60분, 주말 180분 안에서 실행합니다.",
      weeklyRule: "매주 인터뷰 결과와 전환 수치를 확인합니다.",
      assumptions: ["MVP는 노코드로 제작 가능하다고 가정합니다."],
    },
    weeklySchedule: ["월", "화", "수", "목", "금", "토", "일"].map((day) => ({
      day,
      isRestDay: day === "일",
      tasks: day === "일" ? [] : [{ time: "저녁", durationMinutes: 60, task: "잠재 고객에게 인터뷰 요청", completionRule: "요청 5건 발송" }],
    })),
    revisedTasks: ["인터뷰 후보 20명을 정리합니다.", "고객 인터뷰 10건을 완료합니다.", "핵심 가설 하나로 MVP를 만듭니다.", "유료 제안 5건을 보냅니다."],
  };
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ output_text: JSON.stringify(startupOutput) }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  await createAiPlanRevision({
    goal: "반려동물 돌봄 서비스 창업",
    currentPlanText: "- 경쟁사 조사\n- 서비스 기능 정리",
    revisionDetails: {
      goalType: "startup",
      resources: "인터뷰 후보 20명, 노코드 도구, 광고비 50만원",
      targetOutcome: "4주 안에 고객 인터뷰 20건, MVP 공개, 첫 결제 3건",
      schedule: { weekdayMinutes: 60, weekendMinutes: 180, availableDays: ["월", "화", "수", "목", "금", "토"] },
      priorityAdjustment: { increase: "고객 인터뷰와 판매 검증", decrease: "로고 수정", keepRules: "매주 전환 수치 확인" },
    },
  }, { apiKey: "test-key", fetchImpl });

  assert.match(requestBody.input, /"goalType": "startup"/);
  assert.match(requestBody.input, /첫 결제 3건/);
  assert.match(requestBody.instructions, /공부 계획으로 가정하지 말고/);
  assert.ok(requestBody.text.format.schema.properties.revisionSummary.properties.resourcePlan);
  assert.equal(requestBody.text.format.schema.properties.revisionSummary.properties.materialPlan, undefined);
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

test("변경안은 요일·가능 시간·완료 기록·목표 분야 계약을 활성화 전에 검증한다", () => {
  const normalizedLikeInput = {
    goal: "반려동물 돌봄 서비스 창업",
    completedTasks: ["이미 완료한 고객 인터뷰"],
    revisionDetails: {
      schedule: { availableDays: ["월"], weekdayMinutes: 30, weekendMinutes: 60 },
    },
  };
  const invalid = structuredClone(revisionOutput);
  invalid.weeklySchedule[0].tasks = [
    { time: "저녁", durationMinutes: 40, task: "이미 완료한 고객 인터뷰", completionRule: "기록 완료" },
  ];
  invalid.weeklySchedule[1].tasks = [
    { time: "저녁", durationMinutes: 20, task: "오답 정리 20분", completionRule: "오답 기록" },
  ];

  const errors = validateRevisionOutput(normalizedLikeInput, invalid);
  assert.ok(errors.some((message) => message.includes("가능 시간을 초과")));
  assert.ok(errors.some((message) => message.includes("완료한 일정을 다시 포함")));
  assert.ok(errors.some((message) => message.includes("실행 가능 요일이 아니에요")));
  assert.ok(errors.some((message) => message.includes("다른 목표 분야")));
});

test("필드가 빠진 AI 변경안은 해석 성공으로 처리하지 않는다", async () => {
  const incomplete = { ...revisionOutput, revisionSummary: { goalAlignment: "목표 연결" } };
  await assert.rejects(
    createAiPlanRevision(
      { goal: "토익 900점", currentPlanText: "- 단어 20분", revisionRequest: "시간 조정" },
      { apiKey: "test-key", fetchImpl: async () => Response.json({ output_text: JSON.stringify(incomplete) }) },
    ),
    (error) => error.code === "AI_PLAN_REVISION_VALIDATION_FAILED" && error.status === 502,
  );
});
