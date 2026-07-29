/* 다이어리 북 글의 계약: 호출 2회, 바이블 §7 말투, 입력 상한 서버 재절단,
   그리고 기록이 적은 달을 초라하게 만들지 않는 지침. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  DIARY_BOOK_MAX_OUTPUT_TOKENS,
  MAX_CONVERSATIONS,
  MAX_HIGHLIGHTS,
  createDiaryBookText,
  normalizeDiaryBookInput,
} from "./ai-diary-book.mjs";

const BASE_INPUT = {
  monthKey: "2026-07",
  goal: "토익 900점",
  summary: {
    entryCount: 12,
    chatDayCount: 8,
    chatTurnCount: 46,
    averageCompletion: 64,
    bestCompletion: 100,
    streakDays: 5,
    moods: [{ label: "뿌듯함", count: 5 }, { label: "지침", count: 3 }],
    highlights: [{ date: "2026-07-12", mood: "뿌듯함", note: "피곤했지만 단어 앱은 열었다." }],
    conversations: [{ date: "2026-07-12", user: "오늘 하나도 못 했어", ollie: "괜찮아요. 5분만 해볼까요?" }],
  },
};

/* 두 호출의 본문을 붙잡아 둔다. 어떤 지침이 어느 글에 실려 나갔는지 검사한다. */
function capturingFetch(bodies = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const body = JSON.parse(options.body || "{}");
    calls.push({ url: String(url), body });
    const name = body.text?.format?.name || "";
    const payload = name === "diary_book_letter"
      ? (bodies.letter || { letter: "그 달의 편지예요." })
      : (bodies.foreword || { title: "작게 시작한 달", foreword: "둥실, 이 달의 이야기예요." });
    return new Response(JSON.stringify({ output_text: JSON.stringify(payload), usage: { input_tokens: 100, output_tokens: 50 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { calls, fetchImpl };
}

function forewordCall(calls) {
  return calls.find((call) => call.body.text?.format?.name === "diary_book_foreword");
}

function letterCall(calls) {
  return calls.find((call) => call.body.text?.format?.name === "diary_book_letter");
}

test("한 권을 만들 때 AI는 정확히 두 번 호출된다 — 머리말과 편지", async () => {
  const { calls, fetchImpl } = capturingFetch();
  const book = await createDiaryBookText(BASE_INPUT, { apiKey: "k", fetchImpl });

  assert.equal(calls.length, 2, "머리말 1회 + 편지 1회");
  assert.ok(forewordCall(calls), "머리말 호출이 있어야 한다");
  assert.ok(letterCall(calls), "편지 호출이 있어야 한다");
  assert.equal(book.title, "작게 시작한 달");
  assert.equal(book.foreword, "둥실, 이 달의 이야기예요.");
  assert.equal(book.letter, "그 달의 편지예요.");
  assert.equal(book.monthKey, "2026-07");
  // 두 호출의 토큰을 합쳐 한 권의 비용으로 보고한다.
  assert.equal(book.usage.input_tokens, 200);
  assert.equal(book.usage.output_tokens, 100);
});

test("두 호출 모두 바이블 §7 말투를 이식받는다", async () => {
  const { calls, fetchImpl } = capturingFetch();
  await createDiaryBookText(BASE_INPUT, { apiKey: "k", fetchImpl });

  for (const call of calls) {
    const instructions = call.body.instructions;
    assert.match(instructions, /구름 생명체 '올리'/);
    assert.match(instructions, /짧고 솔직하게/);
    assert.match(instructions, /열심히 해야지/, "훈계 금지가 들어 있다");
    assert.match(instructions, /별일 아니야/, "감정 경시 금지가 들어 있다");
    assert.match(instructions, /대명사/, "성별 대명사 금지가 들어 있다");
  }
  // 감정 태그는 대화 전용이다. 책에는 그 필드가 없으므로 지침도 실리지 않아야 한다.
  assert.doesNotMatch(calls[0].body.instructions, /emotion:/);
});

test("기록이 적은 달을 초라하게 만들지 말라는 지침이 두 글 모두에 실린다", async () => {
  const { calls, fetchImpl } = capturingFetch();
  await createDiaryBookText({ ...BASE_INPUT, summary: { ...BASE_INPUT.summary, entryCount: 1, chatDayCount: 0 } }, { apiKey: "k", fetchImpl });

  for (const call of calls) {
    const instructions = call.body.instructions;
    assert.match(instructions, /부족하다고 말하지 마세요/);
    assert.match(instructions, /얼마 없지만/, "금지 표현 예시가 들어 있다");
    assert.match(instructions, /하루뿐이어도/);
    assert.match(instructions, /지어내지 마세요/, "없는 기억을 만들지 않는다");
  }
});

test("머리말과 편지는 서로 다른 일을 지시받는다", async () => {
  const { calls, fetchImpl } = capturingFetch();
  await createDiaryBookText(BASE_INPUT, { apiKey: "k", fetchImpl });

  assert.match(forewordCall(calls).body.instructions, /머리말/);
  assert.match(forewordCall(calls).body.instructions, /요약이 아니라 인사/);
  assert.match(letterCall(calls).body.instructions, /마지막 장/);
  assert.match(letterCall(calls).body.instructions, /다짐이나 과제를 주지 마세요/);
  assert.match(letterCall(calls).body.instructions, /실제로 있었던 기록 하나/);
});

test("그 달의 기록이 두 호출 모두의 입력에 실린다", async () => {
  const { calls, fetchImpl } = capturingFetch();
  await createDiaryBookText(BASE_INPUT, { apiKey: "k", fetchImpl });

  for (const call of calls) {
    assert.match(call.body.input, /2026년 7월/);
    assert.match(call.body.input, /토익 900점/);
    assert.match(call.body.input, /피곤했지만 단어 앱은 열었다/);
    assert.match(call.body.input, /뿌듯함 5일/);
    assert.match(call.body.input, /괜찮아요/);
  }
});

test("책 내용은 외부에 저장하지 않고 출력 상한을 지킨다", async () => {
  const { calls, fetchImpl } = capturingFetch();
  await createDiaryBookText(BASE_INPUT, { apiKey: "k", fetchImpl });
  for (const call of calls) {
    assert.equal(call.body.store, false, "감정 기록이라 외부 저장을 끈다");
    assert.equal(call.body.max_output_tokens, DIARY_BOOK_MAX_OUTPUT_TOKENS);
    assert.equal(call.body.text.format.strict, true);
  }
});

test("클라이언트가 상한을 넘겨 보내도 서버가 자른다", () => {
  const normalized = normalizeDiaryBookInput({
    monthKey: "2026-07",
    goal: "가".repeat(500),
    summary: {
      entryCount: 999,
      averageCompletion: 640,
      streakDays: -3,
      moods: Array.from({ length: 20 }, (_, index) => ({ label: `감정${index}`, count: 1 })),
      highlights: Array.from({ length: 30 }, () => ({ date: "2026-07-01", mood: "평온함", note: "나".repeat(500) })),
      conversations: Array.from({ length: 30 }, () => ({ date: "2026-07-01", user: "다".repeat(500), ollie: "라".repeat(500) })),
    },
  });

  assert.equal(normalized.goal.length, 200);
  assert.equal(normalized.summary.entryCount, 31, "한 달은 31일을 넘지 않는다");
  assert.equal(normalized.summary.averageCompletion, 100);
  assert.equal(normalized.summary.streakDays, 0, "음수는 0으로 떨어진다");
  assert.equal(normalized.summary.moods.length, 5);
  assert.equal(normalized.summary.highlights.length, MAX_HIGHLIGHTS);
  assert.equal(normalized.summary.highlights[0].note.length, 140);
  assert.equal(normalized.summary.conversations.length, MAX_CONVERSATIONS);
  assert.equal(normalized.summary.conversations[0].user.length, 140);
});

test("달 표기가 올바르지 않으면 AI를 부르기 전에 막는다", async () => {
  for (const monthKey of ["", "2026-7", "2026-13", "2026-07-01", "올해"]) {
    assert.throws(() => normalizeDiaryBookInput({ monthKey }), (error) => error.code === "INVALID_DIARY_BOOK_MONTH");
  }
  let called = 0;
  await assert.rejects(
    () => createDiaryBookText({ monthKey: "2026-13" }, { apiKey: "k", fetchImpl: async () => { called += 1; } }),
    (error) => error.status === 400,
  );
  assert.equal(called, 0, "형식이 틀린 요청은 provider 비용을 만들지 않는다");
});

test("기록이 비어 있어도 한 권은 만들어진다", async () => {
  const { calls, fetchImpl } = capturingFetch();
  const book = await createDiaryBookText({ monthKey: "2026-02", summary: {} }, { apiKey: "k", fetchImpl });
  assert.equal(calls.length, 2);
  assert.ok(book.foreword, "빈 달도 머리말을 받는다");
  assert.doesNotMatch(calls[0].body.input, /남긴 기록/, "없는 항목은 아예 싣지 않는다");
});

test("한쪽 글이 실패하면 한 권 전체가 실패한다", async () => {
  // 절반짜리 책을 유저에게 주지 않는다. 실패는 라우트가 잡아 에너지를 원복한다.
  const fetchImpl = async (url, options = {}) => {
    const body = JSON.parse(options.body || "{}");
    if (body.text?.format?.name === "diary_book_letter") {
      return new Response(JSON.stringify({ error: { message: "letter failed" } }), { status: 500 });
    }
    return new Response(JSON.stringify({ output_text: JSON.stringify({ title: "제목", foreword: "머리말" }) }), { status: 200 });
  };
  await assert.rejects(
    () => createDiaryBookText(BASE_INPUT, { apiKey: "k", fetchImpl }),
    (error) => error.providerCalled === true,
  );
});
