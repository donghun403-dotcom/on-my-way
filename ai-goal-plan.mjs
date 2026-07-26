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
  PLAN_REVISION_MAX_OUTPUT_TOKENS,
  PLAN_ITEM_TYPES,
  countGoalBlueprintItems,
  enrichGoalPlanBlueprint,
  excludedDateSet,
  invalidExcludedDateValues,
  normalizeWeekdayList,
  validateGoalPlanBlueprint,
} from "./ai-plan-output-policy.mjs";
import {
  materialSemanticHashInput,
  normalizeMaterialContract,
  validateMaterialContract,
  validateMaterialScheduleContract,
} from "./ai-material-contract.mjs";

export { PLAN_ITEM_TYPES };
export const GOAL_PLAN_SCHEMA = GOAL_PLAN_BLUEPRINT_SCHEMA;

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

export function normalizeGoalInput(input = {}) {
  const periodDays = Number(input.periodDays);
  const sessionMinutes = Number(input.availability?.sessionMinutes);
  const weeklyFrequency = Number(input.availability?.weeklyFrequency);
  const rawMaterial = {
    hasMaterial: input.material?.hasMaterial === true,
    name: cleanText(input.material?.name || input.material?.sourceDisplayText, 200),
    targetRange: cleanText(input.material?.targetRange || input.material?.semanticRange?.displayText, 200),
    currentProgress: cleanText(input.material?.currentProgress, 200),
    completionRule: cleanText(input.material?.completionRule, 300),
    unit: cleanText(input.material?.unit, 80),
  };
  const materialContract = normalizeMaterialContract(rawMaterial);
  return {
    draftPlanId: cleanText(input.draftPlanId, 100),
    goal: cleanText(input.goal, 300),
    periodDays: Number.isFinite(periodDays) ? Math.max(7, Math.min(365, Math.round(periodDays))) : 90,
    currentState: cleanText(input.currentState, 500),
    routine: {
      readiness: cleanText(input.routine?.readiness, 100),
      preferredTime: cleanText(input.routine?.preferredTime, 50),
      existingRoutine: cleanText(input.routine?.existingRoutine, 300),
    },
    material: {
      ...rawMaterial,
      sourceId: materialContract.sourceId,
      sourceKey: materialContract.sourceKey,
      sourceDisplayText: materialContract.sourceDisplayText,
      semanticRange: materialContract.semanticRange,
    },
    availability: {
      availableDays: normalizeWeekdayList(input.availability?.availableDays),
      sessionMinutes: Number.isFinite(sessionMinutes) ? Math.max(5, Math.min(180, Math.round(sessionMinutes))) : 0,
      difficultDays: normalizeWeekdayList(input.availability?.difficultDays),
      excludedDates: Array.isArray(input.availability?.excludedDates)
        ? input.availability.excludedDates.slice(0, 30).map((date) => cleanText(date, 80)).filter(Boolean)
        : [],
      targetDate: cleanText(input.availability?.targetDate, 20),
      weeklyFrequency: Number.isFinite(weeklyFrequency) ? Math.max(1, Math.min(7, Math.round(weeklyFrequency))) : 0,
      intensity: cleanText(input.availability?.intensity, 30),
      bufferDays: Math.max(0, Math.min(30, Number(input.availability?.bufferDays) || 0)),
      notificationTime: cleanText(input.availability?.notificationTime, 20),
      scheduleStartDate: cleanText(input.availability?.scheduleStartDate, 10),
    },
    planningPreferences: Array.isArray(input.planningPreferences)
      ? input.planningPreferences.slice(0, 5).map((item) => cleanText(item, 100)).filter(Boolean)
      : [],
    feasibilityAdjustment: [
      "keep_current_plan",
      "extend_duration",
      "reduce_scope",
      "increase_frequency",
      "increase_session_duration",
    ].includes(input.feasibilityAdjustment)
      ? input.feasibilityAdjustment
      : "",
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

export function goalInputForHash(input = {}) {
  const normalized = input?.material?.semanticRange ? input : normalizeGoalInput(input);
  const { scheduleStartDate: _serverDerivedScheduleStartDate, ...availability } = normalized.availability || {};
  return {
    ...normalized,
    availability,
    material: materialSemanticHashInput(normalized.material),
  };
}

function validateGoalInput(input) {
  if (!input.goal) return "목표를 입력해 주세요.";
  if (!input.availability.availableDays.length || !input.availability.sessionMinutes) return "가능한 요일과 회당 가능 시간을 입력해 주세요.";
  if (input.material.hasMaterial && (!input.material.name || !input.material.targetRange)) return "사용할 자료의 이름과 목표 범위를 입력해 주세요.";
  if (invalidExcludedDateValues(input.availability.excludedDates, {
    referenceDate: input.availability.scheduleStartDate,
  }).length) {
    return "제외 날짜는 8/12 또는 8/15–8/18 형식으로 입력해 주세요.";
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

export function validateGeneratedPlan(input, plan) {
  const errors = [];
  const week = Array.isArray(plan?.firstWeekSchedule) ? plan.firstWeekSchedule : [];
  const schedule = Array.isArray(plan?.scheduleOccurrences) && plan.scheduleOccurrences.length
    ? plan.scheduleOccurrences
    : week;
  if (week.length !== 7) errors.push("FIRST_WEEK_SCHEDULE_INVALID");

  const allowedDays = new Set(normalizeWeekdayList(input.availability.availableDays));
  const difficultDays = new Set(normalizeWeekdayList(input.availability.difficultDays));
  const excludedDates = excludedDateSet(input.availability.excludedDates, {
    referenceDate: input.availability.scheduleStartDate || plan?.scheduleContract?.startDate,
  });
  const actionIds = new Set();
  let actionCount = 0;
  let materialActionCount = 0;

  schedule.forEach((day, dayIndex) => {
    if (Number(day?.dayNumber) !== dayIndex + 1) errors.push("SCHEDULE_DAY_ORDER_INVALID");
    const label = cleanText(day?.dayLabel, 20).replace(/요일$/, "");
    const items = Array.isArray(day?.items) ? day.items : [];
    const scheduledOnExcludedDate = items.some((item) => excludedDates.has(String(item?.scheduledAt || "").slice(0, 10)));
    if (scheduledOnExcludedDate && items.some((item) => item?.type === "ACTION")) errors.push("EXCLUDED_DATE_ACTION");
    if ((!allowedDays.has(label) || difficultDays.has(label)) && items.some((item) => item?.type === "ACTION")) {
      errors.push("EXCLUDED_WEEKDAY_ACTION");
    }
    if (day?.isRestDay && items.some((item) => item?.type === "ACTION")) errors.push("REST_PERIOD_ACTION");
    if (items.some((item) => item?.type === "SYSTEM_RULE")) errors.push("SYSTEM_RULE_EXPOSED");
    const totalActionMinutes = items
      .filter((item) => item?.type === "ACTION")
      .reduce((total, item) => total + (Number(item?.durationMinutes) || 0), 0);
    if (totalActionMinutes > input.availability.sessionMinutes) errors.push("AVAILABILITY_OVER_CAPACITY");

    items.forEach((item, itemIndex) => {
      if (!PLAN_ITEM_TYPES.includes(item?.type)) errors.push("PLAN_ITEM_TYPE_INVALID");
      if (item?.type !== "ACTION") return;
      actionCount += 1;
      const title = cleanText(item.title, 240);
      const duration = Number(item.durationMinutes);
      if (!item.id || !item.planId || !item.recurrenceGroupId) errors.push("ACTION_IDENTITY_MISSING");
      if (item.id && actionIds.has(String(item.id))) errors.push("ACTION_IDENTITY_DUPLICATE");
      if (item.id) actionIds.add(String(item.id));
      if (input.draftPlanId && item.planId !== input.draftPlanId) errors.push("ACTION_PLAN_ID_MISMATCH");
      if (!title || /\{[^}]*\}|\d*일째에는|다음 주 분량을 조정|놓친 항목은 다음 날/.test(title)) errors.push("ACTION_TITLE_INVALID");
      if (!Number.isFinite(duration) || duration < 5) errors.push("ACTION_DURATION_MISSING");
      if (duration > input.availability.sessionMinutes) errors.push("AVAILABILITY_OVER_CAPACITY");
      if (!cleanText(item.completionRule, 300)) errors.push("ACTION_COMPLETION_RULE_MISSING");
      if (!cleanText(item.quantityOrRange, 200)) errors.push("ACTION_RANGE_MISSING");
      if (input.material.hasMaterial && cleanText(item.sourceReference, 200)) materialActionCount += 1;
    });
  });

  if (!actionCount && plan?.feasibility?.status === "feasible") errors.push("FEASIBILITY_SCHEDULE_CONFLICT");
  if (input.material.hasMaterial && actionCount && !materialActionCount) errors.push("SOURCE_REFERENCE_MISSING");
  errors.push(...validateMaterialScheduleContract(input.material, schedule));
  return [...new Set(errors)];
}

function hasUnrelatedExamLeakage(goal, plan) {
  const goalText = String(goal || "");
  const isExamGoal = /토익|시험|수능|자격증|학습|공부|영어|오답|문제\s*풀이|단어\s*암기/i.test(goalText);
  if (isExamGoal) return false;
  return /토익|\bLC\b|\bRC\b|오답\s*(정리|노트)|단어\s*\d+\s*개/i.test(planText(plan));
}

export async function createAiGoalPlan(input, {
  apiKey,
  model = "gpt-5.4-mini",
  fetchImpl = fetch,
  timeoutMs,
  maxOutputTokens = GOAL_PLAN_MAX_OUTPUT_TOKENS,
  now = Date.now(),
} = {}) {
  if (!apiKey) {
    const error = new Error("서버에 OPENAI_API_KEY가 설정되지 않았어요.");
    error.status = 503;
    throw error;
  }

  const normalized = normalizeGoalInput(input);
  const boundedMaxOutputTokens = Number(maxOutputTokens) === PLAN_REVISION_MAX_OUTPUT_TOKENS
    ? PLAN_REVISION_MAX_OUTPUT_TOKENS
    : GOAL_PLAN_MAX_OUTPUT_TOKENS;
  const validationError = validateGoalInput(normalized);
  if (validationError) {
    const error = new Error(validationError);
    error.status = 400;
    throw error;
  }
  const materialRules = validateMaterialContract(normalized.material);
  if (materialRules.hard.length) {
    const error = new Error("자료의 현재 진도와 목표 범위를 다시 확인해 주세요.");
    error.status = 400;
    error.code = "MATERIAL_RANGE_INVALID";
    error.retryable = false;
    error.providerCalled = false;
    error.ruleIds = materialRules.hard;
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
        "전체 기간은 phases로 요약하고, 첫 7일의 days는 정확한 달력 날짜가 아닌 재사용 가능한 상대적 주간 패턴으로만 반환하세요.",
        "material과 availability를 반드시 반영하세요. 사용 자료가 없으면 일반 계획으로 구성했다고 assumptions에 명시하세요.",
        "days는 상대 슬롯 7개입니다. 사용 가능 요일·제외 날짜·정확한 날짜와 시간 배치는 서버가 결정하므로 달력 날짜를 출력하지 마세요.",
        "같은 행동은 taskTemplates에 한 번만 쓰고 days.taskIndexes에서 재사용하세요. 하루 참조는 중복 없이 최대 5개입니다.",
        "ACTION에는 행동·자료·범위·시간·측정 가능한 완료 기준을 채우세요. REVIEW는 점검, TIP은 조언, SYSTEM_RULE은 내부 운영 규칙입니다.",
        "ACTION의 durationMinutes는 의미상 권장 시간이며, 회당 가능 시간에 맞춘 정확한 시간은 서버가 결정합니다.",
        "ID, planId, 상태, 정확한 날짜·시간, timezone, 반복 그룹은 서버가 생성하므로 출력하지 마세요.",
        "time에는 선호 시간이나 기존 루틴에 연결한 짧은 시간대 표현만 사용하세요.",
        "실패한 날을 위한 최소 행동과 재시작 규칙을 fallbackPlan과 checkInRules에 포함하세요.",
        "planningStyle은 설명문이 아니라 18자 이내의 짧은 유형명으로 작성하세요.",
        "모든 일정과 행동은 사용자의 목표 분야에 직접 연결하세요. 다른 목표 분야의 예시나 템플릿 문구를 재사용하지 마세요.",
        "feasibility.status는 feasible, constrained, infeasible_as_requested 중 하나입니다. 현실적으로 어렵다면 거부하지 말고 constrained 또는 infeasible_as_requested를 사용하세요.",
        "feasibility.adjustmentOptions에는 keep_current_plan, extend_duration, reduce_scope, increase_frequency, increase_session_duration 중 실제 선택 가능한 대안을 1~4개 넣고 recommendedOption을 하나 고르세요.",
        "feasibilityAdjustment가 비어 있지 않으면 사용자가 명시적으로 고른 조정안입니다. 조정된 입력 조건과 함께 반영하고, 아직도 불가능한 경우에만 infeasible_as_requested를 유지하세요.",
        "요청한 기간과 가능 시간만으로 전체 목표 달성이 현실적으로 어렵다면 assumptions에 제약을 밝히고, 검증 가능한 중간 목표와 조정 대안을 제안하세요. 불가능한 목표를 가능하다고 위장하지 마세요.",
        "자료 범위가 구조화되어 있으면 sourceId와 semanticRange의 의미를 따르세요. 범위가 모호하면 거부하지 말고 assumptions에 추가로 확인할 정보를 적으세요.",
        "짧고 구체적으로 쓰고 같은 설명을 여러 필드에 반복하지 마세요.",
      ].join("\n"),
      input: `다음 사용자 정보로 정밀 목표 계획을 설계하세요.\n${JSON.stringify(normalized, null, 2)}`,
      max_output_tokens: boundedMaxOutputTokens,
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
    const plan = enrichGoalPlanBlueprint(normalized, blueprint, { now });
    const materialAssumptions = [];
    if (materialRules.soft.includes("MATERIAL_RANGE_AMBIGUOUS")) {
      materialAssumptions.push("자료 범위가 모호해 첫 실행에서 현재 위치와 목표 범위를 확인합니다.");
    }
    if (materialRules.soft.includes("MATERIAL_UNIT_UNKNOWN")) {
      materialAssumptions.push("자료 단위가 명확하지 않아 첫 실행에서 사용할 단위를 확인합니다.");
    }
    if (materialRules.soft.includes("MATERIAL_TARGET_START_INFERRED")) {
      materialAssumptions.push("현재 완료 지점의 다음 단위부터 목표 범위를 시작한다고 가정합니다.");
    }
    plan.assumptions = [...new Set([...(plan.assumptions || []), ...materialAssumptions])].slice(0, 8);
    if (hasUnrelatedExamLeakage(normalized.goal, plan)) {
      throw createAiContractError("AI_OUTPUT_DOMAIN_INVALID", {
        ...diagnostics,
        domainValidationCode: "GOAL_FIELD_MISMATCH",
        domainErrorCount: 1,
      });
    }
    const finalDomainRules = validateGeneratedPlan(normalized, plan);
    if (finalDomainRules.length) {
      throw createAiContractError("AI_OUTPUT_DOMAIN_INVALID", {
        ...diagnostics,
        domainValidationCode: finalDomainRules[0],
        domainRuleIds: finalDomainRules,
        domainErrorCount: finalDomainRules.length,
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
        maxOutputTokens: boundedMaxOutputTokens,
      },
    };
  } catch (caught) {
    if (String(caught?.code || "").startsWith("AI_OUTPUT_")) {
      caught.message = "계획을 완성하지 못했어요. 적어둔 내용은 그대로 보관했어요.";
    }
    throw attachProviderContext(caught, {
      responseBody,
      requestId: response.headers.get("x-request-id") || "",
    });
  }
}
