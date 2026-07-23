import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const STAGING_RATE_LIMIT_NAMESPACE_PLACEHOLDER = "0";
export const EXPECTED_AI_RATE_LIMIT_POLICY = Object.freeze({
  limit: 5,
  period: 60,
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
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

  const durableBindings = (config.durable_objects?.bindings || [])
    .filter((binding) => binding?.name === "GUEST_PLAN_DRAFTS");
  invariant(
    durableBindings.length === 1 && durableBindings[0].class_name === "GuestPlanDraftObject",
    "Generated config must define the GuestPlanDraftObject binding",
  );
  const migrations = (config.migrations || []).filter((migration) => migration?.tag === "guest-plan-drafts-v1");
  invariant(
    migrations.length === 1
      && Array.isArray(migrations[0].new_sqlite_classes)
      && migrations[0].new_sqlite_classes.length === 1
      && migrations[0].new_sqlite_classes[0] === "GuestPlanDraftObject",
    "Generated config must define the GuestPlanDraftObject SQLite migration",
  );

  const requiredNames = [
    config.assets.binding,
    kvBindings[0].binding,
    d1Bindings[0].binding,
    rateLimit.name,
    durableBindings[0].name,
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
