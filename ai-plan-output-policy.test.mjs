import test from "node:test";
import assert from "node:assert/strict";

import {
  parseStructuredResponse,
  validateStructuredValue,
} from "./ai-output-contract.mjs";
import {
  buildMaterialOccurrenceContract,
  normalizeMaterialContract,
  validateMaterialActionContract,
  validateMaterialScheduleContract,
} from "./ai-material-contract.mjs";
import {
  DOMAIN_RULES,
  MAX_DAY_ITEM_COUNT,
  MAX_WEEK_TEMPLATE_COUNT,
  PLAN_REVISION_BLUEPRINT_SCHEMA,
  PLAN_REVISION_MAX_OUTPUT_TOKENS,
  PLAN_REVISION_MAX_PARSED_BYTES,
  enrichRevisionBlueprint,
  excludedDateSet,
  invalidExcludedDateValues,
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

const MAX_REVISION_FIXTURE = revisionBlueprint();
const MAX_REVISION_FIXTURE_BYTES = new TextEncoder().encode(JSON.stringify(MAX_REVISION_FIXTURE)).byteLength;
const MAX_REVISION_FIXTURE_CHARACTERS = JSON.stringify(MAX_REVISION_FIXTURE).length;
const MAX_REVISION_FIXTURE_ITEMS = MAX_REVISION_FIXTURE.days
  .reduce((count, day) => count + day.taskIndexes.length, 0);

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

test("all emitted roadmap rules are registered with stable responsibility metadata", () => {
  const emittedRules = [
    "REVISION_BLUEPRINT_DAY_COUNT_INVALID",
    "REVISION_BLUEPRINT_DUPLICATE_DAY_REFERENCE",
    "REVISION_BLUEPRINT_REFERENCE_INVALID",
    "REVISION_BLUEPRINT_COMPLETED_TASK",
    "EXCLUDED_WEEKDAY_ACTION",
    "REST_PERIOD_ACTION",
    "AVAILABILITY_OVER_CAPACITY",
    "SOURCE_REFERENCE_MISSING",
    "ACTION_IDENTITY_MISSING",
    "ACTION_IDENTITY_DUPLICATE",
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
