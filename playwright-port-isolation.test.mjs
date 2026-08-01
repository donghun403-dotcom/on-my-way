import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const configPath = require.resolve("./playwright.config.js");
const serveLocalSource = readFileSync(new URL("./serve-local.cjs", import.meta.url), "utf8");

const PORT_ENV_KEYS = ["PORT", "E2E_PORT", "E2E_BASE_URL", "CI"];

/* worktree를 여러 개 굴리므로 설정 파일이 로드 시점의 env를 읽는다.
   permutation마다 require 캐시를 비워 새 env로 다시 평가시킨다. */
function loadConfig(env = {}) {
  const previous = {};
  for (const key of PORT_ENV_KEYS) {
    previous[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    delete require.cache[configPath];
    return require(configPath);
  } finally {
    for (const key of PORT_ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    delete require.cache[configPath];
  }
}

test("기본값은 8765이고 baseURL·webServer.url·webServer.env.PORT가 모두 같은 포트를 가리킨다", () => {
  const config = loadConfig();
  assert.equal(config.use.baseURL, "http://127.0.0.1:8765");
  assert.equal(config.webServer.url, "http://127.0.0.1:8765/index.html");
  assert.equal(config.webServer.env.PORT, "8765");
});

test("PORT를 주면 baseURL과 webServer가 함께 그 포트로 옮겨간다", () => {
  const config = loadConfig({ PORT: "8899" });
  assert.equal(config.use.baseURL, "http://127.0.0.1:8899");
  assert.equal(config.webServer.url, "http://127.0.0.1:8899/index.html");
  assert.equal(config.webServer.env.PORT, "8899");
});

test("E2E_PORT도 같은 방식으로 포트를 옮긴다", () => {
  const config = loadConfig({ E2E_PORT: "8901" });
  assert.equal(config.use.baseURL, "http://127.0.0.1:8901");
  assert.equal(config.webServer.url, "http://127.0.0.1:8901/index.html");
  assert.equal(config.webServer.env.PORT, "8901");
});

test("PORT가 E2E_PORT보다 우선한다 (serve-local.cjs와 같은 순서)", () => {
  const config = loadConfig({ PORT: "8902", E2E_PORT: "8903" });
  assert.equal(config.use.baseURL, "http://127.0.0.1:8902");
  assert.equal(config.webServer.env.PORT, "8902");
});

/* 이 테스트가 이번 회귀의 핵심이다. 셋 중 하나라도 어긋나면 Playwright가
   테스트하는 포트와 serve-local.cjs가 바인딩하는 포트가 갈라진다. */
test("어떤 포트에서도 테스트 대상과 서버 바인딩 포트가 갈라지지 않는다", () => {
  for (const port of ["8765", "8899", "9100", "3000"]) {
    const config = loadConfig({ PORT: port });
    const baseUrlPort = new URL(config.use.baseURL).port;
    const webServerPort = new URL(config.webServer.url).port;
    assert.equal(baseUrlPort, port);
    assert.equal(webServerPort, port);
    assert.equal(config.webServer.env.PORT, port);
  }
});

/* 다른 worktree가 이미 그 포트를 쓰고 있으면 조용히 남의 서버에 붙는 대신
   Playwright가 "already used" 오류로 멈춰야 한다. */
test("이미 떠 있는 서버를 말없이 재사용하지 않는다", () => {
  assert.equal(loadConfig().webServer.reuseExistingServer, false);
  assert.equal(loadConfig({ PORT: "8899" }).webServer.reuseExistingServer, false);
});

test("E2E_BASE_URL을 주면 외부 서버만 쓰고 webServer를 띄우지 않는다", () => {
  const config = loadConfig({ E2E_BASE_URL: "https://preview.example.com" });
  assert.equal(config.use.baseURL, "https://preview.example.com");
  assert.equal(config.webServer, undefined);
});

test("E2E_BASE_URL은 PORT가 함께 있어도 그대로 이긴다", () => {
  const config = loadConfig({ E2E_BASE_URL: "https://preview.example.com", PORT: "8899" });
  assert.equal(config.use.baseURL, "https://preview.example.com");
  assert.equal(config.webServer, undefined);
});

/* 설정이 넘기는 환경변수 이름과 기본값이 serve-local.cjs가 읽는 것과 같아야 한다. */
test("serve-local.cjs가 설정과 같은 PORT 변수와 같은 기본 포트를 읽는다", () => {
  assert.match(serveLocalSource, /process\.env\.PORT/);
  assert.match(serveLocalSource, /8765/);
});
