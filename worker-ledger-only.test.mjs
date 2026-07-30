/* 차감 경로가 다시 KV로 배선되는 것을 막는 경계 테스트.
 *
 * ai-credits-service의 KV 회계는 withAiCreditUserLock에 직렬화를 의존하고, 그 락은
 * 모듈 스코프 Map이라 아이솔레이트 안에서만 유효하다. worker가 그것을 차감에 쓰면
 * colo가 다른 동시 요청이 서로를 못 보고 이중 차감이 난다. import 자체를 막는 것이
 * 가장 싼 방어선이다 — 코드 리뷰보다 먼저 걸린다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "./worker.mjs";
import { workerEnv, memoryKv, durableObjectNamespace } from "./test-helpers/worker-env.mjs";

const workerSource = readFileSync(new URL("./worker.mjs", import.meta.url), "utf8");

/* worker.mjs가 ai-credits-service에서 무엇을 가져오는지 소스에서 직접 읽는다.
   런타임 검사로는 "import했지만 안 쓴다"를 구분할 수 없다. */
function creditServiceImports() {
  const match = workerSource.match(/import\s*(?:\{([^}]*)\}|([A-Za-z_$][\w$]*))\s*from\s*["']\.\/ai-credits-service\.mjs["']/);
  if (!match) return [];
  const body = match[1] ?? match[2] ?? "";
  return body.split(",").map((part) => part.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
}

const FORBIDDEN_IN_WORKER = ["reserveAiCredits", "commitAiCredits", "releaseAiCredits", "getAiCreditUsage"];

test("worker는 KV 차감·조회 함수를 import하지 않는다", () => {
  const imported = creditServiceImports();
  for (const name of FORBIDDEN_IN_WORKER) {
    assert.equal(
      imported.includes(name),
      false,
      `${name}이 worker.mjs로 돌아왔다 — 차감은 EnergyLedger DO만 한다`,
    );
  }
});

/* 남는 둘은 재화 회계가 아니다. 목록을 고정해 두면 세 번째가 슬며시 늘어날 때 걸린다. */
test("worker가 이 모듈에서 가져오는 것은 체험 시작과 치어링 락뿐이다", () => {
  assert.deepEqual(creditServiceImports().sort(), ["startAiTrial", "withAiCreditUserLock"]);
});

test("소스에 KV 폴백의 흔적이 남아 있지 않다", () => {
  for (const name of FORBIDDEN_IN_WORKER) {
    assert.equal(
      new RegExp(`\\b${name}\\s*\\(`).test(workerSource),
      false,
      `${name} 호출이 worker.mjs에 남아 있다`,
    );
  }
});

/* ---------- fail-closed 런타임 동작 ---------- */

const TEST_SECRET = "worker-ledger-only-test-secret-that-is-long-enough";

async function session({ ledger }) {
  const kv = memoryKv();
  const userId = "ledger-only-user";
  const now = Date.now();
  const sessionId = `session-${userId}`;
  await kv.put(`user:${userId}`, JSON.stringify({
    id: userId, provider: "google", name: "테스트", email: "t@example.test",
    role: "member", status: "active", plan: "pro", createdAt: now - 1_000,
  }));
  await kv.put(`session:${sessionId}`, JSON.stringify({
    id: sessionId, userId, createdAt: now, expiresAt: now + 3_600_000, revokedAt: null,
  }));
  const { createSessionToken } = await import("./auth-service.mjs");
  const token = await createSessionToken(
    { sid: sessionId, sub: userId, role: "member", iat: now, exp: now + 3_600_000 },
    TEST_SECRET,
  );
  return {
    userId,
    cookie: `omw_session=${token}`,
    env: workerEnv({ kv, ledger, SESSION_SECRET: TEST_SECRET, OPENAI_API_KEY: "k", OPENAI_MODEL: "m" }),
  };
}

function chatRequest(cookie, { requestId = "ledger-only-1", body } = {}) {
  return new Request("https://onmyway.example.test/api/ai/companion-chat", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-Request-ID": requestId },
    body: JSON.stringify(body || { message: "안녕", context: { goal: "테스트" } }),
  });
}

/* 원장 바인딩이 없으면 provider를 부르기 전에 503으로 끝난다. 전에는 이 자리에서
   조용히 KV 차감으로 물러났다. */
test("원장 바인딩이 없으면 차감 요청은 503 ENERGY_LEDGER_UNAVAILABLE로 끝난다", async () => {
  const ctx = await session({ ledger: null });
  const response = await worker.fetch(chatRequest(ctx.cookie), ctx.env);
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.code, "ENERGY_LEDGER_UNAVAILABLE");
  assert.equal(payload.ok, false);
});

test("원장 바인딩이 없어도 무료 치어링은 계속 된다", async () => {
  const ctx = await session({ ledger: null });
  const response = await worker.fetch(
    chatRequest(ctx.cookie, { requestId: "cheer-no-ledger", body: { message: "다 했어요!", eventType: "celebrate" } }),
    ctx.env,
  );
  // provider 키가 가짜라 200은 아닐 수 있다. 중요한 것은 원장 부재로 막히지 않는 것이다.
  assert.notEqual(response.status, 503);
  assert.notEqual((await response.json()).code, "ENERGY_LEDGER_UNAVAILABLE");
});

/* ---------- C-2: 읽기 ---------- */

test("원장이 없으면 usage는 숫자 대신 degraded 상태를 낸다", async () => {
  const ctx = await session({ ledger: null });
  const response = await worker.fetch(
    new Request("https://onmyway.example.test/api/ai/usage", { headers: { Cookie: ctx.cookie } }),
    ctx.env,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.degraded, true);
  assert.equal(body.available, false);
  assert.equal(body.reason, "ENERGY_LEDGER_UNAVAILABLE");

  // 잔량을 뜻하는 숫자가 하나도 실리지 않아야 한다 — 틀린 숫자는 없는 숫자보다 나쁘다.
  for (const key of ["balance", "daily", "monthly", "reserved", "available_credits"]) {
    assert.equal(typeof body[key] === "number", false, `${key}에 숫자가 실렸다`);
  }
  // 플랜 판정은 원장이 아니라 회원 레코드에서 오므로 남아 있어야 한다.
  assert.equal(body.plan, "pro");
  assert.equal(typeof body.paywallEnabled, "boolean");
});

test("원장이 있으면 usage는 degraded가 아니다", async () => {
  const ctx = await session({ ledger: durableObjectNamespace() });
  const response = await worker.fetch(
    new Request("https://onmyway.example.test/api/ai/usage", { headers: { Cookie: ctx.cookie } }),
    ctx.env,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.notEqual(body.degraded, true);
  assert.equal(typeof body.balance, "number");
});
