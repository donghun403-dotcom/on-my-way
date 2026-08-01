import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const STAGING_RATE_LIMIT_NAMESPACE_PLACEHOLDER = "0";
export const EXPECTED_AI_RATE_LIMIT_POLICY = Object.freeze({
  limit: 5,
  period: 60,
});

/* Durable Object 바인딩과 마이그레이션의 기대 집합. 새 DO를 추가하면 여기도 고쳐야
   staging 배포가 통과한다 — 이것이 의도다. 검증기가 모르는 DO는 검증되지 않은 DO다. */
export const EXPECTED_DURABLE_OBJECTS = Object.freeze({
  ENERGY_LEDGER: "EnergyLedgerObject",
});
/* 태그마다 "무엇을 하는가"를 적는다. 클래스를 없앨 때는 과거 태그를 지우는 게 아니라
   deleted_classes 태그를 뒤에 붙인다 — 이미 적용된 태그를 빼면 배포가 거부된다.
   그래서 만들지 않는 태그도 이 목록에 남는다. */
export const EXPECTED_DURABLE_MIGRATIONS = Object.freeze({
  "guest-plan-drafts-v1": { new_sqlite_classes: ["GuestPlanDraftObject"] },
  "energy-ledger-v1": { new_sqlite_classes: ["EnergyLedgerObject"] },
  "guest-plan-drafts-v2-deleted": { deleted_classes: ["GuestPlanDraftObject"] },
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sortedJoin(values) {
  return [...values].sort().join(", ");
}

function assertDurableObjects(config, label) {
  const bindings = config.durable_objects?.bindings || [];
  const actualNames = bindings.map((binding) => String(binding?.name || ""));
  invariant(
    new Set(actualNames).size === actualNames.length,
    `${label} contains duplicate Durable Object binding names`,
  );
  const expectedNames = Object.keys(EXPECTED_DURABLE_OBJECTS);
  invariant(
    sortedJoin(actualNames) === sortedJoin(expectedNames),
    `${label} Durable Object bindings must be exactly [${sortedJoin(expectedNames)}] but found [${sortedJoin(actualNames)}]`,
  );
  for (const binding of bindings) {
    const expectedClass = EXPECTED_DURABLE_OBJECTS[binding.name];
    invariant(
      binding.class_name === expectedClass,
      `${label} binding ${binding.name} must use class ${expectedClass} but found ${binding.class_name}`,
    );
  }

  const migrations = config.migrations || [];
  const actualTags = migrations.map((migration) => String(migration?.tag || ""));
  invariant(
    new Set(actualTags).size === actualTags.length,
    `${label} contains duplicate migration tags`,
  );
  const expectedTags = Object.keys(EXPECTED_DURABLE_MIGRATIONS);
  invariant(
    sortedJoin(actualTags) === sortedJoin(expectedTags),
    `${label} migrations must be exactly [${sortedJoin(expectedTags)}] but found [${sortedJoin(actualTags)}]`,
  );
  for (const migration of migrations) {
    const expected = EXPECTED_DURABLE_MIGRATIONS[migration.tag];
    // 기대한 동작(생성/삭제)과 그 대상이 정확히 일치해야 한다. 생성을 기대한 태그가
    // 삭제로 바뀌거나 그 반대가 되면 여기서 걸린다.
    const [action] = Object.keys(expected);
    invariant(
      Array.isArray(migration[action])
        && sortedJoin(migration[action]) === sortedJoin(expected[action]),
      `${label} migration ${migration.tag} must declare ${action} [${sortedJoin(expected[action])}]`,
    );
    const unexpected = ["new_sqlite_classes", "new_classes", "deleted_classes", "renamed_classes"]
      .filter((key) => key !== action && migration[key] !== undefined);
    invariant(
      unexpected.length === 0,
      `${label} migration ${migration.tag} must not also declare [${sortedJoin(unexpected)}]`,
    );
  }
}

function readConfig(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function aiRateLimiterBindings(config) {
  return (config.ratelimits || []).filter((binding) => binding?.name === "AI_RATE_LIMITER");
}

function aiRateLimiter(config, label) {
  const bindings = aiRateLimiterBindings(config);
  invariant(bindings.length === 1, `${label} must define exactly one AI_RATE_LIMITER binding`);
  return bindings[0];
}

function assertRateLimitPolicy(binding, label) {
  invariant(
    Number.isInteger(binding?.simple?.limit)
      && binding.simple.limit === EXPECTED_AI_RATE_LIMIT_POLICY.limit,
    `${label} must use the canonical AI rate limit`,
  );
  invariant(
    Number.isInteger(binding?.simple?.period)
      && binding.simple.period === EXPECTED_AI_RATE_LIMIT_POLICY.period,
    `${label} must use the canonical AI rate limit period`,
  );
}

export function isPositiveIntegerNamespaceId(value) {
  return typeof value === "string" && /^[1-9][0-9]*$/.test(value);
}

export function repositoryRateLimitNamespaceIds(previewConfig, productionConfig) {
  const preview = aiRateLimiter(previewConfig, "Preview config");
  const production = aiRateLimiter(productionConfig, "Production config");
  assertRateLimitPolicy(preview, "Preview AI_RATE_LIMITER");
  assertRateLimitPolicy(production, "Production AI_RATE_LIMITER");
  invariant(isPositiveIntegerNamespaceId(preview.namespace_id), "Preview AI rate limiter namespace is invalid");
  invariant(isPositiveIntegerNamespaceId(production.namespace_id), "Production AI rate limiter namespace is invalid");
  return new Set([preview.namespace_id, production.namespace_id]);
}

export function validateGeneratedStagingConfig(config, knownNamespaceIds = new Set()) {
  invariant(config?.name === "on-my-way-staging", "Generated config must target on-my-way-staging");
  invariant(config?.main === "./worker.mjs", "Generated config must use worker.mjs");
  invariant(config?.assets?.binding === "ASSETS", "Generated config must define the ASSETS binding");

  for (const [name, expected] of [
    ["APP_ENV", "staging"],
    ["PAYMENTS_ENABLED", "false"],
    ["ALLOW_DEV_LOGIN", "false"],
    ["ALLOW_DEMO_BILLING", "false"],
    ["APPLE_LOGIN_VISIBLE", "false"],
  ]) {
    invariant(config?.vars?.[name] === expected, `Generated config has an invalid ${name} value`);
  }

  const kvBindings = (config.kv_namespaces || []).filter((binding) => binding?.binding === "USERS_KV");
  invariant(kvBindings.length === 1, "Generated config must define exactly one USERS_KV binding");
  invariant(typeof kvBindings[0].id === "string" && kvBindings[0].id.trim(), "Generated config USERS_KV identifier is missing");

  const d1Bindings = (config.d1_databases || []).filter((binding) => binding?.binding === "BILLING_DB");
  invariant(d1Bindings.length === 1, "Generated config must define exactly one BILLING_DB binding");
  invariant(
    d1Bindings[0].database_name === "on-my-way-billing-staging",
    "Generated config must target the Staging billing database",
  );
  invariant(
    typeof d1Bindings[0].database_id === "string" && d1Bindings[0].database_id.trim(),
    "Generated config BILLING_DB identifier is missing",
  );

  const rateLimit = aiRateLimiter(config, "Generated config");
  invariant(
    isPositiveIntegerNamespaceId(rateLimit.namespace_id),
    "Generated config AI rate limiter namespace must be a positive integer string",
  );
  invariant(
    rateLimit.namespace_id !== STAGING_RATE_LIMIT_NAMESPACE_PLACEHOLDER,
    "Generated config contains the Staging AI rate limiter placeholder",
  );
  invariant(
    !knownNamespaceIds.has(rateLimit.namespace_id),
    "Staging AI rate limiter namespace must differ from repository Preview and Production namespaces",
  );
  assertRateLimitPolicy(rateLimit, "Generated config AI_RATE_LIMITER");

  /* 기대 집합과 실제 집합이 정확히 일치해야 한다.

     전에는 GUEST_PLAN_DRAFTS로 필터한 뒤 "정확히 1개"를 셌다. 그러면 ENERGY_LEDGER가
     통째로 빠져도 staging 배포가 통과한다 — 필터가 그것을 애초에 안 봤기 때문이다.
     실제로 그 상태였다. 이제 새 DO 클래스를 추가하면 아래 상수를 갱신하지 않는 한
     검증이 실패한다. 원장이 조용히 사라지는 것보다 배포가 시끄럽게 막히는 것이 낫다. */
  assertDurableObjects(config, "Generated config");

  // 서로 다른 종류의 바인딩이 같은 이름을 쓰면 워커에서 한쪽이 가려진다.
  const requiredNames = [
    config.assets.binding,
    kvBindings[0].binding,
    d1Bindings[0].binding,
    rateLimit.name,
    ...Object.keys(EXPECTED_DURABLE_OBJECTS),
  ];
  invariant(
    new Set(requiredNames).size === requiredNames.length,
    "Generated config contains duplicate required binding names",
  );
  return config;
}

export function generateStagingConfig(baseConfig, resources, knownNamespaceIds = new Set()) {
  invariant(
    typeof resources?.usersKvId === "string" && resources.usersKvId.trim() && resources.usersKvId !== "null",
    "Required Staging resource identifier is missing: CLOUDFLARE_STAGING_USERS_KV_ID",
  );
  invariant(
    typeof resources?.billingDatabaseId === "string"
      && resources.billingDatabaseId.trim()
      && resources.billingDatabaseId !== "null",
    "Required Staging resource identifier is missing: CLOUDFLARE_STAGING_D1_DATABASE_ID",
  );
  invariant(
    isPositiveIntegerNamespaceId(resources?.rateLimitNamespaceId),
    "Required Staging resource identifier is invalid: CLOUDFLARE_STAGING_AI_RATE_LIMITER_NAMESPACE_ID",
  );
  invariant(
    resources.rateLimitNamespaceId !== STAGING_RATE_LIMIT_NAMESPACE_PLACEHOLDER,
    "Staging AI rate limiter namespace placeholder is not deployable",
  );
  invariant(
    !knownNamespaceIds.has(resources.rateLimitNamespaceId),
    "Staging AI rate limiter namespace must differ from repository Preview and Production namespaces",
  );

  const baseRateLimit = aiRateLimiter(baseConfig, "Raw Staging config");
  invariant(
    baseRateLimit.namespace_id === STAGING_RATE_LIMIT_NAMESPACE_PLACEHOLDER,
    "Raw Staging config must retain the non-deployable AI rate limiter placeholder",
  );
  assertRateLimitPolicy(baseRateLimit, "Raw Staging config AI_RATE_LIMITER");

  const generated = structuredClone(baseConfig);
  generated.kv_namespaces = [{
    binding: "USERS_KV",
    id: resources.usersKvId,
  }];
  generated.d1_databases = [{
    binding: "BILLING_DB",
    database_name: "on-my-way-billing-staging",
    database_id: resources.billingDatabaseId,
    migrations_dir: "migrations",
  }];
  generated.ratelimits = generated.ratelimits.map((binding) => (
    binding.name === "AI_RATE_LIMITER"
      ? { ...binding, namespace_id: resources.rateLimitNamespaceId }
      : binding
  ));
  generated.assets = {
    ...generated.assets,
    exclude: [...new Set([...(generated.assets?.exclude || []), "wrangler.staging.generated.jsonc"])],
  };
  return validateGeneratedStagingConfig(generated, knownNamespaceIds);
}

function repositoryConfigs() {
  return {
    preview: readConfig(resolve("wrangler.preview.jsonc")),
    production: readConfig(resolve("wrangler.production.jsonc")),
  };
}

function runCli() {
  const [command, inputPath, outputPath] = process.argv.slice(2);
  invariant(command === "generate" || command === "validate", "Expected generate or validate command");
  invariant(inputPath, "A Staging config path is required");
  const configs = repositoryConfigs();
  const knownNamespaceIds = repositoryRateLimitNamespaceIds(configs.preview, configs.production);

  if (command === "generate") {
    invariant(outputPath, "A generated Staging config path is required");
    const generated = generateStagingConfig(readConfig(inputPath), {
      usersKvId: process.env.STAGING_USERS_KV_ID,
      billingDatabaseId: process.env.STAGING_D1_DATABASE_ID,
      rateLimitNamespaceId: process.env.STAGING_AI_RATE_LIMITER_NAMESPACE_ID,
    }, knownNamespaceIds);
    writeFileSync(outputPath, `${JSON.stringify(generated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    console.log("Generated isolated Staging config");
    return;
  }

  validateGeneratedStagingConfig(readConfig(inputPath), knownNamespaceIds);
  console.log("Validated isolated Staging config");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Staging config validation failed");
    process.exitCode = 1;
  }
}
