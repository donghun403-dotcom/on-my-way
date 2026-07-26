import test from "node:test";
import assert from "node:assert/strict";
import { createAiPlanRevision, validateRevisionOutput } from "./ai-plan-revision.mjs";
import {
  AI_OUTPUT_BUDGET_VERSION,
  PLAN_REVISION_MAX_OUTPUT_TOKENS,
} from "./ai-plan-output-policy.mjs";

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

function revisionBlueprint(overrides = {}) {
  const blueprint = {
    revisionSummary: structuredClone(revisionOutput.revisionSummary),
    taskTemplates: [
      { time: "저녁", durationMinutes: 40, task: "단어 40개 암기", completionRule: "테스트 90% 이상" },
      { time: "저녁", durationMinutes: 50, task: "RC 기출 1세트 풀이", completionRule: "오답 이유를 기록하면 완료" },
      { time: "저녁", durationMinutes: 40, task: "LC 기출 1세트 풀이", completionRule: "틀린 문장을 표시하면 완료" },
      { time: "오후", durationMinutes: 90, task: "실전 모의고사 1회", completionRule: "제한 시간 안에 풀면 완료" },
    ],
    days: [
      { isRestDay: false, taskIndexes: [0, 1] },
      { isRestDay: false, taskIndexes: [0, 2] },
      { isRestDay: false, taskIndexes: [0, 1] },
      { isRestDay: false, taskIndexes: [0, 2] },
      { isRestDay: false, taskIndexes: [0, 1] },
      { isRestDay: true, taskIndexes: [] },
      { isRestDay: false, taskIndexes: [3] },
    ],
    changes: [...revisionOutput.changes],
    ollieMessage: revisionOutput.ollieMessage,
    ...overrides,
  };
  blueprint.taskTemplates = blueprint.taskTemplates.map((task) => ({
    sourceReference: "",
    quantityOrRange: "",
    ...task,
  }));
  return blueprint;
}

function responseForRevision(value, { requestId = "", parsed = true } = {}) {
  return new Response(JSON.stringify({
    status: "completed",
    output: [{
      type: "message",
      role: "assistant",
      content: [{
        type: "output_text",
        text: parsed ? "{not-reparsed" : JSON.stringify(value),
        ...(parsed ? { parsed: value } : {}),
      }],
    }],
    usage: { output_tokens: 100 },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...(requestId ? { "x-request-id": requestId } : {}) },
  });
}

test("상세 교재·시간·분량 조건을 Responses API 구조화 입력으로 전달한다", async () => {
  let requestBody;
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return responseForRevision(revisionBlueprint(), { requestId: "req_detail" });
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
  assert.equal(requestBody.text.format.schema.properties.days.minItems, 7);
  assert.match(requestBody.instructions, /지정 범위 밖 일정과 완료 기록은 그대로 유지/);
  assert.equal(requestBody.max_output_tokens, PLAN_REVISION_MAX_OUTPUT_TOKENS);
  assert.equal(requestBody.reasoning.effort, "none");
  assert.equal(requestBody.text.verbosity, "low");
  assert.equal(result.revision.revisionSummary.timePlan, revisionOutput.revisionSummary.timePlan);
  assert.equal(result.revision.weeklySchedule.length, 7);
  assert.equal(result.requestId, "req_detail");
  assert.equal(result.contract.budgetVersion, AI_OUTPUT_BUDGET_VERSION);
});

test("자유 입력이 없어도 상세 조건이 있으면 변경안을 만들 수 있다", async () => {
  const fetchImpl = async () => responseForRevision(revisionBlueprint());

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
  const startupOutput = revisionBlueprint({
    revisionSummary: {
      goalAlignment: "기능 개발 전에 고객 문제와 결제 의사를 검증합니다.",
      resourcePlan: "인터뷰 후보 20명과 노코드 도구, 광고비 50만원을 활용합니다.",
      timePlan: "평일 60분, 주말 180분 안에서 실행합니다.",
      weeklyRule: "매주 인터뷰 결과와 전환 수치를 확인합니다.",
      assumptions: ["MVP는 노코드로 제작 가능하다고 가정합니다."],
    },
    taskTemplates: [
      { time: "저녁", durationMinutes: 60, task: "인터뷰 후보 20명 정리", completionRule: "후보 20명을 적으면 완료" },
      { time: "저녁", durationMinutes: 60, task: "고객 인터뷰 요청", completionRule: "요청 5건 발송" },
      { time: "주말", durationMinutes: 120, task: "핵심 가설 MVP 제작", completionRule: "공유 가능한 링크를 만들면 완료" },
      { time: "주말", durationMinutes: 60, task: "유료 제안 발송", completionRule: "제안 5건을 보내면 완료" },
    ],
    days: [
      { isRestDay: false, taskIndexes: [0] },
      { isRestDay: false, taskIndexes: [1] },
      { isRestDay: false, taskIndexes: [1] },
      { isRestDay: false, taskIndexes: [1] },
      { isRestDay: false, taskIndexes: [1] },
      { isRestDay: false, taskIndexes: [2, 3] },
      { isRestDay: true, taskIndexes: [] },
    ],
  });
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return responseForRevision(startupOutput);
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
  assert.ok(errors.includes("AVAILABILITY_OVER_CAPACITY"));
  assert.ok(errors.includes("COMPLETED_ACTION_REINTRODUCED"));
  assert.ok(errors.includes("EXCLUDED_WEEKDAY_ACTION"));
  assert.ok(errors.includes("GOAL_FIELD_MISMATCH"));
});

test("필드가 빠진 AI 변경안은 해석 성공으로 처리하지 않는다", async () => {
  const incomplete = revisionBlueprint({ revisionSummary: { goalAlignment: "목표 연결" } });
  await assert.rejects(
    createAiPlanRevision(
      { goal: "토익 900점", currentPlanText: "- 단어 20분", revisionRequest: "시간 조정" },
      { apiKey: "test-key", fetchImpl: async () => responseForRevision(incomplete) },
    ),
    (error) => error.code === "AI_OUTPUT_SCHEMA_INVALID" && error.status === 502,
  );
});

test("revision은 generation과 같은 parser로 refusal을 별도 처리한다", async () => {
  await assert.rejects(
    createAiPlanRevision(
      { goal: "토익 900점", currentPlanText: "- 단어 20분", revisionRequest: "시간 조정" },
      {
        apiKey: "test-key",
        fetchImpl: async () => Response.json({
          status: "completed",
          output: [{ type: "message", content: [{ type: "refusal", refusal: "fixture refusal" }] }],
        }),
      },
    ),
    (error) => error.code === "AI_OUTPUT_REFUSED" && error.providerCalled === true,
  );
});

test("material-only revision preserves current availability and rejects an out-of-bounds final schedule", async () => {
  let requestBody;
  const completedTask = "완료한 교재 1쪽 복습";
  const blueprint = revisionBlueprint({
    taskTemplates: [
      { time: "아침", durationMinutes: 40, task: "교재 2쪽 핵심 문장 읽기", completionRule: "핵심 문장 3개를 표시하면 완료" },
      { time: "아침", durationMinutes: 35, task: "교재 3쪽 예문 따라 쓰기", completionRule: "예문 3개를 쓰면 완료" },
      { time: "아침", durationMinutes: 30, task: "교재 4쪽 단어 확인", completionRule: "단어 5개 뜻을 말하면 완료" },
      { time: "아침", durationMinutes: 30, task: "교재 5쪽 한 문단 요약", completionRule: "한 문단을 두 문장으로 요약하면 완료" },
    ],
    days: [
      { isRestDay: false, taskIndexes: [0] },
      { isRestDay: false, taskIndexes: [1] },
      { isRestDay: false, taskIndexes: [2] },
      { isRestDay: false, taskIndexes: [3] },
      { isRestDay: true, taskIndexes: [] },
      { isRestDay: true, taskIndexes: [] },
      { isRestDay: true, taskIndexes: [] },
    ],
  });

  const result = await createAiPlanRevision(
    {
      goal: "영어 교재 한 권 완독",
      currentPlanText: "- 월요일 교재 읽기\n- 수요일 예문 복습",
      currentAvailability: {
        availableDays: ["월", "수"],
        sessionMinutes: 25,
        preferredTime: "아침",
        excludedDates: ["8/12", "8/15–8/18"],
      },
      completedTasks: [completedTask],
      revisionDetails: {
        goalType: "study",
        resources: "새 영어 교재로 변경",
      },
    },
    {
      apiKey: "test-key",
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return responseForRevision(blueprint);
      },
    },
  );

  const normalizedInput = JSON.parse(requestBody.input.slice(requestBody.input.indexOf("{")));
  assert.deepEqual(normalizedInput.revisionDetails.schedule.availableDays, ["월", "수"]);
  assert.equal(normalizedInput.revisionDetails.schedule.weekdayMinutes, 25);
  assert.equal(normalizedInput.revisionDetails.schedule.weekendMinutes, 25);
  assert.equal(normalizedInput.revisionDetails.schedule.preferredTime, "아침");
  assert.deepEqual(normalizedInput.revisionDetails.schedule.excludedDates, ["8/12", "8/15–8/18"]);

  const actionDays = result.revision.weeklySchedule.filter((day) => day.tasks.length);
  assert.deepEqual(actionDays.map((day) => day.day), ["월", "수"]);
  assert.ok(actionDays.every((day) => day.tasks.reduce((sum, task) => sum + task.durationMinutes, 0) <= 25));
  assert.ok(actionDays.every((day) => day.tasks.every((task) => task.time === "아침")));
  assert.doesNotMatch(JSON.stringify(result.revision), new RegExp(completedTask));

  const invalidFinalRevision = structuredClone(result.revision);
  invalidFinalRevision.weeklySchedule[0].tasks[0].durationMinutes = 30;
  invalidFinalRevision.weeklySchedule[1] = {
    day: "화",
    isRestDay: false,
    tasks: [{
      time: "아침",
      durationMinutes: 10,
      task: completedTask,
      completionRule: "복습 기록을 남기면 완료",
    }],
  };
  const errors = validateRevisionOutput(normalizedInput, invalidFinalRevision);
  assert.ok(errors.includes("AVAILABILITY_OVER_CAPACITY"));
  assert.ok(errors.includes("EXCLUDED_WEEKDAY_ACTION"));
  assert.ok(errors.includes("COMPLETED_ACTION_REINTRODUCED"));
});

test("completed Unit 12 continues at Unit 13 and server-derives the full Unit 13~30 revision allocation", async () => {
  const providerBlueprint = revisionBlueprint();
  providerBlueprint.taskTemplates.forEach((task) => {
    task.sourceReference = "provider supplied wrong source";
    task.quantityOrRange = "Page 900~999";
  });

  const result = await createAiPlanRevision({
    goal: "영어 교재 완독",
    currentPlanText: "- Unit 1~12 완료",
    revisionRequest: "남은 범위를 현재 일정에 맞게 다시 배치해 줘.",
    currentMaterial: {
      hasMaterial: true,
      name: "English Textbook A",
      currentProgress: "Unit 12까지 완료",
      targetRange: "Unit 13~30",
      unit: "Unit",
      completionRule: "각 Unit 연습문제를 끝내면 완료",
    },
  }, {
    apiKey: "test-key",
    fetchImpl: async () => responseForRevision(providerBlueprint),
  });

  const tasks = result.revision.weeklySchedule.flatMap((day) => day.tasks);
  assert.ok(tasks.length > 0);
  assert.ok(tasks.every((task) => task.sourceReference === "English Textbook A"));
  assert.match(tasks[0].quantityOrRange, /^Unit 13(?:~\d+)?$/);
  assert.match(tasks.at(-1).quantityOrRange, /30$/);
  assert.equal(tasks.some((task) => /Page|wrong source/.test(`${task.sourceReference} ${task.quantityOrRange}`)), false);
  assert.equal(result.revision.updatedMaterial.semanticRange.currentPosition, 12);
  assert.equal(result.revision.updatedMaterial.semanticRange.targetStart, 13);
  assert.equal(result.revision.updatedMaterial.semanticRange.targetEnd, 30);
  assert.equal(result.revision.scheduleOccurrences.length, 30);
  assert.deepEqual(result.revision.scheduleContract, {
    scope: "remaining",
    timezone: "Asia/Seoul",
    startDate: result.revision.scheduleOccurrences[0].date,
    generatedDays: 30,
    exactDatesServerDerived: true,
    materialAllocationServerDerived: true,
  });
  const exactItems = result.revision.scheduleOccurrences.flatMap((day) => day.items);
  const exactActions = exactItems.filter((item) => item.type === "ACTION");
  const exactReviews = exactItems.filter((item) => item.type === "REVIEW");
  assert.deepEqual(
    exactActions.map((item) => item.quantityOrRange),
    Array.from({ length: 18 }, (_, index) => `Unit ${index + 13}`),
  );
  assert.ok(exactReviews.length > 0);
  assert.ok(exactItems.every((item) => item.sourceReference === "English Textbook A"));
  assert.ok(exactItems.every((item) => /^Unit \d+(?:~\d+)?$/.test(item.quantityOrRange)));
  assert.ok(exactActions.every((item) => item.durationMinutes >= 5));
  assert.ok(exactReviews.every((item) => item.durationMinutes === 0 && item.title.endsWith("· 복습")));
  const weekSignature = (days) => days.flatMap((day) => day.items)
    .map((item) => `${item.type}:${item.quantityOrRange}`);
  assert.notDeepEqual(
    weekSignature(result.revision.scheduleOccurrences.slice(0, 7)),
    weekSignature(result.revision.scheduleOccurrences.slice(7, 14)),
  );
  const validationInput = {
    goal: "영어 교재 완독",
    periodDays: 30,
    currentPlanText: "- Unit 1~12 완료",
    completedTasks: [],
    pendingMaterial: result.revision.updatedMaterial,
    revisionDetails: {
      adjustmentScope: "remaining",
      schedule: {
        availableDays: [],
        weekdayMinutes: null,
        weekendMinutes: null,
        preferredTime: "",
        excludedDates: [],
        scheduleStartDate: result.revision.scheduleContract.startDate,
      },
    },
  };
  assert.deepEqual(validateRevisionOutput(validationInput, result.revision), []);

  const wrongUnit = structuredClone(result.revision);
  wrongUnit.weeklySchedule[0].tasks[0].quantityOrRange = "Page 13";
  const wrongUnitRules = validateRevisionOutput(validationInput, wrongUnit);
  assert.ok(wrongUnitRules.includes("MATERIAL_ACTION_UNIT_MISMATCH"));
  assert.ok(wrongUnitRules.includes("MATERIAL_SCHEDULE_SEQUENCE_INVALID"));

  const tamperedExact = structuredClone(result.revision);
  const firstExactAction = tamperedExact.scheduleOccurrences
    .flatMap((day) => day.items)
    .find((item) => item.type === "ACTION");
  firstExactAction.quantityOrRange = "Page 13";
  const tamperedExactRules = validateRevisionOutput(validationInput, tamperedExact);
  assert.ok(tamperedExactRules.includes("REVISION_EXACT_SCHEDULE_TASK_MISMATCH"));
  assert.ok(tamperedExactRules.includes("MATERIAL_ACTION_UNIT_MISMATCH"));
  assert.ok(tamperedExactRules.includes("MATERIAL_SCHEDULE_SEQUENCE_INVALID"));

  const missingExactDay = structuredClone(result.revision);
  missingExactDay.scheduleOccurrences.pop();
  assert.ok(
    validateRevisionOutput(validationInput, missingExactDay)
      .includes("REVISION_EXACT_SCHEDULE_DAY_COUNT_INVALID"),
  );
});

test("changing to a new named textbook resets implicit progress and binds the revision to Unit 1~20", async () => {
  let requestBody;
  const result = await createAiPlanRevision({
    goal: "영어 교재 완독",
    currentPlanText: "- English Textbook A Unit 1~12 완료",
    currentMaterial: {
      hasMaterial: true,
      name: "English Textbook A",
      currentProgress: "Unit 12까지 완료",
      targetRange: "Unit 13~30",
      unit: "Unit",
    },
    pendingMaterial: {
      hasMaterial: true,
      name: "English Textbook B",
      targetRange: "Unit 20",
      unit: "Unit",
    },
  }, {
    apiKey: "test-key",
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return responseForRevision(revisionBlueprint());
    },
  });

  const normalizedInput = JSON.parse(requestBody.input.slice(requestBody.input.indexOf("{")));
  assert.equal(normalizedInput.currentMaterial.sourceDisplayText, "English Textbook A");
  assert.equal(normalizedInput.currentMaterial.semanticRange.currentPosition, 12);
  assert.equal(normalizedInput.pendingMaterial.sourceDisplayText, "English Textbook B");
  assert.equal(normalizedInput.pendingMaterial.semanticRange.currentState, "not_started");
  assert.equal(normalizedInput.pendingMaterial.semanticRange.targetStart, 1);
  assert.equal(normalizedInput.pendingMaterial.semanticRange.targetEnd, 20);

  const tasks = result.revision.weeklySchedule.flatMap((day) => day.tasks);
  assert.ok(tasks.every((task) => task.sourceReference === "English Textbook B"));
  assert.match(tasks[0].quantityOrRange, /^Unit 1(?:~\d+)?$/);
  assert.match(tasks.at(-1).quantityOrRange, /20$/);
  assert.equal(result.revision.updatedMaterial.sourceDisplayText, "English Textbook B");
});

test("reversed, before-current, and mismatched-unit material revisions fail before the provider call", async () => {
  const cases = [
    {
      pendingMaterial: { hasMaterial: true, name: "Book", targetRange: "Unit 30~13", unit: "Unit" },
      expectedRule: "MATERIAL_RANGE_REVERSED",
    },
    {
      pendingMaterial: { hasMaterial: true, name: "Book", targetRange: "Unit 1~10", unit: "Unit" },
      expectedRule: "MATERIAL_TARGET_BEFORE_CURRENT",
    },
    {
      currentMaterial: {
        hasMaterial: true,
        name: "Book",
        currentProgress: "Page 12까지 완료",
        targetRange: "Page 13~30",
        unit: "Page",
      },
      pendingMaterial: { hasMaterial: true, name: "Book", targetRange: "Unit 13~30", unit: "Unit" },
      expectedRule: "MATERIAL_UNIT_MISMATCH",
    },
  ];

  for (const fixture of cases) {
    let providerCalls = 0;
    const currentMaterial = fixture.currentMaterial || {
      hasMaterial: true,
      name: "Book",
      currentProgress: "Unit 12까지 완료",
      targetRange: "Unit 13~30",
      unit: "Unit",
    };
    await assert.rejects(
      createAiPlanRevision({
        goal: "교재 완독",
        currentPlanText: "- 현재 교재 계획",
        currentMaterial,
        pendingMaterial: fixture.pendingMaterial,
      }, {
        apiKey: "test-key",
        fetchImpl: async () => {
          providerCalls += 1;
          return responseForRevision(revisionBlueprint());
        },
      }),
      (error) => (
        error.status === 400
        && error.code === "MATERIAL_CONTRACT_INVALID"
        && error.providerCalled === false
        && error.domainRuleIds.includes(fixture.expectedRule)
      ),
    );
    assert.equal(providerCalls, 0);
  }
});

test("non-material revisions retain empty material fields and a disabled updatedMaterial contract", async () => {
  const result = await createAiPlanRevision({
    goal: "토익 900점",
    currentPlanText: "- 월수금 20분 영어 공부",
    revisionRequest: "금요일 학습을 토요일로 옮겨 줘.",
  }, {
    apiKey: "test-key",
    fetchImpl: async () => responseForRevision(revisionBlueprint()),
  });

  const tasks = result.revision.weeklySchedule.flatMap((day) => day.tasks);
  const exactTasks = result.revision.scheduleOccurrences.flatMap((day) => day.items);
  assert.equal(result.revision.updatedMaterial.hasMaterial, false);
  assert.ok(tasks.every((task) => task.sourceReference === "" && task.quantityOrRange === ""));
  assert.equal(result.revision.scheduleOccurrences.length, 30);
  assert.equal(result.revision.scheduleContract.materialAllocationServerDerived, false);
  assert.ok(exactTasks.every((task) => (
    task.type === "ACTION"
    && task.sourceReference === ""
    && task.quantityOrRange === ""
  )));
});

test("exact remaining occurrences honor start date, available weekdays, exclusions, and daily limits", async () => {
  const result = await createAiPlanRevision({
    goal: "영어 교재 완독",
    periodDays: 21,
    currentPlanText: "- Unit 1~12 완료",
    revisionRequest: "남은 범위를 가능한 날에 다시 배치해 줘.",
    currentMaterial: {
      hasMaterial: true,
      name: "English Textbook A",
      currentProgress: "Unit 12까지 완료",
      targetRange: "Unit 13~30",
      unit: "Unit",
    },
    currentAvailability: {
      availableDays: ["월", "수", "금"],
      sessionMinutes: 25,
      preferredTime: "아침",
      scheduleStartDate: "2026-07-20",
      excludedDates: ["2026-07-22"],
    },
    revisionDetails: { adjustmentScope: "remaining" },
  }, {
    apiKey: "test-key",
    fetchImpl: async () => responseForRevision(revisionBlueprint()),
  });

  assert.equal(result.revision.scheduleOccurrences.length, 21);
  assert.equal(result.revision.scheduleContract.startDate, "2026-07-20");
  const allowedDays = new Set(["월", "수", "금"]);
  result.revision.scheduleOccurrences.forEach((day) => {
    const hasItems = day.items.length > 0;
    if (!allowedDays.has(day.dayLabel) || day.date === "2026-07-22") {
      assert.equal(hasItems, false, day.date);
    }
    const actionMinutes = day.items
      .filter((item) => item.type === "ACTION")
      .reduce((total, item) => total + item.durationMinutes, 0);
    assert.ok(actionMinutes <= 25, `${day.date}: ${actionMinutes}`);
    assert.ok(day.items.every((item) => item.scheduledAt.includes("T07:00:00+09:00")));
  });
  assert.equal(
    result.revision.scheduleOccurrences.find((day) => day.date === "2026-07-22").items.length,
    0,
  );
  const items = result.revision.scheduleOccurrences.flatMap((day) => day.items);
  assert.ok(items.every((item) => item.sourceReference === "English Textbook A"));
  assert.ok(items.every((item) => /^Unit \d+(?:~\d+)?$/.test(item.quantityOrRange)));
  assert.equal(new Set(items.filter((item) => item.type === "ACTION").map((item) => item.quantityOrRange)).size, 8);
});

test("a three-day remaining revision stops exact occurrences at the plan end", async () => {
  let requestBody;
  const result = await createAiPlanRevision({
    goal: "토익 900점",
    periodDays: 3,
    currentPlanText: "- Study vocabulary for 20 minutes",
    revisionRequest: "Redistribute only the remaining three days",
    revisionDetails: {
      adjustmentScope: "remaining",
      schedule: {
        scheduleStartDate: "2026-07-20",
      },
    },
  }, {
    apiKey: "test-key",
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return responseForRevision(revisionBlueprint());
    },
  });

  const normalizedInput = JSON.parse(requestBody.input.slice(requestBody.input.indexOf("{")));
  assert.equal(normalizedInput.periodDays, 3);
  assert.equal(result.revision.scheduleContract.generatedDays, 3);
  assert.deepEqual(
    result.revision.scheduleOccurrences.map((day) => day.date),
    ["2026-07-20", "2026-07-21", "2026-07-22"],
  );
  assert.ok(result.revision.scheduleOccurrences.every((day) => day.date <= "2026-07-22"));
});

test("missing revision material fields remain a schema-invalid provider output, not a domain fallback", async () => {
  const malformed = revisionBlueprint();
  delete malformed.taskTemplates[0].quantityOrRange;
  await assert.rejects(
    createAiPlanRevision({
      goal: "영어 교재 완독",
      currentPlanText: "- Unit 1~12 완료",
      revisionRequest: "남은 범위를 다시 배치해 줘.",
      currentMaterial: {
        hasMaterial: true,
        name: "English Textbook A",
        currentProgress: "Unit 12까지 완료",
        targetRange: "Unit 13~30",
        unit: "Unit",
      },
    }, {
      apiKey: "test-key",
      fetchImpl: async () => responseForRevision(malformed),
    }),
    (error) => error.code === "AI_OUTPUT_SCHEMA_INVALID" && error.status === 502,
  );
});
