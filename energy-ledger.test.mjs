import test from "node:test";
import assert from "node:assert/strict";
import {
  ENERGY_LEDGER_SCHEMA_VERSION,
  EnergyLedgerError,
  STATE_KEY,
  TXN_TYPES,
  commitEnergy,
  getEnergyUsage,
  getLedgerPeriod,
  listTransactions,
  monthlyGrantAmount,
  purchaseEnergy,
  releaseEnergy,
  reserveEnergy,
  resetLedgerForPlan,
} from "./energy-ledger.mjs";
import { AI_CREDIT_COSTS, PLAN_CONFIG } from "./plan-policy.mjs";

// DO storage.transaction을 흉내 내는 최소 저장소. 순서 보장을 위해 연산을 직렬화한다.
function memoryStorage() {
  const values = new Map();
  return {
    values,
    async get(key) {
      const value = values.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    async put(key, value) {
      values.set(key, structuredClone(value));
    },
    async delete(key) {
      values.delete(key);
    },
    async list({ prefix = "" } = {}) {
      const result = new Map();
      for (const [key, value] of [...values.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        if (key.startsWith(prefix)) result.set(key, structuredClone(value));
      }
      return result;
    },
  };
}

// 2026-03-15 12:00 KST
const MARCH = Date.UTC(2026, 2, 15, 3, 0, 0);

test("lazy-grant는 그 달 첫 접근에 플랜 지급액을 넣는다", async () => {
  const storage = memoryStorage();
  const usage = await getEnergyUsage(storage, { plan: "pro", now: MARCH });
  assert.equal(usage.balance, PLAN_CONFIG.pro.monthlyCredits);
  assert.equal(usage.available, PLAN_CONFIG.pro.monthlyCredits);
  assert.equal(usage.monthly.limit, monthlyGrantAmount("pro"));

  const txns = await listTransactions(storage);
  assert.equal(txns.length, 1);
  assert.equal(txns[0].type, TXN_TYPES.GRANT);
  assert.equal(txns[0].amount, PLAN_CONFIG.pro.monthlyCredits);
});

test("같은 달 안에서는 두 번 지급하지 않는다", async () => {
  const storage = memoryStorage();
  await getEnergyUsage(storage, { plan: "pro", now: MARCH });
  await getEnergyUsage(storage, { plan: "pro", now: MARCH + 60_000 });
  const grants = (await listTransactions(storage)).filter((txn) => txn.type === TXN_TYPES.GRANT);
  assert.equal(grants.length, 1);
});

test("KST 월 경계를 넘으면 다시 지급하고 지난 달 정기 잔액은 소멸한다", async () => {
  const storage = memoryStorage();
  // 3월 마지막 순간 (KST 2026-03-31 23:00) → UTC 14:00
  const endOfMarch = Date.UTC(2026, 2, 31, 14, 0, 0);
  await getEnergyUsage(storage, { plan: "pro", now: endOfMarch });
  // KST 기준 4월 1일 00:30 → UTC 3월 31일 15:30
  const startOfApril = Date.UTC(2026, 2, 31, 15, 30, 0);
  const april = await getEnergyUsage(storage, { plan: "pro", now: startOfApril });

  assert.equal(april.balance, PLAN_CONFIG.pro.monthlyCredits, "이월 없이 당월 지급액만 남아야 한다");
  const grants = (await listTransactions(storage)).filter((txn) => txn.type === TXN_TYPES.GRANT);
  assert.equal(grants.length, 2, "달이 바뀌었으므로 두 번 지급되어야 한다");
});

test("KST 하루 경계에서 일일 한도가 리셋된다", async () => {
  const storage = memoryStorage();
  const period = getLedgerPeriod(MARCH, "Asia/Seoul");
  assert.equal(period.dayKey, "2026-03-15");
  assert.equal(period.monthKey, "2026-03");

  await reserveEnergy(storage, { plan: "pro", action: "companion_chat", requestId: "r1", now: MARCH });
  await commitEnergy(storage, { plan: "pro", requestId: "r1", now: MARCH });
  const sameDay = await getEnergyUsage(storage, { plan: "pro", now: MARCH + 1000 });
  assert.equal(sameDay.daily.used, AI_CREDIT_COSTS.companion_chat);

  const nextDay = await getEnergyUsage(storage, { plan: "pro", now: MARCH + 24 * 60 * 60 * 1000 });
  assert.equal(nextDay.daily.used, 0, "다음 날에는 일일 사용량이 리셋되어야 한다");
});

test("예약→확정이 잔액을 차감하고 spend 거래를 남긴다", async () => {
  const storage = memoryStorage();
  const reserved = await reserveEnergy(storage, { plan: "pro", action: "revise_plan", requestId: "req-1", now: MARCH });
  assert.equal(reserved.shouldExecute, true);
  assert.equal(reserved.cost, AI_CREDIT_COSTS.revise_plan);
  // 예약 단계에서는 잔액이 아직 줄지 않고 available만 줄어든다.
  assert.equal(reserved.usage.balance, PLAN_CONFIG.pro.monthlyCredits);
  assert.equal(reserved.usage.available, PLAN_CONFIG.pro.monthlyCredits - AI_CREDIT_COSTS.revise_plan);

  const committed = await commitEnergy(storage, { plan: "pro", requestId: "req-1", now: MARCH });
  assert.equal(committed.chargedCredits, AI_CREDIT_COSTS.revise_plan);
  assert.equal(committed.usage.balance, PLAN_CONFIG.pro.monthlyCredits - AI_CREDIT_COSTS.revise_plan);

  const spends = (await listTransactions(storage)).filter((txn) => txn.type === TXN_TYPES.SPEND);
  assert.equal(spends.length, 1);
  assert.equal(spends[0].amount, -AI_CREDIT_COSTS.revise_plan);
  assert.equal(spends[0].reason, "revise_plan");
});

test("AI 실패 시 원복하면 잔액이 그대로고 spend 기록이 남지 않는다", async () => {
  const storage = memoryStorage();
  await reserveEnergy(storage, { plan: "pro", action: "revise_plan", requestId: "req-fail", now: MARCH });
  const released = await releaseEnergy(storage, { plan: "pro", requestId: "req-fail", now: MARCH, errorCode: "AI_REQUEST_FAILED" });

  assert.equal(released.releasedCredits, AI_CREDIT_COSTS.revise_plan);
  assert.equal(released.usage.balance, PLAN_CONFIG.pro.monthlyCredits);
  assert.equal(released.usage.available, PLAN_CONFIG.pro.monthlyCredits, "잡아 둔 몫이 완전히 풀려야 한다");
  assert.equal(released.usage.daily.used, 0, "실패한 호출은 일일 사용량을 먹지 않아야 한다");

  const spends = (await listTransactions(storage)).filter((txn) => txn.type === TXN_TYPES.SPEND);
  assert.equal(spends.length, 0, "실제로 오간 재화가 없으므로 spend 기록도 없어야 한다");
});

test("원복은 멱등이다", async () => {
  const storage = memoryStorage();
  await reserveEnergy(storage, { plan: "pro", action: "companion_chat", requestId: "req-x", now: MARCH });
  await releaseEnergy(storage, { plan: "pro", requestId: "req-x", now: MARCH });
  const again = await releaseEnergy(storage, { plan: "pro", requestId: "req-x", now: MARCH });
  assert.equal(again.idempotent, true);
  assert.equal(again.releasedCredits, 0);
  assert.equal(again.usage.balance, PLAN_CONFIG.pro.monthlyCredits);
});

test("같은 requestId 재예약은 중복 차감하지 않는다", async () => {
  const storage = memoryStorage();
  const first = await reserveEnergy(storage, { plan: "pro", action: "companion_chat", requestId: "dup", now: MARCH });
  const second = await reserveEnergy(storage, { plan: "pro", action: "companion_chat", requestId: "dup", now: MARCH });
  assert.equal(first.shouldExecute, true);
  assert.equal(second.shouldExecute, false, "같은 요청은 두 번 실행되면 안 된다");
  assert.equal(second.idempotent, true);
  assert.equal(second.usage.available, PLAN_CONFIG.pro.monthlyCredits - AI_CREDIT_COSTS.companion_chat);
});

test("같은 requestId를 다른 action에 쓰면 거절한다", async () => {
  const storage = memoryStorage();
  await reserveEnergy(storage, { plan: "pro", action: "companion_chat", requestId: "same", now: MARCH });
  await assert.rejects(
    () => reserveEnergy(storage, { plan: "pro", action: "revise_plan", requestId: "same", now: MARCH }),
    (error) => error instanceof EnergyLedgerError && error.code === "REQUEST_ID_CONFLICT",
  );
});

test("동시 예약이 잔액을 넘어서지 못한다 (이중 차감 방지)", async () => {
  // DO는 단일 실행이므로 직렬화는 보장된다. 여기서 검증하는 것은 그 직렬화 위에서
  // 원장 로직이 실제로 잔액을 넘기지 않는가 — 즉 마지막 한 칸을 두 요청이 나눠 갖지 못하는가.
  const storage = memoryStorage();
  await getEnergyUsage(storage, { plan: "free", now: MARCH });
  const balance = PLAN_CONFIG.free.monthlyCredits;
  const cost = AI_CREDIT_COSTS.companion_chat;
  const capacity = Math.floor(balance / cost);

  let granted = 0;
  let refused = 0;
  for (let index = 0; index < capacity + 5; index += 1) {
    try {
      const result = await reserveEnergy(storage, { plan: "free", action: "companion_chat", requestId: `c${index}`, now: MARCH });
      if (result.shouldExecute) granted += 1;
    } catch (error) {
      assert.ok(error instanceof EnergyLedgerError);
      refused += 1;
    }
  }

  const usage = await getEnergyUsage(storage, { plan: "free", now: MARCH });
  assert.ok(refused > 0, "잔액을 넘는 요청은 거절되어야 한다");
  assert.equal(granted * cost, balance - usage.available, "예약된 총량이 줄어든 가용량과 정확히 일치해야 한다");
  assert.ok(usage.available >= 0, "가용 잔량이 음수가 되면 안 된다");
});

test("일일 한도가 잔액과 별개로 작동한다", async () => {
  const storage = memoryStorage();
  await getEnergyUsage(storage, { plan: "pro", now: MARCH });
  const dailyLimit = PLAN_CONFIG.pro.dailyCreditLimit;
  const cost = AI_CREDIT_COSTS.companion_chat;

  let granted = 0;
  for (let index = 0; index < dailyLimit + 3; index += 1) {
    try {
      const result = await reserveEnergy(storage, { plan: "pro", action: "companion_chat", requestId: `d${index}`, now: MARCH });
      if (result.shouldExecute) {
        await commitEnergy(storage, { plan: "pro", requestId: `d${index}`, now: MARCH });
        granted += 1;
      }
    } catch (error) {
      assert.equal(error.code, "DAILY_AI_CREDIT_LIMIT_EXCEEDED");
    }
  }
  assert.equal(granted * cost, dailyLimit, "하루에 쓸 수 있는 총량은 일일 한도를 넘지 못한다");
});

test("purchase는 orderId 기준으로 멱등이다", async () => {
  const storage = memoryStorage();
  await getEnergyUsage(storage, { plan: "free", now: MARCH });
  const before = (await getEnergyUsage(storage, { plan: "free", now: MARCH })).balance;

  const first = await purchaseEnergy(storage, { plan: "free", orderId: "omw_order_1", amount: 100, now: MARCH });
  const second = await purchaseEnergy(storage, { plan: "free", orderId: "omw_order_1", amount: 100, now: MARCH });

  assert.equal(first.credited, 100);
  assert.equal(second.credited, 0, "같은 주문이 두 번 와도 한 번만 충전해야 한다");
  assert.equal(second.idempotent, true);
  assert.equal(second.usage.balance, before + 100);

  const purchases = (await listTransactions(storage)).filter((txn) => txn.type === TXN_TYPES.PURCHASE);
  assert.equal(purchases.length, 1);
});

test("구매분은 월이 바뀌어도 소멸하지 않는다", async () => {
  const storage = memoryStorage();
  const endOfMarch = Date.UTC(2026, 2, 31, 14, 0, 0);
  await getEnergyUsage(storage, { plan: "free", now: endOfMarch });
  await purchaseEnergy(storage, { plan: "free", orderId: "pack-1", amount: 50, now: endOfMarch });

  const startOfApril = Date.UTC(2026, 2, 31, 15, 30, 0);
  const april = await getEnergyUsage(storage, { plan: "free", now: startOfApril });

  assert.equal(april.purchasedBalance, 50, "구매분은 그대로 남아야 한다");
  assert.equal(april.balance, PLAN_CONFIG.free.monthlyCredits + 50, "당월 지급액 + 구매분");
});

test("정기 지급분을 먼저 쓰고 구매분은 나중에 쓴다", async () => {
  const storage = memoryStorage();
  await getEnergyUsage(storage, { plan: "free", now: MARCH });
  await purchaseEnergy(storage, { plan: "free", orderId: "pack-2", amount: 20, now: MARCH });

  await reserveEnergy(storage, { plan: "free", action: "companion_chat", requestId: "p1", now: MARCH });
  const committed = await commitEnergy(storage, { plan: "free", requestId: "p1", now: MARCH });
  assert.equal(committed.usage.purchasedBalance, 20, "정기 지급분이 남아 있는 동안 구매분은 줄지 않아야 한다");
});

test("마이그레이션 재부여는 플랜 기준으로 다시 세우고 구매분은 보존한다", async () => {
  const storage = memoryStorage();
  await getEnergyUsage(storage, { plan: "pro", now: MARCH });
  await purchaseEnergy(storage, { plan: "pro", orderId: "keep-me", amount: 30, now: MARCH });
  // 잔액을 깎아 둔 상태에서 재부여한다.
  await reserveEnergy(storage, { plan: "pro", action: "reschedule_plan", requestId: "burn", now: MARCH });
  await commitEnergy(storage, { plan: "pro", requestId: "burn", now: MARCH });

  const reset = await resetLedgerForPlan(storage, { plan: "pro", now: MARCH });
  assert.equal(reset.purchasedBalance, 30, "돈 주고 산 몫은 재부여에서 건드리면 안 된다");
  assert.equal(reset.balance, PLAN_CONFIG.pro.monthlyCredits + 30);
  assert.equal(reset.daily.used, 0);
});

test("체험 플랜은 체험 지급액을 받는다", async () => {
  const storage = memoryStorage();
  const usage = await getEnergyUsage(storage, { plan: "trial", now: MARCH });
  assert.equal(usage.balance, PLAN_CONFIG.pro.trial.credits);
  assert.equal(usage.monthly.limit, PLAN_CONFIG.pro.trial.credits);
});

test("거래 기록은 append-only로 누적된다", async () => {
  const storage = memoryStorage();
  await getEnergyUsage(storage, { plan: "pro", now: MARCH });
  await purchaseEnergy(storage, { plan: "pro", orderId: "o1", amount: 10, now: MARCH });
  await reserveEnergy(storage, { plan: "pro", action: "companion_chat", requestId: "a", now: MARCH });
  await commitEnergy(storage, { plan: "pro", requestId: "a", now: MARCH });

  const txns = await listTransactions(storage);
  assert.deepEqual(txns.map((txn) => txn.type), [TXN_TYPES.SPEND, TXN_TYPES.PURCHASE, TXN_TYPES.GRANT]);
  for (const txn of txns) {
    assert.ok(txn.txnId, "모든 거래에 txnId가 있어야 한다");
    assert.ok(Number.isFinite(txn.at), "모든 거래에 시각이 있어야 한다");
    assert.ok(typeof txn.reason === "string", "모든 거래에 사유가 있어야 한다");
    assert.ok(Number.isFinite(txn.balanceAfter), "감사용으로 거래 후 잔액이 남아야 한다");
  }
  // seq는 단조 증가해야 한다 (기록을 덮어쓰지 않는다는 뜻).
  const seqs = txns.map((txn) => txn.seq);
  assert.deepEqual([...seqs].sort((a, b) => b - a), seqs);
});

test("TTL을 넘긴 고아 예약은 자동으로 회수된다", async () => {
  const storage = memoryStorage();
  await reserveEnergy(storage, { plan: "pro", action: "reschedule_plan", requestId: "orphan", now: MARCH });
  const before = await getEnergyUsage(storage, { plan: "pro", now: MARCH });
  assert.equal(before.available, PLAN_CONFIG.pro.monthlyCredits - AI_CREDIT_COSTS.reschedule_plan);

  const later = await getEnergyUsage(storage, { plan: "pro", now: MARCH + 11 * 60 * 1000 });
  assert.equal(later.available, PLAN_CONFIG.pro.monthlyCredits, "고아 예약은 TTL 후 잔량으로 돌아와야 한다");
});

test("상태 레코드에 스키마 버전이 남는다", async () => {
  const storage = memoryStorage();
  await getEnergyUsage(storage, { plan: "free", now: MARCH });
  const state = await storage.get(STATE_KEY);
  assert.equal(state.schemaVersion, ENERGY_LEDGER_SCHEMA_VERSION);
});
