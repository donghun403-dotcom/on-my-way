/* 체험 시작의 회계·부수효과 불변식.
 *
 * ── 테스트 규칙 ────────────────────────────────────────────────────────────────
 * 외부 부수효과(provider 호출, 결제 승인, 메일 발송, 원장 재지급)가 있는 경로는
 * 두 불변식을 반드시 짝으로 단언한다:
 *
 *   회계 불변식 — 재화가 두 번 빠지거나 두 번 들어오지 않는다
 *   부수효과 불변식 — 바깥 세계가 두 번 움직이지 않는다
 *
 * 하나만 단언하면 다른 하나가 조용히 깨진다. 이 리포에서 두 번 그랬다:
 *   ① worker가 reserve의 shouldExecute=false를 무시했다. "크레딧이 두 번 빠지지
 *      않는다"는 테스트는 통과했지만 provider는 두 번 불렸다.
 *   ② 체험 시작 재호출이 원장을 reset했다. 회계·부수효과 어느 쪽도 단언이 없었다.
 * ───────────────────────────────────────────────────────────────────────────────
 */
import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.mjs";
import { createSessionToken } from "./auth-service.mjs";
import { memoryKv, durableObjectNamespace } from "./test-helpers/worker-env.mjs";
import { createEnergyLedgerClient } from "./energy-ledger-client.mjs";
import { PLAN_CONFIG } from "./plan-policy.mjs";

const TEST_SECRET = "worker-trial-grant-test-secret-that-is-long-enough";

async function trialContext({ userId = "trial-grant-user", plan = "expired" } = {}) {
  const kv = memoryKv();
  const ledger = durableObjectNamespace();
  const now = Date.now();
  const sessionId = `session-${userId}`;
  await kv.put(`user:${userId}`, JSON.stringify({
    id: userId, provider: "google", name: "체험", email: `${userId}@example.test`,
    role: "member", status: "active", plan, createdAt: now - 1_000,
  }));
  await kv.put(`session:${sessionId}`, JSON.stringify({
    id: sessionId, userId, createdAt: now, expiresAt: now + 3_600_000, revokedAt: null,
  }));
  const token = await createSessionToken(
    { sid: sessionId, sub: userId, role: "member", iat: now, exp: now + 3_600_000 },
    TEST_SECRET,
  );
  return {
    userId,
    ledger,
    cookie: `omw_session=${token}`,
    env: {
      APP_ENV: "test",
      SESSION_SECRET: TEST_SECRET,
      USERS_KV: kv,
      ENERGY_LEDGER: ledger,
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "test-model",
    },
  };
}

async function call(ctx, path, init = {}) {
  const headers = new Headers({ Cookie: ctx.cookie, ...(init.headers || {}) });
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await worker.fetch(
    new Request(`https://onmyway.example.test${path}`, { ...init, headers }),
    ctx.env,
  );
  return { status: response.status, body: await response.json().catch(() => null) };
}

const usage = async (ctx) => (await call(ctx, "/api/ai/usage")).body;

function ledgerClient(ctx) {
  return createEnergyLedgerClient({ ENERGY_LEDGER: ctx.ledger });
}

/* 원장이 "이번 달 지급을 이미 했다"고 기억하는지 본다. reset이 돌면 이 값이 비워졌다가
   다시 채워지고, 그 과정에서 재지급이 일어난다. 부수효과 불변식은 이 값으로 잰다 —
   잔량만 보면 "소비가 없었을 뿐"과 구분되지 않는다. */
async function grantTransactionCount(ctx) {
  const result = await ledgerClient(ctx).transactions(ctx.userId, { limit: 200 });
  return (result?.transactions || []).filter((txn) => txn.type === "grant").length;
}

function chatCall(ctx, requestId) {
  return call(ctx, "/api/ai/companion-chat", {
    method: "POST",
    headers: { "X-Request-ID": requestId },
    body: JSON.stringify({ message: "안녕", context: { goal: "테스트" } }),
  });
}

async function withProvider(operation) {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("openai")) {
      calls += 1;
      return new Response(JSON.stringify({
        output_text: JSON.stringify({ headline: "좋아요", reply: "한 걸음씩 가요." }),
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return realFetch(url, options);
  };
  try {
    return { result: await operation(), providerCalls: calls };
  } finally {
    globalThis.fetch = realFetch;
  }
}

/* ---------- ① 체험 크레딧 리필 ---------- */

test("체험 시작 재호출은 크레딧을 다시 채우지 않는다 (회계)", async () => {
  const ctx = await trialContext({ userId: "refill-accounting" });

  const started = await call(ctx, "/api/ai/trial/start", { method: "POST" });
  assert.equal(started.body.started, true);
  assert.equal((await usage(ctx)).balance, PLAN_CONFIG.pro.trial.credits);

  await withProvider(async () => {
    for (let i = 1; i <= 3; i += 1) {
      const response = await chatCall(ctx, `refill-chat-${i}`);
      assert.equal(response.status, 200, `${i}번째 대화가 실패했다`);
    }
  });
  const spent = (await usage(ctx)).balance;
  assert.equal(spent, PLAN_CONFIG.pro.trial.credits - 3);

  const again = await call(ctx, "/api/ai/trial/start", { method: "POST" });
  assert.equal(again.body.started, false, "이미 체험 중이면 다시 시작되지 않는다");
  assert.equal(again.body.idempotent, true);

  assert.equal(
    (await usage(ctx)).balance,
    spent,
    "재호출로 잔량이 늘었다 — 체험 크레딧을 무한히 리필할 수 있다",
  );
});

test("체험 시작 재호출은 원장 재지급을 일으키지 않는다 (부수효과)", async () => {
  const ctx = await trialContext({ userId: "refill-side-effect" });

  await call(ctx, "/api/ai/trial/start", { method: "POST" });
  const grantsAfterStart = await grantTransactionCount(ctx);
  assert.ok(grantsAfterStart >= 1, "체험 시작은 지급을 한 번 일으켜야 한다");

  await call(ctx, "/api/ai/trial/start", { method: "POST" });
  await call(ctx, "/api/ai/trial/start", { method: "POST" });

  assert.equal(
    await grantTransactionCount(ctx),
    grantsAfterStart,
    "재호출이 지급 거래를 더 만들었다 — reset이 돌았다는 뜻이다",
  );
});

/* ---------- ② 멱등성 레코드 소멸 ---------- */

/* 멱등성 보장이 플랜 전환 이벤트에 의존해서는 안 된다. 전에는 resetLedgerForPlan이
   state.requests를 통째로 비워서, 정당한 전환 한 번에 그때까지 쓴 모든 requestId가
   다시 통했다. */
test("정당한 플랜 전환 뒤에도 이미 쓴 requestId는 409로 막힌다", async () => {
  const ctx = await trialContext({ userId: "identity-after-switch" });
  await call(ctx, "/api/ai/trial/start", { method: "POST" });

  const first = await withProvider(() => chatCall(ctx, "switch-replay-1"));
  assert.equal(first.result.status, 200);
  assert.equal(first.providerCalls, 1);

  // 체험 → PRO 전환. 이 경로가 원장을 플랜 기준으로 다시 세운다.
  await ledgerClient(ctx).reset(ctx.userId, { plan: "pro", reason: "plan_change" });
  assert.equal((await usage(ctx)).balance, PLAN_CONFIG.pro.monthlyCredits, "전환은 PRO 지급으로 다시 세운다");

  const replay = await withProvider(() => chatCall(ctx, "switch-replay-1"));
  assert.equal(replay.result.status, 409, "전환 뒤에 같은 requestId가 다시 통했다");
  assert.equal(replay.result.body.code, "AI_REQUEST_ALREADY_COMMITTED");
  assert.equal(replay.providerCalls, 0, "409는 provider보다 앞에 있어야 한다");
});

test("전환은 진행 중이던 예약을 해제로 남기고 레코드를 지우지 않는다", async () => {
  const ctx = await trialContext({ userId: "identity-reserved" });
  await call(ctx, "/api/ai/trial/start", { method: "POST" });

  // provider가 실패하면 예약이 잡혔다가 해제된다 — 레코드는 남는다.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("openai")) return new Response("nope", { status: 500 });
    return realFetch(url, options);
  };
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await chatCall(ctx, "reserved-then-switch");
  } finally {
    console.error = originalConsoleError;
    globalThis.fetch = realFetch;
  }

  await ledgerClient(ctx).reset(ctx.userId, { plan: "pro", reason: "plan_change" });

  const replay = await withProvider(() => chatCall(ctx, "reserved-then-switch"));
  assert.equal(replay.result.status, 409, "해제된 requestId도 재사용되면 안 된다");
  assert.equal(replay.providerCalls, 0);
});
