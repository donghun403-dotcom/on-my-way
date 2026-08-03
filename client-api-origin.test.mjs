import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* 네이티브 셸은 번들 구성에서 WebView origin이 `https://localhost`라, 상대 경로 API 호출이
   Capacitor 로컬 서버로 들어가 워커에 닿지 않는다. 실기기 2회차에서 직접 관측했다 —
   `/api/*`가 상대·절대 가릴 것 없이 번들 `index.html`로 돌아왔다.

   그래서 클라이언트의 API 호출은 전부 `apiUrl()`을 지나야 한다. 이 파일이 지키는 것은
   두 가지다.

     ① 상대 경로 API 호출이 새로 들어오지 않는다 — 들어오면 셸에서만 조용히 깨진다.
        웹에서는 멀쩡하므로 e2e도 유닛도 잡지 못한다. 그래서 소스를 직접 훑는다.
     ② `apiUrl()`이 웹에서는 인자를 그대로 돌려준다 — 웹 동작이 한 바이트도 바뀌지 않는다는
        약속이고, 이게 깨지면 모든 요청의 대상이 바뀐다. */

const CLIENT_FILES = ["script.js", "account-delete.js"];
const sources = new Map(CLIENT_FILES.map((file) => [file, readFileSync(file, "utf8")]));

/* `fetch("/api/…")` · `location.assign("/api/…")` 처럼 슬래시로 시작하는 API 경로를
   호출 인자로 바로 넘기는 형태를 찾는다. `apiUrl("/api/…")`은 그 안쪽이라 걸리지 않는다. */
const RELATIVE_CALL = /(?:fetch|assign|sendBeacon)\(\s*["'`]\/api\//g;

test("클라이언트에 상대 경로 API 호출이 남아 있지 않다", () => {
  for (const [file, source] of sources) {
    const hits = source.match(RELATIVE_CALL) || [];
    assert.deepEqual(
      hits,
      [],
      `${file}에 상대 경로 API 호출이 있다: ${hits.join(", ")}\n` +
        `apiUrl("/api/…")로 감싸세요. 감싸지 않으면 웹은 멀쩡하고 네이티브 셸에서만 깨집니다.`,
    );
  }
});

test("두 클라이언트 파일이 각자 API_ORIGIN을 정의한다", () => {
  for (const [file, source] of sources) {
    assert.ok(
      /const API_ORIGIN =/.test(source),
      `${file}에 API_ORIGIN 정의가 없다. 두 파일은 서로를 불러오지 않으므로 각자 있어야 한다.`,
    );
    assert.ok(/const apiUrl =/.test(source), `${file}에 apiUrl 정의가 없다.`);
  }
});

/* 실제 소스에서 그 두 줄을 꺼내 평가한다. 여기 식을 다시 적으면 테스트가 자기 자신을
   검사하게 되고, 제품 코드가 바뀌어도 통과한다. */
function loadApiUrl(source, capacitor) {
  const originLine = source.match(/^const API_ORIGIN = .+$/m)?.[0];
  const helperLine = source.match(/^const apiUrl = .+$/m)?.[0];
  assert.ok(originLine && helperLine, "API_ORIGIN·apiUrl 정의를 소스에서 찾지 못했다.");
  const factory = new Function("Capacitor", `${originLine}\n${helperLine}\nreturn { API_ORIGIN, apiUrl };`);
  const previous = globalThis.Capacitor;
  if (capacitor === undefined) delete globalThis.Capacitor;
  else globalThis.Capacitor = capacitor;
  try {
    return factory(capacitor);
  } finally {
    if (previous === undefined) delete globalThis.Capacitor;
    else globalThis.Capacitor = previous;
  }
}

test("웹에서는 apiUrl이 경로를 그대로 돌려준다", () => {
  for (const [file, source] of sources) {
    const { API_ORIGIN, apiUrl } = loadApiUrl(source, undefined);
    assert.equal(API_ORIGIN, "", `${file}: 웹에서 API_ORIGIN은 빈 문자열이어야 한다.`);
    assert.equal(apiUrl("/api/auth/me"), "/api/auth/me", `${file}: 웹 동작이 바뀌면 안 된다.`);
  }
});

test("네이티브 셸에서만 절대 URL이 된다", () => {
  const native = { isNativePlatform: () => true };
  for (const [file, source] of sources) {
    const { apiUrl } = loadApiUrl(source, native);
    assert.equal(apiUrl("/api/auth/me"), "https://onmyway.olivenrich.com/api/auth/me", `${file}`);
  }
});

/* Capacitor 브리지가 있어도 웹 플랫폼이면(예: `npx cap serve`) 상대 경로여야 한다.
   `isNativePlatform()`을 보는 이유가 이것이고, `window.Capacitor` 존재만 보면 틀린다. */
test("Capacitor가 있어도 네이티브가 아니면 상대 경로다", () => {
  const web = { isNativePlatform: () => false };
  for (const [file, source] of sources) {
    const { apiUrl } = loadApiUrl(source, web);
    assert.equal(apiUrl("/api/auth/me"), "/api/auth/me", `${file}`);
  }
});
