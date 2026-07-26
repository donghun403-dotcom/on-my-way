import test from "node:test";
import assert from "node:assert/strict";

import {
  parseStructuredResponse,
  validateStructuredValue,
} from "./ai-output-contract.mjs";
import { validateGeneratedPlan } from "./ai-goal-plan.mjs";
import {
  buildMaterialOccurrenceContract,
  normalizeMaterialContract,
  validateMaterialActionContract,
  validateMaterialScheduleContract,
} from "./ai-material-contract.mjs";
import {
  GOAL_PLAN_BLUEPRINT_SCHEMA,
  GOAL_PLAN_MAX_OUTPUT_TOKENS,
  GOAL_PLAN_MAX_PARSED_BYTES,
  DOMAIN_RULES,
  MAX_DAY_ITEM_COUNT,
  MAX_WEEK_TEMPLATE_COUNT,
  PLAN_REVISION_BLUEPRINT_SCHEMA,
  PLAN_REVISION_MAX_OUTPUT_TOKENS,
  PLAN_REVISION_MAX_PARSED_BYTES,
  countGoalBlueprintItems,
  enrichGoalPlanBlueprint,
  enrichRevisionBlueprint,
  excludedDateSet,
  invalidExcludedDateValues,
  validateGoalPlanBlueprint,
  validateRevisionBlueprint,
} from "./ai-plan-output-policy.mjs";

test("UI exclusion dates normalize against the schedule year and preserve year-crossing ranges", () => {
  assert.deepEqual(
    [...excludedDateSet(["8/12", "8/15–8/18"], { referenceDate: "2026-07-24" })],
    ["2026-08-12", "2026-08-15", "2026-08-16", "2026-08-17", "2026-08-18"],
  );
  assert.deepEqual(
    [...excludedDateSet(["12/30–1/2"], { referenceDate: "2026-12-20" })],
    ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"],
  );
  assert.deepEqual(
    invalidExcludedDateValues(["8/12", "2026-02-30", "휴가 때"], { referenceDate: "2026-07-24" }),
    ["2026-02-30", "휴가 때"],
  );
});

function goalInput() {
  return {
    draftPlanId: "draft-output-budget-fixture",
    goal: "영어 원서 6장까지 읽고 핵심 문장 기록하기",
    routine: { preferredTime: "저녁" },
    material: { hasMaterial: true, name: "영어 원서 A", targetRange: "1장~50장" },
    availability: {
      availableDays: ["월", "화", "수", "목", "금", "토", "일"],
      difficultDays: [],
      sessionMinutes: 180,
    },
  };
}

function goalBlueprint({ templates = MAX_WEEK_TEMPLATE_COUNT, itemsPerDay = MAX_DAY_ITEM_COUNT } = {}) {
  return {
    personalitySummary: "정해진 범위를 짧게 읽고 기록할 때 흐름을 유지하기 쉬워요.",
    planningStyle: "범위 기록형",
    weekTitle: "첫 7일 읽기 리듬 만들기",
    coachMessage: "읽은 범위와 핵심 문장을 함께 남겨 다음 실행을 쉽게 시작해요.",
    feasibility: {
      status: "feasible",
      summary: "주 7회 180분 안에서 충분히 실행 가능",
      recommendedOption: "keep_current_plan",
      adjustmentOptions: ["keep_current_plan"],
    },
    phases: [
      { phase: "시작", days: "1~7일", focus: "1장 읽기", successMetric: "핵심 문장 7개" },
      { phase: "확장", days: "8~21일", focus: "2장~4장 읽기", successMetric: "4장까지 기록" },
      { phase: "완료", days: "22~30일", focus: "5장~6장 읽기", successMetric: "6장까지 기록" },
    ],
    taskTemplates: Array.from({ length: templates }, (_, index) => ({
      type: index % 7 === 5 ? "REVIEW" : index % 7 === 6 ? "TIP" : "ACTION",
      title: `영어 원서 A ${index + 1}구간 읽고 핵심 문장 기록`,
      sourceReference: "영어 원서 A",
      quantityOrRange: `${index + 1}구간`,
      durationMinutes: index % 7 >= 5 ? 0 : 20,
      completionRule: index % 7 === 6 ? "" : "핵심 문장 3개를 기록하면 완료",
      time: "저녁",
    })),
    days: Array.from({ length: 7 }, (_, dayIndex) => ({
      isRestDay: false,
      taskIndexes: Array.from({ length: itemsPerDay }, (_, itemIndex) => (
        (dayIndex * itemsPerDay + itemIndex) % templates
      )),
    })),
    assumptions: ["각 구간은 20분 안에 읽을 수 있는 분량으로 나눠요."],
    checkInRules: ["읽은 범위를 기록해요.", "막히면 한 쪽만 읽어요.", "주말에 다음 범위를 조정해요."],
    fallbackPlan: "어려운 날에는 한 쪽을 읽고 문장 하나만 기록해요.",
  };
}

function revisionInput() {
  return {
    completedTasks: [],
    revisionDetails: {
      schedule: {
        availableDays: ["월", "화", "수", "목", "금", "토", "일"],
        weekdayMinutes: 180,
        weekendMinutes: 180,
      },
    },
  };
}

function revisionBlueprint() {
  return {
    revisionSummary: {
      goalAlignment: "읽기 범위와 기록 기준을 유지합니다.",
      resourcePlan: "영어 원서 A의 현재 진도부터 이어서 읽습니다.",
      timePlan: "하루 180분 안에서 실행합니다.",
      weeklyRule: "읽은 범위와 핵심 문장을 매일 기록합니다.",
      assumptions: [],
    },
    taskTemplates: Array.from({ length: MAX_WEEK_TEMPLATE_COUNT }, (_, index) => ({
      time: "저녁",
      durationMinutes: 20,
      task: `영어 원서 A ${index + 1}구간 읽기`,
      sourceReference: "",
      quantityOrRange: "",
      completionRule: "핵심 문장 3개를 기록하면 완료",
    })),
    days: Array.from({ length: 7 }, (_, dayIndex) => ({
      isRestDay: false,
      taskIndexes: Array.from({ length: MAX_DAY_ITEM_COUNT }, (_, itemIndex) => (
        (dayIndex * MAX_DAY_ITEM_COUNT + itemIndex) % MAX_WEEK_TEMPLATE_COUNT
      )),
    })),
    changes: ["현재 진도 이후 구간만 다시 배치"],
    ollieMessage: "기존 완료 기록은 유지하고 남은 범위만 조정했어요.",
  };
}

const MAX_GOAL_FIXTURE = goalBlueprint();
const MAX_GOAL_FIXTURE_BYTES = new TextEncoder().encode(JSON.stringify(MAX_GOAL_FIXTURE)).byteLength;
const MAX_GOAL_FIXTURE_CHARACTERS = JSON.stringify(MAX_GOAL_FIXTURE).length;
const MAX_GOAL_FIXTURE_ITEMS = countGoalBlueprintItems(MAX_GOAL_FIXTURE);
const MAX_REVISION_FIXTURE = revisionBlueprint();
const MAX_REVISION_FIXTURE_BYTES = new TextEncoder().encode(JSON.stringify(MAX_REVISION_FIXTURE)).byteLength;
const MAX_REVISION_FIXTURE_CHARACTERS = JSON.stringify(MAX_REVISION_FIXTURE).length;
const MAX_REVISION_FIXTURE_ITEMS = MAX_REVISION_FIXTURE.days
  .reduce((count, day) => count + day.taskIndexes.length, 0);

test("generation과 revision은 서로 다른 제한된 output budget을 사용한다", () => {
  assert.equal(GOAL_PLAN_MAX_OUTPUT_TOKENS, 6000);
  assert.equal(PLAN_REVISION_MAX_OUTPUT_TOKENS, 4500);
  assert.ok(GOAL_PLAN_MAX_OUTPUT_TOKENS <= 8000);
  assert.ok(PLAN_REVISION_MAX_OUTPUT_TOKENS <= 8000);
});

test("AI generation schema에는 서버 소유 필드와 중복 최종 표현이 없다", () => {
  const schemaText = JSON.stringify(GOAL_PLAN_BLUEPRINT_SCHEMA);
  for (const serverOwned of ["planId", "recurrenceGroupId", "scheduledAt", "createdAt", "updatedAt"]) {
    assert.equal(schemaText.includes(`"${serverOwned}"`), false, serverOwned);
  }
  assert.equal(Object.hasOwn(GOAL_PLAN_BLUEPRINT_SCHEMA.properties.feasibility.properties, "status"), true);
  assert.equal(Object.hasOwn(GOAL_PLAN_BLUEPRINT_SCHEMA.properties.taskTemplates.items.properties, "status"), false);
  assert.equal(Object.hasOwn(GOAL_PLAN_BLUEPRINT_SCHEMA.properties.days.items.properties, "status"), false);
  for (const derived of ["firstAction", "weekPlan", "dashboard", "todaySchedule", "firstWeekSchedule"]) {
    assert.equal(Object.hasOwn(GOAL_PLAN_BLUEPRINT_SCHEMA.properties, derived), false, derived);
  }
});

test(`최대 item-count generation blueprint (${MAX_GOAL_FIXTURE_BYTES} bytes, ${MAX_GOAL_FIXTURE_CHARACTERS} chars, ${MAX_GOAL_FIXTURE_ITEMS} items)는 제한 안에서 검증되고 stable final plan으로 보강된다`, () => {
  const blueprint = structuredClone(MAX_GOAL_FIXTURE);
  assert.deepEqual(validateStructuredValue(blueprint, GOAL_PLAN_BLUEPRINT_SCHEMA), []);
  assert.deepEqual(validateGoalPlanBlueprint(goalInput(), blueprint), []);
  assert.equal(countGoalBlueprintItems(blueprint), 7 * MAX_DAY_ITEM_COUNT);
  const bytes = new TextEncoder().encode(JSON.stringify(blueprint)).byteLength;
  assert.ok(bytes < GOAL_PLAN_MAX_PARSED_BYTES * 0.75, `${bytes} bytes`);

  const plan = enrichGoalPlanBlueprint(goalInput(), blueprint);
  const occurrences = plan.firstWeekSchedule.flatMap((day) => day.items);
  assert.equal(plan.firstWeekSchedule.length, 7);
  assert.equal(occurrences.length, 7 * MAX_DAY_ITEM_COUNT);
  assert.equal(new Set(occurrences.map((item) => item.id)).size, occurrences.length);
  assert.ok(occurrences.every((item) => item.planId === goalInput().draftPlanId));
  assert.ok(occurrences.every((item) => item.status === "pending"));
  assert.ok(occurrences.every((item) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+09:00$/.test(item.scheduledAt)));
  assert.ok(occurrences.every((item) => item.recurrenceGroupId));
  assert.equal(plan.scheduleContract.timezone, "Asia/Seoul");
  assert.equal(plan.scheduleContract.exactDatesServerDerived, true);
});

test("final schedule and Today use the same server-derived exact HH:MM instead of AI time labels", () => {
  const input = {
    ...goalInput(),
    material: { hasMaterial: false },
    availability: {
      ...goalInput().availability,
      weeklyFrequency: 6,
      scheduleStartDate: "2026-07-20",
    },
  };
  const blueprint = goalBlueprint({ templates: 7, itemsPerDay: 1 });
  blueprint.taskTemplates.forEach((item) => {
    item.sourceReference = "";
    item.time = "저녁";
  });

  const plan = enrichGoalPlanBlueprint(input, blueprint, { now: Date.parse("2026-07-19T15:00:00Z") });
  const items = plan.scheduleOccurrences.flatMap((day) => day.items);
  assert.ok(items.length > 0);
  assert.ok(items.every((item) => item.time === "19:00"));
  assert.ok(items.every((item) => item.scheduledAt.endsWith("T19:00:00+09:00")));
  assert.ok(plan.todaySchedule.length > 0);
  assert.ok(plan.todaySchedule.every((item) => item.time === "19:00"));
  assert.ok(plan.todaySchedule.every((item) => item.date === "2026-07-20"));
  assert.ok(plan.todaySchedule.every((item) => item.scheduledAt === "2026-07-20T19:00:00+09:00"));
  assert.equal(items.some((item) => item.time === "저녁"), false);

  const futurePlan = enrichGoalPlanBlueprint({
    ...input,
    availability: { ...input.availability, scheduleStartDate: "2026-07-21" },
  }, blueprint, { now: Date.parse("2026-07-19T15:00:00Z") });
  assert.deepEqual(futurePlan.todaySchedule, []);
});

test("generation schema와 domain은 최대 개수 초과와 잘못된 참조를 거부한다", () => {
  const tooMany = goalBlueprint({ templates: MAX_WEEK_TEMPLATE_COUNT + 1 });
  assert.ok(validateStructuredValue(tooMany, GOAL_PLAN_BLUEPRINT_SCHEMA).some((error) => error.rule === "maxItems"));

  const invalidReference = goalBlueprint();
  invalidReference.days[0].taskIndexes = [MAX_WEEK_TEMPLATE_COUNT - 1, MAX_WEEK_TEMPLATE_COUNT - 1];
  assert.ok(validateGoalPlanBlueprint(goalInput(), invalidReference).includes("GOAL_BLUEPRINT_DUPLICATE_DAY_REFERENCE"));
});

test(`최대 item-count revision blueprint (${MAX_REVISION_FIXTURE_BYTES} bytes, ${MAX_REVISION_FIXTURE_CHARACTERS} chars, ${MAX_REVISION_FIXTURE_ITEMS} items)는 기존 UI 계약으로 결정적으로 확장된다`, () => {
  const blueprint = structuredClone(MAX_REVISION_FIXTURE);
  assert.deepEqual(validateStructuredValue(blueprint, PLAN_REVISION_BLUEPRINT_SCHEMA), []);
  assert.deepEqual(validateRevisionBlueprint(revisionInput(), blueprint), []);
  const bytes = new TextEncoder().encode(JSON.stringify(blueprint)).byteLength;
  assert.ok(bytes < PLAN_REVISION_MAX_PARSED_BYTES * 0.75, `${bytes} bytes`);

  const revision = enrichRevisionBlueprint(blueprint);
  assert.equal(revision.weeklySchedule.length, 7);
  assert.equal(revision.revisedTasks.length, MAX_WEEK_TEMPLATE_COUNT);
  assert.ok(revision.weeklySchedule.every((day) => day.tasks.length === MAX_DAY_ITEM_COUNT));
});

test("파싱된 payload byte 상한 초과는 partial 저장 없이 명시적 domain error가 된다", () => {
  const blueprint = goalBlueprint();
  const body = {
    status: "completed",
    output_parsed: blueprint,
    usage: { output_tokens: 100 },
  };
  assert.throws(
    () => parseStructuredResponse(body, {
      schema: GOAL_PLAN_BLUEPRINT_SCHEMA,
      maxParsedBytes: 100,
      countItems: countGoalBlueprintItems,
    }),
    (error) => (
      error.code === "AI_OUTPUT_DOMAIN_INVALID"
      && error.diagnostics.domainValidationCode === "AI_OUTPUT_PAYLOAD_TOO_LARGE"
      && error.diagnostics.parsedPayloadBytes > 100
    ),
  );
});

test("all emitted roadmap rules are registered with stable responsibility metadata", () => {
  const emittedRules = [
    "FEASIBILITY_OPTION_REQUIRED",
    "FEASIBILITY_SCHEDULE_CONFLICT",
    "FIRST_WEEK_SCHEDULE_INVALID",
    "GOAL_BLUEPRINT_DAY_COUNT_INVALID",
    "GOAL_BLUEPRINT_TEMPLATE_LIMIT",
    "GOAL_BLUEPRINT_DUPLICATE_TASK_TEMPLATE",
    "GOAL_BLUEPRINT_DUPLICATE_DAY_REFERENCE",
    "GOAL_BLUEPRINT_REFERENCE_INVALID",
    "GOAL_BLUEPRINT_ACTION_INCOMPLETE",
    "GOAL_BLUEPRINT_ACTION_DURATION",
    "GOAL_BLUEPRINT_ACTION_REQUIRED",
    "GOAL_BLUEPRINT_ENGAGEMENT_FREQUENCY_UNDERFILLED",
    "REVISION_BLUEPRINT_DAY_COUNT_INVALID",
    "REVISION_BLUEPRINT_DUPLICATE_DAY_REFERENCE",
    "REVISION_BLUEPRINT_REFERENCE_INVALID",
    "REVISION_BLUEPRINT_COMPLETED_TASK",
    "EXCLUDED_WEEKDAY_ACTION",
    "EXCLUDED_DATE_ACTION",
    "REST_PERIOD_ACTION",
    "AVAILABILITY_OVER_CAPACITY",
    "SOURCE_REFERENCE_MISSING",
    "SYSTEM_RULE_EXPOSED",
    "SCHEDULE_DAY_ORDER_INVALID",
    "PLAN_ITEM_TYPE_INVALID",
    "ACTION_IDENTITY_MISSING",
    "ACTION_IDENTITY_DUPLICATE",
    "ACTION_PLAN_ID_MISMATCH",
    "ACTION_TITLE_INVALID",
    "ACTION_DURATION_MISSING",
    "ACTION_COMPLETION_RULE_MISSING",
    "ACTION_RANGE_MISSING",
    "MATERIAL_ACTION_RANGE_MISSING",
    "MATERIAL_ACTION_RANGE_OUTSIDE_TARGET",
    "MATERIAL_ACTION_UNIT_MISMATCH",
    "MATERIAL_SOURCE_REFERENCE_MISMATCH",
    "MATERIAL_SCHEDULE_SEQUENCE_INVALID",
    "MATERIAL_TARGET_COVERAGE_INCOMPLETE",
    "REVISION_OUTPUT_INVALID",
    "REVISION_SUMMARY_MISSING",
    "REVISION_ACTIONS_MISSING",
    "REVISION_WEEK_DAY_COUNT_INVALID",
    "REVISION_WEEK_DAY_ORDER_INVALID",
    "REVISION_ACTION_INCOMPLETE",
    "REVISION_EXACT_SCHEDULE_DAY_COUNT_INVALID",
    "REVISION_EXACT_SCHEDULE_DAY_ORDER_INVALID",
    "REVISION_EXACT_SCHEDULE_TASK_MISMATCH",
    "COMPLETED_ACTION_REINTRODUCED",
    "GOAL_FIELD_MISMATCH",
    "PLAN_INPUT_HASH_MISMATCH",
  ];
  for (const rule of emittedRules) {
    assert.equal(Object.hasOwn(DOMAIN_RULES, rule), true, rule);
    assert.match(DOMAIN_RULES[rule].classification, /^(MODEL_REQUIRED|SERVER_DERIVED|HARD|SOFT|FEASIBILITY)$/);
    assert.match(DOMAIN_RULES[rule].stage, /^(blueprint|schedule|commit)$/);
  }
});

test("feasibility options are internally consistent and infeasible roadmaps remain claim-locked", () => {
  const invalid = goalBlueprint();
  invalid.feasibility = {
    status: "feasible",
    summary: "fixture",
    recommendedOption: "reduce_scope",
    adjustmentOptions: ["keep_current_plan"],
  };
  assert.deepEqual(validateGoalPlanBlueprint(goalInput(), invalid), ["FEASIBILITY_OPTION_REQUIRED"]);

  const constrained = goalBlueprint();
  constrained.feasibility = {
    status: "infeasible_as_requested",
    summary: "The requested scope exceeds the available time.",
    recommendedOption: "reduce_scope",
    adjustmentOptions: ["reduce_scope", "extend_duration"],
  };
  assert.deepEqual(validateGoalPlanBlueprint(goalInput(), constrained), []);
  const plan = enrichGoalPlanBlueprint(goalInput(), constrained, { now: Date.parse("2026-07-18T15:00:00Z") });
  assert.equal(plan.feasibility.status, "infeasible_as_requested");
  assert.equal(plan.scheduleContract.requiresAdjustmentBeforeClaim, true);
  assert.equal(plan.feasibility.adjustmentOptions.includes("keep_current_plan"), false);
});

test("a server-derived zero-ACTION schedule remains claim-locked regardless of the model feasibility label", () => {
  const input = {
    ...goalInput(),
    material: { hasMaterial: false },
    availability: {
      availableDays: ["월"],
      difficultDays: ["월"],
      excludedDates: [],
      sessionMinutes: 30,
      weeklyFrequency: 1,
      scheduleStartDate: "2026-07-20",
    },
  };
  const blueprint = goalBlueprint();
  blueprint.feasibility = {
    status: "constrained",
    summary: "현재 선택한 요일은 모두 어려운 날이라 먼저 조건 조정이 필요해요.",
    recommendedOption: "increase_frequency",
    adjustmentOptions: ["increase_frequency", "extend_duration"],
  };
  blueprint.taskTemplates.forEach((item) => {
    item.sourceReference = "";
  });

  const plan = enrichGoalPlanBlueprint(input, blueprint, { now: Date.parse("2026-07-19T15:00:00Z") });
  const actions = plan.scheduleOccurrences.flatMap((day) => day.items).filter((item) => item.type === "ACTION");
  assert.equal(actions.length, 0);
  assert.equal(plan.feasibility.status, "infeasible_as_requested");
  assert.equal(plan.scheduleContract.requiresAdjustmentBeforeClaim, true);
  assert.equal(plan.feasibility.recommendedOption, "extend_duration");
  assert.equal(plan.feasibility.adjustmentOptions.includes("increase_frequency"), false);
});

test("a nonzero schedule that cannot meet requested frequency is deterministically infeasible and claim-locked", () => {
  const input = {
    ...goalInput(),
    material: { hasMaterial: false },
    availability: {
      availableDays: ["월", "화", "수", "목"],
      difficultDays: ["화", "수", "목"],
      excludedDates: [],
      sessionMinutes: 180,
      weeklyFrequency: 4,
      scheduleStartDate: "2026-07-20",
    },
  };
  const blueprint = goalBlueprint({ templates: 7, itemsPerDay: 1 });
  blueprint.taskTemplates.forEach((item) => {
    item.sourceReference = "";
  });

  const plan = enrichGoalPlanBlueprint(input, blueprint, { now: Date.parse("2026-07-19T15:00:00Z") });
  const actions = plan.scheduleOccurrences.flatMap((day) => day.items).filter((item) => item.type === "ACTION");
  assert.ok(actions.length > 0);
  assert.equal(plan.feasibility.status, "infeasible_as_requested");
  assert.equal(plan.scheduleContract.requiresAdjustmentBeforeClaim, true);
  assert.deepEqual(plan.scheduleContract.underfilledWeeks, [1]);
  assert.equal(plan.scheduleContract.eligibleUnderfilled, true);
  assert.equal(plan.scheduleContract.capacityUnderfilled, false);
  assert.equal(plan.feasibility.adjustmentOptions.includes("keep_current_plan"), false);
  assert.equal(plan.feasibility.recommendedOption, "extend_duration");
  assert.deepEqual(plan.feasibility.adjustmentOptions, ["extend_duration", "reduce_scope"]);
});

test("feasible availability with too few model engagement references is a model domain error", () => {
  const input = {
    ...goalInput(),
    material: { hasMaterial: false },
    availability: {
      availableDays: ["월", "화", "수", "목", "금", "토", "일"],
      difficultDays: [],
      excludedDates: [],
      sessionMinutes: 60,
      weeklyFrequency: 7,
      scheduleStartDate: "2026-07-20",
    },
  };
  const sparse = goalBlueprint({ templates: 7, itemsPerDay: 1 });
  sparse.taskTemplates.forEach((item) => {
    item.sourceReference = "";
  });

  assert.deepEqual(
    validateGoalPlanBlueprint(input, sparse),
    ["GOAL_BLUEPRINT_ENGAGEMENT_FREQUENCY_UNDERFILLED"],
  );
});

test("a REVIEW-only roadmap day satisfies weekly engagement without hiding hard availability loss", () => {
  const input = {
    ...goalInput(),
    material: { hasMaterial: false },
    availability: {
      availableDays: ["월", "화", "수", "목", "금", "토", "일"],
      difficultDays: [],
      excludedDates: [],
      sessionMinutes: 180,
      weeklyFrequency: 7,
      scheduleStartDate: "2026-07-20",
    },
  };
  const blueprint = goalBlueprint({ templates: 6, itemsPerDay: 1 });
  blueprint.taskTemplates.push({
    type: "REVIEW",
    title: "한 주 실행 점검",
    sourceReference: "",
    quantityOrRange: "",
    durationMinutes: 0,
    completionRule: "다음 주 조정 한 가지를 고르면 완료",
    time: "주말",
  });
  blueprint.days[6] = {
    isRestDay: false,
    taskIndexes: [blueprint.taskTemplates.length - 1],
  };
  blueprint.taskTemplates.forEach((item) => {
    item.sourceReference = "";
  });

  assert.deepEqual(validateGoalPlanBlueprint(input, blueprint), []);
  const plan = enrichGoalPlanBlueprint(input, blueprint, { now: Date.parse("2026-07-19T15:00:00Z") });
  const reviews = plan.scheduleOccurrences.flatMap((day) => day.items).filter((item) => item.type === "REVIEW");
  assert.ok(reviews.length > 0);
  assert.equal(plan.feasibility.status, "feasible");
  assert.equal(plan.scheduleContract.requiresAdjustmentBeforeClaim, false);
  assert.deepEqual(plan.scheduleContract.underfilledWeeks, []);
});

test("capacity loss of required material references is deterministic and claim-locked", () => {
  const material = normalizeMaterialContract({
    hasMaterial: true,
    name: "영어 원서 A",
    currentProgress: "Unit 12까지 완료",
    targetRange: "Unit 13~50",
  });
  const input = {
    ...goalInput(),
    material,
    availability: {
      availableDays: ["월", "화", "수", "목", "금", "토", "일"],
      difficultDays: [],
      excludedDates: [],
      sessionMinutes: 5,
      weeklyFrequency: 7,
      scheduleStartDate: "2026-07-20",
    },
  };
  const blueprint = goalBlueprint();
  blueprint.taskTemplates.forEach((item) => {
    item.sourceReference = "영어 원서 A";
    item.quantityOrRange = "Unit 13~50";
  });

  const plan = enrichGoalPlanBlueprint(input, blueprint, { now: Date.parse("2026-07-19T15:00:00Z") });
  const actions = plan.scheduleOccurrences.flatMap((day) => day.items).filter((item) => item.type === "ACTION");
  assert.equal(actions.length, 7);
  assert.equal(plan.feasibility.status, "infeasible_as_requested");
  assert.equal(plan.scheduleContract.requiresAdjustmentBeforeClaim, true);
  assert.equal(plan.scheduleContract.eligibleUnderfilled, false);
  assert.equal(plan.scheduleContract.capacityUnderfilled, true);
  assert.equal(plan.scheduleContract.materialReferencesDropped, true);
});

test("dropping redundant model references does not lock a fully covered material schedule", () => {
  const material = normalizeMaterialContract({
    hasMaterial: true,
    name: "영어 원서 A",
    currentProgress: "Unit 12까지 완료",
    targetRange: "Unit 13~15",
  });
  const input = {
    ...goalInput(),
    periodDays: 7,
    material,
    availability: {
      availableDays: ["월", "화", "수", "목", "금", "토", "일"],
      difficultDays: [],
      excludedDates: [],
      sessionMinutes: 5,
      weeklyFrequency: 3,
      scheduleStartDate: "2026-07-20",
    },
  };
  const blueprint = goalBlueprint({ templates: 1, itemsPerDay: 1 });
  blueprint.taskTemplates[0] = {
    type: "ACTION",
    title: "영어 원서 다음 범위 읽기",
    sourceReference: "영어 원서 A",
    quantityOrRange: "Unit 13~15",
    durationMinutes: 5,
    completionRule: "정한 범위를 읽으면 완료",
    time: "저녁",
  };
  blueprint.days = blueprint.days.map(() => ({ isRestDay: false, taskIndexes: [0] }));

  assert.deepEqual(validateGoalPlanBlueprint(input, blueprint), []);
  const plan = enrichGoalPlanBlueprint(input, blueprint, { now: Date.parse("2026-07-19T15:00:00Z") });
  const actions = plan.scheduleOccurrences.flatMap((day) => day.items).filter((item) => item.type === "ACTION");
  assert.deepEqual(actions.map((item) => item.quantityOrRange), ["Unit 13", "Unit 14", "Unit 15"]);
  assert.equal(plan.scheduleContract.capacityUnderfilled, false);
  assert.equal(plan.scheduleContract.materialReferencesDropped, false);
  assert.equal(plan.scheduleContract.requiresAdjustmentBeforeClaim, false);
  assert.deepEqual(validateGeneratedPlan(input, plan), []);
});

test("server scheduling applies KST weekday and inclusive exclusion constraints to every occurrence", () => {
  const input = {
    ...goalInput(),
    periodDays: 14,
    material: { hasMaterial: false },
    availability: {
      availableDays: ["일", "월요일", "Tue", "수", "목", "금", "토"],
      difficultDays: ["Wednesday"],
      excludedDates: ["2026-07-20~2026-07-21"],
      sessionMinutes: 60,
      weeklyFrequency: 4,
      scheduleStartDate: "2026-07-19",
      notificationTime: "07:30",
    },
  };
  const blueprint = goalBlueprint();
  blueprint.taskTemplates.forEach((item) => {
    item.sourceReference = "";
    item.durationMinutes = item.type === "ACTION" ? 20 : 0;
  });
  const plan = enrichGoalPlanBlueprint(input, blueprint, { now: Date.parse("2026-07-18T15:00:00Z") });
  assert.equal(plan.scheduleOccurrences.length, 14);
  assert.deepEqual(
    plan.scheduleOccurrences.slice(0, 4).map((day) => [day.date, day.dayLabel]),
    [["2026-07-19", "일"], ["2026-07-20", "월"], ["2026-07-21", "화"], ["2026-07-22", "수"]],
  );
  const excluded = excludedDateSet(input.availability.excludedDates);
  for (const day of plan.scheduleOccurrences) {
    const actions = day.items.filter((item) => item.type === "ACTION");
    if (excluded.has(day.date) || day.dayLabel === "수") assert.equal(actions.length, 0, day.date);
    assert.ok(actions.reduce((sum, item) => sum + item.durationMinutes, 0) <= 60, day.date);
    assert.equal(day.items.some((item) => item.type === "SYSTEM_RULE"), false);
  }
  assert.deepEqual(validateGeneratedPlan(input, plan), []);
});

test("partial final weeks are period-bounded and use prorated engagement targets", () => {
  const startDate = "2026-07-20";
  const blueprint = goalBlueprint({ templates: 7, itemsPerDay: 1 });
  blueprint.taskTemplates = blueprint.taskTemplates.map((item, index) => ({
    ...item,
    type: "ACTION",
    title: `period action ${index + 1}`,
    sourceReference: "",
    quantityOrRange: `step ${index + 1}`,
    durationMinutes: 20,
    completionRule: "한 단계를 마치면 완료",
  }));
  blueprint.days = blueprint.days.map((day, index) => ({
    ...day,
    isRestDay: false,
    taskIndexes: [index],
  }));

  for (const [periodDays, finalDays, expectedFinalEngagements] of [
    [8, 1, 1],
    [10, 3, 2],
    [13, 6, 4],
    [365, 1, 1],
  ]) {
    const input = {
      ...goalInput(),
      periodDays,
      material: { hasMaterial: false },
      availability: {
        availableDays: ["월", "화", "수", "목", "금", "토", "일"],
        difficultDays: [],
        excludedDates: [],
        sessionMinutes: 60,
        weeklyFrequency: 4,
        scheduleStartDate: startDate,
      },
    };
    assert.deepEqual(validateGoalPlanBlueprint(input, blueprint), []);
    const plan = enrichGoalPlanBlueprint(input, blueprint, { now: Date.parse("2026-07-19T15:00:00Z") });
    const finalTarget = plan.scheduleContract.periodBoundedFrequencyTargets.at(-1);
    const expectedEnd = new Date(`${startDate}T00:00:00Z`);
    expectedEnd.setUTCDate(expectedEnd.getUTCDate() + periodDays - 1);

    assert.equal(plan.scheduleOccurrences.length, periodDays, `${periodDays} days`);
    assert.equal(plan.scheduleOccurrences.at(-1).date, expectedEnd.toISOString().slice(0, 10));
    assert.deepEqual(
      {
        daysInPeriod: finalTarget.daysInPeriod,
        expectedEngagementDays: finalTarget.expectedEngagementDays,
        actualEngagementDays: finalTarget.actualEngagementDays,
      },
      {
        daysInPeriod: finalDays,
        expectedEngagementDays: expectedFinalEngagements,
        actualEngagementDays: expectedFinalEngagements,
      },
    );
    assert.deepEqual(plan.scheduleContract.underfilledWeeks, []);
    assert.equal(plan.scheduleContract.requiresAdjustmentBeforeClaim, false);
  }
});

test("an empty partial final-week engagement window is claim-locked while a REVIEW remains valid engagement", () => {
  const input = {
    ...goalInput(),
    periodDays: 8,
    material: { hasMaterial: false },
    availability: {
      availableDays: ["월", "화", "수", "목", "금", "토", "일"],
      difficultDays: [],
      excludedDates: [],
      sessionMinutes: 60,
      weeklyFrequency: 4,
      scheduleStartDate: "2026-07-20",
    },
  };
  const blueprint = goalBlueprint({ templates: 7, itemsPerDay: 1 });
  blueprint.taskTemplates = blueprint.taskTemplates.map((item, index) => ({
    ...item,
    type: "ACTION",
    title: `partial-window action ${index + 1}`,
    sourceReference: "",
    quantityOrRange: `step ${index + 1}`,
    durationMinutes: 20,
    completionRule: "한 단계를 마치면 완료",
  }));
  blueprint.days = blueprint.days.map((day, index) => ({
    ...day,
    isRestDay: false,
    taskIndexes: [index],
  }));
  blueprint.days[0] = { isRestDay: true, taskIndexes: [] };

  assert.deepEqual(validateGoalPlanBlueprint(input, blueprint), []);
  const underfilled = enrichGoalPlanBlueprint(input, blueprint, {
    now: Date.parse("2026-07-19T15:00:00Z"),
  });
  assert.equal(
    underfilled.scheduleOccurrences.at(-1).items.some((item) => ["ACTION", "REVIEW"].includes(item.type)),
    false,
  );
  assert.deepEqual(underfilled.scheduleContract.periodBoundedFrequencyTargets.at(-1), {
    weekNumber: 2,
    daysInPeriod: 1,
    expectedEngagementDays: 1,
    actualEngagementDays: 0,
  });
  assert.deepEqual(underfilled.scheduleContract.underfilledWeeks, [2]);
  assert.equal(underfilled.scheduleContract.modelReferenceUnderfilled, true);
  assert.equal(underfilled.scheduleContract.requiresAdjustmentBeforeClaim, true);

  const reviewBlueprint = structuredClone(blueprint);
  reviewBlueprint.taskTemplates[0] = {
    type: "REVIEW",
    title: "다음 주 실행 점검",
    sourceReference: "",
    quantityOrRange: "",
    durationMinutes: 0,
    completionRule: "다음 조정 한 가지를 고르면 완료",
    time: "저녁",
  };
  reviewBlueprint.days[0] = { isRestDay: false, taskIndexes: [0] };

  assert.deepEqual(validateGoalPlanBlueprint(input, reviewBlueprint), []);
  const withReview = enrichGoalPlanBlueprint(input, reviewBlueprint, {
    now: Date.parse("2026-07-19T15:00:00Z"),
  });
  assert.equal(withReview.scheduleOccurrences.at(-1).items.some((item) => item.type === "REVIEW"), true);
  assert.deepEqual(withReview.scheduleContract.periodBoundedFrequencyTargets.at(-1), {
    weekNumber: 2,
    daysInPeriod: 1,
    expectedEngagementDays: 1,
    actualEngagementDays: 1,
  });
  assert.deepEqual(withReview.scheduleContract.underfilledWeeks, []);
  assert.equal(withReview.scheduleContract.requiresAdjustmentBeforeClaim, false);
});

test("multi-week material occurrences progress deterministically from current to target while review ranges remain valid", () => {
  const material = normalizeMaterialContract({
    hasMaterial: true,
    name: "영어 원서 A",
    currentProgress: "Unit 12까지 완료",
    targetRange: "Unit 13~40",
  });
  const input = {
    ...goalInput(),
    periodDays: 14,
    material,
    availability: {
      availableDays: ["월", "화", "수", "목", "금", "토", "일"],
      difficultDays: [],
      excludedDates: [],
      sessionMinutes: 30,
      weeklyFrequency: 5,
      scheduleStartDate: "2026-07-20",
    },
  };
  const blueprint = goalBlueprint({ templates: 7, itemsPerDay: 1 });
  blueprint.taskTemplates.forEach((item) => {
    item.sourceReference = "영어 원서 A";
    item.quantityOrRange = "Unit 13~40";
  });

  const plan = enrichGoalPlanBlueprint(input, blueprint, { now: Date.parse("2026-07-19T15:00:00Z") });
  const actions = plan.scheduleOccurrences.flatMap((day) => day.items).filter((item) => item.type === "ACTION");
  const ranges = actions.map((item) => item.quantityOrRange);
  assert.equal(actions.length, 10);
  assert.equal(ranges[0].match(/\d+/g).map(Number)[0], 13);
  assert.equal(ranges.at(-1).match(/\d+/g).map(Number).at(-1), 40);
  assert.equal(new Set(ranges).size, ranges.length);
  assert.equal(ranges.includes("Unit 13~40"), false);
  assert.ok(actions.every((item) => validateMaterialActionContract(material, item).length === 0));

  const reviewMaterial = normalizeMaterialContract({
    hasMaterial: true,
    name: "영어 원서 A",
    currentProgress: "Unit 12까지 완료",
    targetRange: "복습 Unit 1~12",
  });
  const reviewBlueprint = structuredClone(blueprint);
  reviewBlueprint.taskTemplates.forEach((item) => {
    item.quantityOrRange = "Unit 1~12";
  });
  const reviewPlan = enrichGoalPlanBlueprint({ ...input, material: reviewMaterial }, reviewBlueprint);
  const reviewActions = reviewPlan.scheduleOccurrences
    .flatMap((day) => day.items)
    .filter((item) => item.type === "ACTION");
  assert.deepEqual(
    reviewActions.map((item) => item.quantityOrRange),
    buildMaterialOccurrenceContract(reviewMaterial, reviewActions.length)
      .allocations.map((item) => item.quantityOrRange),
  );
  assert.ok(reviewActions.every((item) => validateMaterialActionContract(reviewMaterial, item).length === 0));
  assert.deepEqual(validateMaterialScheduleContract(reviewMaterial, reviewPlan.scheduleOccurrences), []);

  const shortProgression = normalizeMaterialContract({
    hasMaterial: true,
    name: "영어 원서 A",
    currentProgress: "Unit 12까지 완료",
    targetRange: "Unit 13~15",
  });
  const shortPlan = enrichGoalPlanBlueprint({ ...input, material: shortProgression }, blueprint);
  const shortItems = shortPlan.scheduleOccurrences.flatMap((day) => day.items);
  const shortActions = shortItems.filter((item) => item.type === "ACTION");
  const convertedReviews = shortItems.filter((item) => item.type === "REVIEW" && item.title.endsWith("· 복습"));
  assert.deepEqual(shortActions.map((item) => item.quantityOrRange), ["Unit 13", "Unit 14", "Unit 15"]);
  assert.equal(convertedReviews.length, 7);
  assert.ok(convertedReviews.every((item) => item.durationMinutes === 0));
  assert.deepEqual(validateMaterialScheduleContract(shortProgression, shortPlan.scheduleOccurrences), []);
  assert.deepEqual(validateGeneratedPlan({ ...input, material: shortProgression }, shortPlan), []);
});

test("365-day goals retain exact-date constraints beyond day 100", () => {
  const input = {
    ...goalInput(),
    periodDays: 365,
    availability: {
      ...goalInput().availability,
      availableDays: ["월", "화", "수", "목", "금", "토", "일"],
      difficultDays: [],
      excludedDates: ["2027-03-15"],
      weeklyFrequency: 7,
      scheduleStartDate: "2026-07-20",
    },
  };
  const blueprint = goalBlueprint();
  blueprint.taskTemplates.forEach((item) => {
    item.sourceReference = "영어 원서 A";
  });
  const plan = enrichGoalPlanBlueprint(input, blueprint, { now: Date.parse("2026-07-19T15:00:00Z") });

  assert.equal(plan.scheduleContract.generatedDays, 365);
  assert.equal(plan.scheduleOccurrences.length, 365);
  const excludedDay = plan.scheduleOccurrences.find((day) => day.date === "2027-03-15");
  assert.ok(excludedDay);
  assert.equal(excludedDay.items.some((item) => item.type === "ACTION"), false);
});

test("semantic recurrence identity survives template reorder and changes only occurrence identity when moved", () => {
  const input = {
    ...goalInput(),
    material: { hasMaterial: false },
    periodDays: 7,
    availability: {
      availableDays: ["월", "화", "수", "목", "금", "토", "일"],
      difficultDays: [],
      excludedDates: [],
      sessionMinutes: 180,
      weeklyFrequency: 7,
      scheduleStartDate: "2026-07-20",
    },
  };
  const original = goalBlueprint({ templates: 7, itemsPerDay: 1 });
  original.taskTemplates.forEach((item) => { item.sourceReference = ""; });
  const reordered = structuredClone(original);
  const order = [3, 0, 6, 1, 5, 2, 4];
  reordered.taskTemplates = order.map((index) => original.taskTemplates[index]);
  const remap = new Map(order.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  reordered.days = original.days.map((day) => ({
    ...day,
    taskIndexes: day.taskIndexes.map((index) => remap.get(index)),
  }));
  const first = enrichGoalPlanBlueprint(input, original);
  const second = enrichGoalPlanBlueprint(input, reordered);
  const actionIdentity = (plan) => new Map(
    plan.scheduleOccurrences.flatMap((day) => day.items)
      .filter((item) => item.type === "ACTION")
      .map((item) => [`${item.title}|${item.scheduledAt}`, [item.id, item.recurrenceGroupId]]),
  );
  assert.deepEqual(actionIdentity(first), actionIdentity(second));

  const moved = structuredClone(original);
  const movedIndex = moved.days[0].taskIndexes[0];
  moved.days[0].taskIndexes = [];
  moved.days[1].taskIndexes = [movedIndex];
  const movedPlan = enrichGoalPlanBlueprint(input, moved);
  const before = first.scheduleOccurrences.flatMap((day) => day.items).find((item) => item.title === original.taskTemplates[movedIndex].title);
  const after = movedPlan.scheduleOccurrences.flatMap((day) => day.items).find((item) => item.title === original.taskTemplates[movedIndex].title);
  assert.equal(before.recurrenceGroupId, after.recurrenceGroupId);
  assert.notEqual(before.id, after.id);
  assert.notEqual(before.scheduledAt, after.scheduledAt);
});

test("recurrence identity separates same-label morning summaries from evening quizzes and survives reorder", () => {
  const input = {
    ...goalInput(),
    material: { hasMaterial: false },
    periodDays: 7,
    availability: {
      availableDays: ["월", "화", "수", "목", "금", "토", "일"],
      difficultDays: [],
      excludedDates: [],
      sessionMinutes: 180,
      weeklyFrequency: 6,
      scheduleStartDate: "2026-07-20",
    },
  };
  const original = goalBlueprint({ templates: 7, itemsPerDay: 1 });
  original.taskTemplates.forEach((item) => { item.sourceReference = ""; });
  original.taskTemplates[0] = {
    type: "ACTION",
    title: "학습 내용 확인",
    sourceReference: "",
    quantityOrRange: "오늘 학습 범위",
    durationMinutes: 20,
    completionRule: "아침에 핵심을 3줄로 요약하면 완료",
    time: "아침",
  };
  original.taskTemplates[1] = {
    type: "ACTION",
    title: "학습 내용 확인",
    sourceReference: "",
    quantityOrRange: "오늘 학습 범위",
    durationMinutes: 20,
    completionRule: "저녁에 퀴즈 5문항을 풀면 완료",
    time: "저녁",
  };
  original.taskTemplates[2] = {
    ...original.taskTemplates[0],
    durationMinutes: 30,
  };
  original.taskTemplates[3] = {
    ...original.taskTemplates[0],
    time: "저녁",
  };
  original.days[0] = { isRestDay: false, taskIndexes: [0, 1, 2, 3] };
  original.days[1] = { isRestDay: false, taskIndexes: [4] };

  assert.deepEqual(validateGoalPlanBlueprint(input, original), []);
  const first = enrichGoalPlanBlueprint(input, original);
  const firstActions = first.scheduleOccurrences.flatMap((day) => day.items)
    .filter((item) => item.type === "ACTION");
  const firstDayVariants = first.scheduleOccurrences[0].items
    .filter((item) => item.title === "학습 내용 확인");
  assert.equal(firstDayVariants.length, 4);
  assert.equal(new Set(firstDayVariants.map((item) => item.recurrenceGroupId)).size, 4);
  assert.equal(new Set(firstDayVariants.map((item) => item.id)).size, 4);
  const morning = firstActions.find((item) => item.completionRule.includes("3줄"));
  const evening = firstActions.find((item) => item.completionRule.includes("5문항"));
  assert.ok(morning);
  assert.ok(evening);
  assert.notEqual(morning.recurrenceGroupId, evening.recurrenceGroupId);
  assert.notEqual(morning.id, evening.id);
  assert.deepEqual(
    firstActions
      .filter((item) => item.recurrenceGroupId === morning.recurrenceGroupId)
      .map((item) => item.completionRule),
    [morning.completionRule],
  );
  assert.equal(
    firstActions
      .filter((item) => item.recurrenceGroupId === morning.recurrenceGroupId)
      .some((item) => item.id === evening.id),
    false,
  );

  const order = [3, 1, 0, 2, 4, 5, 6];
  const reordered = structuredClone(original);
  reordered.taskTemplates = order.map((index) => original.taskTemplates[index]);
  const remap = new Map(order.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  reordered.days = original.days.map((day) => ({
    ...day,
    taskIndexes: day.taskIndexes.map((index) => remap.get(index)),
  }));
  assert.deepEqual(validateGoalPlanBlueprint(input, reordered), []);
  const second = enrichGoalPlanBlueprint(input, reordered);
  const logicalIdentity = (plan) => new Map(
    plan.scheduleOccurrences.flatMap((day) => day.items)
      .filter((item) => item.type === "ACTION")
      .map((item) => [
        `${item.completionRule}|${item.durationMinutes}|${item.scheduledAt}`,
        [item.id, item.recurrenceGroupId],
      ]),
  );
  assert.deepEqual(logicalIdentity(first), logicalIdentity(second));
});

test("exact duplicate task templates are rejected before ambiguous recurrence groups are generated", () => {
  const input = {
    ...goalInput(),
    material: { hasMaterial: false },
    availability: {
      ...goalInput().availability,
      weeklyFrequency: 6,
      scheduleStartDate: "2026-07-20",
    },
  };
  const blueprint = goalBlueprint({ templates: 7, itemsPerDay: 1 });
  blueprint.taskTemplates.forEach((item) => { item.sourceReference = ""; });
  blueprint.taskTemplates[1] = structuredClone(blueprint.taskTemplates[0]);

  assert.deepEqual(
    validateGoalPlanBlueprint(input, blueprint),
    ["GOAL_BLUEPRINT_DUPLICATE_TASK_TEMPLATE"],
  );
  assert.deepEqual(DOMAIN_RULES.GOAL_BLUEPRINT_DUPLICATE_TASK_TEMPLATE, {
    classification: "MODEL_REQUIRED",
    stage: "blueprint",
  });
});

test("SYSTEM_RULE templates never enter the user schedule", () => {
  const blueprint = goalBlueprint({ templates: 7, itemsPerDay: 1 });
  blueprint.taskTemplates[0] = {
    type: "SYSTEM_RULE",
    title: "internal fixture",
    sourceReference: "",
    quantityOrRange: "",
    durationMinutes: 0,
    completionRule: "",
    time: "",
  };
  blueprint.days[0].taskIndexes = [0];
  const input = { ...goalInput(), material: { hasMaterial: false } };
  const plan = enrichGoalPlanBlueprint(input, blueprint);
  assert.equal(plan.scheduleOccurrences.flatMap((day) => day.items).some((item) => item.type === "SYSTEM_RULE"), false);
});
