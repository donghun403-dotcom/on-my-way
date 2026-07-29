// 다이어리 북의 글 — 올리의 머리말과 마지막 장 편지 (스펙 4장).
//
// 이 모듈이 만드는 것은 텍스트뿐이다. 조판과 PDF 변환은 클라이언트가 한다(스펙 4장
// 「전달 방식」). Workers에서 PDF를 렌더링하면 서버 비용이 붙고 디자인 자유도가 줄어든다.
//
// 호출은 정확히 2회다. 머리말은 그 달을 요약하는 글이고 편지는 유저에게 건네는 말이라
// 필요한 지침도 길이도 다르다. 한 번에 둘 다 시키면 두 글이 서로의 톤에 끌려간다.
// 두 호출은 서로를 기다릴 이유가 없으므로 동시에 보낸다.

import { fetchAiResponse } from "./ai-request.mjs";
import { OLLIE_VOICE_INSTRUCTIONS } from "./ai-companion-chat.mjs";

// 한 권의 입력 상한. 한 달치를 통째로 보내면 토큰이 터지므로 클라이언트가 요약해 보내고,
// 서버가 같은 상한으로 한 번 더 자른다 — 클라이언트를 믿고 남기는 상한은 상한이 아니다.
export const MAX_HIGHLIGHTS = 8;
export const MAX_CONVERSATIONS = 5;
const MAX_NOTE_CHARS = 140;
const MAX_TURN_CHARS = 140;
const MAX_MOODS = 5;
export const DIARY_BOOK_MAX_OUTPUT_TOKENS = 900;

const FOREWORD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "foreword"],
  properties: {
    title: { type: "string" },
    foreword: { type: "string" },
  },
};

const LETTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["letter"],
  properties: {
    letter: { type: "string" },
  },
};

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function boundedInteger(value, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(number, max);
}

const MONTH_KEY_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;

export function normalizeDiaryBookInput(input) {
  const monthKey = String(input?.monthKey || "").trim();
  if (!MONTH_KEY_PATTERN.test(monthKey)) {
    const error = new Error("만들 달을 정확히 알려 주세요.");
    error.status = 400;
    error.code = "INVALID_DIARY_BOOK_MONTH";
    throw error;
  }

  const summary = input?.summary || {};
  return {
    monthKey,
    goal: cleanText(input?.goal, 200),
    summary: {
      entryCount: boundedInteger(summary.entryCount, 31),
      chatDayCount: boundedInteger(summary.chatDayCount, 31),
      chatTurnCount: boundedInteger(summary.chatTurnCount, 5_000),
      averageCompletion: boundedInteger(summary.averageCompletion, 100),
      bestCompletion: boundedInteger(summary.bestCompletion, 100),
      streakDays: boundedInteger(summary.streakDays, 366),
      moods: Array.isArray(summary.moods)
        ? summary.moods.slice(0, MAX_MOODS)
          .map((mood) => ({ label: cleanText(mood?.label, 20), count: boundedInteger(mood?.count, 31) }))
          .filter((mood) => mood.label)
        : [],
      highlights: Array.isArray(summary.highlights)
        ? summary.highlights.slice(0, MAX_HIGHLIGHTS)
          .map((item) => ({
            date: cleanText(item?.date, 10),
            mood: cleanText(item?.mood, 20),
            note: cleanText(item?.note, MAX_NOTE_CHARS),
          }))
          .filter((item) => item.note || item.mood)
        : [],
      conversations: Array.isArray(summary.conversations)
        ? summary.conversations.slice(0, MAX_CONVERSATIONS)
          .map((item) => ({
            date: cleanText(item?.date, 10),
            user: cleanText(item?.user, MAX_TURN_CHARS),
            ollie: cleanText(item?.ollie, MAX_TURN_CHARS),
          }))
          .filter((item) => item.user || item.ollie)
        : [],
    },
  };
}

/* 기록이 적은 달을 초라하게 만들지 않는 것이 이 책의 전제다. 한 달에 이틀만 적은 사람도
   그 두 날을 남겼다는 사실로 책을 받아야 하고, 숫자가 적다는 말을 들으면 안 된다. */
const BOOK_TONE_INSTRUCTIONS = [
  "이 글은 한 달의 기록을 묶은 책에 실립니다. 유저가 오래 간직할 글이라는 것을 염두에 두세요.",
  "기록이 적은 달이라도 부족하다고 말하지 마세요. '얼마 없지만', '조금밖에', '아쉽게도' 같은 표현을 쓰지 않습니다.",
  "숫자를 나열해 평가하지 마세요. 완료율이 낮아도 그것을 성적처럼 말하지 않습니다.",
  "기록이 하루뿐이어도 그 하루를 온전한 이야기로 씁니다. 남긴 것이 있다는 사실 자체를 반깁니다.",
  "지어내지 마세요. 주어진 기록에 없는 사건·감정·인물을 만들어 쓰지 않습니다.",
];

function describeMonth(monthKey) {
  const [year, month] = monthKey.split("-");
  return `${year}년 ${Number(month)}월`;
}

function buildInputText(payload) {
  const { monthKey, goal, summary } = payload;
  return [
    `달: ${describeMonth(monthKey)}`,
    goal ? `유저의 목표: ${goal}` : "",
    `기록한 날: ${summary.entryCount}일 · 올리와 이야기한 날: ${summary.chatDayCount}일 (${summary.chatTurnCount}마디)`,
    `평균 실행률: ${summary.averageCompletion}% · 가장 높았던 날: ${summary.bestCompletion}% · 연속 실행: ${summary.streakDays}일`,
    summary.moods.length ? `그 달의 마음: ${summary.moods.map((mood) => `${mood.label} ${mood.count}일`).join(", ")}` : "",
    summary.highlights.length ? `남긴 기록: ${JSON.stringify(summary.highlights)}` : "",
    summary.conversations.length ? `올리와 나눈 이야기: ${JSON.stringify(summary.conversations)}` : "",
  ].filter(Boolean).join("\n");
}

async function requestBookText({ apiKey, model, fetchImpl, timeoutMs, instructions, input, schemaName, schema }) {
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
        // 이 책의 내용은 감정 기록이다. 외부에 남기지 않는다.
        store: false,
        reasoning: { effort: "low" },
        instructions: instructions.join("\n"),
        input,
        max_output_tokens: DIARY_BOOK_MAX_OUTPUT_TOKENS,
        text: {
          verbosity: "low",
          format: { type: "json_schema", name: schemaName, strict: true, schema },
        },
      }),
    }, { fetchImpl, timeoutMs });
  } catch (error) {
    error.providerCalled = true;
    throw error;
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error?.message || "OpenAI API 요청에 실패했어요.");
    error.status = response.status >= 400 && response.status < 500 ? 502 : response.status;
    error.providerUsage = body.usage || null;
    error.providerRequestId = body.id || "";
    error.providerCalled = true;
    throw error;
  }

  const text = typeof body.output_text === "string"
    ? body.output_text
    : (body.output || []).flatMap((item) => item.content || [])
      .find((content) => content.type === "output_text" && typeof content.text === "string")?.text || "";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const error = new Error("올리가 쓴 글을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    error.status = 502;
    error.code = "DIARY_BOOK_PARSE_FAILED";
    error.providerCalled = true;
    error.providerUsage = body.usage || null;
    throw error;
  }
  return { parsed, usage: body.usage || null, requestId: body.id || "" };
}

export async function createDiaryBookText(input, { apiKey, model = "gpt-5.4-mini", fetchImpl = fetch, timeoutMs } = {}) {
  if (!apiKey) {
    const error = new Error("서버에 OPENAI_API_KEY가 설정되지 않았어요.");
    error.status = 503;
    throw error;
  }

  const payload = normalizeDiaryBookInput(input);
  const inputText = buildInputText(payload);
  const month = describeMonth(payload.monthKey);

  const [foreword, letter] = await Promise.all([
    requestBookText({
      apiKey,
      model,
      fetchImpl,
      timeoutMs,
      schemaName: "diary_book_foreword",
      schema: FOREWORD_SCHEMA,
      instructions: [
        ...OLLIE_VOICE_INSTRUCTIONS,
        ...BOOK_TONE_INSTRUCTIONS,
        `당신은 ${month} 다이어리 북의 머리말을 씁니다. 책을 펼치면 가장 먼저 나오는 글입니다.`,
        "title: 이 달에 붙이는 제목. 12자 이내이고 날짜나 숫자를 넣지 않습니다. 예: '작게 시작한 달'.",
        "foreword: 3~4문장. 이 달이 어떤 여정이었는지 올리의 눈으로 이야기합니다. 유저를 '당신'이라 부르지 말고 올리가 곁에서 지켜본 것처럼 씁니다.",
        "머리말은 요약이 아니라 인사입니다. 통계를 읊지 말고 그 달의 결을 한 장면으로 잡아 주세요.",
      ],
      input: inputText,
    }),
    requestBookText({
      apiKey,
      model,
      fetchImpl,
      timeoutMs,
      schemaName: "diary_book_letter",
      schema: LETTER_SCHEMA,
      instructions: [
        ...OLLIE_VOICE_INSTRUCTIONS,
        ...BOOK_TONE_INSTRUCTIONS,
        `당신은 ${month} 다이어리 북의 마지막 장에 실릴 올리의 편지를 씁니다.`,
        "letter: 4~6문장의 편지. 머리말보다 사적이고 따뜻하게, 유저에게 직접 건네는 말로 씁니다.",
        "그 달에 실제로 있었던 기록 하나를 골라 구체적으로 언급하세요. 기억하고 있다는 것이 이 편지의 힘입니다.",
        "다음 달을 향한 다짐이나 과제를 주지 마세요. 잘 지나왔다는 것과 계속 곁에 있겠다는 것으로 끝냅니다.",
        "'-올리 드림' 같은 서명은 넣지 마세요. 책이 따로 붙입니다.",
      ],
      input: inputText,
    }),
  ]);

  return {
    monthKey: payload.monthKey,
    title: cleanText(foreword.parsed.title, 40) || month,
    foreword: cleanText(foreword.parsed.foreword, 900),
    letter: cleanText(letter.parsed.letter, 1_200),
    usage: {
      input_tokens: Number(foreword.usage?.input_tokens || 0) + Number(letter.usage?.input_tokens || 0),
      output_tokens: Number(foreword.usage?.output_tokens || 0) + Number(letter.usage?.output_tokens || 0),
    },
    requestId: foreword.requestId || letter.requestId || "",
  };
}
