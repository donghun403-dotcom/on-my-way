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
