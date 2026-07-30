const { spawnSync } = require("node:child_process");
const { execFileSync } = require("node:child_process");

function currentBranch() {
  const ciBranch = process.env.GITHUB_REF_NAME || process.env.WORKERS_CI_BRANCH;
  if (ciBranch) return ciBranch;
  try {
    return execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const branch = currentBranch();
if (branch !== "main" && process.env.ALLOW_PRODUCTION_DEPLOY !== "true") {
  console.error(`Production deployment refused from branch "${branch || "unknown"}". Merge to main first.`);
  process.exit(2);
}

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(executable, ["wrangler", "deploy", "--config", "wrangler.production.jsonc"], {
  stdio: "inherit",
  env: process.env,
});
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

/* 배포된 워커가 실제로 해석한 바인딩을 판정한다. 설정에는 있는데 배포본에는 없는
   경우가 있고(특히 ENERGY_LEDGER는 빠져도 배포가 성공하고 차감이 KV로 샌다),
   그것은 산출물을 읽어야만 잡힌다. 판정 로직은 binding-health.mjs 한 곳이다.

   도메인은 배포 설정에서 읽는다 — 여기 다시 적으면 둘이 어긋날 수 있다. */
const { readFileSync } = require("node:fs");
const config = JSON.parse(readFileSync("wrangler.production.jsonc", "utf8"));
const customDomain = (config.routes || []).find((route) => route?.custom_domain)?.pattern;
if (!customDomain) {
  console.error("Production verification refused: wrangler.production.jsonc has no custom_domain route.");
  process.exit(1);
}

const verification = spawnSync(
  process.execPath,
  ["scripts/verify-deployed-bindings.mjs", `https://${customDomain}`],
  { stdio: "inherit", env: process.env },
);
process.exit(verification.status ?? 1);
