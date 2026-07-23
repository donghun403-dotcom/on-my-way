import { fetchAiResponse } from "./ai-request.mjs";

export const PLAN_ITEM_TYPES = Object.freeze(["ACTION", "REVIEW", "TIP", "SYSTEM_RULE"]);

const PLAN_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "planId",
    "type",
    "title",
    "sourceReference",
    "quantityOrRange",
    "durationMinutes",
    "completionRule",
    "scheduledAt",
    "status",
    "recurrenceGroupId",
  ],
  properties: {
    id: { type: "string" },
    planId: { type: "string" },
    type: { type: "string", enum: PLAN_ITEM_TYPES },
    title: { type: "string" },
    sourceReference: { type: "string" },
    quantityOrRange: { type: "string" },
    durationMinutes: { type: "integer", minimum: 0, maximum: 180 },
    completionRule: { type: "string" },
    scheduledAt: { type: "string" },
    status: { type: "string", enum: ["pending"] },
    recurrenceGroupId: { type: "string" },
  },
};

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "personalitySummary",
    "planningStyle",
    "firstAction",
    "weekTitle",
    "weekPlan",
    "coachMessage",
    "dashboard",
    "fullSchedule",
    "todaySchedule",
    "firstWeekSchedule",
    "assumptions",
    "checkInRules",
    "fallbackPlan",
  ],
  properties: {
    personalitySummary: { type: "string" },
    planningStyle: { type: "string" },
    firstAction: { type: "string" },
    weekTitle: { type: "string" },
    weekPlan: { type: "array", items: { type: "string" }, minItems: 5, maxItems: 7 },
    coachMessage: { type: "string" },
    dashboard: {
      type: "object",
      additionalProperties: false,
      required: ["goal", "progress", "pace"],
      properties: {
        goal: { type: "string" },
        progress: { type: "integer", minimum: 0, maximum: 100 },
        pace: { type: "string" },
      },
    },
    fullSchedule: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["phase", "days", "focus", "successMetric"],
        properties: {
          phase: { type: "string" },
          days: { type: "string" },
          focus: { type: "string" },
          successMetric: { type: "string" },
        },
      },
    },
    todaySchedule: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["time", "durationMinutes", "task", "completionRule"],
        properties: {
          time: { type: "string" },
          durationMinutes: { type: "integer", minimum: 5, maximum: 180 },
          task: { type: "string" },
          completionRule: { type: "string" },
        },
      },
    },
    firstWeekSchedule: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dayNumber", "dayLabel", "isRestDay", "items"],
        properties: {
          dayNumber: { type: "integer", minimum: 1, maximum: 7 },
          dayLabel: { type: "string" },
          isRestDay: { type: "boolean" },
          items: { type: "array", minItems: 0, maxItems: 5, items: PLAN_ITEM_SCHEMA },
        },
      },
    },
    assumptions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
    checkInRules: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
    fallbackPlan: { type: "string" },
  },
};

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

export function normalizeGoalInput(input = {}) {
  const periodDays = Number(input.periodDays);
  const sessionMinutes = Number(input.availability?.sessionMinutes);
  const weeklyFrequency = Number(input.availability?.weeklyFrequency);
  return {
    draftPlanId: cleanText(input.draftPlanId, 100),
    goal: cleanText(input.goal, 300),
    periodDays: Number.isFinite(periodDays) ? Math.max(7, Math.min(3650, Math.round(periodDays))) : 90,
    currentState: cleanText(input.currentState, 500),
    routine: {
      readiness: cleanText(input.routine?.readiness, 100),
      preferredTime: cleanText(input.routine?.preferredTime, 50),
      existingRoutine: cleanText(input.routine?.existingRoutine, 300),
    },
    material: {
      hasMaterial: input.material?.hasMaterial === true,
      name: cleanText(input.material?.name, 200),
      targetRange: cleanText(input.material?.targetRange, 200),
      currentProgress: cleanText(input.material?.currentProgress, 200),
      completionRule: cleanText(input.material?.completionRule, 300),
      unit: cleanText(input.material?.unit, 80),
    },
    availability: {
      availableDays: Array.isArray(input.availability?.availableDays)
        ? input.availability.availableDays.slice(0, 7).map((day) => cleanText(day, 10)).filter(Boolean)
        : [],
      sessionMinutes: Number.isFinite(sessionMinutes) ? Math.max(5, Math.min(180, Math.round(sessionMinutes))) : 0,
      difficultDays: Array.isArray(input.availability?.difficultDays)
        ? input.availability.difficultDays.slice(0, 7).map((day) => cleanText(day, 10)).filter(Boolean)
        : [],
      excludedDates: Array.isArray(input.availability?.excludedDates)
        ? input.availability.excludedDates.slice(0, 30).map((date) => cleanText(date, 20)).filter(Boolean)
        : [],
      targetDate: cleanText(input.availability?.targetDate, 20),
      weeklyFrequency: Number.isFinite(weeklyFrequency) ? Math.max(1, Math.min(7, Math.round(weeklyFrequency))) : 0,
      intensity: cleanText(input.availability?.intensity, 30),
      bufferDays: Math.max(0, Math.min(30, Number(input.availability?.bufferDays) || 0)),
      notificationTime: cleanText(input.availability?.notificationTime, 20),
    },
    planningPreferences: Array.isArray(input.planningPreferences)
      ? input.planningPreferences.slice(0, 5).map((item) => cleanText(item, 100)).filter(Boolean)
      : [],
    birth: {
      date: cleanText(input.birth?.date, 20),
      time: cleanText(input.birth?.time, 20),
      place: cleanText(input.birth?.place, 100),
    },
    mbti: cleanText(input.mbti, 10),
    personalitySignals: {
      summary: cleanText(input.manseoryeok?.summary, 300),
      planningStyle: cleanText(input.recommendedPlanningStyle, 100),
    },
  };
}

function validateGoalInput(input) {
  if (!input.goal) return "목표를 입력해 주세요.";
  if (!input.availability.availableDays.length || !input.availability.sessionMinutes) return "가능한 요일과 회당 가능 시간을 입력해 주세요.";
  if (input.material.hasMaterial && (!input.material.name || !input.material.targetRange)) return "사용할 자료의 이름과 목표 범위를 입력해 주세요.";
  return "";
}

function extractOutputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

function compactPlanningStyle(value) {
  const label = cleanText(value, 120)
    .split(/[:：·\n]/, 1)[0]
    .replace(/\s*계획\s*$/, "")
    .trim()
    .slice(0, 18);
  return `${label || "맞춤 실행형"} 계획`;
}

function planText(plan) {
  return [
    plan.firstAction,
    plan.weekTitle,
    ...(Array.isArray(plan.weekPlan) ? plan.weekPlan : []),
    ...(Array.isArray(plan.todaySchedule) ? plan.todaySchedule.flatMap((item) => [item?.task, item?.completionRule]) : []),
    ...(Array.isArray(plan.fullSchedule) ? plan.fullSchedule.flatMap((item) => [item?.focus, item?.successMetric]) : []),
    ...(Array.isArray(plan.firstWeekSchedule)
      ? plan.firstWeekSchedule.flatMap((day) => (day?.items || []).flatMap((item) => [item?.title, item?.quantityOrRange, item?.completionRule]))
      : []),
    plan.fallbackPlan,
  ].map((value) => String(value || "")).join("\n");
}

function validationFailure(details) {
  const error = new Error("AI 계획이 입력 조건을 충족하지 않아 활성화하지 않았어요.");
  error.status = 502;
  error.code = "AI_PLAN_VALIDATION_FAILED";
  error.details = details.slice(0, 12);
  return error;
}

export function validateGeneratedPlan(input, plan) {
  const errors = [];
  const week = Array.isArray(plan?.firstWeekSchedule) ? plan.firstWeekSchedule : [];
  if (week.length !== 7) errors.push("첫 7일 일정이 모두 필요해요.");

  const allowedDays = new Set(input.availability.availableDays);
  const difficultDays = new Set(input.availability.difficultDays);
  const excludedDates = new Set(input.availability.excludedDates);
  const actionIds = new Set();
  let actionCount = 0;
  let materialActionCount = 0;

  week.forEach((day, dayIndex) => {
    if (Number(day?.dayNumber) !== dayIndex + 1) errors.push(`${dayIndex + 1}일차 순서가 올바르지 않아요.`);
    const label = cleanText(day?.dayLabel, 20).replace(/요일$/, "");
    const items = Array.isArray(day?.items) ? day.items : [];
    const scheduledOnExcludedDate = items.some((item) => excludedDates.has(String(item?.scheduledAt || "").slice(0, 10)));
    if (scheduledOnExcludedDate) errors.push(`${dayIndex + 1}일차가 제외 날짜에 배치됐어요.`);
    if ((!allowedDays.has(label) || difficultDays.has(label)) && items.some((item) => item?.type === "ACTION")) {
      errors.push(`${label || `${dayIndex + 1}일차`}에 실행 가능한 ACTION을 배치할 수 없어요.`);
    }
    if (day?.isRestDay && items.some((item) => item?.type === "ACTION")) errors.push(`${dayIndex + 1}일차 휴식일에 ACTION이 있어요.`);

    items.forEach((item, itemIndex) => {
      if (!PLAN_ITEM_TYPES.includes(item?.type)) errors.push(`${dayIndex + 1}일차 ${itemIndex + 1}번 항목 유형이 올바르지 않아요.`);
      if (item?.type !== "ACTION") return;
      actionCount += 1;
      const title = cleanText(item.title, 240);
      const duration = Number(item.durationMinutes);
      if (!item.id || !item.planId || !item.recurrenceGroupId) errors.push(`${dayIndex + 1}일차 ACTION 식별자가 부족해요.`);
      if (item.id && actionIds.has(String(item.id))) errors.push(`${dayIndex + 1}일차 ACTION 식별자가 중복됐어요.`);
      if (item.id) actionIds.add(String(item.id));
      if (input.draftPlanId && item.planId !== input.draftPlanId) errors.push(`${dayIndex + 1}일차 ACTION이 현재 계획 ID와 일치하지 않아요.`);
      if (!title || /\{[^}]*\}|\d*일째에는|다음 주 분량을 조정|놓친 항목은 다음 날/.test(title)) errors.push(`${dayIndex + 1}일차 ACTION 제목이 실제 행동이 아니에요.`);
      if (!Number.isFinite(duration) || duration < 5) errors.push(`${dayIndex + 1}일차 ACTION 시간이 없어요.`);
      if (duration > input.availability.sessionMinutes) errors.push(`${dayIndex + 1}일차 ACTION이 회당 가능 시간을 초과해요.`);
      if (!cleanText(item.completionRule, 300)) errors.push(`${dayIndex + 1}일차 ACTION 완료 기준이 없어요.`);
      if (!cleanText(item.quantityOrRange, 200)) errors.push(`${dayIndex + 1}일차 ACTION 대상이나 범위가 없어요.`);
      if (input.material.hasMaterial && cleanText(item.sourceReference, 200)) materialActionCount += 1;
    });
  });

  if (!actionCount) errors.push("첫 7일에 실행 가능한 ACTION이 하나 이상 필요해요.");
  if (input.material.hasMaterial && !materialActionCount) errors.push("등록한 자료와 범위가 ACTION에 반영되지 않았어요.");
  return errors;
}

function hasUnrelatedExamLeakage(goal, plan) {
  const goalText = String(goal || "");
  const isExamGoal = /토익|시험|수능|자격증|학습|공부|영어|오답|문제\s*풀이|단어\s*암기/i.test(goalText);
  if (isExamGoal) return false;
  return /토익|\bLC\b|\bRC\b|오답\s*(정리|노트)|단어\s*\d+\s*개/i.test(planText(plan));
}

export async function createAiGoalPlan(input, { apiKey, model = "gpt-5.4-mini", fetchImpl = fetch, timeoutMs } = {}) {
  if (!apiKey) {
    const error = new Error("서버에 OPENAI_API_KEY가 설정되지 않았어요.");
    error.status = 503;
    throw error;
  }

  const normalized = normalizeGoalInput(input);
  const validationError = validateGoalInput(normalized);
  if (validationError) {
    const error = new Error(validationError);
    error.status = 400;
    throw error;
  }

  let response;
  try {
    response = await fetchAiResponse("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "low" },
      instructions: [
        "당신은 행동과학 기반 목표 설계 코치입니다. 모든 답변은 자연스러운 한국어로 작성하세요.",
        "사용자의 목표, 현재 수준, 사용 가능 시간, 기존 루틴, 실행 성향을 최우선 근거로 사용하세요.",
        "MBTI와 생년월일 기반 성향 신호는 사용자가 제공한 선호 정보로만 참고하고 사실이나 운명처럼 단정하지 마세요.",
        "현재 상황, 기존 루틴, MBTI, 생년월일 값이 비어 있으면 임의로 추정하지 말고 목표와 기간, 선호 시간을 중심으로 일반적인 계획을 세우세요.",
        "전체 기간을 측정 가능한 단계로 나누고, 첫 7일은 실제로 실행 가능한 분량과 완료 기준을 제시하세요.",
        "material과 availability를 반드시 반영하세요. 사용 자료가 없으면 일반 계획으로 구성했다고 assumptions에 명시하세요.",
        "firstWeekSchedule은 정확히 7일이며 가능한 요일에만 ACTION을 배치하고, 어려운 요일·제외 날짜에는 ACTION을 배치하지 마세요.",
        "ACTION은 실제로 체크할 행동만 사용하고 자료·범위·예상 시간·완료 기준을 채우세요. REVIEW는 점검, TIP은 조언, SYSTEM_RULE은 내부 운영 규칙으로 분리하세요.",
        "TIP과 SYSTEM_RULE을 ACTION으로 만들지 말고, ACTION 시간은 availability.sessionMinutes를 초과하지 마세요.",
        "각 항목의 planId에는 draftPlanId를, scheduledAt에는 날짜가 있으면 ISO 날짜와 시간을 사용하세요. 반복 행동은 같은 recurrenceGroupId를 사용하세요.",
        "오늘 일정은 선호 시간과 기존 루틴에 연결하고, 실패한 날을 위한 최소 행동과 재시작 규칙을 포함하세요.",
        "planningStyle은 설명문이 아니라 18자 이내의 짧은 유형명으로 작성하세요.",
        "모든 일정과 행동은 사용자의 목표 분야에 직접 연결하세요. 다른 목표 분야의 예시나 템플릿 문구를 재사용하지 마세요.",
        "과도한 자신감, 의료·재정적 단정, 불필요하게 긴 설명은 피하세요.",
      ].join("\n"),
      input: `다음 사용자 정보로 정밀 목표 계획을 설계하세요.\n${JSON.stringify(normalized, null, 2)}`,
      max_output_tokens: 3000,
      text: {
        verbosity: "medium",
        format: {
          type: "json_schema",
          name: "personalized_goal_plan",
          strict: true,
          schema: PLAN_SCHEMA,
        },
      },
    }),
    }, { fetchImpl, timeoutMs });
  } catch (error) {
    error.providerCalled = true;
    throw error;
  }

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(responseBody.error?.message || "OpenAI API 요청에 실패했어요.");
    error.status = response.status >= 400 && response.status < 500 ? 502 : response.status;
    error.providerUsage = responseBody.usage || null;
    error.providerRequestId = response.headers.get("x-request-id") || "";
    error.providerCalled = true;
    throw error;
  }

  const outputText = extractOutputText(responseBody);
  if (!outputText) {
    const error = new Error("AI 응답에서 계획을 확인하지 못했어요.");
    error.status = 502;
    error.providerUsage = responseBody.usage || null;
    error.providerRequestId = response.headers.get("x-request-id") || "";
    error.providerCalled = true;
    throw error;
  }

  try {
    const plan = JSON.parse(outputText);
    if (hasUnrelatedExamLeakage(normalized.goal, plan)) {
      const error = new Error("AI 계획이 입력한 목표 분야와 일치하지 않아 적용하지 않았어요.");
      error.status = 502;
      error.code = "AI_PLAN_GOAL_MISMATCH";
      error.providerUsage = responseBody.usage || null;
      error.providerRequestId = response.headers.get("x-request-id") || "";
      error.providerCalled = true;
      throw error;
    }
    const validationErrors = validateGeneratedPlan(normalized, plan);
    if (validationErrors.length) {
      const error = validationFailure(validationErrors);
      error.providerUsage = responseBody.usage || null;
      error.providerRequestId = response.headers.get("x-request-id") || "";
      error.providerCalled = true;
      throw error;
    }
    plan.planningStyle = compactPlanningStyle(plan.planningStyle);
    return { plan, usage: responseBody.usage || null, requestId: response.headers.get("x-request-id") || "" };
  } catch (caught) {
    if (["AI_PLAN_GOAL_MISMATCH", "AI_PLAN_VALIDATION_FAILED"].includes(caught?.code)) throw caught;
    const error = new Error("AI 계획 응답을 해석하지 못했어요.");
    error.status = 502;
    error.providerUsage = responseBody.usage || null;
    error.providerRequestId = response.headers.get("x-request-id") || "";
    error.providerCalled = true;
    throw error;
  }
}
