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
    checkInRules: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
    fallbackPlan: { type: "string" },
  },
};

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeGoalInput(input = {}) {
  const periodDays = Number(input.periodDays);
  return {
    goal: cleanText(input.goal, 300),
    periodDays: Number.isFinite(periodDays) ? Math.max(7, Math.min(3650, Math.round(periodDays))) : 90,
    currentState: cleanText(input.currentState, 500),
    routine: {
      readiness: cleanText(input.routine?.readiness, 100),
      preferredTime: cleanText(input.routine?.preferredTime, 50),
      existingRoutine: cleanText(input.routine?.existingRoutine, 300),
    },
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
  if (!input.routine.readiness || !input.routine.preferredTime) return "목표 기간과 시간대를 입력해 주세요.";
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

export async function createAiGoalPlan(input, { apiKey, model = "gpt-5.4-mini", fetchImpl = fetch } = {}) {
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
        "당신은 행동과학 기반 목표 설계 코치입니다. 모든 답변은 자연스러운 한국어로 작성하세요.",
        "사용자의 목표, 현재 수준, 사용 가능 시간, 기존 루틴, 실행 성향을 최우선 근거로 사용하세요.",
        "MBTI와 생년월일 기반 성향 신호는 사용자가 제공한 선호 정보로만 참고하고 사실이나 운명처럼 단정하지 마세요.",
        "현재 상황, 기존 루틴, MBTI, 생년월일 값이 비어 있으면 임의로 추정하지 말고 목표와 기간, 선호 시간을 중심으로 일반적인 계획을 세우세요.",
        "전체 기간을 측정 가능한 단계로 나누고, 첫 7일은 실제로 실행 가능한 분량과 완료 기준을 제시하세요.",
        "오늘 일정은 선호 시간과 기존 루틴에 연결하고, 실패한 날을 위한 최소 행동과 재시작 규칙을 포함하세요.",
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
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(responseBody.error?.message || "OpenAI API 요청에 실패했어요.");
    error.status = response.status >= 400 && response.status < 500 ? 502 : response.status;
    throw error;
  }

  const outputText = extractOutputText(responseBody);
  if (!outputText) {
    const error = new Error("AI 응답에서 계획을 확인하지 못했어요.");
    error.status = 502;
    throw error;
  }

  try {
    return { plan: JSON.parse(outputText), usage: responseBody.usage || null, requestId: response.headers.get("x-request-id") || "" };
  } catch {
    const error = new Error("AI 계획 응답을 해석하지 못했어요.");
    error.status = 502;
    throw error;
  }
}
