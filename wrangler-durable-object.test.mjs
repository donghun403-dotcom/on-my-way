import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONFIG_FILES = [
  "wrangler.jsonc",
  "wrangler.preview.jsonc",
  "wrangler.staging.jsonc",
  "wrangler.production.jsonc",
];

async function config(file) {
  return JSON.parse(await readFile(new URL(file, import.meta.url), "utf8"));
}

test("모든 Worker 환경은 같은 SQLite GuestPlanDraftObject binding과 migration을 사용한다", async () => {
  for (const file of CONFIG_FILES) {
    const value = await config(file);
    assert.deepEqual(value.durable_objects?.bindings, [{
      name: "GUEST_PLAN_DRAFTS",
      class_name: "GuestPlanDraftObject",
    }], file);
    assert.deepEqual(value.migrations, [{
      tag: "guest-plan-drafts-v1",
      new_sqlite_classes: ["GuestPlanDraftObject"],
    }], file);
    assert.equal("exports" in value, false, `${file}: migrations와 exports를 혼용하지 않음`);
    assert.equal(value.vars.PAYMENTS_ENABLED, "false", file);
    assert.equal(value.vars.ALLOW_DEV_LOGIN, "false", file);
    assert.equal(value.vars.ALLOW_DEMO_BILLING, "false", file);
    assert.equal(value.vars.APPLE_LOGIN_VISIBLE, "false", file);
  }
});

test("Production route, KV, rate limiter, cron은 Durable Object 추가 전 계약을 유지한다", async () => {
  const production = await config("wrangler.production.jsonc");
  assert.deepEqual(production.routes, [{ pattern: "onmyway.olivenrich.com", custom_domain: true }]);
  assert.equal(production.kv_namespaces?.[0]?.binding, "USERS_KV");
  assert.equal(production.ratelimits?.[0]?.name, "AI_RATE_LIMITER");
  assert.deepEqual(production.triggers?.crons, ["15 0 * * *"]);
});
