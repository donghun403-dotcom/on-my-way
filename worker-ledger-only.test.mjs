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

/* 남는 하나는 재화 회계가 아니다(회원 레코드의 체험 필드를 세운다).
   목록을 고정해 두면 두 번째가 슬며시 늘어날 때 걸린다.

   withAiCreditUserLock이 목록에서 빠진 이유: 무료 치어링 상한이 EnergyLedger DO로
   옮겨가면서 마지막 호출자를 잃었다. 그 락은 모듈 스코프 Map이라 colo 간 상호배제가
   없었고, 상한이 묶는 것이 provider 호출이라 실제 AI 비용이 새는 자리였다.
   다시 들어오면 그 구멍이 그대로 돌아온다. */
test("worker가 이 모듈에서 가져오는 것은 체험 시작뿐이다", () => {
  assert.deepEqual(creditServiceImports().sort(), ["startAiTrial"]);
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

/* AI를 부르는 모든 경로는 원장을 통과한다 — 무료 치어링도 예외가 아니다.
   전에는 "치어링은 재화를 안 쓰니 원장이 없어도 된다"고 열어 뒀다. 그러면 원장 장애 시에
   유료 대화는 503으로 막히고 상한 없는 무료 AI만 열려 있는 최악의 조합이 된다.
   치어링이 쓰지 않는 것은 크레딧이지 provider 호출이 아니다.
   상한이 원장으로 옮겨간 지금은 원장 없이 치어링을 허용하면 상한 자체가 사라진다. */
test("원장 바인딩이 없으면 무료 치어링도 막힌다", async () => {
  const ctx = await session({ ledger: null });
  const response = await worker.fetch(
    chatRequest(ctx.cookie, { requestId: "cheer-no-ledger", body: { message: "다 했어요!", eventType: "celebrate" } }),
    ctx.env,
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "ENERGY_LEDGER_UNAVAILABLE");
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
