export const AI_OUTPUT_BUDGET_VERSION = "ai-output-budget.v2";
export const GOAL_PLAN_MAX_OUTPUT_TOKENS = 6000;
export const PLAN_REVISION_MAX_OUTPUT_TOKENS = 4500;
export const GOAL_PLAN_MAX_PARSED_BYTES = 48_000;
export const PLAN_REVISION_MAX_PARSED_BYTES = 40_000;

export const PLAN_ITEM_TYPES = Object.freeze(["ACTION", "REVIEW", "TIP", "SYSTEM_RULE"]);
export const WEEKDAY_LABELS = Object.freeze(["월", "화", "수", "목", "금", "토", "일"]);
export const MAX_WEEK_TEMPLATE_COUNT = 14;
export const MAX_DAY_ITEM_COUNT = 5;

const SHORT_TEXT = { type: "string", minLength: 1, maxLength: 240 };
const OPTIONAL_SHORT_TEXT = { type: "string", maxLength: 240 };

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
    feasibility: SHORT_TEXT,
    phases: {
      type: "array",
      minItems: 3,
      maxItems: 6,
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
  required: ["time", "durationMinutes", "task", "completionRule"],
  properties: {
    time: { type: "string", maxLength: 40 },
    durationMinutes: { type: "integer", minimum: 5, maximum: 360 },
    task: { type: "string", minLength: 1, maxLength: 280 },
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

  const allowedDays = new Set(input.availability.availableDays);
  const difficultDays = new Set(input.availability.difficultDays);
  let actionCount = 0;
  let materialActionCount = 0;

  days.slice(0, 7).forEach((day, dayIndex) => {
    const indexes = Array.isArray(day?.taskIndexes) ? day.taskIndexes : [];
    if (new Set(indexes).size !== indexes.length) errors.push("GOAL_BLUEPRINT_DUPLICATE_DAY_REFERENCE");
    const items = indexes.map((index) => templates[index]).filter(Boolean);
    if (items.length !== indexes.length) errors.push("GOAL_BLUEPRINT_REFERENCE_INVALID");
    const actions = items.filter((item) => item?.type === "ACTION");
    const dayLabel = WEEKDAY_LABELS[dayIndex];
    if (day?.isRestDay && actions.length) errors.push("GOAL_BLUEPRINT_REST_ACTION");
    if ((!allowedDays.has(dayLabel) || difficultDays.has(dayLabel)) && actions.length) {
      errors.push("GOAL_BLUEPRINT_UNAVAILABLE_DAY");
    }
    const totalMinutes = actions.reduce((total, item) => total + (Number(item?.durationMinutes) || 0), 0);
    if (totalMinutes > input.availability.sessionMinutes) errors.push("GOAL_BLUEPRINT_DAILY_DURATION");
    for (const item of actions) {
      actionCount += 1;
      if (!clean(item?.completionRule) || !clean(item?.quantityOrRange, 200)) errors.push("GOAL_BLUEPRINT_ACTION_INCOMPLETE");
      if (Number(item?.durationMinutes) < 5) errors.push("GOAL_BLUEPRINT_ACTION_DURATION");
      if (input.material.hasMaterial && clean(item?.sourceReference, 200)) materialActionCount += 1;
    }
  });

  if (actionCount < 2) errors.push("GOAL_BLUEPRINT_ACTION_COUNT");
  if (input.material.hasMaterial && materialActionCount === 0) errors.push("GOAL_BLUEPRINT_MATERIAL_MISSING");
  return [...new Set(errors)];
}

export function enrichGoalPlanBlueprint(input, blueprint) {
  const planId = clean(input.draftPlanId, 100) || `draft-${stableHash(input.goal)}`;
  const firstWeekSchedule = blueprint.days.map((day, dayIndex) => ({
    dayNumber: dayIndex + 1,
    dayLabel: WEEKDAY_LABELS[dayIndex],
    isRestDay: Boolean(day.isRestDay),
    items: day.taskIndexes.map((templateIndex, occurrenceIndex) => {
      const template = blueprint.taskTemplates[templateIndex];
      const recurrenceGroupId = `task-group-${stableHash(`${planId}:${templateIndex}:${template.type}:${template.title}`)}`;
      return {
        id: `task-${stableHash(`${planId}:${dayIndex}:${occurrenceIndex}:${templateIndex}`)}`,
        planId,
        type: template.type,
        title: clean(template.title),
        sourceReference: clean(template.sourceReference, 200),
        quantityOrRange: clean(template.quantityOrRange, 200),
        durationMinutes: Number(template.durationMinutes) || 0,
        completionRule: clean(template.completionRule),
        time: clean(template.time, 40),
        scheduledAt: "",
        status: "pending",
        recurrenceGroupId,
      };
    }),
  }));
  const occurrences = firstWeekSchedule.flatMap((day) => day.items);
  const actions = occurrences.filter((item) => item.type === "ACTION");
  const firstAction = actions[0];
  const weekPlanCandidates = [
    ...actions.map((item) => item.title),
    ...occurrences.filter((item) => item.type === "REVIEW").map((item) => item.title),
    ...blueprint.phases.map((phase) => phase.focus),
  ];
  const weekPlan = [...new Set(weekPlanCandidates.filter(Boolean))].slice(0, 5);
  while (weekPlan.length < 5) weekPlan.push(blueprint.fallbackPlan);
  const firstDayActions = firstWeekSchedule.find((day) => day.items.some((item) => item.type === "ACTION"))
    ?.items.filter((item) => item.type === "ACTION") || [];
  const todaySource = firstDayActions.length >= 2 ? firstDayActions : actions.slice(0, 2);

  return {
    personalitySummary: blueprint.personalitySummary,
    planningStyle: blueprint.planningStyle,
    firstAction: firstAction?.title || weekPlan[0],
    weekTitle: blueprint.weekTitle,
    weekPlan,
    coachMessage: blueprint.coachMessage,
    dashboard: { goal: input.goal, progress: 0, pace: blueprint.feasibility },
    fullSchedule: blueprint.phases,
    todaySchedule: todaySource.map((item) => ({
      time: item.time || input.routine.preferredTime || "오늘",
      durationMinutes: item.durationMinutes,
      task: item.title,
      completionRule: item.completionRule,
    })),
    firstWeekSchedule,
    assumptions: blueprint.assumptions,
    checkInRules: blueprint.checkInRules,
    fallbackPlan: blueprint.fallbackPlan,
  };
}

export function validateRevisionBlueprint(input, blueprint) {
  const errors = [];
  const templates = Array.isArray(blueprint?.taskTemplates) ? blueprint.taskTemplates : [];
  const days = Array.isArray(blueprint?.days) ? blueprint.days : [];
  const availableDays = new Set(input.revisionDetails.schedule.availableDays);
  const completedTasks = new Set(input.completedTasks.map((task) => clean(task)));
  if (days.length !== 7) errors.push("REVISION_BLUEPRINT_DAY_COUNT_INVALID");

  days.slice(0, 7).forEach((day, dayIndex) => {
    const indexes = Array.isArray(day?.taskIndexes) ? day.taskIndexes : [];
    if (new Set(indexes).size !== indexes.length) errors.push("REVISION_BLUEPRINT_DUPLICATE_DAY_REFERENCE");
    const tasks = indexes.map((index) => templates[index]).filter(Boolean);
    if (tasks.length !== indexes.length) errors.push("REVISION_BLUEPRINT_REFERENCE_INVALID");
    if (day?.isRestDay && tasks.length) errors.push("REVISION_BLUEPRINT_REST_TASK");
    const dayName = WEEKDAY_LABELS[dayIndex];
    if (availableDays.size && !availableDays.has(dayName) && tasks.length) errors.push("REVISION_BLUEPRINT_UNAVAILABLE_DAY");
    const dailyLimit = ["토", "일"].includes(dayName)
      ? input.revisionDetails.schedule.weekendMinutes
      : input.revisionDetails.schedule.weekdayMinutes;
    const totalMinutes = tasks.reduce((total, task) => total + (Number(task?.durationMinutes) || 0), 0);
    if (dailyLimit && totalMinutes > dailyLimit) errors.push("REVISION_BLUEPRINT_DAILY_DURATION");
    if (tasks.some((task) => completedTasks.has(clean(task?.task)))) errors.push("REVISION_BLUEPRINT_COMPLETED_TASK");
  });
  return [...new Set(errors)];
}

export function enrichRevisionBlueprint(blueprint) {
  const weeklySchedule = blueprint.days.map((day, dayIndex) => ({
    day: WEEKDAY_LABELS[dayIndex],
    isRestDay: Boolean(day.isRestDay),
    tasks: day.taskIndexes.map((templateIndex) => ({ ...blueprint.taskTemplates[templateIndex] })),
  }));
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
    revisedTasks: revisedTasks.slice(0, MAX_WEEK_TEMPLATE_COUNT),
    changes: blueprint.changes,
    ollieMessage: blueprint.ollieMessage,
  };
}
