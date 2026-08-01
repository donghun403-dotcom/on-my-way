import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* 라우트를 걷어내면 그 라우트만 쓰던 모듈이 남는다. 2026-07-28에 게스트 AI 라우트를
   제거했을 때 ai-goal-plan.mjs(386줄)가 그렇게 남아 아무도 모르게 9일을 버텼다.
   테스트는 통과했다 — 자기 테스트가 자기를 살아있게 만들었기 때문이다.

   그래서 "테스트가 참조한다"를 살아있음의 근거로 치지 않는다. 진짜 진입점에서
   도달할 수 있어야 살아있는 것이다. */

// 실제로 실행되는 것들. 테스트 파일은 진입점이 아니다.
const ENTRIES = [
  "worker.mjs",        // wrangler main
  "serve-local.cjs",   // 로컬 개발 서버
  "script.js",         // 클라이언트
  "core-loop-v2.js",
  "sample-diary-book.js",
  "account-delete.js",
  "scripts/deploy-production.cjs",
];

/* 도구 설정 파일은 모듈 그래프 밖에서 각자의 러너가 읽는다. */
const TOOL_CONFIGS = new Set(["playwright.config.js"]);

/* `*-fixture.mjs`는 테스트가 쓰는 표본 데이터다. 프로덕션에서 닿지 않는 게 정상이라
   여기서 제외한다. 대신 어느 테스트도 안 쓰는 fixture는 아래에서 따로 잡는다. */
const isFixture = (f) => /-fixture\.(mjs|js|cjs)$/.test(f);

/* 상대 경로 지정자만 따라간다. `import x from "pkg"`는 대상이 아니다.
   동적 import("./x")도 잡아야 한다 — serve-local.cjs가 그렇게 쓴다. */
const SPECIFIER = /(?:\bfrom\s*|(?:^|[^.\w])import\s*|\brequire\s*)\(?\s*["'](\.[^"']+)["']/g;

function reachableFrom(root, entries) {
  const seen = new Set();
  const queue = [];
  const push = (rel) => {
    const norm = rel.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!seen.has(norm)) { seen.add(norm); queue.push(norm); }
  };
  for (const e of entries) if (fs.existsSync(path.join(root, e))) push(e);

  while (queue.length) {
    const rel = queue.shift();
    let source;
    try { source = fs.readFileSync(path.join(root, rel), "utf8"); } catch { continue; }
    for (const match of source.matchAll(SPECIFIER)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), match[1]));
      for (const candidate of [target, `${target}.mjs`, `${target}.js`, `${target}.cjs`]) {
        const abs = path.join(root, candidate);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) { push(candidate); break; }
      }
    }
  }
  return seen;
}

test("저장소 루트의 모든 모듈은 실제 진입점에서 도달할 수 있다", () => {
  const root = process.cwd();
  const reachable = reachableFrom(root, ENTRIES);
  const orphans = fs.readdirSync(root)
    .filter((f) => /\.(mjs|js|cjs)$/.test(f))
    .filter((f) => !/\.test\.(mjs|js|cjs)$/.test(f))
    .filter((f) => !TOOL_CONFIGS.has(f))
    .filter((f) => !isFixture(f))
    .filter((f) => !reachable.has(f));

  assert.deepEqual(orphans, [], `진입점에서 닿지 않는 모듈: ${orphans.join(", ")}`);
});

test("fixture는 최소한 어느 테스트에는 쓰인다", () => {
  // 위 검사에서 fixture를 빼줬으니, 아무도 안 쓰는 fixture가 그 틈으로 숨지 않게 막는다.
  const root = process.cwd();
  const files = fs.readdirSync(root);
  const tests = files.filter((f) => /\.test\.(mjs|js|cjs)$/.test(f))
    .map((f) => fs.readFileSync(path.join(root, f), "utf8"))
    .join("\n");
  const unused = files.filter(isFixture)
    .filter((f) => !tests.includes(f.replace(/\.(mjs|js|cjs)$/, "")));

  assert.deepEqual(unused, [], `어느 테스트도 쓰지 않는 fixture: ${unused.join(", ")}`);
});

test("진입점 목록 자체가 낡지 않았다", () => {
  // 진입점이 사라지면 위 검사가 조용히 헐거워진다. 존재를 못 박는다.
  const missing = ENTRIES.filter((e) => !fs.existsSync(path.join(process.cwd(), e)));
  assert.deepEqual(missing, [], `사라진 진입점: ${missing.join(", ")}`);
});
