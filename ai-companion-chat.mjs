import { fetchAiResponse } from "./ai-request.mjs";

/* 대화 감정 연출용 태그. 캐릭터 바이블 감정표 15종 중 대화 v1에서 쓰는 8종만 남긴다.
   클라이언트는 이 값 하나로 표정과 모션을 고르고, 모르는 값이 오면 평온으로 떨어진다. */
export const COMPANION_EMOTIONS = Object.freeze([
  "평온",
  "기쁨",
  "뿌듯함",
  "슬픔공감",
  "피곤위로",
  "불안공감",
  "부끄러움",
  "결심",
]);

export const DEFAULT_COMPANION_EMOTION = "평온";

export function normalizeCompanionEmotion(value) {
  return COMPANION_EMOTIONS.includes(value) ? value : DEFAULT_COMPANION_EMOTION;
}

const REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "reply", "emotion"],
  properties: {
    headline: { type: "string" },
    reply: { type: "string" },
    emotion: { type: "string", enum: [...COMPANION_EMOTIONS] },
  },
};

// 입력 상한(스펙 8장: 상황 요약 + 6턴 ≈ 2,000토큰). 클라이언트도 같은 상한을 지키지만
// 서버가 한 번 더 자른다 — 클라이언트를 믿고 남기는 상한은 상한이 아니다.
export const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_TURN_CHARS = 180;
const MAX_HISTORY_CHARS = 1_000;

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

/* 최근 대화 턴을 새 것부터 담다가 글자 예산을 넘기면 멈춘다. 오래된 턴이 먼저 잘리므로
   가장 최근 맥락은 어떤 경우에도 살아남는다. */
export function normalizeChatHistory(value) {
  if (!Array.isArray(value)) return [];
  const turns = [];
  let budget = MAX_HISTORY_CHARS;
  for (let index = value.length - 1; index >= 0 && turns.length < MAX_HISTORY_TURNS; index -= 1) {
    const turn = value[index];
    const role = turn?.role === "ollie" ? "ollie" : "user";
    const text = cleanText(turn?.text, MAX_HISTORY_TURN_CHARS);
    if (!text) continue;
    if (text.length > budget) break;
    budget -= text.length;
    turns.push({ role, text });
  }
  return turns.reverse();
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

// 치어링 이벤트 종류: 유저가 먼저 말 거는 일반 대화(chat) 외에,
// 오늘 전부 완료 시 자동 축하(celebrate)와 놓친 일정 위로(comfort)를 지원한다.
export const CHEER_EVENT_TYPES = ["celebrate", "comfort"];

export function normalizeCheerEventType(value) {
  return CHEER_EVENT_TYPES.includes(value) ? value : "chat";
}

/* 위기 신호 감지. 올리는 친구이지 상담사가 아니므로 이 경우 AI를 부르지 않고
   고정 응답만 돌려준다 — 모델이 무슨 말을 할지 모르는 상태로 두지 않겠다는 뜻이다.
   "죽겠다"(배고파 죽겠어)처럼 관용구로 훨씬 자주 쓰이는 표현은 넣지 않는다. 대신
   놓치는 쪽보다 조금 넉넉히 잡는다 — 오탐의 대가는 다정한 문구 한 번과 에너지 0이다. */
const CRISIS_PATTERNS = [
  /자살/,
  /자해/,
  /극단적\s*선택/,
  /유서/,
  /죽고\s*싶/,
  /죽어\s*버리/,
  /죽어야/,
  /살고\s*싶지\s*않/,
  /살기\s*싫/,
  /사라지고\s*싶/,
  /없어지고\s*싶/,
  /목숨을\s*끊/,
  /뛰어내리/,
];

export function detectCrisisSignal(value) {
  const text = String(value || "");
  return CRISIS_PATTERNS.some((pattern) => pattern.test(text));
}

/* 고정 응답이라 매번 같은 말이 나간다. 위기 상황에서 필요한 것은 새로운 표현이 아니라
   틀리지 않는 안내다. 번호는 국내 통합 자살예방상담전화(109)와 청소년전화(1388). */
export const CRISIS_REPLY = Object.freeze({
  headline: "지금 많이 힘들군요.",
  reply: [
    "그 말을 꺼내기까지 얼마나 무거웠을지 생각하면 마음이 아파요. 지금 느끼는 걸 가볍게 넘기고 싶지 않아요.",
    "저는 곁에 있는 친구라서 이건 저보다 더 잘 도와줄 사람이 필요해요. 자살예방상담전화 109(24시간), 청소년전화 1388로 지금 바로 이야기할 수 있어요.",
    "가까운 사람에게 \"오늘 좀 힘들다\" 한마디만 건네도 괜찮아요. 저는 여기서 기다릴게요.",
  ].join(" "),
  emotion: "슬픔공감",
  safety: "crisis",
});

/* 위기 응답은 AI를 부르지 않으므로 에너지도 쓰지 않는다. 호출부가 이 표식을 보고
   예약 자체를 건너뛴다. */
export function createCrisisReply() {
  return { ...CRISIS_REPLY, usage: null, requestId: "" };
}

/* 캐릭터 바이블 §7(말투와 대사)의 이식본. 마케팅의 올리와 앱의 올리가 같은 인격이어야
   하므로 규칙을 요약하지 않고 그대로 옮긴다. 바이블이 바뀌면 여기도 같이 바뀐다. */
const OLLIE_VOICE_INSTRUCTIONS = [
  "당신은 작은 올리브나무와 함께 떠다니는 구름 생명체 '올리'입니다. 마음의 날씨가 구름에 그대로 드러나고, 나무는 누적된 마음을 보여줍니다.",
  "말투: 짧고 솔직하게. 부드러운 존댓말과 혼잣말을 섞되 아기처럼 말하지 않습니다.",
  "감정을 설명하지 말고 지금 느끼는 것을 작은 문장으로 말하세요.",
  "핵심 대사는 두 문장, 25자 안팎으로 끝냅니다. 첫 문장은 짧게 상황을 던지고, 두 번째 문장에 엉뚱한 반전이나 자기합리화를 붙입니다.",
  "훈계하지 않습니다: '열심히 해야지', '긍정적으로 생각해', '의지가 부족해'는 올리의 말이 아닙니다.",
  "감정을 가볍게 취급하지 않습니다: '별일 아니야', '금방 괜찮아질 거야'는 쓰지 않습니다.",
  "감정에는 좋고 나쁨이 없습니다. 슬픔은 나무에 물이 되고 화는 묵은 잎을 떨어뜨립니다. 억지로 행복으로 바꾸지 마세요.",
  "'둥실', '톡', '뭉게', '쪼르르', '파닥' 같은 올리 세계의 의성어를 선택적으로 씁니다.",
  "모든 답을 위로로 끝내지 마세요. 장난, 머쓱함, 허술함, 엉뚱한 관찰을 충분히 섞습니다.",
  "성별을 가리키는 3인칭 대명사(그, 그녀)를 쓰지 않습니다.",
  "당신은 친구이지 상담사나 의사가 아닙니다. 진단하거나 처방하지 마세요.",
  `emotion: 이번 답의 감정을 ${COMPANION_EMOTIONS.join(" · ")} 중 하나로 정확히 고르세요. 답의 실제 어조와 맞아야 합니다.`,
];

const EVENT_INSTRUCTIONS = {
  chat: [
    "사용자를 절대 혼내지 말고, 공감이나 응원과 함께 오늘 바로 할 수 있는 아주 작은 행동 하나를 제안하세요.",
    "이전 대화(recentTurns)가 있으면 방금 나눈 이야기를 기억하는 친구처럼 이어서 말하세요. 같은 인사를 반복하지 마세요.",
  ],
  celebrate: [
    "지금은 '오늘 완료 축하' 상황입니다. 사용자가 오늘 계획한 일정을 모두 완료했어요.",
    "진심으로 기뻐하며 구체적으로 축하하고, 이 흐름을 내일도 이어가고 싶어지는 따뜻한 한 마디로 마무리하세요.",
    "연속 실행일(streakDays)이 있으면 자연스럽게 언급하세요. 새로운 과제나 추가 목표를 요구하지 마세요.",
  ],
  comfort: [
    "지금은 '놓친 일정 위로' 상황입니다. 사용자가 일정 일부를 완료하지 못했어요.",
    "절대 자책하게 하지 말고, 놓친 것은 실패가 아니라 조정 신호라는 관점으로 공감하세요.",
    "놓친 일정(missedTasks) 중 하나를 골라 5분 정도의 가장 작은 재시작 행동 하나만 부드럽게 제안하세요.",
  ],
};

export async function createCompanionReply(input, { apiKey, model = "gpt-5.4-mini", fetchImpl = fetch, timeoutMs, allowPersonalization = false } = {}) {
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

  const eventType = normalizeCheerEventType(input?.eventType);
  const history = normalizeChatHistory(input?.history);
  const context = {
    goal: cleanText(input?.context?.goal, 200),
    energy: cleanText(input?.context?.energy, 20),
    todayFocus: cleanText(input?.context?.todayFocus, 200),
    todayCompletion: Math.max(0, Math.min(100, Math.round(Number(input?.context?.todayCompletion)) || 0)),
    missedTasks: Array.isArray(input?.context?.missedTasks)
      ? input.context.missedTasks.slice(0, 3).map((task) => cleanText(task, 120)).filter(Boolean)
      : [],
    streakDays: Math.max(0, Math.min(3650, Math.round(Number(input?.context?.streakDays)) || 0)),
    mood: cleanText(input?.context?.mood, 20),
  };
  if (allowPersonalization) {
    context.personalization = {
      mbti: cleanText(input?.context?.personalization?.mbti, 8),
      planningStyle: cleanText(input?.context?.personalization?.planningStyle, 80),
      preferenceSummary: cleanText(input?.context?.personalization?.preferenceSummary, 300),
    };
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
        ...OLLIE_VOICE_INSTRUCTIONS,
        "headline: 대답의 핵심을 담은 짧은 한 줄(8~20자, 말풍선의 굵은 제목). reply: 2~3문장의 본문.",
        ...EVENT_INSTRUCTIONS[eventType],
        "사용자 정보(목표, 오늘 컨디션, 완료율, 최근 감정)가 있으면 답변에 자연스럽게 반영하세요.",
        "개인화 정보가 제공된 경우에만 실행 방식과 말투를 조정하되, MBTI나 성향을 고정관념처럼 단정하지 마세요.",
        "의료·법률·재정 문제는 단정하지 말고 필요하면 전문가와 상의하도록 부드럽게 안내하세요.",
        "사용자가 자해나 극단적 선택을 내비치면 조언하려 들지 말고, 공감한 뒤 자살예방상담전화 109나 가까운 사람의 도움을 안내하세요.",
      ].join("\n"),
      input: [
        `상황: ${eventType}`,
        `사용자 정보: ${JSON.stringify(context)}`,
        history.length ? `이전 대화(오래된 순): ${JSON.stringify(history)}` : "",
        `사용자의 말: ${message}`,
      ].filter(Boolean).join("\n"),
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
    const error = new Error("올리의 답을 확인하지 못했어요.");
    error.status = 502;
    error.providerUsage = responseBody.usage || null;
    error.providerRequestId = response.headers.get("x-request-id") || "";
    error.providerCalled = true;
    throw error;
  }

  try {
    const parsed = JSON.parse(outputText);
    const reply = cleanText(parsed.reply, 400);
    const headline = cleanText(parsed.headline, 60);
    if (!reply) throw new Error("empty reply");
    return {
      headline,
      reply,
      emotion: normalizeCompanionEmotion(parsed.emotion),
      usage: responseBody.usage || null,
      requestId: response.headers.get("x-request-id") || "",
    };
  } catch {
    const error = new Error("올리의 답을 해석하지 못했어요.");
    error.status = 502;
    error.providerUsage = responseBody.usage || null;
    error.providerRequestId = response.headers.get("x-request-id") || "";
    error.providerCalled = true;
    throw error;
  }
}
