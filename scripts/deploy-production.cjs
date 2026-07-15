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
process.exit(result.status ?? 1);
