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
  // legal.css는 --font-* 토큰 체계를 쓰지 않는 독립 파일이라 이 테스트의 취지(토큰 우회
  // 탐지)와는 별개지만, -apple-system이 있으면 시스템 글꼴로 되돌아간다는 신호는 같다.
  // Task 7: 법적 고지 4개 페이지가 legal.css를 통해 시스템 글꼴로 남아 있던 것을
  // Pretendard로 맞췄다 — 이 파일도 같이 훑어서 되돌아가지 못하게 막는다.
  const offenders = ["styles.css", "legal.css"].flatMap((file) => {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    return lines
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => /-apple-system/.test(line))
      .map(({ number, line }) => `${file}:${number}: ${line.trim().slice(0, 80)}`);
  });
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

test("잘난체 참조가 저장소에 하나도 없다", () => {
  // plan-policy.test.mjs가 폐지한 플랜 상수의 잔재를 훑는 것과 같은 관용구다.
  // (그 테스트의 이름을 여기 그대로 적으면 그 상수 이름이 이 파일에 남아 그쪽 검사에
  //  걸린다. 두 검사가 서로를 잡는 것이 정상이다.)
  //
  // 이 파일 자신은 제외한다. 찾으려는 문자열이 아래 정규식 리터럴에 그대로 들어 있어서,
  // 제외하지 않으면 이 테스트가 스스로를 검출해 절대 통과하지 못한다.
  // .md는 대상이 아니다 — 설계 문서와 design-tokens.md는 과거 경위를 계속 서술해야 한다.
  const exts = /\.(mjs|js|cjs|html|css)$/;
  const skip = /node_modules|[\\/]\.git|\.worktrees|\.claude|test-results|playwright-report|blob-report/;
  const selfName = "fonts.test.mjs";
  const hits = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (skip.test(full)) continue;
      if (entry.isDirectory()) { walk(full); continue; }
      if (!exts.test(entry.name) || entry.name === selfName) continue;
      if (/여기어때 잘난체|Jalnan|jalnan/i.test(fs.readFileSync(full, "utf8"))) hits.push(full);
    }
  };
  walk(".");
  assert.deepEqual(hits, [], "잘난체 참조가 남아 있다");
});

test("글꼴 가족 토큰이 전부 Pretendard로 해석된다", () => {
  const css = fs.readFileSync("styles.css", "utf8");
  assert.match(css, /--font-body:\s*"Pretendard Variable"/);
  for (const token of ["--font-numeric", "--font-brand-display", "--font-brand-ui"]) {
    assert.match(css, new RegExp(`${token}:\\s*var\\(--font-body\\)`), `${token}가 --font-body를 가리키지 않는다`);
  }
});

// 이 테스트가 이번 작업의 존재 이유를 닫는다.
//
// 원래 버그는 "선언된 url()이 없는 파일을 가리킨" 것이 아니라 **--font-body가
// "Pretendard"라는 이름만 가리키고 그 이름의 @font-face가 저장소 어디에도 없던 것**이다.
// url()을 훑는 검사로는 절대 잡히지 않는다. Task 1의 리뷰가 이 구멍을 지적했다.
//
// 지금도 위험이 남아 있다: 벤더된 CSS가 선언하는 이름은 'Pretendard Variable'인데
// 토큰에 "Pretendard"라고 적으면 문자열이 달라 조용히 폴백된다. 그 오타를 여기서 잡는다.
test("--font-* 토큰이 가리키는 주 글꼴에 실제 @font-face가 있다", () => {
  // 주석은 걷어내고 본다. styles.css:5245의 NOTE가 옛 버그를 설명하려고
  // `--font-body: 15px`를 그대로 인용하고 있어서, 주석을 남겨 두면 그 문구가
  // 선언으로 잡혀 "15px`"라는 유령 글꼴이 나온다.
  const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const styles = stripComments(fs.readFileSync("styles.css", "utf8"));
  const vendored = stripComments(fs.readFileSync(PRETENDARD_CSS, "utf8"));
  const declared = new Set(
    [...`${styles}\n${vendored}`.matchAll(/@font-face\s*\{[^}]*?font-family:\s*["']([^"']+)["']/g)]
      .map((match) => match[1]),
  );
  // 폴백은 시스템 글꼴이라 @font-face가 없는 것이 정상이다. 첫 가족만 검사한다.
  const orphans = [...styles.matchAll(/--font-[a-z-]+:\s*([^;]+);/g)]
    .map((match) => match[1].trim())
    .filter((value) => !value.startsWith("var("))
    .map((value) => value.split(",")[0].trim().replace(/^["']|["']$/g, ""))
    .filter((family) => !declared.has(family));
  assert.deepEqual([...new Set(orphans)], [], "@font-face 없이 이름만 참조된 글꼴");
});

test("font-weight는 6단계 계약 안의 값만 쓴다", () => {
  // docs/design-tokens.md:93. 650·750 같은 중간값이 다시 들어오지 않게 막는다.
  //
  // 토큰 참조를 통째로 면제하면 안 된다. `--weight-subtle: 450`을 만들어
  // `font-weight: var(--weight-subtle)`로 쓰면 막으려던 바로 그 값이 조용히 통과한다.
  // 그래서 토큰의 '값'까지 따라가 검사한다.
  //
  // legal.css도 같이 훑는다. 위의 -apple-system 검사와 같은 이유다. 이 검사가 styles.css만
  // 보던 동안 `label { font-weight: 750 }`이 조용히 살아남아 있었다.
  // 계약이 750을 지운 근거는 "폴백 글꼴(맑은 고딕, Apple SD Gothic Neo)에 750이 없어 어차피
  // 700으로 스냅되니 의미 없는 변주"였는데, Task 7이 이 파일을 Pretendard **Variable**로
  // 옮기면서 그 전제가 사라졌다 — 가변 글꼴은 750을 그대로 그린다. 안 보이던 위반이
  // 이제 보이는 위반이 됐다.
  const allowed = new Set(["400", "500", "600", "700", "800", "900", "inherit"]);
  const badTokens = [];
  const bad = [];

  // 파일마다 토큰 표를 따로 만든다. 법적 고지 4개 페이지는 styles.css를 링크하지 않으므로
  // (privacy/terms/support/delete-account → pretendard-variable.css + legal.css 뿐)
  // 저쪽 --weight-* 토큰이 여기서는 해석되지 않는다. 파일 안에서 선언된 것만 유효하다.
  for (const file of ["styles.css", "legal.css"]) {
    const css = fs.readFileSync(file, "utf8");
    const lineOf = (index) => css.slice(0, index).split(/\r?\n/).length;

    const tokenValues = new Map(
      [...css.matchAll(/(--weight-[a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
    );
    for (const [token, value] of tokenValues) {
      if (!allowed.has(value)) badTokens.push(`${file}: ${token}: ${value}`);
    }

    for (const match of css.matchAll(/font-weight:\s*([^;\n}]+)/g)) {
      const value = match[1].trim();
      const where = `${file}:${lineOf(match.index)}`;
      const reference = value.match(/^var\((--weight-[a-z-]+)\)$/);
      if (reference) {
        // 선언되지 않은 토큰을 참조하면 그 규칙은 굵기가 없는 것과 같다. 오타를 잡는다.
        if (!tokenValues.has(reference[1])) bad.push(`${where}: ${value} — 선언되지 않은 토큰`);
        continue;
      }
      if (!allowed.has(value)) bad.push(`${where}: ${value}`);
    }
  }

  assert.deepEqual(badTokens, [], "6단계 밖의 값을 가진 --weight-* 토큰");
  assert.deepEqual(bad, [], "6단계 밖의 font-weight");
});
