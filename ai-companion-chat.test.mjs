import test from "node:test";
import assert from "node:assert/strict";
import { createCompanionReply, normalizeCheerEventType } from "./ai-companion-chat.mjs";

function mockFetch(capture) {
  return async (_url, options) => {
    capture.body = JSON.parse(options.body);
    return new Response(
      JSON.stringify({ output_text: JSON.stringify({ headline: "테스트 한 줄", reply: "테스트 응답이에요." }), usage: { total_tokens: 50 } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
}

test("eventType은 celebrate·comfort만 허용하고 나머지는 chat으로 정규화한다", () => {
  assert.equal(normalizeCheerEventType("celebrate"), "celebrate");
  assert.equal(normalizeCheerEventType("comfort"), "comfort");
  assert.equal(normalizeCheerEventType("chat"), "chat");
  assert.equal(normalizeCheerEventType("hack-the-prompt"), "chat");
  assert.equal(normalizeCheerEventType(undefined), "chat");
});

test("축하 이벤트는 축하 지침과 실행 컨텍스트를 함께 전달한다", async () => {
  const capture = {};
  const result = await createCompanionReply(
    {
      message: "오늘 계획 3개를 방금 모두 완료했어요!",
      eventType: "celebrate",
      context: { goal: "토익 900점", todayCompletion: 100, streakDays: 5, missedTasks: [], mood: "뿌듯함" },
    },
    { apiKey: "test-key", fetchImpl: mockFetch(capture) },
  );

  assert.equal(result.reply, "테스트 응답이에요.");
  assert.match(capture.body.instructions, /오늘 완료 축하/);
  assert.match(capture.body.input, /"todayCompletion":100/);
  assert.match(capture.body.input, /"streakDays":5/);
  assert.match(capture.body.input, /뿌듯함/);
  assert.equal(capture.body.max_output_tokens, 700);
});

test("위로 이벤트는 자책 방지 지침과 놓친 일정을 전달한다", async () => {
  const capture = {};
  await createCompanionReply(
    {
      message: "지난 접속에서 일정 2개를 완료하지 못했어요.",
      eventType: "comfort",
      context: { goal: "운동 습관", todayCompletion: 33, missedTasks: ["저녁 운동 20분", "식사 기록"], streakDays: 0 },
    },
    { apiKey: "test-key", fetchImpl: mockFetch(capture) },
  );

  assert.match(capture.body.instructions, /놓친 일정 위로/);
  assert.match(capture.body.instructions, /자책하게 하지 말고/);
  assert.match(capture.body.input, /저녁 운동 20분/);
});

test("알 수 없는 eventType과 과도한 컨텍스트 값은 안전하게 정규화된다", async () => {
  const capture = {};
  await createCompanionReply(
    {
      message: "안녕!",
      eventType: "malicious-mode",
      context: { todayCompletion: 987, streakDays: -3, missedTasks: ["a", "b", "c", "d", "e"] },
    },
    { apiKey: "test-key", fetchImpl: mockFetch(capture) },
  );

  assert.match(capture.body.input, /상황: chat/);
  assert.match(capture.body.input, /"todayCompletion":100/);
  assert.match(capture.body.input, /"streakDays":0/);
  const context = JSON.parse(capture.body.input.match(/사용자 정보: (\{.*\})\n/)[1]);
  assert.equal(context.missedTasks.length, 3);
});
