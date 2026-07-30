import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ALWAYS_REQUIRED_BINDINGS,
  VERIFIED_BINDINGS,
  checkBindingInvariants,
  describeBindings,
  paymentsIntended,
} from "./binding-health.mjs";
import {
  EXPECTED_DURABLE_MIGRATIONS,
  EXPECTED_DURABLE_OBJECTS,
  generateStagingConfig,
  repositoryRateLimitNamespaceIds,
  validateGeneratedStagingConfig,
} from "./.github/scripts/staging-config.mjs";

const kvStub = () => ({ get() {}, put() {}, delete() {} });
const doStub = () => ({ idFromName() {}, get() {} });
const rateLimiterStub = () => ({ limit() {} });
const d1Stub = () => ({ prepare() {} });
const assetsStub = () => ({ fetch() {} });

function fullEnv(overrides = {}) {
  return {
    USERS_KV: kvStub(),
    ENERGY_LEDGER: doStub(),
    AI_RATE_LIMITER: rateLimiterStub(),
    BILLING_DB: d1Stub(),
    ASSETS: assetsStub(),
    ...overrides,
  };
}

const healthFrom = (env) => ({ bindings: describeBindings(env), paymentsEnabled: paymentsIntended(env) });

/* ---------- describeBindings ---------- */

test("바인딩 보고는 다섯 자리를 모두 불리언으로 낸다", () => {
  const report = describeBindings(fullEnv());
  assert.deepEqual(Object.keys(report).sort(), [...VERIFIED_BINDINGS].sort());
  for (const [name, value] of Object.entries(report)) {
    assert.equal(typeof value, "boolean", `${name}은 불리언이어야 한다`);
    assert.equal(value, true, name);
  }
});

test("빠진 바인딩은 false로 보고된다", () => {
  assert.equal(describeBindings(fullEnv({ ENERGY_LEDGER: undefined })).ENERGY_LEDGER, false);
  assert.equal(describeBindings({}).USERS_KV, false);
  assert.equal(describeBindings(undefined).ASSETS, false);
});

/* 이름은 맞는데 다른 타입이 꽂힌 경우. truthy 검사만 하면 통과해 버리고, 그때
   실패는 배포가 아니라 첫 요청에서 난다. */
test("이름만 맞고 모양이 다른 바인딩은 false다", () => {
  assert.equal(describeBindings(fullEnv({ ENERGY_LEDGER: kvStub() })).ENERGY_LEDGER, false);
  assert.equal(describeBindings(fullEnv({ BILLING_DB: kvStub() })).BILLING_DB, false);
  assert.equal(describeBindings(fullEnv({ ASSETS: "https://example.test" })).ASSETS, false);
});

/* 보고에 값이 새면 안 된다 — health는 공개 엔드포인트다. */
test("보고에는 값·ID·시크릿이 실리지 않는다", () => {
  const env = fullEnv({
    USERS_KV: Object.assign(kvStub(), { id: "04d136e6bcef4de7bb8a515856dd48f6" }),
    SESSION_SECRET: "super-secret-value",
    TOSS_SECRET_KEY: "sk_live_do_not_leak",
  });
  const serialized = JSON.stringify(healthFrom(env));
  assert.equal(serialized.includes("04d136e6"), false);
  assert.equal(serialized.includes("super-secret-value"), false);
  assert.equal(serialized.includes("sk_live"), false);
});

/* ---------- paymentsIntended ---------- */

test("결제 의도는 플래그만 본다", () => {
  assert.equal(paymentsIntended({ PAYMENTS_ENABLED: "true" }), true);
  assert.equal(paymentsIntended({ PAYMENTS_ENABLED: "TRUE" }), true);
  assert.equal(paymentsIntended({ PAYMENTS_ENABLED: "false" }), false);
  assert.equal(paymentsIntended({ PAYMENTS_ENABLED: "1" }), false, "값을 좁게 본다");
  assert.equal(paymentsIntended({}), false);
  assert.equal(paymentsIntended(undefined), false);
});

/* ---------- 불변식 ---------- */

test("다섯 자리가 모두 해석되면 통과한다", () => {
  assert.deepEqual(checkBindingInvariants(healthFrom(fullEnv())), { ok: true, failures: [] });
});

test("ENERGY_LEDGER가 없으면 결제와 무관하게 실패한다", () => {
  const result = checkBindingInvariants(healthFrom(fullEnv({ ENERGY_LEDGER: undefined })));
  assert.equal(result.ok, false);
  assert.equal(result.failures.some((line) => line.startsWith("ENERGY_LEDGER")), true);
});

test("항상 필요한 네 자리 각각이 단독으로 배포를 막는다", () => {
  for (const name of ALWAYS_REQUIRED_BINDINGS) {
    const result = checkBindingInvariants(healthFrom(fullEnv({ [name]: undefined })));
    assert.equal(result.ok, false, `${name}이 빠졌는데 통과했다`);
  }
});

/* 결제를 켜기 전에는 BILLING_DB가 없어도 배포를 막지 않는다. 지금 production이
   그 상태다 — 이 조건부가 없으면 W1이 production 배포를 즉시 깨뜨린다. */
test("BILLING_DB는 결제가 꺼져 있으면 없어도 통과한다", () => {
  const env = fullEnv({ BILLING_DB: undefined, PAYMENTS_ENABLED: "false" });
  assert.equal(checkBindingInvariants(healthFrom(env)).ok, true);
});

test("결제를 켜는 순간 BILLING_DB 요구가 스스로 무장된다", () => {
  const env = fullEnv({ BILLING_DB: undefined, PAYMENTS_ENABLED: "true" });
  const result = checkBindingInvariants(healthFrom(env));
  assert.equal(result.ok, false);
  assert.equal(result.failures.some((line) => line.includes("BILLING_DB")), true);
});

/* 구버전 배포본에 새 검증기를 걸면 bindings가 없다. 조용히 통과시키면
   검증을 붙인 의미가 없어진다. */
test("bindings가 없는 응답은 통과하지 않는다", () => {
  assert.equal(checkBindingInvariants({ environment: "production" }).ok, false);
  assert.equal(checkBindingInvariants(null).ok, false);
  assert.equal(checkBindingInvariants("nope").ok, false);
});

test("보고되지 않은 자리는 위반으로 센다", () => {
  const health = { bindings: { USERS_KV: true }, paymentsEnabled: false };
  const result = checkBindingInvariants(health);
  assert.equal(result.ok, false);
  assert.equal(result.failures.some((line) => line.includes("ENERGY_LEDGER")), true);
});

/* ---------- staging 생성기의 Durable Object 검증 (B-3) ---------- */

const STAGING_FIXTURE_RESOURCES = Object.freeze({
  usersKvId: "1111111111111111111111111111aaaa",
  billingDatabaseId: "22222222-3333-4444-5555-666666666666",
  rateLimitNamespaceId: "90001",
});

function generatedStagingConfig() {
  const base = JSON.parse(readFileSync(new URL("./wrangler.staging.jsonc", import.meta.url), "utf8"));
  const preview = JSON.parse(readFileSync(new URL("./wrangler.preview.jsonc", import.meta.url), "utf8"));
  const production = JSON.parse(readFileSync(new URL("./wrangler.production.jsonc", import.meta.url), "utf8"));
  const known = repositoryRateLimitNamespaceIds(preview, production);
  return { config: generateStagingConfig(base, STAGING_FIXTURE_RESOURCES, known), known };
}

test("생성된 staging 설정은 그대로 검증을 통과한다", () => {
  const { config, known } = generatedStagingConfig();
  assert.doesNotThrow(() => validateGeneratedStagingConfig(config, known));
});

/* 전에는 GUEST_PLAN_DRAFTS로 필터한 뒤 개수를 세서, ENERGY_LEDGER가 통째로 빠져도
   검증이 통과했다. 이 테스트가 그 회귀를 막는다. */
test("ENERGY_LEDGER 바인딩이 빠지면 staging 검증이 실패한다", () => {
  const { config, known } = generatedStagingConfig();
  config.durable_objects.bindings = config.durable_objects.bindings
    .filter((binding) => binding.name !== "ENERGY_LEDGER");
  assert.throws(() => validateGeneratedStagingConfig(config, known), /ENERGY_LEDGER/);
});

test("energy-ledger-v1 마이그레이션이 빠지면 staging 검증이 실패한다", () => {
  const { config, known } = generatedStagingConfig();
  config.migrations = config.migrations.filter((migration) => migration.tag !== "energy-ledger-v1");
  assert.throws(() => validateGeneratedStagingConfig(config, known), /energy-ledger-v1/);
});

/* 검증기가 모르는 DO는 검증되지 않은 DO다. 새 클래스를 추가하면 기대 집합을
   갱신하지 않는 한 배포가 막혀야 한다. */
test("검증기가 모르는 DO를 추가하면 staging 검증이 실패한다", () => {
  const { config, known } = generatedStagingConfig();
  config.durable_objects.bindings.push({ name: "BRAND_NEW_THING", class_name: "BrandNewObject" });
  config.migrations.push({ tag: "brand-new-v1", new_sqlite_classes: ["BrandNewObject"] });
  assert.throws(() => validateGeneratedStagingConfig(config, known), /BRAND_NEW_THING|brand-new-v1/);
});

test("DO 바인딩의 클래스 이름이 바뀌면 staging 검증이 실패한다", () => {
  const { config, known } = generatedStagingConfig();
  const ledger = config.durable_objects.bindings.find((binding) => binding.name === "ENERGY_LEDGER");
  ledger.class_name = "SomethingElseObject";
  assert.throws(() => validateGeneratedStagingConfig(config, known), /ENERGY_LEDGER/);
});

/* 기대 집합이 배포 설정과 어긋나면 어느 쪽이 맞는지 알 수 없다. 한쪽만 고치는 것을 막는다. */
test("기대 집합은 실제 배포 설정과 일치한다", () => {
  for (const file of ["wrangler.jsonc", "wrangler.preview.jsonc", "wrangler.staging.jsonc", "wrangler.production.jsonc"]) {
    const config = JSON.parse(readFileSync(new URL(`./${file}`, import.meta.url), "utf8"));
    const actual = Object.fromEntries((config.durable_objects?.bindings || [])
      .map((binding) => [binding.name, binding.class_name]));
    assert.deepEqual(actual, { ...EXPECTED_DURABLE_OBJECTS }, file);
    const tags = Object.fromEntries((config.migrations || [])
      .map((migration) => [migration.tag, migration.new_sqlite_classes]));
    assert.deepEqual(tags, { ...EXPECTED_DURABLE_MIGRATIONS }, file);
  }
});

/* ---------- B-4 ---------- */

test("네 설정 모두 로컬 산출물 디렉터리를 자산에서 제외한다", () => {
  for (const file of ["wrangler.jsonc", "wrangler.preview.jsonc", "wrangler.staging.jsonc", "wrangler.production.jsonc"]) {
    const raw = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    // 이 파일들은 jq와 JSON.parse가 그대로 읽는다 — 주석을 넣으면 배포가 깨진다.
    const config = JSON.parse(raw);
    assert.ok(
      (config.assets?.exclude || []).includes(".codex-artifacts"),
      `${file}: assets.exclude에 .codex-artifacts가 있어야 한다`,
    );
  }
});
