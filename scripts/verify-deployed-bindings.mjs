#!/usr/bin/env node
/* 배포된 워커의 /api/health를 읽어 바인딩 불변식을 판정한다.
   세 배포 경로(preview 워크플로 / staging-deploy / deploy-production)의 마지막 관문이다.

   사용법: node scripts/verify-deployed-bindings.mjs <base-url>

   판정 로직은 binding-health.mjs에 있다. 여기서는 가져오기와 재시도만 한다 —
   생성기가 넷이 되어도 판정은 한 곳이어야 하기 때문이다.

   BILLING_DB 조건부 불변식은 웹 결제(토스) 전제로 만든 것이다. 웹 결제는 도입하지
   않기로 확정했고(2026-07-30) 스토어 IAP용으로 재정의될 예정이다. 불변식 자체는
   그대로 둔다 — PAYMENTS_ENABLED가 네 환경 모두 false라 지금 아무것도 요구하지 않고,
   IAP 설계가 확정되면 한 PR로 교체한다. docs/PROJECT_STATUS.md 참고. */
import { checkBindingInvariants } from "../binding-health.mjs";

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("usage: node scripts/verify-deployed-bindings.mjs <base-url>");
  process.exit(2);
}

const healthUrl = new URL("/api/health", baseUrl).toString();
const ATTEMPTS = 6;
const RETRY_DELAY_MS = 5_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* 방금 배포한 워커는 몇 초 동안 이전 버전을 서빙할 수 있다. 그래서 "읽기 실패"와
   "불변식 위반"을 구분한다 — 읽기 실패만 재시도하고, 위반은 즉시 실패시킨다.
   위반을 재시도하면 낡은 배포본이 우연히 통과하는 창이 생긴다. */
async function readHealth() {
  let lastError = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(healthUrl, { headers: { "cache-control": "no-cache" } });
      const body = await response.json();
      // 503(USERS_KV 없음)도 본문은 읽는다 — 어느 바인딩이 빠졌는지 보고해야 한다.
      return { body, status: response.status };
    } catch (error) {
      lastError = error?.message || String(error);
      if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS);
    }
  }
  return { body: null, status: 0, error: lastError };
}

const { body, status, error } = await readHealth();

if (!body) {
  console.error(`바인딩 검증 실패: ${healthUrl}를 읽지 못했습니다 (${error})`);
  process.exit(1);
}

const result = checkBindingInvariants(body);
const reported = body.bindings && typeof body.bindings === "object"
  ? Object.entries(body.bindings).map(([name, ok]) => `${name}=${ok}`).join(" ")
  : "(없음)";

console.log(`환경: ${body.environment} | HTTP ${status} | paymentsEnabled=${body.paymentsEnabled}`);
console.log(`바인딩: ${reported}`);

if (!result.ok) {
  console.error("바인딩 불변식 위반:");
  for (const failure of result.failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("바인딩 불변식 통과");
