const REVISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "revisionSummary", "weeklySchedule", "revisedTasks", "changes", "ollieMessage"],
  properties: {
    summary: { type: "string" },
    revisionSummary: {
      type: "object",
      additionalProperties: false,
      required: ["goalAlignment", "resourcePlan", "timePlan", "weeklyRule", "assumptions"],
      properties: {
        goalAlignment: { type: "string" },
        resourcePlan: { type: "string" },
        timePlan: { type: "string" },
        weeklyRule: { type: "string" },
        assumptions: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 4 },
      },
    },
    weeklySchedule: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["day", "isRestDay", "tasks"],
        properties: {
          day: { type: "string", enum: ["월", "화", "수", "목", "금", "토", "일"] },
          isRestDay: { type: "boolean" },
          tasks: {
            type: "array",
            minItems: 0,
            maxItems: 5,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["time", "durationMinutes", "task", "completionRule"],
              properties: {
                time: { type: "string" },
                durationMinutes: { type: "integer", minimum: 5, maximum: 360 },
                task: { type: "string" },
                completionRule: { type: "string" },
              },
            },
          },
        },
      },
    },
    revisedTasks: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 14 },
    changes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
    ollieMessage: { type: "string" },
  },
};

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeRevisionInput(input = {}) {
  const details = input.revisionDetails || {};
  const schedule = details.schedule || {};
  const priority = details.priorityAdjustment || details.focusAdjustment || {};
  const normalizeMinutes = (value) => {
    const minutes = Number(value);
    return Number.isFinite(minutes) && minutes > 0 ? Math.max(10, Math.min(720, Math.round(minutes))) : null;
  };
  return {
    goal: cleanText(input.goal, 300),
    periodDays: Math.max(7, Math.min(3650, Number(input.periodDays) || 30)),
    currentState: cleanText(input.currentState, 500),
    planningStyle: cleanText(input.planningStyle, 100),
    routine: {
      readiness: cleanText(input.routine?.readiness, 100),
      preferredTime: cleanText(input.routine?.preferredTime, 50),
      existingRoutine: cleanText(input.routine?.existingRoutine, 300),
    },
    currentPlanText: cleanText(input.currentPlanText, 5000),
    revisionRequest: cleanText(input.revisionRequest, 1600),
    revisionDetails: {
      goalType: cleanText(details.goalType, 30) || "general",
      resources: cleanText(details.resources || details.materials, 1200),
      targetOutcome: cleanText(details.targetOutcome || details.targetCoverage, 1200),
      schedule: {
        weekdayMinutes: normalizeMinutes(schedule.weekdayMinutes),
        weekendMinutes: normalizeMinutes(schedule.weekendMinutes),
        preferredTime: cleanText(schedule.preferredTime, 80),
        availableDays: Array.isArray(schedule.availableDays)
          ? schedule.availableDays.slice(0, 7).map((day) => cleanText(day, 10)).filter(Boolean)
          : [],
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

function hasRevisionIntent(input) {
  const details = input.revisionDetails;
  return Boolean(
    input.revisionRequest ||
      details.resources ||
      details.targetOutcome ||
      details.schedule.weekdayMinutes ||
      details.schedule.weekendMinutes ||
      details.schedule.preferredTime ||
      details.schedule.availableDays.length ||
      details.priorityAdjustment.increase ||
      details.priorityAdjustment.decrease ||
      details.priorityAdjustment.keepRules ||
      details.constraints,
  );
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

export async function createAiPlanRevision(input, { apiKey, model = "gpt-5.4-mini", fetchImpl = fetch } = {}) {
  if (!apiKey) {
    const error = new Error("서버에 OPENAI_API_KEY가 설정되지 않았어요.");
    error.status = 503;
    throw error;
  }

  const normalized = normalizeRevisionInput(input);
  if (!normalized.goal || !normalized.currentPlanText || !hasRevisionIntent(normalized)) {
    const error = new Error("목표, 현재 계획과 한 가지 이상의 상세 수정 조건을 확인해 주세요.");
    error.status = 400;
    throw error;
  }

  const response = await fetchImpl("https://api.openai.com/v1/responses", {
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
        "당신은 행동과학 기반 목표 계획 수정 코치이며, 모든 답변은 자연스러운 한국어로 작성합니다.",
        "목표 유형은 시험·학습, 창업·사업, 취업·커리어, 운동·건강, 습관·생활, 콘텐츠·프로젝트, 재무·저축 또는 기타일 수 있습니다. 공부 계획으로 가정하지 말고 revisionDetails.goalType과 실제 목표 문맥에 맞는 전문 용어와 완료 기준을 사용하세요.",
        "사용자가 요청한 수정 조건을 가장 우선하고, 최종 결과에 직접 도움이 되는 검증 가능하고 구체적인 행동만 남기세요.",
        "완료한 태스크는 성취 기록으로 보호하고 다시 수행하도록 요구하지 마세요.",
        "resources는 목표에 따라 교재, 도구, 고객, 사람, 예산, 채널, 장비, 계좌 또는 기존 결과물일 수 있습니다. 사용자가 제공하지 않은 수량·사양·성과를 지어내지 말고 필요한 경우 assumptions에 가정을 명시하세요.",
        "targetOutcome을 점수, 완료 범위, 고객 검증, MVP, 매출, 지원 결과, 신체 지표, 반복 빈도, 공개 결과물 또는 금액처럼 목표 유형에 맞는 측정 가능한 완료 기준으로 해석하세요.",
        "평일·주말 가용 시간과 선택 요일을 넘지 않게 총분량을 배치하고, 시간이 부족하면 우선순위를 정해 범위 또는 빈도 조정안을 changes와 assumptions에 분명히 쓰세요.",
        "더 비중을 둘 일, 줄이거나 제외할 일, 반드시 유지할 조건을 서로 상쇄하지 말고 실제 시간 배분과 주간 빈도에 수치로 반영하세요.",
        "각 revisedTasks 항목은 대상, 구체적인 행동과 분량, 소요 시간, 빈도나 요일, 완료 기준 중 관련 정보를 포함한 실행 가능한 한 문장이어야 합니다.",
        "창업 목표라면 조사만 반복하지 말고 고객 접촉·가설 검증·제작·판매 같은 실제 시장 행동을 목표 단계에 맞게 배치하세요. 운동은 안전과 회복을, 재무는 현실적 제약과 위험을 고려하세요.",
        "weeklySchedule은 월요일부터 일요일까지 정확히 7개를 순서대로 반환하세요. 선택하지 않은 요일은 isRestDay=true, tasks=[]로 두고, 실행일의 tasks 소요 시간 합계는 사용자의 평일·주말 가용 시간을 넘지 마세요.",
        "부담이 크다고 기록된 경우 첫 행동을 더 쉽게 시작할 수 있도록 나누되 '작게' 같은 모호한 표현만 쓰지 마세요.",
        "현재 계획의 장점은 보존하고 수정 요청과 충돌하는 부분만 바꾸세요.",
        "revisionSummary에는 목표 연결, 자원 활용과 진행 방식, 평일·주말 시간 배분, 주간 운영 규칙을 각각 한눈에 검토할 수 있도록 구체적으로 요약하세요.",
      ].join("\n"),
      input: `다음 기록을 바탕으로 적용 전 확인할 계획 변경안을 만드세요.\n${JSON.stringify(normalized, null, 2)}`,
      max_output_tokens: 2800,
      text: {
        verbosity: "medium",
        format: {
          type: "json_schema",
          name: "goal_plan_revision",
          strict: true,
          schema: REVISION_SCHEMA,
        },
      },
    }),
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(responseBody.error?.message || "OpenAI API 요청에 실패했어요.");
    error.status = response.status >= 400 && response.status < 500 ? 502 : response.status;
    throw error;
  }

  const outputText = extractOutputText(responseBody);
  if (!outputText) {
    const error = new Error("AI 응답에서 변경안을 확인하지 못했어요.");
    error.status = 502;
    throw error;
  }

  try {
    return { revision: JSON.parse(outputText), usage: responseBody.usage || null, requestId: response.headers.get("x-request-id") || "" };
  } catch {
    const error = new Error("AI 변경안을 해석하지 못했어요.");
    error.status = 502;
    throw error;
  }
}
