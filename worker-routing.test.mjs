import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker from "./worker.mjs";

async function readWranglerConfig(name) {
  return JSON.parse(await readFile(new URL(name, import.meta.url), "utf8"));
}

function guestAiHealthFixture(overrides = {}) {
  let limiterCalls = 0;
  return {
    env: {
      APP_ENV: "test",
      USERS_KV: {
        async get() { return null; },
        async put() {},
      },
      OPENAI_API_KEY: "fixture-ai-key",
      SESSION_SECRET: "fixture-session-secret-that-is-long-enough",
      AI_RATE_LIMITER: {
        async limit() {
          limiterCalls += 1;
          return { success: true };
        },
      },
      GUEST_PLAN_DRAFTS: {
        idFromName(name) { return name; },
        get() { return { async fetch() { return new Response(); } }; },
      },
      PAYMENTS_ENABLED: "false",
      ...overrides,
    },
    limiterCalls: () => limiterCalls,
  };
}

test("Production과 Preview는 저장소 루트 자산에 SPA fallback을 적용한다", async () => {
  for (const name of ["wrangler.jsonc", "wrangler.preview.jsonc", "wrangler.production.jsonc"]) {
    const config = await readWranglerConfig(name);
    assert.equal(config.assets.directory, ".");
    assert.equal(config.assets.binding, "ASSETS");
    assert.equal(config.assets.run_worker_first, true);
    assert.equal(config.assets.html_handling, "none");
    assert.equal(config.assets.not_found_handling, "single-page-application");
  }
});

test("운영 배포 설정만 사용자 도메인과 운영 환경을 소유한다", async () => {
  const nonproduction = await readWranglerConfig("wrangler.jsonc");
  const preview = await readWranglerConfig("wrangler.preview.jsonc");
  const production = await readWranglerConfig("wrangler.production.jsonc");
  assert.equal(nonproduction.vars.APP_ENV, "preview");
  assert.equal(preview.vars.APP_ENV, "preview");
  assert.equal(nonproduction.routes, undefined);
  assert.equal(preview.routes, undefined);
  assert.equal(production.vars.APP_ENV, "production");
  assert.equal(production.routes[0].pattern, "onmyway.olivenrich.com");
  assert.equal(production.vars.PAYMENTS_ENABLED, "false");
});

test("상태 점검 API는 비밀값 없이 운영 의존성 준비 여부를 반환한다", async () => {
  const fixture = guestAiHealthFixture({
    APP_ENV: "production",
    TOSS_CLIENT_KEY: "client-key",
    TOSS_SECRET_KEY: "secret-toss-key",
  });
  const response = await worker.fetch(new Request("https://onmyway.olivenrich.com/api/health"), {
    ...fixture.env,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.services, { accountStorage: true, ai: true, payments: false });
  assert.equal(JSON.stringify(body).includes("secret"), false);
  assert.equal(fixture.limiterCalls(), 0);
});

test("health AI readiness matches the dependencies required by guest preview and revision", async () => {
  const cases = [
    { name: "API key only", overrides: { AI_RATE_LIMITER: null, GUEST_PLAN_DRAFTS: null, SESSION_SECRET: "" } },
    { name: "limiter missing", overrides: { AI_RATE_LIMITER: null } },
    { name: "Durable Object missing", overrides: { GUEST_PLAN_DRAFTS: null } },
    { name: "account storage missing", overrides: { USERS_KV: null } },
    { name: "server secret missing", overrides: { SESSION_SECRET: "" } },
    { name: "server secret invalid", overrides: { SESSION_SECRET: "short" } },
  ];

  for (const entry of cases) {
    const fixture = guestAiHealthFixture(entry.overrides);
    const response = await worker.fetch(new Request("https://staging.example/api/health"), fixture.env);
    const body = await response.json();
    assert.equal(body.services.ai, false, entry.name);
    assert.equal(fixture.limiterCalls(), 0, entry.name);
    assert.deepEqual(Object.keys(body.services).sort(), ["accountStorage", "ai", "payments"]);
  }

  const ready = guestAiHealthFixture();
  let providerCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    providerCalls += 1;
    throw new Error("health must not call the AI provider");
  };
  try {
    const response = await worker.fetch(new Request("https://staging.example/api/health"), ready.env);
    assert.equal((await response.json()).services.ai, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(providerCalls, 0);
  assert.equal(ready.limiterCalls(), 0);
});

test("상태 점검 API는 결제 비활성 상태에서 Toss 키를 공개하지 않는다", async () => {
  const response = await worker.fetch(new Request("https://on-my-way-pr-10.jungslawyer.workers.dev/api/health"), {
    APP_ENV: "preview",
    USERS_KV: {},
    TOSS_CLIENT_KEY: "test_ck_TEST_FIXTURE",
    TOSS_SECRET_KEY: "test_sk_TEST_FIXTURE",
    PAYMENTS_ENABLED: "false",
  });
  const body = await response.json();
  assert.equal(body.services.payments, false);
  assert.equal(JSON.stringify(body).includes("TEST_FIXTURE"), false);
  assert.equal(JSON.stringify(body).includes("TOSS_SECRET_KEY"), false);
});

test("상태 점검 API는 테스트·라이브 키 혼용을 활성 결제로 판정하지 않는다", async () => {
  const response = await worker.fetch(new Request("https://on-my-way-pr-10.jungslawyer.workers.dev/api/health"), {
    APP_ENV: "preview",
    USERS_KV: {},
    TOSS_CLIENT_KEY: "test_ck_TEST_FIXTURE",
    TOSS_SECRET_KEY: "live_sk_TEST_FIXTURE",
    PAYMENTS_ENABLED: "true",
  });
  const body = await response.json();
  assert.equal(body.services.payments, false);
  assert.equal(JSON.stringify(body).includes("TEST_FIXTURE"), false);
});

test("알 수 없는 API 경로는 SPA 자산으로 전달하지 않고 JSON 404를 반환한다", async () => {
  let assetFetches = 0;
  const response = await worker.fetch(new Request("https://onmyway.olivenrich.com/api/does-not-exist"), {
    ASSETS: {
      async fetch() {
        assetFetches += 1;
        return new Response("index", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  assert.equal(assetFetches, 0);
});

test("법적 페이지는 hostname과 무관하게 전용 HTML 자산으로 전달한다", async () => {
  const seen = [];
  const env = {
    ASSETS: {
      async fetch(request) {
        seen.push(new URL(request.url).pathname);
        return new Response("<!doctype html><title>On My Way</title>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
    },
  };

  for (const hostname of ["on-my-way.jungslawyer.workers.dev", "onmyway.olivenrich.com"]) {
    for (const pathname of ["/privacy", "/terms", "/support", "/delete-account"]) {
      const response = await worker.fetch(new Request(`https://${hostname}${pathname}`), env);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /On My Way/);
    }
  }
  assert.deepEqual(seen, [
    "/privacy.html", "/terms.html", "/support.html", "/delete-account.html",
    "/privacy.html", "/terms.html", "/support.html", "/delete-account.html",
  ]);
});

test("루트와 앱 진입점은 HTML 파일 URL을 바꾸지 않고 명시적으로 반환한다", async () => {
  const seen = [];
  const env = {
    ASSETS: {
      async fetch(request) {
        seen.push(new URL(request.url).pathname);
        return new Response("<!doctype html><title>On My Way</title>", { status: 200 });
      },
    },
  };

  for (const pathname of ["/", "/app"]) {
    const response = await worker.fetch(new Request(`https://onmyway.olivenrich.com${pathname}`), env);
    assert.equal(response.status, 200);
  }

  assert.deepEqual(seen, ["/index.html", "/app.html"]);
});

test("plan-policy 모듈은 정적 자산으로 포함되고 서버 모듈 패턴의 예외로 지정된다", async () => {
  const assetsIgnore = await readFile(new URL(".assetsignore", import.meta.url), "utf8");
  assert.match(assetsIgnore, /^\*\.mjs$/m);
  assert.match(assetsIgnore, /^!plan-policy\.mjs$/m);
});

test("누락된 모듈·스크립트·스타일 요청은 SPA HTML fallback 대신 404를 반환한다", async () => {
  for (const pathname of ["/missing.mjs", "/missing.js", "/missing.css"]) {
    const response = await worker.fetch(new Request(`https://onmyway.olivenrich.com${pathname}`), {
      ASSETS: {
        async fetch() {
          return new Response("<!doctype html><html></html>", {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        },
      },
    });
    assert.equal(response.status, 404, pathname);
    assert.match(response.headers.get("content-type") || "", /text\/plain/);
  }
});

test("정상 plan-policy 모듈 응답은 HTML fallback 검사 없이 전달한다", async () => {
  const response = await worker.fetch(new Request("https://onmyway.olivenrich.com/plan-policy.mjs"), {
    ASSETS: {
      async fetch() {
        return new Response('export const POLICY_VERSION = "test";', {
          status: 200,
          headers: { "Content-Type": "application/javascript; charset=utf-8" },
        });
      },
    },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /javascript/);
  assert.match(await response.text(), /^export const/);
});
