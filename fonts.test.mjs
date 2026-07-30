import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PRETENDARD_CSS = "assets/fonts/pretendard/pretendard-variable.css";

function woff2Sources(css) {
  return [...css.matchAll(/url\(\s*["']?([^"')]+\.woff2)["']?\s*\)/g)].map((m) => m[1]);
}

test("Pretendard 웹폰트 CSS가 존재하고 subset 92개를 선언한다", () => {
  assert.ok(fs.existsSync(PRETENDARD_CSS), `${PRETENDARD_CSS}가 없다`);
  const sources = woff2Sources(fs.readFileSync(PRETENDARD_CSS, "utf8"));
  assert.equal(sources.length, 92, "dynamic subset은 92개여야 한다");
});

test("Pretendard가 선언한 subset 파일이 전부 실제로 존재한다", () => {
  const dir = path.dirname(PRETENDARD_CSS);
  const sources = woff2Sources(fs.readFileSync(PRETENDARD_CSS, "utf8"));
  const missing = sources.filter((src) => !fs.existsSync(path.join(dir, src)));
  assert.deepEqual(missing, [], "선언은 있는데 파일이 없는 폰트");
});

// 이번 버그의 본질을 잡는 테스트다. styles.css가 이름만 적어두고 파일이 없던 상태를
// 기존 테스트가 통과시켰다. 선언된 모든 폰트 파일이 실재하는지 저장소 전체에서 본다.
test("styles.css가 선언한 @font-face 파일이 전부 실제로 존재한다", () => {
  const sources = woff2Sources(fs.readFileSync("styles.css", "utf8"));
  const missing = sources.filter((src) => !fs.existsSync(src));
  assert.deepEqual(missing, [], "선언은 있는데 파일이 없는 폰트");
});

test("OFL 라이선스 원문을 함께 배포한다", () => {
  const ofl = "assets/fonts/pretendard/OFL.txt";
  assert.ok(fs.existsSync(ofl), `${ofl}가 없다 — OFL은 라이선스 동봉을 요구한다`);
  assert.match(fs.readFileSync(ofl, "utf8"), /SIL OPEN FONT LICENSE/i);
});

test("글꼴 스택을 하드코딩한 곳이 없다 — 전부 --font-* 토큰을 거친다", () => {
  const css = fs.readFileSync("styles.css", "utf8");
  const lines = css.split(/\r?\n/);
  const offenders = lines
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => /-apple-system/.test(line))
    .map(({ number, line }) => `${number}: ${line.trim().slice(0, 80)}`);
  assert.deepEqual(offenders, [], "글꼴 스택이 토큰을 우회하고 있다");
});

const WEIGHT_TOKENS = {
  "--weight-body": "400",
  "--weight-emphasis": "600",
  "--weight-title": "700",
  "--weight-display": "800",
};

test("굵기 역할 토큰이 정의되어 있다", () => {
  const css = fs.readFileSync("styles.css", "utf8");
  for (const [token, value] of Object.entries(WEIGHT_TOKENS)) {
    assert.match(css, new RegExp(`${token}:\\s*${value}\\s*;`), `${token}: ${value} 가 없다`);
  }
});

test("브랜드 글꼴 선언이 font-weight 400에 묶여 있지 않다", () => {
  // 잘난체는 굵기가 400 하나뿐이라 제목들이 400으로 못박혀 있었다. 가족만 바꾸고
  // 두면 제목이 지금보다 얇아진다. 그 상태로 되돌아가지 않게 막는다.
  const lines = fs.readFileSync("styles.css", "utf8").split(/\r?\n/);
  const offenders = [];
  lines.forEach((line, index) => {
    if (!/font-family:\s*var\(--font-brand-(display|ui)\)/.test(line)) return;
    for (let cursor = index + 1; cursor < Math.min(index + 14, lines.length); cursor += 1) {
      if (lines[cursor].includes("}")) break;
      if (/font-weight:\s*400\s*;/.test(lines[cursor])) offenders.push(cursor + 1);
    }
  });
  assert.deepEqual(offenders, [], "브랜드 글꼴 선언이 400에 묶여 있다");
});

test("font-weight는 6단계 계약 안의 값만 쓴다", () => {
  // docs/design-tokens.md:93. 650·750 같은 중간값이 다시 들어오지 않게 막는다.
  //
  // 토큰 참조를 통째로 면제하면 안 된다. `--weight-subtle: 450`을 만들어
  // `font-weight: var(--weight-subtle)`로 쓰면 막으려던 바로 그 값이 조용히 통과한다.
  // 그래서 토큰의 '값'까지 따라가 검사한다.
  const allowed = new Set(["400", "500", "600", "700", "800", "900", "inherit"]);
  const css = fs.readFileSync("styles.css", "utf8");

  const tokenValues = new Map(
    [...css.matchAll(/(--weight-[a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
  const badTokens = [...tokenValues].filter(([, value]) => !allowed.has(value));
  assert.deepEqual(badTokens, [], "6단계 밖의 값을 가진 --weight-* 토큰");

  const bad = [];
  for (const match of css.matchAll(/font-weight:\s*([^;\n}]+)/g)) {
    const value = match[1].trim();
    const reference = value.match(/^var\((--weight-[a-z-]+)\)$/);
    if (reference) {
      // 선언되지 않은 토큰을 참조하면 그 규칙은 굵기가 없는 것과 같다. 오타를 잡는다.
      if (!tokenValues.has(reference[1])) bad.push(`${value} — 선언되지 않은 토큰`);
      continue;
    }
    if (!allowed.has(value)) bad.push(value);
  }
  assert.deepEqual([...new Set(bad)], [], "6단계 밖의 font-weight");
});
