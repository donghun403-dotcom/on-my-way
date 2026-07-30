/* resetLedgerForPlan의 지우기 범위를 명세로 고정한다.
 *
 * 이 함수의 지우기 범위에서 결함이 세 번 나왔다:
 *   ① 체험 무한 리필 — 체험 시작이 reset을 불러서 부를 때마다 재지급됐다
 *   ② 멱등성 레코드 소멸 — state.requests를 통째로 비워 쓴 requestId가 다시 통했다
 *   ③ dailyCheer 배치 — state.daily 안에 뒀다면 전환 한 번에 오늘 응원이 되살아났다
 *
 * 셋 다 "이 필드가 reset 대상인가"를 아무도 명시적으로 답하지 않아서 생겼다.
 * 여기서 두 가지를 강제한다:
 *   ⓐ 원장 상태의 모든 필드가 RESET_DISPOSITION에 등록돼 있다 (누락 시 실패)
 *   ⓑ 등록한 처분이 실제 동작과 일치한다 (라벨만 바꿔도 실패)
 *
 * 새 필드는 등록과 동작 검증을 둘 다 통과해야 들어온다. 조용히 지워지는 것도,
 * 조용히 살아남는 것도 막는다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  RESET_DISPOSITION,
  STATE_KEY,
  emptyLedgerState,
  normalizeLedgerState,
  resetLedgerForPlan,
} from "./energy-ledger.mjs";
import { PLAN_CONFIG } from "./plan-policy.mjs";

const NOW = Date.UTC(2026, 6, 30, 3, 0, 0); // KST 2026-07-30 12:00
const TODAY_KEY = "2026-07-30";
const THIS_MONTH_KEY = "2026-07";

function memoryStorage() {
  const values = new Map();
  return {
    async get(key) { const v = values.get(key); return v === undefined ? undefined : structuredClone(v); },
    async put(key, value) { values.set(key, structuredClone(value)); },
    async delete(key) { values.delete(key); },
    async list({ prefix = "" } = {}) {
      const out = new Map();
      for (const [k, v] of [...values.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        if (k.startsWith(prefix)) out.set(k, structuredClone(v));
      }
      return out;
    },
  };
}

/* 모든 필드에 기본값과 다른 값을 심는다. 기본값과 같은 값을 심으면 "reset이 지웠다"와
   "원래 그 값이었다"가 구분되지 않아 테스트가 아무것도 증명하지 못한다. */
function seededState() {
  return {
    schemaVersion: 1,
    policyVersion: "seeded-policy",
    // 기본값(Asia/Seoul)과 달라야 심은 값이 살아남았는지 알 수 있다. UTC+9라 일자 키는 같다.
    timeZone: "Asia/Tokyo",
    balance: 999,
    reserved: 5,
    purchasedBalance: 7,
    lastGrantMonthKey: "2020-01",
    trialGrantKey: "trial-round-1",
    daily: { key: "2020-01-01", spent: 9, reserved: 2 },
    dailyCheer: { key: TODAY_KEY, celebrate: NOW - 1_000, comfort: 0 },
    requests: {
      "req-committed": { requestId: "req-committed", action: "companion_chat", cost: 1, status: "committed", createdAt: NOW - 9_000, updatedAt: NOW - 9_000, txnId: "t000000000001" },
      "req-reserved": { requestId: "req-reserved", action: "companion_chat", cost: 1, status: "reserved", createdAt: NOW - 8_000, updatedAt: NOW - 8_000 },
    },
    purchases: { "order-1": { orderId: "order-1", amount: 100, txnId: "t000000000002", at: NOW - 7_000 } },
    revision: 3,
    createdAt: NOW - 500_000,
    updatedAt: NOW - 100_000,
  };
}

async function runReset() {
  const storage = memoryStorage();
  await storage.put(STATE_KEY, seededState());
  const before = normalizeLedgerState(await storage.get(STATE_KEY), NOW);
  await resetLedgerForPlan(storage, { plan: "pro", now: NOW, reason: "plan_change" });
  const after = normalizeLedgerState(await storage.get(STATE_KEY), NOW);
  return { before, after, empty: emptyLedgerState(NOW) };
}

/* 각 필드가 처분대로 움직였는지 구체적으로 본다. 라벨(RESET_DISPOSITION)이 일반 규칙을
   강제하고, 여기가 그 라벨이 뜻하는 실제 값을 못 박는다. */
const EXPECTATIONS = {
  schemaVersion: ({ after }) => assert.equal(after.schemaVersion, 1),
  policyVersion: ({ after, empty }) => assert.equal(after.policyVersion, empty.policyVersion),
  timeZone: ({ after }) => assert.equal(after.timeZone, "Asia/Tokyo"),
  balance: ({ after }) => assert.equal(
    after.balance,
    PLAN_CONFIG.pro.monthlyCredits + 7,
    "정기 지급분은 회수하고 다시 지급하되 구매분 7은 남아야 한다",
  ),
  reserved: ({ after }) => assert.equal(after.reserved, 0),
  purchasedBalance: ({ after }) => assert.equal(after.purchasedBalance, 7, "돈을 낸 재화가 사라졌다"),
  lastGrantMonthKey: ({ after }) => assert.equal(after.lastGrantMonthKey, THIS_MONTH_KEY),
  trialGrantKey: ({ after }) => assert.equal(
    after.trialGrantKey,
    "trial-round-1",
    "회차 키가 지워졌다 — reset 뒤 같은 회차로 체험을 다시 받을 수 있다",
  ),
  daily: ({ after }) => assert.deepEqual(after.daily, { key: TODAY_KEY, spent: 0, reserved: 0 }),
  dailyCheer: ({ after, before }) => assert.deepEqual(
    after.dailyCheer,
    before.dailyCheer,
    "오늘 쓴 무료 응원이 되살아났다 — 전환을 반복하면 상한이 사라진다",
  ),
  requests: ({ after, before }) => {
    assert.deepEqual(
      Object.keys(after.requests).sort(),
      Object.keys(before.requests).sort(),
      "요청 레코드가 사라졌다 — 이미 쓴 requestId가 다시 통한다",
    );
    assert.equal(after.requests["req-committed"].status, "committed", "확정된 레코드를 건드렸다");
    assert.equal(after.requests["req-reserved"].status, "released", "진행 중이던 예약이 해제로 옮겨지지 않았다");
  },
  purchases: ({ after, before }) => assert.deepEqual(after.purchases, before.purchases),
  revision: ({ after, before }) => assert.ok(after.revision > before.revision, "revision이 올라가지 않았다"),
  createdAt: ({ after }) => assert.equal(after.createdAt, NOW - 500_000),
  updatedAt: ({ after }) => assert.equal(after.updatedAt, NOW),
};

/* ---------- ⓐ 등록 누락 ---------- */

test("원장 상태의 모든 필드가 RESET_DISPOSITION에 등록돼 있다", () => {
  assert.deepEqual(
    Object.keys(RESET_DISPOSITION).sort(),
    Object.keys(emptyLedgerState(NOW)).sort(),
    "새 상태 필드가 reset 처분 목록에 등록되지 않았다 — 조용히 지워지거나 조용히 살아남는다",
  );
});

test("등록된 모든 필드에 동작 검증이 있다", () => {
  assert.deepEqual(
    Object.keys(EXPECTATIONS).sort(),
    Object.keys(RESET_DISPOSITION).sort(),
    "처분만 선언하고 그 처분이 맞는지 보는 단언이 없다",
  );
});

test("처분 값은 정의된 넷 중 하나다", () => {
  const allowed = new Set(["cleared", "preserved", "rebuilt", "transitioned"]);
  for (const [field, disposition] of Object.entries(RESET_DISPOSITION)) {
    assert.ok(allowed.has(disposition), `${field}: 알 수 없는 처분 "${disposition}"`);
  }
});

/* ---------- ⓑ 선언과 동작의 일치 ---------- */

/* 라벨만 바꿔도 여기서 걸린다. preserved라고 적고 실제로 지우면 실패하고,
   그 반대도 실패한다. 목록이 장식이 아니라 명세가 되는 지점이다. */
test("reset이 각 필드를 선언한 처분대로 움직인다", async () => {
  const context = await runReset();
  for (const [field, disposition] of Object.entries(RESET_DISPOSITION)) {
    if (disposition === "preserved") {
      assert.deepEqual(
        context.after[field], context.before[field],
        `${field}: preserved로 선언했는데 reset이 값을 바꿨다`,
      );
    } else if (disposition === "cleared") {
      assert.deepEqual(
        context.after[field], context.empty[field],
        `${field}: cleared로 선언했는데 기본값이 아니다`,
      );
    } else if (disposition === "rebuilt") {
      assert.notDeepEqual(
        context.after[field], context.before[field],
        `${field}: rebuilt로 선언했는데 값이 그대로다`,
      );
    }
    // transitioned는 일반 규칙이 없다 — 아래 구체 단언이 직접 본다.
  }
});

test("reset 뒤 각 필드의 값이 명세와 일치한다", async () => {
  const context = await runReset();
  for (const [field, expect] of Object.entries(EXPECTATIONS)) expect(context);
});

/* ---------- 심은 값이 실제로 기본값과 다른가 ---------- */

/* 기본값과 같은 값을 심으면 preserved·cleared 단언이 둘 다 참이 되어 아무것도 증명하지
   못한다. W2의 dailyCheer 호환 테스트가 정확히 그 이유로 정규화 누락에도 통과했다. */
test("씨앗 상태의 모든 필드가 기본값과 다르다", () => {
  const seeded = normalizeLedgerState(seededState(), NOW);
  const empty = emptyLedgerState(NOW);
  const sameAsDefault = Object.keys(RESET_DISPOSITION).filter((field) => {
    // 버전 상수는 정규화가 항상 기본값으로 되돌리므로 심을 수 없다.
    if (field === "schemaVersion" || field === "policyVersion") return false;
    return JSON.stringify(seeded[field]) === JSON.stringify(empty[field]);
  });
  assert.deepEqual(
    sameAsDefault, [],
    "이 필드들은 기본값과 같은 값으로 심겼다 — reset이 지웠는지 원래 그랬는지 구분할 수 없다",
  );
});
