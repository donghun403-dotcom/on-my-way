import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  EXPECTED_AI_RATE_LIMIT_POLICY,
  STAGING_RATE_LIMIT_NAMESPACE_PLACEHOLDER,
  isPositiveIntegerNamespaceId,
} from "./.github/scripts/staging-config.mjs";

const CONFIG_FILES = [
  "wrangler.jsonc",
  "wrangler.preview.jsonc",
  "wrangler.staging.jsonc",
  "wrangler.production.jsonc",
];

async function config(file) {
  return JSON.parse(await readFile(new URL(file, import.meta.url), "utf8"));
}

test("모든 Worker 환경은 같은 SQLite Durable Object binding과 migration을 사용한다", async () => {
  for (const file of CONFIG_FILES) {
    const value = await config(file);
    assert.deepEqual(value.durable_objects?.bindings, [{
      // 에너지 원장은 유저별 단일 실행이 필요해 DO여야 한다 (KV에는 CAS가 없다).
      name: "ENERGY_LEDGER",
      class_name: "EnergyLedgerObject",
    }], file);
    /* migration은 태그가 붙은 누적 로그다. 게스트 초안 클래스를 없앴지만
       guest-plan-drafts-v1은 이미 적용된 태그라 목록에 남는다 — 과거 태그를 빼면
       원격이 적용한 것을 로컬이 선언하지 않는 상태가 되어 배포가 거부된다.
       삭제는 뒤에 붙인 deleted_classes 태그가 수행한다. */
    assert.deepEqual(value.migrations, [{
      tag: "guest-plan-drafts-v1",
      new_sqlite_classes: ["GuestPlanDraftObject"],
    }, {
      tag: "energy-ledger-v1",
      new_sqlite_classes: ["EnergyLedgerObject"],
    }, {
      tag: "guest-plan-drafts-v2-deleted",
      deleted_classes: ["GuestPlanDraftObject"],
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

test("Every AI-enabled Worker config defines the canonical rate limiter contract", async () => {
  const values = new Map();
  for (const file of CONFIG_FILES) {
    const value = await config(file);
    const bindings = (value.ratelimits || []).filter((binding) => binding.name === "AI_RATE_LIMITER");
    assert.equal(bindings.length, 1, `${file}: expected exactly one AI_RATE_LIMITER`);
    assert.deepEqual(bindings[0].simple, EXPECTED_AI_RATE_LIMIT_POLICY, file);
    if (file === "wrangler.staging.jsonc") {
      assert.equal(bindings[0].namespace_id, STAGING_RATE_LIMIT_NAMESPACE_PLACEHOLDER, file);
    } else {
      assert.equal(isPositiveIntegerNamespaceId(bindings[0].namespace_id), true, file);
    }
    values.set(file, bindings[0].namespace_id);
  }
  assert.notEqual(values.get("wrangler.staging.jsonc"), values.get("wrangler.preview.jsonc"));
  assert.notEqual(values.get("wrangler.staging.jsonc"), values.get("wrangler.production.jsonc"));
});

test("Durable Object config classes are exported by the Worker entry", async () => {
  // 바인딩된 클래스 이름이 Worker export와 정확히 맞아야 배포가 깨지지 않는다.
  const worker = await readFile(new URL("worker.mjs", import.meta.url), "utf8");
  assert.match(worker, /export\s*\{[^}]*\bEnergyLedgerObject\b[^}]*\}/);
  /* 삭제한 클래스는 반대로 export가 남아 있으면 안 된다. deleted_classes 태그와
     export가 공존하면 wrangler가 배포를 거부한다. */
  assert.doesNotMatch(worker, /\bGuestPlanDraftObject\b/);
});
