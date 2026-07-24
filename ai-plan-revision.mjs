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
  PLAN_REVISION_BLUEPRINT_SCHEMA,
  PLAN_REVISION_MAX_OUTPUT_TOKENS,
  PLAN_REVISION_MAX_PARSED_BYTES,
  countRevisionBlueprintItems,
  enrichRevisionBlueprint,
  normalizeWeekdayList,
  validateRevisionBlueprint,
  validateRevisionScheduleOccurrences,
} from "./ai-plan-output-policy.mjs";
import {
  buildMaterialOccurrenceContract,
  materialSemanticHashInput,
  normalizeMaterialContract,
  validateMaterialActionContract,
  validateMaterialContract,
} from "./ai-material-contract.mjs";

export const PLAN_REVISION_SCHEMA = PLAN_REVISION_BLUEPRINT_SCHEMA;

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizedScheduleDate(value) {
  const match = cleanText(value, 40).match(/^\d{4}-\d{2}-\d{2}/);
  if (match) {
    const parsed = new Date(`${match[0]}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === match[0]) {
      return match[0];
    }
  }
  return new Date(Date.now() + 9 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(object, key) {
  return isRecord(object) && Object.hasOwn(object, key);
}

function materialInputShape(material = {}) {
  const range = isRecord(material?.semanticRange) ? material.semanticRange : {};
  const unitType = cleanText(material?.unit || range.unitType, 80);
  return {
    hasMaterial: material?.hasMaterial === true,
    name: cleanText(material?.name || material?.sourceDisplayText, 200),
    targetRange: cleanText(
      hasOwn(material, "targetRange") ? material.targetRange : range.displayText,
      200,
    ),
    currentProgress: cleanText(
      hasOwn(material, "currentProgress") ? material.currentProgress : range.currentDisplayText,
      200,
    ),
    completionRule: cleanText(material?.completionRule, 300),
    unit: ["unknown", "custom"].includes(unitType) ? "" : unitType,
  };
}

function pendingMaterialSource(input, details) {
  if (isRecord(input?.pendingMaterial)) return input.pendingMaterial;
  if (isRecord(details?.pendingMaterial)) return details.pendingMaterial;
  if (isRecord(details?.material)) return details.material;
  return null;
}

function normalizeRevisionMaterials(input, details) {
  const currentSource = isRecord(input?.currentMaterial)
    ? input.currentMaterial
    : isRecord(input?.material)
      ? input.material
      : { hasMaterial: false };
  const currentRaw = materialInputShape(currentSource);
  const currentMaterial = normalizeMaterialContract(currentRaw);
  const pendingSource = pendingMaterialSource(input, details);
  if (!pendingSource) {
    return {
      currentMaterial,
      pendingMaterial: currentMaterial,
      materialChangeRequested: false,
    };
  }

  const pendingRaw = materialInputShape(pendingSource);
  const pendingHasMaterial = hasOwn(pendingSource, "hasMaterial")
    ? pendingSource.hasMaterial === true
    : currentRaw.hasMaterial;
  if (!pendingHasMaterial) {
    return {
      currentMaterial,
      pendingMaterial: normalizeMaterialContract({ hasMaterial: false }),
      materialChangeRequested: true,
    };
  }

  const pendingNameWasProvided = (
    hasOwn(pendingSource, "name")
    || hasOwn(pendingSource, "sourceDisplayText")
  );
  const pendingName = pendingNameWasProvided ? pendingRaw.name : currentRaw.name;
  const sourceChanged = Boolean(
    pendingName
    && currentRaw.name
    && pendingName.normalize("NFKC").toLocaleLowerCase("en-US")
      !== currentRaw.name.normalize("NFKC").toLocaleLowerCase("en-US"),
  );
  const currentProgressWasProvided = (
    hasOwn(pendingSource, "currentProgress")
    || (isRecord(pendingSource.semanticRange) && hasOwn(pendingSource.semanticRange, "currentDisplayText"))
  );
  const merged = {
    hasMaterial: true,
    name: pendingName,
    targetRange: (
      hasOwn(pendingSource, "targetRange")
      || (isRecord(pendingSource.semanticRange) && hasOwn(pendingSource.semanticRange, "displayText"))
    ) ? pendingRaw.targetRange : currentRaw.targetRange,
    currentProgress: currentProgressWasProvided
      ? pendingRaw.currentProgress
      : sourceChanged
        ? "not started"
        : currentRaw.currentProgress,
    completionRule: hasOwn(pendingSource, "completionRule")
      ? pendingRaw.completionRule
      : currentRaw.completionRule,
    unit: (
      hasOwn(pendingSource, "unit")
      || (isRecord(pendingSource.semanticRange) && hasOwn(pendingSource.semanticRange, "unitType"))
    ) ? pendingRaw.unit : currentRaw.unit,
  };
  return {
    currentMaterial,
    pendingMaterial: normalizeMaterialContract(merged),
    materialChangeRequested: true,
  };
}

function normalizeRevisionInput(input = {}) {
  const details = input.revisionDetails || {};
  const schedule = details.schedule || {};
  const currentAvailability = input.currentAvailability || {};
  const priority = details.priorityAdjustment || details.focusAdjustment || {};
  const normalizeMinutes = (value) => {
    const minutes = Number(value);
    return Number.isFinite(minutes) && minutes > 0 ? Math.max(10, Math.min(720, Math.round(minutes))) : null;
  };
  const currentDifficultDays = new Set(normalizeWeekdayList(currentAvailability.difficultDays));
  const currentAvailableDays = normalizeWeekdayList(currentAvailability.availableDays)
    .filter((day) => !currentDifficultDays.has(day));
  const requestedAvailableDays = normalizeWeekdayList(schedule.availableDays);
  const currentSessionMinutes = normalizeMinutes(currentAvailability.sessionMinutes);
  const {
    currentMaterial,
    pendingMaterial,
    materialChangeRequested,
  } = normalizeRevisionMaterials(input, details);
  return {
    goal: cleanText(input.goal, 300),
    periodDays: Math.max(1, Math.min(365, Number(input.periodDays) || 30)),
    currentState: cleanText(input.currentState, 500),
    planningStyle: cleanText(input.planningStyle, 100),
    routine: {
      readiness: cleanText(input.routine?.readiness, 100),
      preferredTime: cleanText(input.routine?.preferredTime, 50),
      existingRoutine: cleanText(input.routine?.existingRoutine, 300),
    },
    currentPlanText: cleanText(input.currentPlanText, 5000),
    revisionRequest: cleanText(input.revisionRequest, 1600),
    currentMaterial,
    pendingMaterial,
    materialChangeRequested,
    revisionDetails: {
      adjustmentScope: ["today", "week", "remaining"].includes(details.adjustmentScope) ? details.adjustmentScope : "remaining",
      goalType: cleanText(details.goalType, 30) || "general",
      resources: cleanText(details.resources || details.materials, 1200),
      targetOutcome: cleanText(details.targetOutcome || details.targetCoverage, 1200),
      schedule: {
        weekdayMinutes: normalizeMinutes(schedule.weekdayMinutes)
          || normalizeMinutes(currentAvailability.weekdayMinutes)
          || currentSessionMinutes,
        weekendMinutes: normalizeMinutes(schedule.weekendMinutes)
          || normalizeMinutes(currentAvailability.weekendMinutes)
          || currentSessionMinutes,
        preferredTime: cleanText(
          schedule.preferredTime
          || currentAvailability.preferredTime
          || currentAvailability.notificationTime,
          80,
        ),
        availableDays: requestedAvailableDays.length ? requestedAvailableDays : currentAvailableDays,
        excludedDates: Array.isArray(schedule.excludedDates)
          ? schedule.excludedDates.slice(0, 30).map((value) => cleanText(value, 80)).filter(Boolean)
          : Array.isArray(currentAvailability.excludedDates)
            ? currentAvailability.excludedDates.slice(0, 30).map((value) => cleanText(value, 80)).filter(Boolean)
          : [],
        scheduleStartDate: normalizedScheduleDate(
          schedule.scheduleStartDate
          || currentAvailability.scheduleStartDate
          || input.scheduleStartDate,
        ),
      },
      priorityAdjustment: {
        increase: cleanText(priority.increase, 600),
        decrease: cleanText(priority.decrease, 600),
        keepRules: cleanText(priority.keepRules, 900),
      },
      constraints: cleanText(details.constraints, 1000),
    },
    completedTasks: Array.isArray(input.completedTasks)
      ? input.completedTasks.slice(-30).map((task) => cleanText(task, 240)).filter(Boolean)
      : [],
  };
}

function hasRevisionIntent(input, rawInput = input) {
  const details = input.revisionDetails;
  const rawDetails = rawInput?.revisionDetails || {};
  const rawSchedule = rawDetails.schedule || {};
  return Boolean(
    input.revisionRequest ||
      details.resources ||
      details.targetOutcome ||
      rawSchedule.weekdayMinutes ||
      rawSchedule.weekendMinutes ||
      rawSchedule.preferredTime ||
      (Array.isArray(rawSchedule.availableDays) && rawSchedule.availableDays.length) ||
      details.priorityAdjustment.increase ||
      details.priorityAdjustment.decrease ||
      details.priorityAdjustment.keepRules ||
      details.constraints ||
      input.materialChangeRequested
  );
}

function revisionText(revision) {
  return [
    revision?.summary,
    ...(Array.isArray(revision?.revisedTasks) ? revision.revisedTasks : []),
    ...(Array.isArray(revision?.weeklySchedule)
      ? revision.weeklySchedule.flatMap((day) => (day?.tasks || []).flatMap((task) => [task?.task, task?.completionRule]))
      : []),
  ].map((value) => String(value || "")).join("\n");
}

export function validateRevisionOutput(input, revision) {
  const errors = [];
  if (!revision || typeof revision !== "object" || Array.isArray(revision)) return ["REVISION_OUTPUT_INVALID"];
  const pendingMaterial = input?.pendingMaterial?.semanticRange
    ? input.pendingMaterial
    : normalizeMaterialContract(input?.pendingMaterial || { hasMaterial: false });
  errors.push(...validateMaterialContract(pendingMaterial).hard);
  const outputMaterial = revision?.updatedMaterial?.semanticRange
    ? revision.updatedMaterial
    : normalizeMaterialContract(revision?.updatedMaterial || { hasMaterial: false });
  if (
    JSON.stringify(materialSemanticHashInput(outputMaterial))
    !== JSON.stringify(materialSemanticHashInput(pendingMaterial))
  ) {
    errors.push("MATERIAL_SOURCE_REFERENCE_MISMATCH");
  }
  const summary = revision.revisionSummary;
  if (!summary || typeof summary !== "object" || ["goalAlignment", "resourcePlan", "timePlan", "weeklyRule"].some((key) => !cleanText(summary[key], 1200))) {
    errors.push("REVISION_SUMMARY_MISSING");
  }
  const revisedTasks = Array.isArray(revision.revisedTasks) ? revision.revisedTasks : [];
  if (revisedTasks.length < 4 || revisedTasks.some((task) => !cleanText(task, 600))) errors.push("REVISION_ACTIONS_MISSING");

  const expectedDays = ["월", "화", "수", "목", "금", "토", "일"];
  const weeklySchedule = Array.isArray(revision.weeklySchedule) ? revision.weeklySchedule : [];
  if (weeklySchedule.length !== 7) errors.push("REVISION_WEEK_DAY_COUNT_INVALID");
  const availableDays = new Set(input.revisionDetails.schedule.availableDays);
  const completedTasks = new Set((input.completedTasks || []).map((task) => cleanText(task, 240)));
  if (revisedTasks.some((task) => completedTasks.has(cleanText(task, 240)))) {
    errors.push("COMPLETED_ACTION_REINTRODUCED");
  }
  weeklySchedule.slice(0, 7).forEach((day, index) => {
    const dayName = cleanText(day?.day, 10);
    if (dayName !== expectedDays[index]) errors.push("REVISION_WEEK_DAY_ORDER_INVALID");
    const tasks = Array.isArray(day?.tasks) ? day.tasks : [];
    if (day?.isRestDay && tasks.length) errors.push("REST_PERIOD_ACTION");
    if (availableDays.size && !availableDays.has(dayName) && tasks.length) errors.push("EXCLUDED_WEEKDAY_ACTION");
    const totalMinutes = tasks.reduce((sum, task) => sum + (Number(task?.durationMinutes) || 0), 0);
    const dailyLimit = ["토", "일"].includes(dayName)
      ? input.revisionDetails.schedule.weekendMinutes
      : input.revisionDetails.schedule.weekdayMinutes;
    if (dailyLimit && totalMinutes > dailyLimit) errors.push("AVAILABILITY_OVER_CAPACITY");
    tasks.forEach((task, taskIndex) => {
      const duration = Number(task?.durationMinutes);
      const taskText = cleanText(task?.task, 600);
      if (!taskText || !cleanText(task?.completionRule, 600) || !Number.isFinite(duration) || duration < 5) {
        errors.push("REVISION_ACTION_INCOMPLETE");
      }
      if (completedTasks.has(taskText)) errors.push("COMPLETED_ACTION_REINTRODUCED");
    });
  });
  const scheduledTasks = weeklySchedule
    .flatMap((day) => Array.isArray(day?.tasks) ? day.tasks : []);
  const expectedAllocations = buildMaterialOccurrenceContract(
    pendingMaterial,
    scheduledTasks.length,
  ).allocations;
  scheduledTasks.forEach((task, index) => {
    const sourceReference = cleanText(task?.sourceReference, 200);
    const quantityOrRange = cleanText(task?.quantityOrRange, 200);
    if (!pendingMaterial.hasMaterial) {
      if (sourceReference || quantityOrRange) errors.push("MATERIAL_SOURCE_REFERENCE_MISMATCH");
      return;
    }
    if (sourceReference !== cleanText(pendingMaterial.sourceDisplayText, 200)) {
      errors.push("MATERIAL_SOURCE_REFERENCE_MISMATCH");
    }
    const expectedRange = cleanText(expectedAllocations[index]?.quantityOrRange, 200);
    if (expectedRange && quantityOrRange !== expectedRange) {
      errors.push("MATERIAL_SCHEDULE_SEQUENCE_INVALID");
    }
    errors.push(...validateMaterialActionContract(pendingMaterial, task));
  });
  errors.push(...validateRevisionScheduleOccurrences(input, revision));

  const goal = String(input.goal || "");
  const examGoal = /토익|시험|수능|자격증|학습|공부|영어|오답|문제\s*풀이|단어\s*암기/i.test(goal);
  if (!examGoal && /토익|\bLC\b|\bRC\b|오답\s*(정리|노트)|단어\s*\d+\s*개/i.test(revisionText(revision))) {
    errors.push("GOAL_FIELD_MISMATCH");
  }
  return [...new Set(errors)];
}

export async function createAiPlanRevision(input, { apiKey, model = "gpt-5.4-mini", fetchImpl = fetch, timeoutMs } = {}) {
  if (!apiKey) {
    const error = new Error("서버에 OPENAI_API_KEY가 설정되지 않았어요.");
    error.status = 503;
    throw error;
  }

  const normalized = normalizeRevisionInput(input);
  if (!normalized.goal || !normalized.currentPlanText || !hasRevisionIntent(normalized, input)) {
    const error = new Error("목표, 현재 계획과 한 가지 이상의 상세 수정 조건을 확인해 주세요.");
    error.status = 400;
    throw error;
  }
  const materialHardRules = validateMaterialContract(normalized.pendingMaterial).hard;
  if (materialHardRules.length) {
    const error = new Error("자료의 현재 진도, 목표 범위와 단위를 다시 확인해 주세요.");
    error.status = 400;
    error.code = "MATERIAL_CONTRACT_INVALID";
    error.domainRuleIds = materialHardRules;
    error.domainValidationCode = materialHardRules[0];
    error.providerCalled = false;
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
        "당신은 행동과학 기반 목표 계획 수정 코치이며, 모든 답변은 자연스러운 한국어로 작성합니다.",
        "목표 유형은 시험·학습, 창업·사업, 취업·커리어, 운동·건강, 습관·생활, 콘텐츠·프로젝트, 재무·저축 또는 기타일 수 있습니다. 공부 계획으로 가정하지 말고 revisionDetails.goalType과 실제 목표 문맥에 맞는 전문 용어와 완료 기준을 사용하세요.",
        "사용자가 요청한 수정 조건을 가장 우선하고, 최종 결과에 직접 도움이 되는 검증 가능하고 구체적인 행동만 남기세요.",
        "완료한 태스크는 성취 기록으로 보호하고 다시 수행하도록 요구하지 마세요.",
        "revisionDetails.adjustmentScope가 today면 오늘 일정만, week면 현재 7일 범위만, remaining이면 완료하지 않은 남은 계획만 수정하세요. 지정 범위 밖 일정과 완료 기록은 그대로 유지하세요.",
        "resources와 targetOutcome은 목표 분야에 맞게 해석하고, 제공되지 않은 수량·성과를 지어내지 마세요.",
        "currentMaterial과 pendingMaterial이 자료 사용 목표라면 모든 taskTemplates에 sourceReference와 quantityOrRange를 문자열로 포함하세요. 자료가 없으면 두 필드는 빈 문자열이어야 합니다. 정확한 최종 범위 배분은 서버가 pendingMaterial 계약에서 다시 계산합니다.",
        "평일·주말 가용 시간과 선택 요일은 의미적 제약으로 반영하되, 정확한 요일·날짜·시간 배치는 서버가 결정합니다. 시간이 부족하면 범위 또는 빈도 조정안을 changes와 assumptions에 분명히 쓰세요.",
        "같은 행동은 taskTemplates에 한 번만 쓰고 days.taskIndexes에서 재사용하세요. 하루 참조는 중복 없이 최대 5개입니다.",
        "각 taskTemplates 항목은 대상, 구체적인 행동과 분량, 소요 시간과 측정 가능한 완료 기준을 포함하세요.",
        "창업 목표라면 조사만 반복하지 말고 고객 접촉·가설 검증·제작·판매 같은 실제 시장 행동을 목표 단계에 맞게 배치하세요. 운동은 안전과 회복을, 재무는 현실적 제약과 위험을 고려하세요.",
        "days는 정확한 달력 날짜가 아닌 상대적인 주간 패턴 7개입니다. 선택하지 않은 요일의 실제 occurrence 제거와 재배치는 서버가 수행합니다.",
        "ID, 정확한 날짜·시간, timezone, 완료 상태, occurrence는 출력하지 마세요.",
        "부담이 크다고 기록된 경우 첫 행동을 더 쉽게 시작할 수 있도록 나누되 '작게' 같은 모호한 표현만 쓰지 마세요.",
        "현재 계획의 장점은 보존하고 수정 요청과 충돌하는 부분만 바꾸세요.",
        "짧고 구체적으로 쓰고 같은 설명을 여러 필드에 반복하지 마세요.",
      ].join("\n"),
      input: `다음 기록을 바탕으로 적용 전 확인할 계획 변경안을 만드세요.\n${JSON.stringify(normalized, null, 2)}`,
      max_output_tokens: PLAN_REVISION_MAX_OUTPUT_TOKENS,
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "bounded_goal_plan_revision",
          strict: true,
          schema: PLAN_REVISION_SCHEMA,
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
      schema: PLAN_REVISION_SCHEMA,
      domainValidate: (candidate) => validateRevisionBlueprint(normalized, candidate),
      domainValidationCode: "PLAN_REVISION_VALIDATION_FAILED",
      maxParsedBytes: PLAN_REVISION_MAX_PARSED_BYTES,
      countItems: countRevisionBlueprintItems,
    });
    const revision = enrichRevisionBlueprint(blueprint, normalized);
    const finalDomainRules = validateRevisionOutput(normalized, revision);
    if (finalDomainRules.length) {
      throw createAiContractError("AI_OUTPUT_DOMAIN_INVALID", {
        ...diagnostics,
        domainValidationCode: finalDomainRules[0],
        domainRuleIds: finalDomainRules,
        domainErrorCount: finalDomainRules.length,
      });
    }
    return {
      revision,
      usage: responseBody.usage || null,
      requestId: response.headers.get("x-request-id") || "",
      diagnostics,
      contract: {
        schemaVersion: AI_CONTRACT_VERSIONS.planRevisionSchema,
        promptVersion: AI_CONTRACT_VERSIONS.planRevisionPrompt,
        domainOutputVersion: AI_CONTRACT_VERSIONS.domainOutput,
        budgetVersion: AI_OUTPUT_BUDGET_VERSION,
        maxOutputTokens: PLAN_REVISION_MAX_OUTPUT_TOKENS,
      },
    };
  } catch (caught) {
    if (String(caught?.code || "").startsWith("AI_OUTPUT_")) {
      caught.message = "이번에는 계획을 바꾸지 못했어요. 기존 길은 그대로 두었어요.";
    }
    throw attachProviderContext(caught, {
      responseBody,
      requestId: response.headers.get("x-request-id") || "",
    });
  }
}
