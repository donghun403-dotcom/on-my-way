import test from "node:test";
import assert from "node:assert/strict";

import {
  parseStructuredResponse,
  validateStructuredValue,
} from "./ai-output-contract.mjs";
import {
  GOAL_PLAN_BLUEPRINT_SCHEMA,
  GOAL_PLAN_MAX_OUTPUT_TOKENS,
  GOAL_PLAN_MAX_PARSED_BYTES,
  MAX_DAY_ITEM_COUNT,
  MAX_WEEK_TEMPLATE_COUNT,
  PLAN_REVISION_BLUEPRINT_SCHEMA,
  PLAN_REVISION_MAX_OUTPUT_TOKENS,
  PLAN_REVISION_MAX_PARSED_BYTES,
  countGoalBlueprintItems,
  enrichGoalPlanBlueprint,
  enrichRevisionBlueprint,
  validateGoalPlanBlueprint,
  validateRevisionBlueprint,
} from "./ai-plan-output-policy.mjs";

function goalInput() {
  return {
    draftPlanId: "draft-output-budget-fixture",
    goal: "영어 원서 6장까지 읽고 핵심 문장 기록하기",
    routine: { preferredTime: "저녁" },
    material: { hasMaterial: true, name: "영어 원서 A", targetRange: "1장~6장" },
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
    feasibility: "주 7회 180분 안에서 충분히 실행 가능",
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
  for (const serverOwned of ["planId", "recurrenceGroupId", "scheduledAt", "status", "createdAt", "updatedAt"]) {
    assert.equal(schemaText.includes(`"${serverOwned}"`), false, serverOwned);
  }
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
  assert.ok(occurrences.every((item) => item.status === "pending" && item.scheduledAt === ""));
  assert.ok(occurrences.every((item) => item.recurrenceGroupId));
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
