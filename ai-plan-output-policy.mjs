import {
  buildMaterialOccurrenceContract,
  normalizeMaterialContract,
  validateMaterialActionContract,
} from "./ai-material-contract.mjs";

export const AI_OUTPUT_BUDGET_VERSION = "ai-output-budget.v2";
export const PLAN_REVISION_MAX_OUTPUT_TOKENS = 4500;
export const PLAN_REVISION_MAX_PARSED_BYTES = 40_000;

export const PLAN_ITEM_TYPES = Object.freeze(["ACTION", "REVIEW", "TIP", "SYSTEM_RULE"]);
export const WEEKDAY_LABELS = Object.freeze(["월", "화", "수", "목", "금", "토", "일"]);
export const MAX_WEEK_TEMPLATE_COUNT = 14;
export const MAX_DAY_ITEM_COUNT = 5;
export const PLAN_TIMEZONE = "Asia/Seoul";

export const DOMAIN_RULES = Object.freeze({
  REVISION_BLUEPRINT_DAY_COUNT_INVALID: Object.freeze({ classification: "MODEL_REQUIRED", stage: "blueprint" }),
  REVISION_BLUEPRINT_DUPLICATE_DAY_REFERENCE: Object.freeze({ classification: "MODEL_REQUIRED", stage: "blueprint" }),
  REVISION_BLUEPRINT_REFERENCE_INVALID: Object.freeze({ classification: "MODEL_REQUIRED", stage: "blueprint" }),
  REVISION_BLUEPRINT_COMPLETED_TASK: Object.freeze({ classification: "HARD", stage: "blueprint" }),
  EXCLUDED_WEEKDAY_ACTION: Object.freeze({ classification: "HARD", stage: "schedule" }),
  REST_PERIOD_ACTION: Object.freeze({ classification: "HARD", stage: "schedule" }),
  AVAILABILITY_OVER_CAPACITY: Object.freeze({ classification: "HARD", stage: "schedule" }),
  SOURCE_REFERENCE_MISSING: Object.freeze({ classification: "HARD", stage: "blueprint" }),
  ACTION_IDENTITY_MISSING: Object.freeze({ classification: "SERVER_DERIVED", stage: "schedule" }),
  ACTION_IDENTITY_DUPLICATE: Object.freeze({ classification: "SERVER_DERIVED", stage: "schedule" }),
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

export function countRevisionBlueprintItems(blueprint) {
  return (blueprint?.days || []).reduce((total, day) => total + (day?.taskIndexes?.length || 0), 0);
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
