import {
  buildMaterialOccurrenceContract,
  normalizeMaterialContract,
  validateMaterialActionContract,
} from "./ai-material-contract.mjs";

export const AI_OUTPUT_BUDGET_VERSION = "ai-output-budget.v2";
export const GOAL_PLAN_MAX_OUTPUT_TOKENS = 6000;
export const PLAN_REVISION_MAX_OUTPUT_TOKENS = 4500;
export const GOAL_PLAN_MAX_PARSED_BYTES = 48_000;
export const PLAN_REVISION_MAX_PARSED_BYTES = 40_000;

export const PLAN_ITEM_TYPES = Object.freeze(["ACTION", "REVIEW", "TIP", "SYSTEM_RULE"]);
export const WEEKDAY_LABELS = Object.freeze(["월", "화", "수", "목", "금", "토", "일"]);
export const MAX_WEEK_TEMPLATE_COUNT = 14;
export const MAX_DAY_ITEM_COUNT = 5;
export const PLAN_TIMEZONE = "Asia/Seoul";

export const DOMAIN_RULES = Object.freeze({
  FEASIBILITY_OPTION_REQUIRED: Object.freeze({ classification: "FEASIBILITY", stage: "blueprint" }),
  FEASIBILITY_SCHEDULE_CONFLICT: Object.freeze({ classification: "FEASIBILITY", stage: "schedule" }),
  FIRST_WEEK_SCHEDULE_INVALID: Object.freeze({ classification: "SERVER_DERIVED", stage: "schedule" }),
  GOAL_BLUEPRINT_DAY_COUNT_INVALID: Object.freeze({ classification: "MODEL_REQUIRED", stage: "blueprint" }),
  GOAL_BLUEPRINT_TEMPLATE_LIMIT: Object.freeze({ classification: "MODEL_REQUIRED", stage: "blueprint" }),
  GOAL_BLUEPRINT_DUPLICATE_TASK_TEMPLATE: Object.freeze({ classification: "MODEL_REQUIRED", stage: "blueprint" }),
  GOAL_BLUEPRINT_DUPLICATE_DAY_REFERENCE: Object.freeze({ classification: "MODEL_REQUIRED", stage: "blueprint" }),
  GOAL_BLUEPRINT_REFERENCE_INVALID: Object.freeze({ classification: "MODEL_REQUIRED", stage: "blueprint" }),
  GOAL_BLUEPRINT_ACTION_INCOMPLETE: Object.freeze({ classification: "MODEL_REQUIRED", stage: "blueprint" }),
  GOAL_BLUEPRINT_ACTION_DURATION: Object.freeze({ classification: "MODEL_REQUIRED", stage: "blueprint" }),
  GOAL_BLUEPRINT_ACTION_REQUIRED: Object.freeze({ classification: "MODEL_REQUIRED", stage: "blueprint" }),
  GOAL_BLUEPRINT_ENGAGEMENT_FREQUENCY_UNDERFILLED: Object.freeze({ classification: "MODEL_REQUIRED", stage: "blueprint" }),
  REVISION_BLUEPRINT_DAY_COUNT_INVALID: Object.freeze({ classification: "MODEL_REQUIRED", stage: "blueprint" }),
  REVISION_BLUEPRINT_DUPLICATE_DAY_REFERENCE: Object.freeze({ classification: "MODEL_REQUIRED", stage: "blueprint" }),
  REVISION_BLUEPRINT_REFERENCE_INVALID: Object.freeze({ classification: "MODEL_REQUIRED", stage: "blueprint" }),
  REVISION_BLUEPRINT_COMPLETED_TASK: Object.freeze({ classification: "HARD", stage: "blueprint" }),
  EXCLUDED_WEEKDAY_ACTION: Object.freeze({ classification: "HARD", stage: "schedule" }),
  EXCLUDED_DATE_ACTION: Object.freeze({ classification: "HARD", stage: "schedule" }),
  REST_PERIOD_ACTION: Object.freeze({ classification: "HARD", stage: "schedule" }),
  AVAILABILITY_OVER_CAPACITY: Object.freeze({ classification: "HARD", stage: "schedule" }),
  SOURCE_REFERENCE_MISSING: Object.freeze({ classification: "HARD", stage: "blueprint" }),
  SYSTEM_RULE_EXPOSED: Object.freeze({ classification: "HARD", stage: "schedule" }),
  SCHEDULE_DAY_ORDER_INVALID: Object.freeze({ classification: "SERVER_DERIVED", stage: "schedule" }),
  PLAN_ITEM_TYPE_INVALID: Object.freeze({ classification: "MODEL_REQUIRED", stage: "schedule" }),
  ACTION_IDENTITY_MISSING: Object.freeze({ classification: "SERVER_DERIVED", stage: "schedule" }),
  ACTION_IDENTITY_DUPLICATE: Object.freeze({ classification: "SERVER_DERIVED", stage: "schedule" }),
  ACTION_PLAN_ID_MISMATCH: Object.freeze({ classification: "SERVER_DERIVED", stage: "schedule" }),
  ACTION_TITLE_INVALID: Object.freeze({ classification: "HARD", stage: "schedule" }),
  ACTION_DURATION_MISSING: Object.freeze({ classification: "HARD", stage: "schedule" }),
  ACTION_COMPLETION_RULE_MISSING: Object.freeze({ classification: "MODEL_REQUIRED", stage: "schedule" }),
  ACTION_RANGE_MISSING: Object.freeze({ classification: "MODEL_REQUIRED", stage: "schedule" }),
  REVISION_OUTPUT_INVALID: Object.freeze({ classification: "MODEL_REQUIRED", stage: "schedule" }),
  REVISION_SUMMARY_MISSING: Object.freeze({ classification: "MODEL_REQUIRED", stage: "schedule" }),
  REVISION_ACTIONS_MISSING: Object.freeze({ classification: "MODEL_REQUIRED", stage: "schedule" }),
  REVISION_WEEK_DAY_COUNT_INVALID: Object.freeze({ classification: "SERVER_DERIVED", stage: "schedule" }),
  REVISION_WEEK_DAY_ORDER_INVALID: Object.freeze({ classification: "SERVER_DERIVED", stage: "schedule" }),
  REVISION_ACTION_INCOMPLETE: Object.freeze({ classification: "MODEL_REQUIRED", stage: "schedule" }),
  REVISION_EXACT_SCHEDULE_DAY_COUNT_INVALID: Object.freeze({ classification: "SERVER_DERIVED", stage: "schedule" }),
  REVISION_EXACT_SCHEDULE_DAY_ORDER_INVALID: Object.freeze({ classification: "SERVER_DERIVED", stage: "schedule" }),
  REVISION_EXACT_SCHEDULE_TASK_MISMATCH: Object.freeze({ classification: "SERVER_DERIVED", stage: "schedule" }),
  COMPLETED_ACTION_REINTRODUCED: Object.freeze({ classification: "HARD", stage: "schedule" }),
  GOAL_FIELD_MISMATCH: Object.freeze({ classification: "HARD", stage: "schedule" }),
  PLAN_INPUT_HASH_MISMATCH: Object.freeze({ classification: "HARD", stage: "commit" }),
  GOAL_BLUEPRINT_REST_ACTION: Object.freeze({ classification: "SERVER_DERIVED", stage: "blueprint" }),
  GOAL_BLUEPRINT_UNAVAILABLE_DAY: Object.freeze({ classification: "SERVER_DERIVED", stage: "blueprint" }),
  GOAL_BLUEPRINT_DAILY_DURATION: Object.freeze({ classification: "SERVER_DERIVED", stage: "blueprint" }),
  MATERIAL_ACTION_RANGE_MISSING: Object.freeze({ classification: "HARD", stage: "blueprint" }),
  MATERIAL_ACTION_RANGE_OUTSIDE_TARGET: Object.freeze({ classification: "HARD", stage: "blueprint" }),
  MATERIAL_ACTION_UNIT_MISMATCH: Object.freeze({ classification: "HARD", stage: "blueprint" }),
  MATERIAL_SOURCE_REFERENCE_MISMATCH: Object.freeze({ classification: "HARD", stage: "blueprint" }),
  MATERIAL_SCHEDULE_SEQUENCE_INVALID: Object.freeze({ classification: "SERVER_DERIVED", stage: "schedule" }),
  MATERIAL_TARGET_COVERAGE_INCOMPLETE: Object.freeze({ classification: "SERVER_DERIVED", stage: "schedule" }),
});

const SHORT_TEXT = { type: "string", minLength: 1, maxLength: 240 };
const OPTIONAL_SHORT_TEXT = { type: "string", maxLength: 240 };
const FEASIBILITY_OPTIONS = Object.freeze([
  "keep_current_plan",
  "extend_duration",
  "reduce_scope",
  "increase_frequency",
  "increase_session_duration",
]);

const FEASIBILITY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "summary", "recommendedOption", "adjustmentOptions"],
  properties: {
    status: { type: "string", enum: ["feasible", "constrained", "infeasible_as_requested"] },
    summary: SHORT_TEXT,
    recommendedOption: { type: "string", enum: FEASIBILITY_OPTIONS },
    adjustmentOptions: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: { type: "string", enum: FEASIBILITY_OPTIONS },
    },
  },
};

const TASK_TEMPLATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "type",
    "title",
    "sourceReference",
    "quantityOrRange",
    "durationMinutes",
    "completionRule",
    "time",
  ],
  properties: {
    type: { type: "string", enum: PLAN_ITEM_TYPES },
    title: SHORT_TEXT,
    sourceReference: { type: "string", maxLength: 200 },
    quantityOrRange: { type: "string", maxLength: 200 },
    durationMinutes: { type: "integer", minimum: 0, maximum: 180 },
    completionRule: OPTIONAL_SHORT_TEXT,
    time: { type: "string", maxLength: 40 },
  },
};

const DAY_TEMPLATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["isRestDay", "taskIndexes"],
  properties: {
    isRestDay: { type: "boolean" },
    taskIndexes: {
      type: "array",
      minItems: 0,
      maxItems: MAX_DAY_ITEM_COUNT,
      items: { type: "integer", minimum: 0, maximum: MAX_WEEK_TEMPLATE_COUNT - 1 },
    },
  },
};

export const GOAL_PLAN_BLUEPRINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "personalitySummary",
    "planningStyle",
    "weekTitle",
    "coachMessage",
    "feasibility",
    "phases",
    "taskTemplates",
    "days",
    "assumptions",
    "checkInRules",
    "fallbackPlan",
  ],
  properties: {
    personalitySummary: SHORT_TEXT,
    planningStyle: { type: "string", minLength: 1, maxLength: 80 },
    weekTitle: { type: "string", minLength: 1, maxLength: 120 },
    coachMessage: SHORT_TEXT,
    feasibility: FEASIBILITY_SCHEMA,
    phases: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["phase", "days", "focus", "successMetric"],
        properties: {
          phase: { type: "string", minLength: 1, maxLength: 80 },
          days: { type: "string", minLength: 1, maxLength: 40 },
          focus: { type: "string", minLength: 1, maxLength: 180 },
          successMetric: { type: "string", minLength: 1, maxLength: 180 },
        },
      },
    },
    taskTemplates: {
      type: "array",
      minItems: 5,
      maxItems: MAX_WEEK_TEMPLATE_COUNT,
      items: TASK_TEMPLATE_SCHEMA,
    },
    days: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: DAY_TEMPLATE_SCHEMA,
    },
    assumptions: { type: "array", items: SHORT_TEXT, minItems: 1, maxItems: 5 },
    checkInRules: { type: "array", items: SHORT_TEXT, minItems: 3, maxItems: 5 },
    fallbackPlan: SHORT_TEXT,
  },
};

const REVISION_TASK_TEMPLATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "time",
    "durationMinutes",
    "task",
    "sourceReference",
    "quantityOrRange",
    "completionRule",
  ],
  properties: {
    time: { type: "string", maxLength: 40 },
    durationMinutes: { type: "integer", minimum: 5, maximum: 360 },
    task: { type: "string", minLength: 1, maxLength: 280 },
    sourceReference: { type: "string", maxLength: 200 },
    quantityOrRange: { type: "string", maxLength: 200 },
    completionRule: { type: "string", minLength: 1, maxLength: 240 },
  },
};

export const PLAN_REVISION_BLUEPRINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["revisionSummary", "taskTemplates", "days", "changes", "ollieMessage"],
  properties: {
    revisionSummary: {
      type: "object",
      additionalProperties: false,
      required: ["goalAlignment", "resourcePlan", "timePlan", "weeklyRule", "assumptions"],
      properties: {
        goalAlignment: { type: "string", minLength: 1, maxLength: 300 },
        resourcePlan: { type: "string", minLength: 1, maxLength: 300 },
        timePlan: { type: "string", minLength: 1, maxLength: 300 },
        weeklyRule: { type: "string", minLength: 1, maxLength: 300 },
        assumptions: { type: "array", items: SHORT_TEXT, minItems: 0, maxItems: 4 },
      },
    },
    taskTemplates: {
      type: "array",
      minItems: 4,
      maxItems: MAX_WEEK_TEMPLATE_COUNT,
      items: REVISION_TASK_TEMPLATE_SCHEMA,
    },
    days: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: DAY_TEMPLATE_SCHEMA,
    },
    changes: { type: "array", items: SHORT_TEXT, minItems: 1, maxItems: 5 },
    ollieMessage: SHORT_TEXT,
  },
};

function stableHash(value) {
  let hash = 0xcbf29ce484222325n;
  for (const character of String(value || "")) {
    hash ^= BigInt(character.codePointAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function clean(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

const WEEKDAY_ALIASES = Object.freeze({
  월: "월", 월요일: "월", mon: "월", monday: "월",
  화: "화", 화요일: "화", tue: "화", tues: "화", tuesday: "화",
  수: "수", 수요일: "수", wed: "수", wednesday: "수",
  목: "목", 목요일: "목", thu: "목", thur: "목", thurs: "목", thursday: "목",
  금: "금", 금요일: "금", fri: "금", friday: "금",
  토: "토", 토요일: "토", sat: "토", saturday: "토",
  일: "일", 일요일: "일", sun: "일", sunday: "일",
});

export function normalizeWeekday(value) {
  const key = clean(value, 20).normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, "");
  return WEEKDAY_ALIASES[key] || "";
}

export function normalizeWeekdayList(values = []) {
  const selected = new Set((Array.isArray(values) ? values : []).map(normalizeWeekday).filter(Boolean));
  return WEEKDAY_LABELS.filter((day) => selected.has(day));
}

function dateKey(value) {
  const match = clean(value, 40).match(/^\d{4}-\d{2}-\d{2}/);
  if (!match) return "";
  const parsed = new Date(`${match[0]}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== match[0] ? "" : match[0];
}

function addUtcDays(value, amount) {
  const parsed = new Date(`${value}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

function kstDateKey(now = Date.now()) {
  const date = now instanceof Date ? now : new Date(now);
  return new Date(date.getTime() + 9 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function weekdayForDate(value) {
  const index = new Date(`${value}T00:00:00Z`).getUTCDay();
  return ["일", "월", "화", "수", "목", "금", "토"][index];
}

function scheduleTime(input, template = {}) {
  const candidates = [
    input?.availability?.notificationTime,
    template?.time,
    input?.routine?.preferredTime,
  ];
  for (const candidate of candidates) {
    const text = clean(candidate, 40);
    const exact = text.match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?:\s|$)/);
    if (exact) return `${String(Number(exact[1])).padStart(2, "0")}:${exact[2]}`;
    if (/아침|morning/i.test(text)) return "07:00";
    if (/점심|낮|afternoon/i.test(text)) return "13:00";
    if (/저녁|evening/i.test(text)) return "19:00";
    if (/밤|night/i.test(text)) return "21:00";
  }
  return "19:00";
}

function templateWithMaterialAllocation(template, allocation, mode) {
  if (!allocation) return template;
  const convertedToReview = allocation.type === "REVIEW";
  const repeatedReview = mode === "review" && allocation.reviewPass > 1;
  return {
    ...template,
    type: allocation.type,
    title: convertedToReview
      ? `${clean(template.title, 200)} · 복습`
      : repeatedReview
        ? `${clean(template.title, 190)} · ${allocation.reviewPass}회차 복습`
        : template.title,
    quantityOrRange: allocation.quantityOrRange,
    durationMinutes: convertedToReview ? 0 : template.durationMinutes,
  };
}

function partialDateKey(value, referenceDate) {
  const match = clean(value, 20).match(/^(\d{1,2})\/(\d{1,2})$/);
  const reference = dateKey(referenceDate) || kstDateKey();
  if (!match) return "";
  const month = String(Number(match[1])).padStart(2, "0");
  const day = String(Number(match[2])).padStart(2, "0");
  const referenceYear = Number(reference.slice(0, 4));
  let candidate = dateKey(`${referenceYear}-${month}-${day}`);
  if (candidate && candidate < reference) {
    candidate = dateKey(`${referenceYear + 1}-${month}-${day}`);
  }
  return candidate;
}

function excludedDateEntry(value, referenceDate) {
  const text = clean(value, 80).normalize("NFKC");
  const dateToken = String.raw`(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2})`;
  const range = text.match(new RegExp(`^(${dateToken})\\s*(?:~|–|—|부터|to)\\s*(${dateToken})$`, "i"));
  if (range) {
    const start = dateKey(range[1]) || partialDateKey(range[1], referenceDate);
    const end = dateKey(range[2]) || partialDateKey(range[2], start || referenceDate);
    if (!start || !end || start > end) return null;
    const dates = [];
    for (let current = start, guard = 0; current <= end && guard < 370; current = addUtcDays(current, 1), guard += 1) {
      dates.push(current);
    }
    return dates.at(-1) === end ? dates : null;
  }
  const single = dateKey(text) || partialDateKey(text, referenceDate);
  return single ? [single] : null;
}

export function invalidExcludedDateValues(values = [], { referenceDate = "" } = {}) {
  return (Array.isArray(values) ? values : [])
    .map((value) => clean(value, 80))
    .filter(Boolean)
    .filter((value) => !excludedDateEntry(value, referenceDate));
}

export function excludedDateSet(values = [], { referenceDate = "" } = {}) {
  const result = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const dates = excludedDateEntry(value, referenceDate);
    if (dates) dates.forEach((date) => result.add(date));
  }
  return result;
}

function referencedTemplates(blueprint) {
  return (blueprint.days || []).flatMap((day) => (
    (day.taskIndexes || []).map((index) => blueprint.taskTemplates?.[index]).filter(Boolean)
  ));
}

export function countGoalBlueprintItems(blueprint) {
  return (blueprint?.days || []).reduce((total, day) => total + (day?.taskIndexes?.length || 0), 0);
}

export function countRevisionBlueprintItems(blueprint) {
  return (blueprint?.days || []).reduce((total, day) => total + (day?.taskIndexes?.length || 0), 0);
}

export function validateGoalPlanBlueprint(input, blueprint) {
  const errors = [];
  const templates = Array.isArray(blueprint?.taskTemplates) ? blueprint.taskTemplates : [];
  const days = Array.isArray(blueprint?.days) ? blueprint.days : [];
  if (days.length !== 7) errors.push("GOAL_BLUEPRINT_DAY_COUNT_INVALID");
  if (templates.length > MAX_WEEK_TEMPLATE_COUNT) errors.push("GOAL_BLUEPRINT_TEMPLATE_LIMIT");
  if (new Set(templates.map(taskSemanticKey)).size !== templates.length) {
    errors.push("GOAL_BLUEPRINT_DUPLICATE_TASK_TEMPLATE");
  }
  let actionCount = 0;
  let materialActionCount = 0;

  days.slice(0, 7).forEach((day) => {
    const indexes = Array.isArray(day?.taskIndexes) ? day.taskIndexes : [];
    if (new Set(indexes).size !== indexes.length) errors.push("GOAL_BLUEPRINT_DUPLICATE_DAY_REFERENCE");
    const items = indexes.map((index) => templates[index]).filter(Boolean);
    if (items.length !== indexes.length) errors.push("GOAL_BLUEPRINT_REFERENCE_INVALID");
    const actions = items.filter((item) => item?.type === "ACTION");
    for (const item of actions) {
      actionCount += 1;
      if (!clean(item?.completionRule) || !clean(item?.quantityOrRange, 200)) errors.push("GOAL_BLUEPRINT_ACTION_INCOMPLETE");
      if (Number(item?.durationMinutes) < 5) errors.push("GOAL_BLUEPRINT_ACTION_DURATION");
      if (input.material.hasMaterial && clean(item?.sourceReference, 200)) materialActionCount += 1;
      if (input.material.hasMaterial) errors.push(...validateMaterialActionContract(input.material, item));
    }
  });

  if (actionCount < 1) errors.push("GOAL_BLUEPRINT_ACTION_REQUIRED");
  if (input.material.hasMaterial && materialActionCount === 0) errors.push("SOURCE_REFERENCE_MISSING");
  const availableDays = new Set(normalizeWeekdayList(input?.availability?.availableDays));
  const difficultDays = new Set(normalizeWeekdayList(input?.availability?.difficultDays));
  const requestedFrequency = Math.max(
    1,
    Math.min(7, Number(input?.availability?.weeklyFrequency) || availableDays.size || 1),
  );
  const eligibleWeekdayCount = WEEKDAY_LABELS.filter((day) => (
    availableDays.has(day) && !difficultDays.has(day)
  )).length;
  const referencedEngagementDays = days.slice(0, 7).filter((day) => (
    (day?.taskIndexes || []).some((index) => ["ACTION", "REVIEW"].includes(templates[index]?.type))
  )).length;
  if (
    eligibleWeekdayCount >= requestedFrequency
    && referencedEngagementDays < requestedFrequency
  ) {
    errors.push("GOAL_BLUEPRINT_ENGAGEMENT_FREQUENCY_UNDERFILLED");
  }
  const feasibility = blueprint?.feasibility;
  const adjustmentOptions = Array.isArray(feasibility?.adjustmentOptions) ? feasibility.adjustmentOptions : [];
  if (
    adjustmentOptions.length === 0
    || !adjustmentOptions.includes(feasibility?.recommendedOption)
    || (feasibility?.status === "infeasible_as_requested" && adjustmentOptions.includes("keep_current_plan"))
  ) {
    errors.push("FEASIBILITY_OPTION_REQUIRED");
  }
  return [...new Set(errors)];
}

function normalizedFeasibility(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const options = Array.isArray(value.adjustmentOptions)
      ? value.adjustmentOptions.filter((option) => FEASIBILITY_OPTIONS.includes(option)).slice(0, 4)
      : [];
    return {
      status: ["feasible", "constrained", "infeasible_as_requested"].includes(value.status)
        ? value.status
        : "constrained",
      summary: clean(value.summary) || "현재 조건에서 실행 가능한 범위로 길을 나눴어요.",
      recommendedOption: FEASIBILITY_OPTIONS.includes(value.recommendedOption)
        ? value.recommendedOption
        : options[0] || "keep_current_plan",
      adjustmentOptions: options.length ? options : ["keep_current_plan"],
    };
  }
  return {
    status: "feasible",
    summary: clean(value) || "현재 조건에서 시작할 수 있어요.",
    recommendedOption: "keep_current_plan",
    adjustmentOptions: ["keep_current_plan"],
  };
}

function actionTemplateIndexes(blueprint) {
  const templates = Array.isArray(blueprint?.taskTemplates) ? blueprint.taskTemplates : [];
  const referenced = (blueprint?.days || []).flatMap((day) => (
    (day?.taskIndexes || []).filter((index) => templates[index]?.type === "ACTION")
  ));
  if (referenced.length) return referenced;
  return templates.map((template, index) => template?.type === "ACTION" ? index : -1).filter((index) => index >= 0);
}

function canonicalTemplateText(value, maxLength = 240) {
  return clean(value, maxLength).normalize("NFKC").replace(/\s+/g, " ");
}

function normalizedTemplateDuration(template = {}) {
  const duration = Number(template.durationMinutes);
  return Number.isFinite(duration) ? String(Math.trunc(duration)) : "";
}

function normalizedTemplateTime(template = {}) {
  const value = canonicalTemplateText(template.time, 40).toLocaleLowerCase("en-US");
  const exact = value.match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?:\s|$)/);
  if (exact) return `${String(Number(exact[1])).padStart(2, "0")}:${exact[2]}`;
  if (/아침|morning/i.test(value)) return "07:00";
  if (/점심|낮|afternoon/i.test(value)) return "13:00";
  if (/저녁|evening/i.test(value)) return "19:00";
  if (/밤|night/i.test(value)) return "21:00";
  return value;
}

function taskSemanticKey(template = {}) {
  return JSON.stringify([
    canonicalTemplateText(template.type, 40),
    canonicalTemplateText(template.title),
    canonicalTemplateText(template.sourceReference, 200),
    canonicalTemplateText(template.quantityOrRange, 200),
    canonicalTemplateText(template.completionRule),
    normalizedTemplateDuration(template),
    normalizedTemplateTime(template),
  ]);
}

function recurrenceGroupIdFor(planId, template) {
  return `task-group-${stableHash(`${planId}:${taskSemanticKey(template)}`)}`;
}

function makeScheduleItem({
  input,
  template,
  templateIndex,
  planId,
  date,
  recurrenceOrdinal,
  durationMinutesOverride = null,
}) {
  const recurrenceGroupId = recurrenceGroupIdFor(planId, template);
  const time = scheduleTime(input, template);
  const sessionMinutes = Math.max(5, Number(input?.availability?.sessionMinutes) || 5);
  const durationMinutes = template.type === "ACTION"
    ? Math.max(5, Math.min(
      sessionMinutes,
      Number.isFinite(Number(durationMinutesOverride))
        ? Number(durationMinutesOverride)
        : Number(template.durationMinutes) || sessionMinutes,
    ))
    : Math.max(0, Number(template.durationMinutes) || 0);
  return {
    id: `task-${stableHash(`${planId}:${recurrenceGroupId}:${date}:${recurrenceOrdinal}`)}`,
    planId,
    type: template.type,
    title: clean(template.title),
    sourceReference: input?.material?.hasMaterial
      ? clean(input.material.sourceDisplayText || input.material.name, 200)
      : clean(template.sourceReference, 200),
    quantityOrRange: clean(template.quantityOrRange, 200),
    durationMinutes,
    completionRule: clean(template.completionRule),
    time,
    scheduledAt: `${date}T${time}:00+09:00`,
    status: "pending",
    recurrenceGroupId,
  };
}

export function enrichGoalPlanBlueprint(input, blueprint, { now = Date.now(), maxScheduleDays = 365 } = {}) {
  const planId = clean(input.draftPlanId, 100) || `draft-${stableHash(input.goal)}`;
  const startDate = dateKey(input?.availability?.scheduleStartDate) || kstDateKey(now);
  const scheduleDayCount = Math.max(7, Math.min(maxScheduleDays, Number(input?.periodDays) || 7));
  const allowedDays = new Set(normalizeWeekdayList(input?.availability?.availableDays));
  const difficultDays = new Set(normalizeWeekdayList(input?.availability?.difficultDays));
  const excludedDates = excludedDateSet(input?.availability?.excludedDates, { referenceDate: startDate });
  const requestedFrequency = Math.max(
    1,
    Math.min(7, Number(input?.availability?.weeklyFrequency) || allowedDays.size || 1),
  );
  const sessionMinutes = Math.max(5, Number(input?.availability?.sessionMinutes) || 5);
  const material = input?.material?.semanticRange
    ? input.material
    : normalizeMaterialContract(input?.material);
  const scheduleWindowContracts = [];
  const reviewOffsets = new Set(
    (blueprint.days || []).flatMap((day, relativeDayIndex) => (
      (day?.taskIndexes || []).some((index) => blueprint.taskTemplates?.[index]?.type === "REVIEW")
        ? [relativeDayIndex]
        : []
    )),
  );
  const scheduleRows = Array.from({ length: scheduleDayCount }, (_, dayIndex) => {
    const date = addUtcDays(startDate, dayIndex);
    const dayLabel = weekdayForDate(date);
    const sourceDay = blueprint.days[dayIndex % 7] || { taskIndexes: [] };
    return {
      dayIndex,
      date,
      dayLabel,
      sourceDay,
      actions: [],
      actionMinutes: 0,
    };
  });

  for (let windowStart = 0; windowStart < scheduleRows.length; windowStart += 7) {
    const windowRows = scheduleRows.slice(windowStart, windowStart + 7);
    const expectedEngagementDays = Math.min(
      windowRows.length,
      Math.max(1, Math.ceil((requestedFrequency * windowRows.length) / 7)),
    );
    const preferredOffsets = new Set(
      (blueprint.days || []).flatMap((day, relativeDayIndex) => (
        (day?.taskIndexes || []).some((index) => blueprint.taskTemplates?.[index]?.type === "ACTION")
          ? [relativeDayIndex]
          : []
      )),
    );
    const eligibleRows = windowRows
      .filter((row) => (
        allowedDays.has(row.dayLabel)
        && !difficultDays.has(row.dayLabel)
        && !excludedDates.has(row.date)
      ))
      .sort((left, right) => {
        const preferredDifference = Number(preferredOffsets.has(right.dayIndex % 7))
          - Number(preferredOffsets.has(left.dayIndex % 7));
        return preferredDifference || left.dayIndex - right.dayIndex;
      });
    const selectedRows = eligibleRows
      .slice(0, expectedEngagementDays)
      .sort((left, right) => left.dayIndex - right.dayIndex);

    const actionReferences = (blueprint.days || []).flatMap((day, preferredOffset) => (
      (day?.taskIndexes || [])
        .filter((templateIndex) => blueprint.taskTemplates?.[templateIndex]?.type === "ACTION")
        .map((templateIndex) => ({ templateIndex, preferredOffset }))
    )).filter((reference) => reference.preferredOffset < windowRows.length);
    for (const reference of actionReferences) {
      const template = blueprint.taskTemplates[reference.templateIndex];
      const preferred = selectedRows.find((row) => row.dayIndex % 7 === reference.preferredOffset);
      const candidates = [
        ...(preferred ? [preferred] : []),
        ...selectedRows
          .filter((row) => row !== preferred)
          .sort((left, right) => (
            left.actions.length - right.actions.length
            || left.actionMinutes - right.actionMinutes
            || left.dayIndex - right.dayIndex
          )),
      ];
      const target = candidates.find((row) => (
        row.actions.length < MAX_DAY_ITEM_COUNT
        && row.actionMinutes + Math.max(5, Math.min(sessionMinutes, Number(template.durationMinutes) || sessionMinutes))
          <= sessionMinutes
      ));
      if (!target) continue;
      const durationMinutes = Math.max(5, Math.min(sessionMinutes, Number(template.durationMinutes) || sessionMinutes));
      target.actions.push({ templateIndex: reference.templateIndex, durationMinutes });
      target.actionMinutes += durationMinutes;
    }
    const scheduledReferenceCount = windowRows.reduce((count, row) => count + row.actions.length, 0);
    const requiredTemplateIndexes = new Set(actionReferences.map((reference) => reference.templateIndex));
    const scheduledTemplateIndexes = new Set(windowRows.flatMap((row) => (
      row.actions.map((assignment) => assignment.templateIndex)
    )));
    const distinctTemplateUnderfilled = [...requiredTemplateIndexes]
      .some((templateIndex) => !scheduledTemplateIndexes.has(templateIndex));
    const boundedReviewOffsets = [...reviewOffsets].filter((offset) => offset < windowRows.length);
    const scheduledEngagementDays = new Set([
      ...windowRows
        .filter((row) => row.actions.length > 0)
        .map((row) => row.dayIndex % 7),
      ...boundedReviewOffsets,
    ]).size;
    scheduleWindowContracts.push({
      weekNumber: Math.floor(windowStart / 7) + 1,
      daysInPeriod: windowRows.length,
      expectedEngagementDays,
      eligibleUnderfilled: eligibleRows.length < expectedEngagementDays,
      frequencyUnderfilled: scheduledEngagementDays < expectedEngagementDays,
      rawReferenceUnderfilled: scheduledReferenceCount < actionReferences.length,
      capacityUnderfilled: distinctTemplateUnderfilled,
      materialReferencesDropped: material.hasMaterial && distinctTemplateUnderfilled,
    });
  }

  const materialOccurrenceContract = buildMaterialOccurrenceContract(
    material,
    scheduleRows.reduce((count, row) => count + row.actions.length, 0),
  );
  let materialOccurrenceIndex = 0;
  scheduleRows.forEach((row) => {
    row.actions = row.actions.map((assignment) => ({
      ...assignment,
      materialAllocation: materialOccurrenceContract.allocations[materialOccurrenceIndex++],
    }));
  });

  const scheduleOccurrences = scheduleRows.map((row) => {
    const relativeIndexes = Array.isArray(row.sourceDay.taskIndexes) ? row.sourceDay.taskIndexes : [];
    const supplemental = relativeIndexes
      .filter((templateIndex) => ["REVIEW", "TIP"].includes(blueprint.taskTemplates?.[templateIndex]?.type))
      .map((templateIndex) => ({ templateIndex, durationMinutes: null }));
    const assigned = [...row.actions, ...supplemental].slice(0, MAX_DAY_ITEM_COUNT);
    const recurrenceOrdinals = new Map();
    const items = assigned.map(({ templateIndex, durationMinutes, materialAllocation }) => {
      const template = templateWithMaterialAllocation(
        blueprint.taskTemplates[templateIndex],
        materialAllocation,
        materialOccurrenceContract.mode,
      );
      const recurrenceGroupId = recurrenceGroupIdFor(planId, template);
      const recurrenceOrdinal = recurrenceOrdinals.get(recurrenceGroupId) || 0;
      recurrenceOrdinals.set(recurrenceGroupId, recurrenceOrdinal + 1);
      return makeScheduleItem({
        input,
        template,
        templateIndex,
        planId,
        date: row.date,
        recurrenceOrdinal,
        durationMinutesOverride: durationMinutes,
      });
    });
    const hasAction = items.some((item) => item.type === "ACTION");
    return {
      dayNumber: row.dayIndex + 1,
      date: row.date,
      dayLabel: row.dayLabel,
      isRestDay: !hasAction,
      items,
    };
  });
  const firstWeekSchedule = scheduleOccurrences.slice(0, 7);
  const occurrences = firstWeekSchedule.flatMap((day) => day.items);
  const actionOccurrences = scheduleOccurrences.flatMap((day) => day.items).filter((item) => item.type === "ACTION");
  const firstActionTemplate = blueprint.taskTemplates[actionTemplateIndexes(blueprint)[0]];
  const firstAction = actionOccurrences[0] || (firstActionTemplate ? {
    title: firstActionTemplate.title,
    time: firstActionTemplate.time,
    durationMinutes: Math.max(5, Math.min(
      Number(input?.availability?.sessionMinutes) || 5,
      Number(firstActionTemplate.durationMinutes) || Number(input?.availability?.sessionMinutes) || 5,
    )),
    completionRule: firstActionTemplate.completionRule,
  } : null);
  const weekPlanCandidates = [
    ...actionOccurrences.slice(0, 7).map((item) => item.title),
    ...occurrences.filter((item) => item.type === "REVIEW").map((item) => item.title),
    ...blueprint.phases.map((phase) => phase.focus),
  ];
  const weekPlan = [...new Set(weekPlanCandidates.filter(Boolean))].slice(0, 5);
  while (weekPlan.length < 5) weekPlan.push(blueprint.fallbackPlan);
  const currentDate = kstDateKey(now);
  const todaySource = scheduleOccurrences
    .find((day) => day.date === currentDate)
    ?.items.filter((item) => item.type === "ACTION") || [];
  scheduleWindowContracts.forEach((contract, windowIndex) => {
    const windowStart = windowIndex * 7;
    const actualEngagementDays = scheduleOccurrences
      .slice(windowStart, windowStart + contract.daysInPeriod)
      .filter((day) => day.items.some((item) => ["ACTION", "REVIEW"].includes(item.type)))
      .length;
    contract.actualEngagementDays = actualEngagementDays;
    contract.frequencyUnderfilled = actualEngagementDays < contract.expectedEngagementDays;
  });
  const underfilledWindows = scheduleWindowContracts.filter((contract) => (
    contract.eligibleUnderfilled
    || contract.frequencyUnderfilled
    || contract.capacityUnderfilled
    || contract.materialReferencesDropped
  ));
  const eligibleUnderfilled = underfilledWindows.some((contract) => contract.eligibleUnderfilled);
  const capacityUnderfilled = underfilledWindows.some((contract) => contract.capacityUnderfilled);
  const modelReferenceUnderfilled = scheduleWindowContracts.some((contract) => (
    contract.frequencyUnderfilled
    && !contract.eligibleUnderfilled
    && !contract.capacityUnderfilled
  ));
  const materialReferencesDropped = underfilledWindows.some((contract) => contract.materialReferencesDropped)
    || (material.hasMaterial && actionOccurrences.some((item) => !clean(item.sourceReference, 200)));
  const requestedScheduleUnderfilled = underfilledWindows.length > 0 || materialReferencesDropped;
  const modelFeasibility = normalizedFeasibility(blueprint.feasibility);
  const feasibility = requestedScheduleUnderfilled
    && (modelFeasibility.status !== "infeasible_as_requested" || eligibleUnderfilled) ? {
    status: "infeasible_as_requested",
    summary: materialReferencesDropped
      ? "현재 조건에서는 요청한 자료 범위와 실행 횟수를 모두 배치할 수 없어 조정이 필요해요."
      : "현재 가능한 요일과 시간으로는 요청한 주간 실행 횟수를 채울 수 없어 조정이 필요해요.",
    recommendedOption: eligibleUnderfilled ? "extend_duration" : "increase_session_duration",
    adjustmentOptions: eligibleUnderfilled
      ? ["extend_duration", "reduce_scope"]
      : ["increase_session_duration", "reduce_scope", "extend_duration"],
  } : modelFeasibility;
  const requiresAdjustmentBeforeClaim = feasibility.status === "infeasible_as_requested"
    || actionOccurrences.length === 0
    || requestedScheduleUnderfilled;

  return {
    personalitySummary: blueprint.personalitySummary,
    planningStyle: blueprint.planningStyle,
    firstAction: firstAction?.title || weekPlan[0],
    weekTitle: blueprint.weekTitle,
    weekPlan,
    coachMessage: blueprint.coachMessage,
    feasibility,
    feasibilitySummary: feasibility.summary,
    dashboard: { goal: input.goal, progress: 0, pace: feasibility.summary },
    fullSchedule: blueprint.phases,
    todaySchedule: todaySource.map((item) => ({
      date: item.scheduledAt.slice(0, 10),
      scheduledAt: item.scheduledAt,
      time: item.time,
      durationMinutes: item.durationMinutes,
      task: item.title,
      completionRule: item.completionRule,
    })),
    firstWeekSchedule,
    scheduleOccurrences,
    scheduleContract: {
      timezone: PLAN_TIMEZONE,
      startDate,
      generatedDays: scheduleDayCount,
      exactDatesServerDerived: true,
      requiresAdjustmentBeforeClaim,
      requestedWeeklyFrequency: requestedFrequency,
      periodBoundedFrequencyTargets: scheduleWindowContracts.map((contract) => ({
        weekNumber: contract.weekNumber,
        daysInPeriod: contract.daysInPeriod,
        expectedEngagementDays: contract.expectedEngagementDays,
        actualEngagementDays: contract.actualEngagementDays,
      })),
      underfilledWeeks: underfilledWindows.map((contract) => contract.weekNumber),
      eligibleUnderfilled,
      capacityUnderfilled,
      modelReferenceUnderfilled,
      materialReferencesDropped,
    },
    materialContract: input.material?.semanticRange ? {
      sourceId: input.material.sourceId || "",
      semanticRange: input.material.semanticRange,
    } : null,
    assumptions: blueprint.assumptions,
    checkInRules: blueprint.checkInRules,
    fallbackPlan: blueprint.fallbackPlan,
  };
}

export function validateRevisionBlueprint(input, blueprint) {
  const errors = [];
  const templates = Array.isArray(blueprint?.taskTemplates) ? blueprint.taskTemplates : [];
  const days = Array.isArray(blueprint?.days) ? blueprint.days : [];
  const completedTasks = new Set(input.completedTasks.map((task) => clean(task)));
  if (days.length !== 7) errors.push("REVISION_BLUEPRINT_DAY_COUNT_INVALID");

  days.slice(0, 7).forEach((day) => {
    const indexes = Array.isArray(day?.taskIndexes) ? day.taskIndexes : [];
    if (new Set(indexes).size !== indexes.length) errors.push("REVISION_BLUEPRINT_DUPLICATE_DAY_REFERENCE");
    const tasks = indexes.map((index) => templates[index]).filter(Boolean);
    if (tasks.length !== indexes.length) errors.push("REVISION_BLUEPRINT_REFERENCE_INVALID");
    if (tasks.some((task) => completedTasks.has(clean(task?.task)))) errors.push("REVISION_BLUEPRINT_COMPLETED_TASK");
  });
  return [...new Set(errors)];
}

function exactRevisionTaskTitle(task, allocation) {
  const title = clean(task?.task || task?.title, 280);
  return allocation?.type === "REVIEW" ? `${title} · 복습`.slice(0, 300) : title;
}

function revisionScheduleRows(input, weeklySchedule, { now = Date.now() } = {}) {
  const scope = input?.revisionDetails?.adjustmentScope || "remaining";
  const schedule = input?.revisionDetails?.schedule || {};
  const startDate = dateKey(schedule.scheduleStartDate) || kstDateKey(now);
  const generatedDays = scope === "remaining"
    ? Math.max(1, Math.min(365, Number(input?.periodDays) || 7))
    : 0;
  const availableDays = new Set(normalizeWeekdayList(schedule.availableDays));
  const excludedDates = excludedDateSet(schedule.excludedDates, { referenceDate: startDate });
  const weeklyByDay = new Map(
    (Array.isArray(weeklySchedule) ? weeklySchedule : [])
      .map((day) => [clean(day?.day, 10), day]),
  );
  return {
    scope,
    startDate,
    rows: Array.from({ length: generatedDays }, (_, dayIndex) => {
      const date = addUtcDays(startDate, dayIndex);
      const dayLabel = weekdayForDate(date);
      const source = weeklyByDay.get(dayLabel);
      const eligible = (
        (!availableDays.size || availableDays.has(dayLabel))
        && !excludedDates.has(date)
      );
      const dailyLimit = Number(
        ["토", "일"].includes(dayLabel) ? schedule.weekendMinutes : schedule.weekdayMinutes,
      ) || 360;
      let allocatedMinutes = 0;
      const baseTasks = [];
      for (const task of eligible && source && !source.isRestDay && Array.isArray(source.tasks)
        ? source.tasks
        : []) {
        const remainingMinutes = Math.max(0, dailyLimit - allocatedMinutes);
        if (baseTasks.length >= MAX_DAY_ITEM_COUNT || remainingMinutes < 5) break;
        const durationMinutes = Math.max(
          5,
          Math.min(remainingMinutes, Number(task?.durationMinutes) || 15),
        );
        baseTasks.push({ ...task, durationMinutes });
        allocatedMinutes += durationMinutes;
      }
      return {
        dayIndex,
        date,
        dayLabel,
        baseTasks,
      };
    }),
  };
}

export function buildRevisionScheduleOccurrences(input, weeklySchedule, options = {}) {
  const updatedMaterial = input?.pendingMaterial?.semanticRange
    ? input.pendingMaterial
    : normalizeMaterialContract(input?.pendingMaterial || { hasMaterial: false });
  const schedule = input?.revisionDetails?.schedule || {};
  const { scope, startDate, rows } = revisionScheduleRows(input, weeklySchedule, options);
  const totalTaskCount = rows.reduce((count, row) => count + row.baseTasks.length, 0);
  const materialContract = buildMaterialOccurrenceContract(updatedMaterial, totalTaskCount);
  const revisionPlanId = `revision-${stableHash(JSON.stringify([
    input?.goal || "",
    input?.currentPlanText || "",
    startDate,
    input?.periodDays || 0,
    updatedMaterial.sourceKey || "",
    updatedMaterial.semanticRange || {},
  ]))}`;
  let materialIndex = 0;
  const scheduleOccurrences = rows.map((row) => {
    const recurrenceOrdinals = new Map();
    const items = row.baseTasks.map((baseTask) => {
      const allocation = materialContract.allocations[materialIndex++];
      const type = updatedMaterial.hasMaterial
        ? allocation?.type || "ACTION"
        : "ACTION";
      const time = scheduleTime({
        availability: { notificationTime: schedule.preferredTime },
      }, baseTask);
      const taskTemplate = {
        type,
        title: exactRevisionTaskTitle(baseTask, allocation),
        sourceReference: updatedMaterial.hasMaterial ? updatedMaterial.sourceDisplayText : "",
        quantityOrRange: updatedMaterial.hasMaterial ? allocation?.quantityOrRange || "" : "",
        completionRule: clean(baseTask?.completionRule, 240),
        durationMinutes: type === "REVIEW"
          ? 0
          : Math.max(5, Math.min(360, Number(baseTask?.durationMinutes) || 15)),
        time,
      };
      const recurrenceGroupId = recurrenceGroupIdFor(revisionPlanId, taskTemplate);
      const recurrenceOrdinal = recurrenceOrdinals.get(recurrenceGroupId) || 0;
      recurrenceOrdinals.set(recurrenceGroupId, recurrenceOrdinal + 1);
      return {
        id: `task-${stableHash(`${revisionPlanId}:${recurrenceGroupId}:${row.date}:${recurrenceOrdinal}`)}`,
        planId: revisionPlanId,
        type,
        title: taskTemplate.title,
        sourceReference: clean(taskTemplate.sourceReference, 200),
        quantityOrRange: clean(taskTemplate.quantityOrRange, 200),
        durationMinutes: taskTemplate.durationMinutes,
        completionRule: taskTemplate.completionRule,
        time,
        scheduledAt: `${row.date}T${time}:00+09:00`,
        status: "pending",
        recurrenceGroupId,
      };
    });
    return {
      dayNumber: row.dayIndex + 1,
      date: row.date,
      dayLabel: row.dayLabel,
      isRestDay: !items.some((item) => item.type === "ACTION"),
      items,
    };
  });
  return {
    scheduleOccurrences,
    scheduleContract: {
      scope,
      timezone: PLAN_TIMEZONE,
      startDate: rows.length ? startDate : "",
      generatedDays: rows.length,
      exactDatesServerDerived: rows.length > 0,
      materialAllocationServerDerived: updatedMaterial.hasMaterial && rows.length > 0,
    },
  };
}

export function validateRevisionScheduleOccurrences(input, revision, options = {}) {
  const expected = buildRevisionScheduleOccurrences(input, revision?.weeklySchedule || [], options);
  const updatedMaterial = input?.pendingMaterial?.semanticRange
    ? input.pendingMaterial
    : normalizeMaterialContract(input?.pendingMaterial || { hasMaterial: false });
  const actualSchedule = Array.isArray(revision?.scheduleOccurrences)
    ? revision.scheduleOccurrences
    : [];
  const actualContract = revision?.scheduleContract && typeof revision.scheduleContract === "object"
    ? revision.scheduleContract
    : {};
  const errors = [];
  if (actualSchedule.length !== expected.scheduleOccurrences.length) {
    errors.push("REVISION_EXACT_SCHEDULE_DAY_COUNT_INVALID");
  }
  if (
    actualContract.scope !== expected.scheduleContract.scope
    || actualContract.timezone !== expected.scheduleContract.timezone
    || actualContract.startDate !== expected.scheduleContract.startDate
    || actualContract.generatedDays !== expected.scheduleContract.generatedDays
    || actualContract.exactDatesServerDerived !== expected.scheduleContract.exactDatesServerDerived
    || actualContract.materialAllocationServerDerived !== expected.scheduleContract.materialAllocationServerDerived
  ) {
    errors.push("REVISION_EXACT_SCHEDULE_DAY_ORDER_INVALID");
  }
  const expectedIds = new Set();
  expected.scheduleOccurrences.forEach((expectedDay, dayIndex) => {
    const actualDay = actualSchedule[dayIndex];
    if (
      !actualDay
      || actualDay.dayNumber !== expectedDay.dayNumber
      || actualDay.date !== expectedDay.date
      || actualDay.dayLabel !== expectedDay.dayLabel
      || actualDay.isRestDay !== expectedDay.isRestDay
    ) {
      errors.push("REVISION_EXACT_SCHEDULE_DAY_ORDER_INVALID");
      return;
    }
    const actualItems = Array.isArray(actualDay.items) ? actualDay.items : [];
    if (actualItems.length !== expectedDay.items.length) {
      errors.push("REVISION_EXACT_SCHEDULE_TASK_MISMATCH");
      return;
    }
    expectedDay.items.forEach((expectedItem, itemIndex) => {
      const actualItem = actualItems[itemIndex];
      if (!actualItem || JSON.stringify(actualItem) !== JSON.stringify(expectedItem)) {
        errors.push("REVISION_EXACT_SCHEDULE_TASK_MISMATCH");
      }
      if (actualItem && updatedMaterial.hasMaterial) {
        if (clean(actualItem.sourceReference, 200) !== clean(updatedMaterial.sourceDisplayText, 200)) {
          errors.push("MATERIAL_SOURCE_REFERENCE_MISMATCH");
        }
        if (clean(actualItem.quantityOrRange, 200) !== clean(expectedItem.quantityOrRange, 200)) {
          errors.push("MATERIAL_SCHEDULE_SEQUENCE_INVALID");
        }
        errors.push(...validateMaterialActionContract(updatedMaterial, actualItem));
      } else if (
        actualItem
        && (clean(actualItem.sourceReference, 200) || clean(actualItem.quantityOrRange, 200))
      ) {
        errors.push("MATERIAL_SOURCE_REFERENCE_MISMATCH");
      }
      if (!actualItem?.id) {
        errors.push("ACTION_IDENTITY_MISSING");
      } else if (expectedIds.has(actualItem.id)) {
        errors.push("ACTION_IDENTITY_DUPLICATE");
      } else {
        expectedIds.add(actualItem.id);
      }
    });
  });
  return [...new Set(errors)];
}

export function enrichRevisionBlueprint(blueprint, input = {}, options = {}) {
  const schedule = input?.revisionDetails?.schedule || {};
  const updatedMaterial = input?.pendingMaterial?.semanticRange
    ? input.pendingMaterial
    : normalizeMaterialContract(input?.pendingMaterial || { hasMaterial: false });
  const availableDays = normalizeWeekdayList(schedule.availableDays);
  const hasServerConstraints = availableDays.length > 0;
  const completedTasks = new Set((input?.completedTasks || []).map((task) => clean(task, 280)));
  const references = (blueprint?.days || []).flatMap((day) => day?.taskIndexes || [])
    .filter((index) => blueprint.taskTemplates?.[index] && !completedTasks.has(clean(blueprint.taskTemplates[index]?.task, 280)));
  let cursor = 0;
  const weeklySchedule = WEEKDAY_LABELS.map((day, dayIndex) => {
    if (!hasServerConstraints) {
      const source = blueprint.days[dayIndex] || { taskIndexes: [] };
      const tasks = (source.taskIndexes || []).map((templateIndex) => ({ ...blueprint.taskTemplates[templateIndex] }));
      return { day, isRestDay: Boolean(source.isRestDay), tasks };
    }
    if (!availableDays.includes(day) || references.length === 0) return { day, isRestDay: true, tasks: [] };
    const dailyLimit = Number(["토", "일"].includes(day) ? schedule.weekendMinutes : schedule.weekdayMinutes) || 360;
    const tasks = [];
    let totalMinutes = 0;
    while (tasks.length < MAX_DAY_ITEM_COUNT && cursor < references.length) {
      const template = blueprint.taskTemplates[references[cursor]];
      cursor += 1;
      const remaining = Math.max(0, dailyLimit - totalMinutes);
      if (remaining < 5) break;
      const durationMinutes = Math.max(5, Math.min(remaining, Number(template.durationMinutes) || remaining));
      tasks.push({ ...template, durationMinutes });
      totalMinutes += durationMinutes;
    }
    return { day, isRestDay: tasks.length === 0, tasks };
  });
  const scheduledTasks = weeklySchedule.flatMap((day) => day.tasks);
  const materialAllocations = buildMaterialOccurrenceContract(
    updatedMaterial,
    scheduledTasks.length,
  ).allocations;
  scheduledTasks.forEach((task, index) => {
    task.sourceReference = updatedMaterial.hasMaterial
      ? clean(updatedMaterial.sourceDisplayText, 200)
      : "";
    task.quantityOrRange = updatedMaterial.hasMaterial
      ? clean(materialAllocations[index]?.quantityOrRange, 200)
      : "";
  });
  const exactSchedule = buildRevisionScheduleOccurrences(input, weeklySchedule, options);
  const referenced = referencedTemplates(blueprint);
  const uniqueTasks = [...new Set(referenced.map((task) => clean(task?.task, 280)).filter(Boolean))];
  const revisedTasks = [...uniqueTasks];
  for (const template of blueprint.taskTemplates) {
    if (revisedTasks.length >= 4) break;
    const task = clean(template.task, 280);
    if (task && !revisedTasks.includes(task)) revisedTasks.push(task);
  }
  return {
    summary: blueprint.revisionSummary.goalAlignment,
    revisionSummary: blueprint.revisionSummary,
    weeklySchedule,
    scheduleOccurrences: exactSchedule.scheduleOccurrences,
    scheduleContract: exactSchedule.scheduleContract,
    updatedMaterial,
    revisedTasks: revisedTasks.slice(0, MAX_WEEK_TEMPLATE_COUNT),
    changes: blueprint.changes,
    ollieMessage: blueprint.ollieMessage,
  };
}
