import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.mjs";

/* 서버가 계획을 만들던 AI 라우트를 모두 걷어냈다. 온보딩은 수동 빌더가 처리하고,
   회원의 계획 생성(goal-plan)도 클라이언트 호출자가 사라져 함께 제거했다.
   이 스펙은 그 라우트들이 "조용히 다른 핸들러로 흘러가지 않는다"를 고정한다:
   /api/ 아래 경로는 정적 자산으로 폴백하지 않고 JSON 404로 끝나야 한다.
   (기존 guest-ai-preview.test.mjs를 대체한다) */

const REMOVED_ROUTES = [
  "/api/ai/goal-analyze",
  "/api/ai/goal-preview",
  "/api/ai/goal-draft/revise",
  "/api/ai/goal-draft/claim",
  "/api/ai/goal-plan",
];

// 라우트가 살아 있었다면 반드시 건드렸을 바인딩들. 하나라도 호출되면 실패한다.
function removalFixture() {
  const touched = { assets: 0, limiter: 0, drafts: 0, kv: 0 };
  return {
    touched,
    env: {
      APP_ENV: "test",
      OPENAI_API_KEY: "fixture-ai-key",
      SESSION_SECRET: "fixture-session-secret-that-is-long-enough",
      USERS_KV: {
        async get() { touched.kv += 1; return null; },
        async put() { touched.kv += 1; },
      },
      AI_RATE_LIMITER: {
        async limit() { touched.limiter += 1; return { success: true }; },
      },
      GUEST_PLAN_DRAFTS: {
        idFromName(name) { touched.drafts += 1; return name; },
        get() { touched.drafts += 1; return { async fetch() { return new Response(); } }; },
      },
      ASSETS: {
        async fetch() { touched.assets += 1; return new Response("<!doctype html>", { status: 200, headers: { "Content-Type": "text/html" } }); },
      },
    },
  };
}

test("제거한 게스트 온보딩 라우트는 JSON 404로 끝나고 정적 자산으로 폴백하지 않는다", async () => {
  for (const route of REMOVED_ROUTES) {
    for (const method of ["POST", "GET"]) {
      const fixture = removalFixture();
      const response = await worker.fetch(
        new Request(`https://onmyway.olivenrich.com${route}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: method === "POST" ? JSON.stringify({ goalText: "토익 900점" }) : undefined,
        }),
        fixture.env,
      );

      assert.equal(response.status, 404, `${method} ${route}`);
      assert.match(response.headers.get("content-type") || "", /application\/json/, `${method} ${route}`);
      assert.equal(fixture.touched.assets, 0, `${method} ${route} must not serve a static asset`);
      assert.equal(fixture.touched.drafts, 0, `${method} ${route} must not reach the draft Durable Object`);
      assert.equal(fixture.touched.limiter, 0, `${method} ${route} must not consume the rate limiter`);
    }
  }
});

test("남아 있는 AI 라우트는 로그인 없이는 401로 막히고 게스트 우회 경로가 없다", async () => {
  const stillRouted = [
    "/api/ai/companion-chat",
    "/api/ai/plan-revision",
    "/api/ai/recovery-plan",
    "/api/ai/reschedule-plan",
  ];

  for (const route of stillRouted) {
    const fixture = removalFixture();
    const response = await worker.fetch(
      new Request(`https://onmyway.olivenrich.com${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      fixture.env,
    );
    const body = await response.json();
    assert.equal(response.status, 401, route);
    assert.equal(body.code, "AUTH_REQUIRED", route);
    assert.equal(fixture.touched.assets, 0, route);
  }
});

test("게스트 초안 Durable Object 클래스는 wrangler 마이그레이션을 위해 계속 내보낸다", async () => {
  const module = await import("./worker.mjs");
  assert.equal(typeof module.GuestPlanDraftObject, "function");
});
