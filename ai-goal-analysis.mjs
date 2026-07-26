import { fetchAiResponse } from "./ai-request.mjs";

// 온보딩 1단계(자연어 한 문단) → 2단계(올리가 이해한 내용 + 꼭 필요한 확인 질문)용 짧은 분석 계약.
// 계획 생성(create_plan)과 분리된 저비용 호출이며, 여기서는 일정·로드맵을 만들지 않는다.

const MAX_GOAL_TEXT = 1000;
const MAX_QUESTIONS = 3;
const QUESTION_TYPES = ["date", "choice"];
const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

// 사용자가 말한 실행 조건을 계획 입력이 바로 쓸 수 있는 형태로 받는다.
// "말하지 않음"은 0/빈 배열 — 모델이 지어내지 못하게 하는 규약이다.
// (클라이언트는 이 값을 availability 입력에 반영하고, 없으면 폼 기본값을 쓴다.)
const CONDITIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["availableDays", "sessionMinutes", "weeklyFrequency", "periodDays"],
  properties: {
    availableDays: { type: "array", items: { type: "string", enum: WEEKDAY_LABELS } },
    sessionMinutes: { type: "integer" },
    weeklyFrequency: { type: "integer" },
    periodDays: { type: "integer" },
  },
};

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["goal", "currentState", "availableTime", "questions", "conditions"],
  properties: {
    goal: { type: "string" },
    currentState: { type: "array", items: { type: "string" } },
    availableTime: { type: "array", items: { type: "string" } },
    conditions: CONDITIONS_SCHEMA,
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "question", "type", "options", "defaultValue"],
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          type: { type: "string", enum: QUESTION_TYPES },
          options: { type: "array", items: { type: "string" } },
          defaultValue: { type: "string" },
        },
      },
    },
  },
};

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanList(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
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

function normalizeQuestion(raw, index) {
  const type = QUESTION_TYPES.includes(raw?.type) ? raw.type : "choice";
  const question = cleanText(raw?.question, 120);
  if (!question) return null;
  const id = cleanText(raw?.id, 40) || `question-${index + 1}`;
  const options = type === "choice" ? cleanList(raw?.options, 4, 40) : [];
  if (type === "choice" && options.length < 2) return null;
  return {
    id,
    question,
    type,
    options,
    defaultValue: cleanText(raw?.defaultValue, 40),
  };
}

// 기간(마감일)은 2단계 확인 질문으로만 수집하므로, 모델이 빠뜨려도 항상 하나는 보장한다.
export const TARGET_DATE_QUESTION_ID = "target_date";

function withTargetDateQuestion(questions) {
  if (questions.some((item) => item.id === TARGET_DATE_QUESTION_ID || item.type === "date")) return questions;
  return [
    {
      id: TARGET_DATE_QUESTION_ID,
      question: "목표를 마치고 싶은 날이 정해졌나요?",
      type: "date",
      options: [],
      defaultValue: "",
    },
    ...questions,
  ].slice(0, MAX_QUESTIONS);
}

function clampInt(value, min, max) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(max, Math.max(min, parsed));
}

// 모델 출력은 신뢰 경계 밖이다. 요일은 실제 요일만, 숫자는 실행 가능한
// 범위로 자르고, 조건이 아예 없어도(구버전 응답·파싱 실패) 계약을 지킨다.
export function normalizeConditions(raw) {
  const days = Array.isArray(raw?.availableDays)
    ? WEEKDAY_LABELS.filter((day) => raw.availableDays.includes(day))
    : [];
  const weeklyFrequency = clampInt(raw?.weeklyFrequency, 1, 7);
  return {
    availableDays: days,
    // 폼 입력과 같은 한계(5~180분). 0은 "말하지 않음"으로 통과시킨다.
    sessionMinutes: clampInt(raw?.sessionMinutes, 5, 180),
    // 요일을 나열했는데 횟수를 안 말했으면 요일 수가 곧 주당 횟수다.
    weeklyFrequency: weeklyFrequency || days.length,
    periodDays: clampInt(raw?.periodDays, 1, 730),
  };
}

export function normalizeGoalAnalysis(parsed) {
  const goal = cleanText(parsed?.goal, 200);
  if (!goal) {
    const error = new Error("목표를 이해하지 못했어요. 조금 더 구체적으로 적어 주세요.");
    error.status = 502;
    throw error;
  }
  const questions = (Array.isArray(parsed?.questions) ? parsed.questions : [])
    .map((item, index) => normalizeQuestion(item, index))
    .filter(Boolean)
    .slice(0, MAX_QUESTIONS);
  return {
    goal,
    currentState: cleanList(parsed?.currentState, 4, 120),
    availableTime: cleanList(parsed?.availableTime, 4, 120),
    conditions: normalizeConditions(parsed?.conditions),
    questions: withTargetDateQuestion(questions),
  };
}

export async function createGoalAnalysis(input, { apiKey, model = "gpt-5.4-mini", fetchImpl = fetch, timeoutMs } = {}) {
  if (!apiKey) {
    const error = new Error("서버에 OPENAI_API_KEY가 설정되지 않았어요.");
    error.status = 503;
    throw error;
  }

  const goalText = cleanText(input?.goalText, MAX_GOAL_TEXT);
  if (!goalText) {
    const error = new Error("이루고 싶은 목표를 적어 주세요.");
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
          "당신은 목표 실행을 돕는 다정한 목표 메이트 '올리'입니다.",
          "사용자가 자유롭게 적은 목표 이야기를 읽고, 계획을 만들기 전에 이해한 내용을 정리하세요.",
          "goal: 사용자가 이루려는 결과를 한 문장으로 정리(기간이 언급됐다면 포함).",
          "currentState: 사용자가 밝힌 현재 상황을 짧은 항목으로 최대 4개. 없으면 빈 배열.",
          "availableTime: 사용자가 밝힌 가능한 시간을 짧은 항목으로 최대 4개. 없으면 빈 배열.",
          "사용자가 적지 않은 내용을 지어내지 마세요. 추측은 currentState나 availableTime에 넣지 않습니다.",
          "conditions: 사용자가 말한 실행 조건을 구조화해서 담으세요. 말하지 않은 항목은 0 또는 빈 배열로 두세요.",
          "conditions.availableDays: 실행 가능한 요일. '매일'이면 7개 전부, '평일'이면 월~금, '주말'이면 토·일. 요일을 콕 집어 말했으면(예: '화요일이랑 목요일 밤' → [\"화\",\"목\"]) 정확히 그 요일만 담고, '평일'로 일반화하지 마세요. 말하지 않았으면 빈 배열.",
          "conditions.sessionMinutes: 한 번에 실행할 분 단위 시간(예: '하루 20분' → 20, '1시간' → 60, '한 시간 정도' → 60). 말하지 않았으면 0.",
          "conditions.weeklyFrequency: 주당 실행 횟수(예: '주 3회' → 3, '매일' → 7, 요일 2개를 집어 말했으면 → 2). 말하지 않았으면 0.",
          "conditions.periodDays: 목표 기간을 일수로. 말로 쓴 기간도 환산하세요(예: '30일 동안' → 30, '두 달' → 60, '3개월' → 90, '반년' → 180). '10월 말까지'처럼 달성 날짜만 있으면 0으로 두고 날짜는 질문의 defaultValue로 다루세요. 말하지 않았으면 0.",
          "questions: 계획을 만들기 위해 꼭 필요한데 아직 모르는 것만 최대 3개. 이미 답이 있으면 묻지 마세요.",
          "질문 type은 날짜가 필요하면 'date', 선택지가 있으면 'choice'입니다.",
          "choice 질문은 서로 겹치지 않는 선택지를 2~4개 제시하세요(예: 가능해요 / 어려워요 / 상황에 따라 달라요).",
          "질문은 짧은 한국어 '~요'체 한 문장으로, 사용자를 압박하지 않게 부드럽게 적으세요.",
          "일정표나 주차별 계획은 이 단계에서 만들지 마세요.",
        ].join("\n"),
        input: `사용자가 적은 목표 이야기:\n${goalText}`,
        max_output_tokens: 900,
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "goal_analysis",
            strict: true,
            schema: ANALYSIS_SCHEMA,
          },
        },
      }),
    }, { fetchImpl, timeoutMs });
  } catch (error) {
    error.providerCalled = true;
    throw error;
  }

  const responseBody = await response.json().catch(() => ({}));
  const providerUsage = responseBody.usage || null;
  const providerRequestId = response.headers.get("x-request-id") || "";

  if (!response.ok) {
    const error = new Error(responseBody.error?.message || "OpenAI API 요청에 실패했어요.");
    error.status = response.status >= 400 && response.status < 500 ? 502 : response.status;
    error.providerUsage = providerUsage;
    error.providerRequestId = providerRequestId;
    error.providerCalled = true;
    throw error;
  }

  const outputText = extractOutputText(responseBody);
  if (!outputText) {
    const error = new Error("올리가 정리한 내용을 확인하지 못했어요.");
    error.status = 502;
    error.providerUsage = providerUsage;
    error.providerRequestId = providerRequestId;
    error.providerCalled = true;
    throw error;
  }

  let analysis;
  try {
    analysis = normalizeGoalAnalysis(JSON.parse(outputText));
  } catch (error) {
    error.status = error.status || 502;
    error.providerUsage = providerUsage;
    error.providerRequestId = providerRequestId;
    error.providerCalled = true;
    throw error;
  }

  return { analysis, usage: providerUsage, requestId: providerRequestId };
}
