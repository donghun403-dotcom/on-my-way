import { fetchAiResponse } from "./ai-request.mjs";
import {
  AI_CONTRACT_VERSIONS,
  attachProviderContext,
  createAiContractError,
  parseStructuredResponse,
  providerHttpError,
} from "./ai-output-contract.mjs";
import {
  AI_OUTPUT_BUDGET_VERSION,
  GOAL_PLAN_BLUEPRINT_SCHEMA,
  GOAL_PLAN_MAX_OUTPUT_TOKENS,
  GOAL_PLAN_MAX_PARSED_BYTES,
  PLAN_ITEM_TYPES,
  countGoalBlueprintItems,
  enrichGoalPlanBlueprint,
  validateGoalPlanBlueprint,
} from "./ai-plan-output-policy.mjs";

export { PLAN_ITEM_TYPES };
export const GOAL_PLAN_SCHEMA = GOAL_PLAN_BLUEPRINT_SCHEMA;

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
      reasoning: { effort: "none" },
      instructions: [
        "당신은 행동과학 기반 목표 설계 코치입니다. 모든 답변은 자연스러운 한국어로 작성하세요.",
        "사용자의 목표, 현재 수준, 사용 가능 시간, 기존 루틴, 실행 성향을 최우선 근거로 사용하세요.",
        "MBTI와 생년월일 기반 성향 신호는 사용자가 제공한 선호 정보로만 참고하고 사실이나 운명처럼 단정하지 마세요.",
        "비어 있는 정보는 임의로 추정하지 말고 assumptions에 필요한 가정만 짧게 적으세요.",
        "전체 기간은 phases로 요약하고, 실제 일정은 첫 7일의 재사용 가능한 taskTemplates와 days 참조만 반환하세요.",
        "material과 availability를 반드시 반영하세요. 사용 자료가 없으면 일반 계획으로 구성했다고 assumptions에 명시하세요.",
        "days는 월요일부터 일요일까지 정확히 7개입니다. 가능한 요일에만 ACTION을 참조하고, 어려운 요일은 휴식일로 두세요.",
        "같은 행동은 taskTemplates에 한 번만 쓰고 days.taskIndexes에서 재사용하세요. 하루 참조는 중복 없이 최대 5개입니다.",
        "ACTION에는 행동·자료·범위·시간·측정 가능한 완료 기준을 채우세요. REVIEW는 점검, TIP은 조언, SYSTEM_RULE은 내부 운영 규칙입니다.",
        "하루 ACTION 시간 합계는 availability.sessionMinutes를 초과하지 마세요.",
        "ID, planId, 상태, 날짜, 반복 그룹은 서버가 생성하므로 출력하지 마세요.",
        "time에는 선호 시간이나 기존 루틴에 연결한 짧은 시간 표현만 사용하세요.",
        "실패한 날을 위한 최소 행동과 재시작 규칙을 fallbackPlan과 checkInRules에 포함하세요.",
        "planningStyle은 설명문이 아니라 18자 이내의 짧은 유형명으로 작성하세요.",
        "모든 일정과 행동은 사용자의 목표 분야에 직접 연결하세요. 다른 목표 분야의 예시나 템플릿 문구를 재사용하지 마세요.",
        "짧고 구체적으로 쓰고 같은 설명을 여러 필드에 반복하지 마세요.",
      ].join("\n"),
      input: `다음 사용자 정보로 정밀 목표 계획을 설계하세요.\n${JSON.stringify(normalized, null, 2)}`,
      max_output_tokens: GOAL_PLAN_MAX_OUTPUT_TOKENS,
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "bounded_goal_plan_blueprint",
          strict: true,
          schema: GOAL_PLAN_SCHEMA,
        },
      },
    }),
    }, { fetchImpl, timeoutMs });
  } catch (error) {
    error.providerCalled = true;
    throw error;
  }

  let responseBody = {};
  let responseJsonInvalid = false;
  try {
    responseBody = await response.json();
  } catch {
    responseJsonInvalid = true;
  }
  if (!response.ok) {
    throw providerHttpError(response, responseBody);
  }
  if (responseJsonInvalid) {
    throw attachProviderContext(createAiContractError("AI_OUTPUT_PARSE_FAILED", {
      responseStatus: "invalid_response_json",
      incompleteReason: "",
      outputItemTypes: [],
      contentItemTypes: [],
      outputTokens: null,
      reasoningTokens: null,
      outputTextLength: 0,
      retryCount: 0,
    }), { requestId: response.headers.get("x-request-id") || "" });
  }

  try {
    const { value: blueprint, diagnostics } = parseStructuredResponse(responseBody, {
      schema: GOAL_PLAN_SCHEMA,
      domainValidate: (candidate) => validateGoalPlanBlueprint(normalized, candidate),
      domainValidationCode: "GOAL_PLAN_VALIDATION_FAILED",
      maxParsedBytes: GOAL_PLAN_MAX_PARSED_BYTES,
      countItems: countGoalBlueprintItems,
    });
    const plan = enrichGoalPlanBlueprint(normalized, blueprint);
    if (hasUnrelatedExamLeakage(normalized.goal, plan)) {
      throw createAiContractError("AI_OUTPUT_DOMAIN_INVALID", {
        ...diagnostics,
        domainValidationCode: "GOAL_FIELD_MISMATCH",
        domainErrorCount: 1,
      });
    }
    if (validateGeneratedPlan(normalized, plan).length) {
      throw createAiContractError("AI_OUTPUT_DOMAIN_INVALID", {
        ...diagnostics,
        domainValidationCode: "GOAL_PLAN_VALIDATION_FAILED",
        domainErrorCount: 1,
      });
    }
    plan.planningStyle = compactPlanningStyle(plan.planningStyle);
    return {
      plan,
      usage: responseBody.usage || null,
      requestId: response.headers.get("x-request-id") || "",
      diagnostics,
      contract: {
        schemaVersion: AI_CONTRACT_VERSIONS.goalPlanSchema,
        promptVersion: AI_CONTRACT_VERSIONS.goalPlanPrompt,
        domainOutputVersion: AI_CONTRACT_VERSIONS.domainOutput,
        budgetVersion: AI_OUTPUT_BUDGET_VERSION,
        maxOutputTokens: GOAL_PLAN_MAX_OUTPUT_TOKENS,
      },
    };
  } catch (caught) {
    if (caught?.code === "AI_OUTPUT_INCOMPLETE_MAX_TOKENS") {
      caught.message = "계획을 완성하지 못했어요. 입력 내용은 그대로 보관했어요.";
    }
    throw attachProviderContext(caught, {
      responseBody,
      requestId: response.headers.get("x-request-id") || "",
    });
  }
}
