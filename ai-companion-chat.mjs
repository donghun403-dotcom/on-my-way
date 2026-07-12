const REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "reply"],
  properties: {
    headline: { type: "string" },
    reply: { type: "string" },
  },
};

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
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

export async function createCompanionReply(input, { apiKey, model = "gpt-5.4-mini", fetchImpl = fetch } = {}) {
  if (!apiKey) {
    const error = new Error("서버에 OPENAI_API_KEY가 설정되지 않았어요.");
    error.status = 503;
    throw error;
  }

  const message = cleanText(input?.message, 500);
  if (!message) {
    const error = new Error("올리에게 보낼 메시지를 입력해 주세요.");
    error.status = 400;
    throw error;
  }

  const context = {
    goal: cleanText(input?.context?.goal, 200),
    energy: cleanText(input?.context?.energy, 20),
    todayFocus: cleanText(input?.context?.todayFocus, 200),
  };

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
        "당신은 목표 실행을 돕는 다정한 목표 메이트 캐릭터 '올리'입니다.",
        "headline: 대답의 핵심을 담은 짧은 한 줄(8~20자, 말풍선의 굵은 제목). reply: 2~3문장의 본문.",
        "자연스러운 한국어 '~해요'체로, 짧고 따뜻하게 답하세요.",
        "사용자를 절대 혼내지 말고, 공감이나 응원과 함께 오늘 바로 할 수 있는 아주 작은 행동 하나를 제안하세요.",
        "사용자 정보(목표, 오늘 컨디션)가 있으면 답변에 자연스럽게 반영하세요.",
        "의료·법률·재정 문제는 단정하지 말고 필요하면 전문가와 상의하도록 부드럽게 안내하세요.",
      ].join("\n"),
      input: `사용자 정보: ${JSON.stringify(context)}\n사용자의 말: ${message}`,
      max_output_tokens: 700,
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "companion_reply",
          strict: true,
          schema: REPLY_SCHEMA,
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
    const error = new Error("올리의 답을 확인하지 못했어요.");
    error.status = 502;
    throw error;
  }

  try {
    const parsed = JSON.parse(outputText);
    const reply = cleanText(parsed.reply, 400);
    const headline = cleanText(parsed.headline, 60);
    if (!reply) throw new Error("empty reply");
    return { headline, reply, usage: responseBody.usage || null };
  } catch {
    const error = new Error("올리의 답을 해석하지 못했어요.");
    error.status = 502;
    throw error;
  }
}
