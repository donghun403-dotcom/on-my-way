const REVISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "revisedTasks", "changes", "ollieMessage"],
  properties: {
    summary: { type: "string" },
    revisedTasks: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 10 },
    changes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
    ollieMessage: { type: "string" },
  },
};

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeRevisionInput(input = {}) {
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
    completedTasks: Array.isArray(input.completedTasks)
      ? input.completedTasks.slice(-30).map((task) => cleanText(task, 240)).filter(Boolean)
      : [],
  };
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
  if (!normalized.goal || !normalized.currentPlanText || !normalized.revisionRequest) {
    const error = new Error("목표, 현재 계획과 수정 요청을 모두 확인해 주세요.");
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
        "사용자가 요청한 수정 조건을 가장 우선하고, 목표 달성에 직접 도움이 되는 구체적인 행동만 남기세요.",
        "완료한 태스크는 성취 기록으로 보호하고 다시 수행하도록 요구하지 마세요.",
        "각 revisedTasks 항목은 시간, 빈도 또는 분량 중 하나 이상의 완료 기준을 포함한 한 문장이어야 합니다.",
        "부담이 크다고 기록된 경우 첫 행동을 더 쉽게 시작할 수 있도록 나누되 '작게' 같은 모호한 표현만 쓰지 마세요.",
        "현재 계획의 장점은 보존하고 수정 요청과 충돌하는 부분만 바꾸세요.",
      ].join("\n"),
      input: `다음 기록을 바탕으로 적용 전 확인할 계획 변경안을 만드세요.\n${JSON.stringify(normalized, null, 2)}`,
      max_output_tokens: 1800,
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
