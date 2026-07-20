import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const workflowPath = new URL("./.github/workflows/staging-deploy.yml", import.meta.url);
const workflow = readFileSync(workflowPath, "utf8").replace(/\r\n/g, "\n");
const requiredWorkerSecrets = [
  "SESSION_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "TOSS_CLIENT_KEY",
  "TOSS_SECRET_KEY",
  "OPENAI_API_KEY",
];

const fixtureSecrets = {
  SESSION_SECRET: "fixture-session-secret",
  GOOGLE_CLIENT_ID: "fixture-google-client-id",
  GOOGLE_CLIENT_SECRET: "fixture-google-client-secret",
  TOSS_CLIENT_KEY: "test_ck_fixture",
  TOSS_SECRET_KEY: "test_sk_fixture",
  OPENAI_API_KEY: "fixture-openai-key",
};

function extractStep(name) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `Missing workflow step: ${name}`);
  const next = workflow.indexOf("\n      - name: ", start + marker.length);
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

function extractRunScript(step) {
  const marker = "        run: |\n";
  const start = step.indexOf(marker);
  assert.notEqual(start, -1, "Step has no multiline run block");
  return step
    .slice(start + marker.length)
    .split("\n")
    .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
    .join("\n")
    .replace(/\n+$/, "\n");
}

function extractNodeHeredoc(script) {
  const match = script.match(/node <<'NODE'\n([\s\S]*?)\nNODE(?:\n|$)/);
  assert.ok(match, "Missing Node heredoc");
  return match[1];
}

function resolveBash() {
  if (process.platform !== "win32") return "bash";
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  ];
  const candidate = candidates.find(existsSync);
  assert.ok(candidate, "Git Bash is required for workflow shell fixtures");
  return candidate;
}

const bash = resolveBash();

function runBash(script, env = {}, args = ["-s"]) {
  return spawnSync(bash, args, {
    input: script,
    encoding: "utf8",
    env: { ...process.env, ...env },
    windowsHide: true,
  });
}

function runNodeFixture(source, rawOutput) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "omw-staging-secret-list-"));
  const rawPath = join(fixtureDir, "secret-list.raw");
  writeFileSync(rawPath, rawOutput, "utf8");
  const result = spawnSync(process.execPath, ["-e", source], {
    encoding: "utf8",
    env: { ...process.env, SECRET_LIST_RAW: rawPath },
    windowsHide: true,
  });
  rmSync(fixtureDir, { recursive: true, force: true });
  return result;
}

function secretRows(names = requiredWorkerSecrets) {
  return names.map((name) => ({ name, type: "secret_text" }));
}

test("Staging workflow keeps its guarded dispatch and environment boundary", () => {
  assert.match(workflow, /^name: Staging Deploy$/m);
  assert.match(workflow, /^  workflow_dispatch:$/m);
  assert.match(workflow, /^      ref:$/m);
  assert.match(workflow, /^    environment: staging$/m);
  assert.match(workflow, /^          ref: \$\{\{ inputs\.ref \}\}$/m);
  assert.match(workflow, /\.name == "on-my-way-staging"/);
  assert.match(workflow, /\.vars\.PAYMENTS_ENABLED == "false"/);
  assert.match(workflow, /wranglerVersion: "4\.81\.0"/);
  assert.match(workflow, /deploy --config wrangler\.staging\.generated\.jsonc --secrets-file \$\{\{ runner\.temp \}\}\/staging-worker-secrets\.json/);
});

test("ref guard rejects main aliases and permits feature branches and 40-character SHAs", () => {
  const script = extractRunScript(extractStep("Refuse unsafe Staging ref"));
  for (const blocked of ["main", "refs/heads/main", "origin/main", "refs/remotes/origin/main"]) {
    const result = runBash(script, { DEPLOY_REF: blocked });
    assert.notEqual(result.status, 0, `${blocked} must be rejected`);
  }
  for (const allowed of ["ci/staging-openai-secret-sync", "4".repeat(40)]) {
    const result = runBash(script, { DEPLOY_REF: allowed });
    assert.equal(result.status, 0, `${allowed} must be accepted: ${result.stderr}`);
  }
});

test("required Secret validation includes OPENAI_API_KEY and fails closed", () => {
  const step = extractStep("Validate required Staging Worker secrets");
  const script = extractRunScript(step);
  assert.match(step, /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.doesNotMatch(script, /set -x/);

  const success = runBash(script, fixtureSecrets);
  assert.equal(success.status, 0, success.stderr);

  for (const missingName of requiredWorkerSecrets) {
    const missing = { ...fixtureSecrets };
    delete missing[missingName];
    const result = runBash(script, missing);
    assert.notEqual(result.status, 0, `${missingName} must fail before deploy`);
    assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(missingName));
  }

  const blank = runBash(script, { ...fixtureSecrets, OPENAI_API_KEY: "" });
  assert.notEqual(blank.status, 0, "blank OPENAI_API_KEY must fail before deploy");
  assert.match(`${blank.stdout}\n${blank.stderr}`, /OPENAI_API_KEY/);
  assert.doesNotMatch(`${blank.stdout}\n${blank.stderr}`, /OPENAI_API_KEY length|OPENAI_API_KEY starts with|sk-/);
});

test("temporary secrets JSON contains every existing Secret plus OPENAI_API_KEY with protected creation", () => {
  const step = extractStep("Create temporary Staging Worker secrets file");
  const script = extractRunScript(step);
  assert.match(step, /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.match(script, /^umask 077$/m);
  assert.match(script, /mode: 0o600/);
  assert.doesNotMatch(script, /set -x/);

  const fixtureDir = mkdtempSync(join(tmpdir(), "omw-staging-secrets-"));
  const secretsFile = join(fixtureDir, "staging-worker-secrets.json");
  const success = runBash(script, { ...fixtureSecrets, SECRETS_FILE: secretsFile });
  assert.equal(success.status, 0, success.stderr);
  const payload = JSON.parse(readFileSync(secretsFile, "utf8"));
  assert.deepEqual(Object.keys(payload), requiredWorkerSecrets);
  assert.equal(payload.OPENAI_API_KEY, fixtureSecrets.OPENAI_API_KEY);
  for (const name of requiredWorkerSecrets) assert.equal(payload[name], fixtureSecrets[name]);
  if (process.platform !== "win32") assert.equal(statSync(secretsFile).mode & 0o777, 0o600);
  rmSync(fixtureDir, { recursive: true, force: true });

  const missingDir = mkdtempSync(join(tmpdir(), "omw-staging-secrets-missing-"));
  const missingFile = join(missingDir, "staging-worker-secrets.json");
  const missing = { ...fixtureSecrets };
  delete missing.OPENAI_API_KEY;
  const failure = runBash(script, { ...missing, SECRETS_FILE: missingFile });
  assert.notEqual(failure.status, 0);
  assert.match(`${failure.stdout}\n${failure.stderr}`, /OPENAI_API_KEY/);
  assert.equal(existsSync(missingFile), false);
  rmSync(missingDir, { recursive: true, force: true });
});

test("post-deploy parser accepts supported Wrangler output and requires all Secret names", () => {
  const script = extractRunScript(extractStep("Verify Staging Worker secret names"));
  const nodeSource = extractNodeHeredoc(script);

  for (const output of [
    JSON.stringify(secretRows()),
    JSON.stringify({ secrets: secretRows() }),
    `\uFEFF\u001B[36mWrangler notice\u001B[0m\n${JSON.stringify(secretRows())}`,
  ]) {
    const result = runNodeFixture(nodeSource, output);
    assert.equal(result.status, 0, result.stderr);
  }

  for (const missingName of ["OPENAI_API_KEY", "SESSION_SECRET"]) {
    const output = JSON.stringify(secretRows(requiredWorkerSecrets.filter((name) => name !== missingName)));
    const result = runNodeFixture(nodeSource, output);
    assert.notEqual(result.status, 0, `${missingName} must be required after deploy`);
    assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(missingName));
  }

  for (const invalid of ["", "Wrangler notice without JSON", '[{"name":"OPENAI_API_KEY"}']) {
    const result = runNodeFixture(nodeSource, invalid);
    assert.notEqual(result.status, 0, "invalid or incomplete Wrangler output must fail closed");
    assert.match(`${result.stdout}\n${result.stderr}`, /Unable to parse Wrangler secret list JSON output/);
  }
});

test("readiness requires Staging AI while keeping storage and payments safety gates", () => {
  const step = extractStep("Verify Staging routes, AI, and disabled billing");
  assert.match(step, /health\.environment !== "staging"/);
  assert.match(step, /!health\.services\.accountStorage/);
  assert.match(step, /health\.services\.ai !== true/);
  assert.match(step, /health\.services\.payments !== false/);

  const worker = readFileSync(new URL("./worker.mjs", import.meta.url), "utf8");
  assert.match(worker, /ai: Boolean\(env\.OPENAI_API_KEY\)/);
});

test("cleanup always removes every generated config and temporary Secret artifact", () => {
  const step = extractStep("Remove generated Staging config");
  assert.match(step, /^        if: always\(\)$/m);
  for (const target of [
    "wrangler.staging.generated.jsonc",
    "health.json",
    "providers.json",
    "staging-billing-schema.json",
    "staging-worker-secrets.json",
    "staging-worker-secret-list.raw",
  ]) {
    assert.match(step, new RegExp(target.replaceAll(".", "\\.")));
  }
});

test("all multiline workflow shell blocks pass Bash syntax validation", () => {
  const stepMatches = [...workflow.matchAll(/^      - name: (.+)$/gm)];
  let checked = 0;
  for (let index = 0; index < stepMatches.length; index += 1) {
    const start = stepMatches[index].index;
    const end = stepMatches[index + 1]?.index ?? workflow.length;
    const step = workflow.slice(start, end);
    if (!step.includes("        run: |\n")) continue;
    const result = runBash(extractRunScript(step), {}, ["-n", "-s"]);
    assert.equal(result.status, 0, `${stepMatches[index][1]} Bash syntax failed: ${result.stderr}`);
    checked += 1;
  }
  assert.ok(checked >= 10, `Expected at least 10 shell blocks, checked ${checked}`);
});

test("workflow text keeps valid structural invariants for GitHub Actions YAML", () => {
  assert.doesNotMatch(workflow, /\t/);
  assert.equal((workflow.match(/^name:/gm) || []).length, 1);
  assert.equal((workflow.match(/^jobs:/gm) || []).length, 1);
  assert.equal((workflow.match(/^  validate-and-deploy:$/gm) || []).length, 1);
  assert.equal((workflow.match(/^      - name: /gm) || []).length, new Set([...workflow.matchAll(/^      - name: (.+)$/gm)].map((match) => match[1])).size);
});
