/* 샘플 다이어리 북 — summary가 days 배열에서 유도되는지 고정한다.
 *
 * 왜: 잠금 화면의 주인공이라 만료 계정이 결제를 판단할 때 보는 유일한 실물이다.
 * 그런데 summary는 손으로 적힌 숫자였고 실제로 어긋나 있었다 — streakDays가 5로
 * 선언돼 있었는데 날짜 배열의 최대 연속은 2였다(04-02~03, 04-08~09).
 * "10개 기록"과 "최장 5일 연속"을 나란히 보는 사람에게는 앞뒤가 안 맞는다.
 *
 * 그래서 여기서는 선언값을 읽지 않고 days에서 전부 다시 계산해 대조한다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function loadSampleBook() {
  const source = readFileSync(new URL("./sample-diary-book.js", import.meta.url), "utf8");
  const scope = { window: {} };
  // 브라우저 전역에 붙이는 스크립트라 window를 만들어 준 뒤 평가한다.
  new Function("window", source)(scope.window);
  return scope.window.OMW_SAMPLE_DIARY_BOOK;
}

const book = loadSampleBook();
const days = book.days;

/* memoryMoodMeta의 표시값. 샘플만 다른 어휘를 쓰면 실물과 어긋난다. */
const MOOD_LABELS = Object.freeze({
  heavy: "답답함",
  steady: "보통",
  light: "가벼움",
  proud: "뿌듯함",
});

function longestConsecutiveDays(dateKeys) {
  const sorted = [...dateKeys].sort();
  let best = sorted.length ? 1 : 0;
  let run = best;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = Date.parse(`${sorted[index - 1]}T00:00:00Z`);
    const current = Date.parse(`${sorted[index]}T00:00:00Z`);
    run = current - previous === 86_400_000 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

test("entryCount는 기록 수와 같다", () => {
  assert.equal(book.summary.entryCount, days.length);
});

test("chatDayCount와 chatTurnCount는 실제 대화에서 나온다", () => {
  const chatDays = days.filter((day) => day.turns.length > 0).length;
  const turns = days.reduce((total, day) => total + day.turns.length, 0);
  assert.equal(book.summary.chatDayCount, chatDays);
  assert.equal(book.summary.chatTurnCount, turns);
});

test("averageCompletion은 완료율의 평균이다", () => {
  const values = days.map((day) => day.memory.completion);
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  assert.equal(book.summary.averageCompletion, Math.round(mean));
});

/* 이 테스트가 예전 결함을 직접 막는다. 편지와 26일 기록이 "닷새 연속"을 말하므로
   날짜 배열에도 닷새가 실제로 이어져 있어야 한다. */
test("streakDays는 날짜 배열의 최대 연속 일수와 같다", () => {
  assert.equal(book.summary.streakDays, longestConsecutiveDays(days.map((day) => day.dateKey)));
});

test("moods는 실제 기분 분포이고 라벨이 표시값과 같다", () => {
  const counts = new Map();
  for (const day of days) {
    const label = MOOD_LABELS[day.memory.mood];
    assert.ok(label, `알 수 없는 mood: ${day.memory.mood}`);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const expected = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const actual = [...book.summary.moods].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  assert.deepEqual(actual, expected);
  assert.equal(actual.reduce((total, mood) => total + mood.count, 0), days.length);
});

test("날짜는 오름차순이고 중복이 없으며 모두 그 달에 속한다", () => {
  const keys = days.map((day) => day.dateKey);
  assert.deepEqual(keys, [...keys].sort(), "조판이 배열 순서를 그대로 쓴다");
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) assert.ok(key.startsWith(`${book.monthKey}-`), `${key}는 ${book.monthKey}이 아니다`);
});

/* ---------- 캐릭터 바이블 ---------- */

function allProse() {
  const parts = [book.title, book.foreword, book.letter];
  for (const day of days) {
    parts.push(day.memory.title, day.memory.note);
    for (const turn of day.turns) parts.push(turn.text);
  }
  return parts.join("\n");
}

/* 올리는 구름을 타는 것이 아니라 구름 생명체다. 올리와 구름을 분리하는 표현은
   캐릭터 모델을 깨뜨린다. */
test("올리를 구름에서 분리하는 표현이 없다", () => {
  assert.equal(/구름에서\s*(안\s*)?(내려|내리)/.test(allProse()), false);
  assert.equal(/구름을\s*타/.test(allProse()), false);
});

/* 대표 대사 15개 중 "당신" 사용 0건. 당신은 계정 레지스터의 말투다. */
test("올리는 2인칭 당신을 쓰지 않는다", () => {
  const ollieLines = days.flatMap((day) => day.turns.filter((turn) => turn.role === "ollie").map((turn) => turn.text));
  for (const line of [...ollieLines, book.foreword, book.letter]) {
    assert.equal(/당신/.test(line), false, `"당신"이 남아 있다: ${line.slice(0, 40)}`);
  }
});

/* 제목이 본문에 근거가 없으면 조판에서 뜬금없이 읽힌다. */
test("제목의 핵심 표현이 본문에 실제로 나온다", () => {
  assert.match(allProse().replace(book.title, ""), /30초/);
});

/* 편지가 특정 날짜를 언급하면 그 날에 기록이 있어야 한다. */
test("편지가 말하는 스무날째에 비 오는 날 기록이 있다", () => {
  assert.match(book.letter, /스무날째/);
  const twentieth = days.find((day) => day.dateKey === "2026-04-20");
  assert.ok(twentieth, "20일 기록이 없다");
  assert.match(twentieth.memory.note, /비|우산/);
});
