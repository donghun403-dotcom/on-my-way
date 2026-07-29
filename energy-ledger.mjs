// 에너지(AI 크레딧) 원장 — 순수 로직.
//
// 왜 별도 모듈인가: 이 파일은 I/O를 모른다. 저장소는 `storage`(get/put/delete/list)로
// 주입받고, 시간은 인자로 받는다. 덕분에 Durable Object 밖에서도 그대로 테스트할 수 있고,
// DO는 이 로직을 `ctx.storage.transaction()`으로 감싸기만 하면 된다.
//
// 왜 지갑(balance)인가: 기존 ai-credits-service는 "한도 − 사용량" 미터였다. 팩(purchase)은
// 월 리셋과 무관하게 쌓이고 유효기간이 따로 있으므로 미터로는 표현할 수 없다. 잔액을 두고
// 월 정기 지급(grant)과 구매(purchase)가 같은 잔액에 들어오게 한다. 일일 한도는 잔액과
// 별개의 속도 제한으로 남는다 — 하루에 몰아 쓰는 것을 막는 장치라 지갑화와 무관하게 유효하다.

import {
  AI_ACTION_LABELS,
  AI_CREDIT_COSTS,
  CREDIT_POLICY_VERSION,
  DEFAULT_TIME_ZONE,
  PLAN_CONFIG,
  PLAN_LABELS,
  getPlanConfig,
  hasMonthlyFreeDiaryBook,
} from "./plan-policy.mjs";

export const ENERGY_LEDGER_SCHEMA_VERSION = 1;

export const STATE_KEY = "state";
export const SEQ_KEY = "seq";
export const TXN_PREFIX = "txn:";

// 거래 종류. grant/purchase는 잔액을 늘리고, spend는 줄이고, refund는 되돌린다.
export const TXN_TYPES = Object.freeze({
  GRANT: "grant",
  SPEND: "spend",
  REFUND: "refund",
  PURCHASE: "purchase",
});

// 예약이 이 시간을 넘겨 확정도 원복도 되지 않으면 고아로 보고 잔액을 되돌린다.
// (worker가 죽어 commit/release를 못 부른 경우)
export const RESERVATION_TTL_MS = 10 * 60 * 1_000;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ORDER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/* PRO의 "매월 다이어리 북 1권 무료"는 통화가 아니라 자격이다. 에너지를 10 얹어 주면
   대화에 쓸 수 있게 되어 혜택의 모양이 달라진다. 그래서 잔액을 건드리지 않고 월 키
   하나로 소진 여부만 기록한다 — lazy-grant와 같은 원리다. */
export const DIARY_BOOK_ACTION = "diary_book";
export const MONTHLY_DIARY_BOOK_ENTITLEMENT = "monthly_diary_book";

export class EnergyLedgerError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = "EnergyLedgerError";
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}

/* ---------- 시간대(KST) 경계 ---------- */

function pad2(value) {
  return String(value).padStart(2, "0");
}

function validTimeZone(value) {
  const zone = String(value || "").trim();
  if (!zone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function zonedParts(timestamp, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = {};
  for (const part of formatter.formatToParts(new Date(timestamp))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  // Intl은 자정을 24로 주는 구현이 있다.
  if (parts.hour === 24) parts.hour = 0;
  return parts;
}

function timeZoneOffsetMs(timestamp, timeZone) {
  const parts = zonedParts(timestamp, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(timestamp / 1_000) * 1_000;
}

function zonedMidnightToUtc(year, monthIndex, day, timeZone) {
  const guess = Date.UTC(year, monthIndex, day, 0, 0, 0);
  const offset = timeZoneOffsetMs(guess, timeZone);
  return guess - offset;
}

// 그 시각이 속한 KST 하루/한 달의 키와 다음 경계를 돌려준다.
export function getLedgerPeriod(now = Date.now(), requestedTimeZone = DEFAULT_TIME_ZONE) {
  const timeZone = validTimeZone(requestedTimeZone);
  const nowMs = Number(now);
  const parts = zonedParts(nowMs, timeZone);
  const dayKey = `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  const monthKey = `${parts.year}-${pad2(parts.month)}`;
  const dailyResetsAtMs = zonedMidnightToUtc(parts.year, parts.month - 1, parts.day + 1, timeZone);
  const monthlyResetsAtMs = zonedMidnightToUtc(parts.year, parts.month, 1, timeZone);
  return { timeZone, dayKey, monthKey, dailyResetsAtMs, monthlyResetsAtMs };
}

/* ---------- 상태 정규화 ---------- */

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function finiteTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function emptyLedgerState(now = Date.now(), timeZone = DEFAULT_TIME_ZONE) {
  return {
    schemaVersion: ENERGY_LEDGER_SCHEMA_VERSION,
    policyVersion: CREDIT_POLICY_VERSION,
    timeZone: validTimeZone(timeZone),
    // 확정 잔액. 예약은 여기서 빼지 않고 reserved에 따로 잡는다 — 예약이 원복되면
    // 잔액을 건드린 적이 없으므로 되돌릴 것이 없다(원장에 spend 기록도 남지 않는다).
    balance: 0,
    reserved: 0,
    // balance 중 구매로 들어온 몫. 월 이월 소멸과 마이그레이션 재부여에서 이 몫만은
    // 건드리지 않는다 — 돈을 낸 재화이기 때문이다.
    purchasedBalance: 0,
    // 이번 달 정기 지급 여부. lazy-grant 판정에 쓴다.
    lastGrantMonthKey: "",
    // 이번 달 무료 다이어리 북을 이미 받았는지. 비어 있으면 아직 안 받았다는 뜻이다.
    freeDiaryBookMonthKey: "",
    // 일일 속도 제한. 키가 바뀌면 0으로 리셋한다.
    daily: { key: "", spent: 0, reserved: 0 },
    // 진행 중/최근 예약. requestId 멱등 처리를 겸한다.
    requests: {},
    // orderId → txnId. 같은 결제 콜백이 두 번 와도 한 번만 충전한다.
    purchases: {},
    revision: 0,
    createdAt: Number(now),
    updatedAt: Number(now),
  };
}

function normalizeRequests(value) {
  if (!isRecord(value)) return {};
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    if (!REQUEST_ID_PATTERN.test(key)) continue;
    result[key] = {
      requestId: key,
      action: String(raw.action || ""),
      cost: nonNegativeInteger(raw.cost),
      status: raw.status === "committed" || raw.status === "released" ? raw.status : "reserved",
      createdAt: finiteTimestamp(raw.createdAt),
      updatedAt: finiteTimestamp(raw.updatedAt),
      txnId: String(raw.txnId || ""),
      fromPurchased: nonNegativeInteger(raw.fromPurchased),
      // 무료 자격으로 잡은 예약인지, 확정하며 어느 달의 자격을 썼는지.
      entitlement: String(raw.entitlement || ""),
      entitlementMonthKey: String(raw.entitlementMonthKey || ""),
      errorCode: String(raw.errorCode || ""),
    };
  }
  return result;
}

function normalizePurchases(value) {
  if (!isRecord(value)) return {};
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!ORDER_ID_PATTERN.test(key) || !isRecord(raw)) continue;
    result[key] = {
      orderId: key,
      amount: nonNegativeInteger(raw.amount),
      txnId: String(raw.txnId || ""),
      at: finiteTimestamp(raw.at),
    };
  }
  return result;
}

export function normalizeLedgerState(value, now = Date.now(), timeZone = DEFAULT_TIME_ZONE) {
  const base = emptyLedgerState(now, timeZone);
  if (!isRecord(value)) return base;
  const daily = isRecord(value.daily) ? value.daily : {};
  return {
    ...base,
    timeZone: validTimeZone(value.timeZone || timeZone),
    balance: nonNegativeInteger(value.balance),
    reserved: nonNegativeInteger(value.reserved),
    purchasedBalance: Math.min(nonNegativeInteger(value.purchasedBalance), nonNegativeInteger(value.balance)),
    lastGrantMonthKey: String(value.lastGrantMonthKey || ""),
    freeDiaryBookMonthKey: String(value.freeDiaryBookMonthKey || ""),
    daily: {
      key: String(daily.key || ""),
      spent: nonNegativeInteger(daily.spent),
      reserved: nonNegativeInteger(daily.reserved),
    },
    requests: normalizeRequests(value.requests),
    purchases: normalizePurchases(value.purchases),
    revision: nonNegativeInteger(value.revision),
    createdAt: finiteTimestamp(value.createdAt) || base.createdAt,
    updatedAt: finiteTimestamp(value.updatedAt) || base.updatedAt,
  };
}

/* ---------- 플랜별 지급액 ----------
   금액은 여기서 정하지 않고 PLAN_CONFIG에서 읽는다. 스펙(체험 10 / PRO 300)과 코드
   (체험 15 / PRO 250)가 다른 상태라 값이 확정되면 plan-policy.mjs 한 곳만 고치면 된다. */

export function monthlyGrantAmount(plan) {
  if (plan === "trial") return PLAN_CONFIG.pro.trial.credits;
  const config = getPlanConfig(plan);
  return config ? config.monthlyCredits : 0;
}

export function dailySpendLimit(plan) {
  const config = getPlanConfig(plan);
  return config ? config.dailyCreditLimit : 0;
}

/* 이번 달 무료 다이어리 북이 아직 남아 있는가. 자격을 쓰는 시점은 예약이 아니라 확정이다 —
   AI가 실패한 요청이 그 달의 유일한 무료 권을 태워 버리면 안 된다. */
export function hasFreeDiaryBook(state, { plan, period }) {
  return hasMonthlyFreeDiaryBook(plan) && state.freeDiaryBookMonthKey !== period.monthKey;
}

export function resolveActionCost(state, { plan, action, period }) {
  if (action === DIARY_BOOK_ACTION && hasFreeDiaryBook(state, { plan, period })) return 0;
  return AI_CREDIT_COSTS[action];
}

/* ---------- 거래 기록 (append-only) ----------
   거래는 상태 레코드 안에 배열로 쌓지 않고 `txn:<seq>` 개별 키로 append한다.
   상태 레코드를 작게 유지해야 매 요청의 읽기·쓰기가 커지지 않고, 이미 쓴 거래를
   나중에 수정할 수 없게 만들어 감사 기록으로서 신뢰할 수 있다. */

function txnKey(seq) {
  return `${TXN_PREFIX}${String(seq).padStart(12, "0")}`;
}

async function appendTransaction(storage, { type, amount, reason, at, balanceAfter, meta }) {
  const seq = nonNegativeInteger(await storage.get(SEQ_KEY)) + 1;
  const txnId = `t${String(seq).padStart(12, "0")}`;
  const value = Number(amount);
  const record = {
    txnId,
    seq,
    type,
    // 0원짜리 거래(무료 자격 소진)에서 -0이 남지 않게 한다 — 감사 기록에 부호만 붙은 0은 잡음이다.
    amount: Object.is(value, -0) ? 0 : value,
    reason: String(reason || ""),
    at: Number(at),
    balanceAfter: Number(balanceAfter),
  };
  if (meta && Object.keys(meta).length) record.meta = meta;
  await storage.put(txnKey(seq), record);
  await storage.put(SEQ_KEY, seq);
  return record;
}

export async function listTransactions(storage, { limit = 50 } = {}) {
  const entries = await storage.list({ prefix: TXN_PREFIX });
  const rows = [];
  for (const [, value] of entries) rows.push(value);
  rows.sort((a, b) => Number(b.seq) - Number(a.seq));
  return rows.slice(0, Math.max(1, Math.min(500, Number(limit) || 50)));
}

/* ---------- 기간 롤오버 + lazy-grant ---------- */

function rollDaily(state, period) {
  if (state.daily.key === period.dayKey) return false;
  state.daily = { key: period.dayKey, spent: 0, reserved: 0 };
  return true;
}

// 그 달 grant 기록이 없으면 지급한다. 유저별 크론이 필요 없는 이유가 이것이다 —
// 그 달 첫 요청이 들어오는 순간 지급이 일어난다. 요청이 없는 달은 지급도 없고,
// 이월하지 않으므로(creditsRollover=false) 지난 달 잔액은 지급 시점에 정리한다.
async function applyLazyGrant(storage, state, { plan, period, now }) {
  if (state.lastGrantMonthKey === period.monthKey) return null;
  const amount = monthlyGrantAmount(plan);
  const previousMonth = state.lastGrantMonthKey;
  // 이월 없음(creditsRollover=false): 새 달 지급 시 지난 달 정기 잔액은 소멸한다.
  // 단 구매분은 유효기간이 따로 있으므로 남긴다 — 정기 지급으로 들어온 몫만 회수한다.
  const expiring = Math.max(0, state.balance - state.purchasedBalance);
  if (expiring > 0) {
    state.balance -= expiring;
    await appendTransaction(storage, {
      type: TXN_TYPES.REFUND,
      amount: -expiring,
      reason: "monthly_expire",
      at: now,
      balanceAfter: state.balance,
      meta: { month: previousMonth },
    });
  }
  state.balance += amount;
  state.lastGrantMonthKey = period.monthKey;
  const txn = await appendTransaction(storage, {
    type: TXN_TYPES.GRANT,
    amount,
    reason: "monthly_grant",
    at: now,
    balanceAfter: state.balance,
    meta: { plan, month: period.monthKey },
  });
  return txn;
}

// TTL을 넘긴 예약은 고아로 보고 잡아 둔 몫을 되돌린다.
function reclaimStaleReservations(state, now) {
  let reclaimed = 0;
  for (const request of Object.values(state.requests)) {
    if (request.status !== "reserved") continue;
    if (request.updatedAt + RESERVATION_TTL_MS > now) continue;
    request.status = "released";
    request.errorCode = "RESERVATION_EXPIRED";
    request.updatedAt = now;
    state.reserved = Math.max(0, state.reserved - request.cost);
    if (state.daily.key) state.daily.reserved = Math.max(0, state.daily.reserved - request.cost);
    reclaimed += request.cost;
  }
  return reclaimed;
}

// 오래된 종료 요청은 정리해 상태 레코드가 무한히 자라지 않게 한다.
// 거래 기록은 txn: 키에 따로 남으므로 감사에는 영향이 없다.
function pruneRequests(state, now, keep = 200) {
  const entries = Object.entries(state.requests);
  if (entries.length <= keep) return;
  const finished = entries
    .filter(([, request]) => request.status !== "reserved")
    .sort((a, b) => a[1].updatedAt - b[1].updatedAt);
  const removeCount = entries.length - keep;
  for (let index = 0; index < Math.min(removeCount, finished.length); index += 1) {
    delete state.requests[finished[index][0]];
  }
  void now;
}

/* ---------- 조회용 응답 ----------
   클라이언트는 이미 usage.daily / usage.monthly 를 그리고 있다(script.js applyAiUsage).
   그 계약을 깨지 않으려고 같은 모양을 유지하되, monthly.limit 은 이제 "그 달 지급액"이고
   remaining 은 실제 잔액이다. */

export function buildUsageView(state, { plan, period, trial = null } = {}) {
  const grant = monthlyGrantAmount(plan);
  const dailyLimit = dailySpendLimit(plan);
  const dailyRemaining = Math.max(0, dailyLimit - state.daily.spent - state.daily.reserved);
  const available = Math.max(0, state.balance - state.reserved);
  return {
    ok: true,
    schemaVersion: ENERGY_LEDGER_SCHEMA_VERSION,
    policyVersion: CREDIT_POLICY_VERSION,
    timeZone: state.timeZone,
    plan,
    planLabel: PLAN_LABELS[plan] || plan,
    balance: state.balance,
    reserved: state.reserved,
    available,
    purchasedBalance: nonNegativeInteger(state.purchasedBalance),
    // 체험 자격·기간은 원장이 모른다(회원 레코드의 사실이다). worker가 넘겨준 값을
    // 그대로 싣되 남은 크레딧만 원장의 실제 잔량으로 채운다.
    trial: {
      eligible: Boolean(trial?.eligible),
      active: trial ? Boolean(trial.active) : plan === "trial",
      startedAt: trial?.startedAt ?? null,
      endsAt: trial?.endsAt ?? null,
      remainingCredits: (trial ? Boolean(trial.active) : plan === "trial") ? available : 0,
    },
    daily: {
      used: state.daily.spent,
      reserved: state.daily.reserved,
      limit: dailyLimit,
      remaining: dailyRemaining,
      resetsAt: new Date(period.dailyResetsAtMs).toISOString(),
    },
    monthly: {
      used: Math.max(0, grant - available),
      reserved: state.reserved,
      limit: grant,
      remaining: available,
      resetsAt: new Date(period.monthlyResetsAtMs).toISOString(),
    },
    creditCosts: { ...AI_CREDIT_COSTS },
    actionLabels: { ...AI_ACTION_LABELS },
    /* 클라이언트가 버튼에 "이번 달 무료"와 "에너지 10" 중 무엇을 쓸지 정할 근거.
       판정 자체는 서버가 하고, 클라이언트는 결과만 읽는다. */
    diaryBook: {
      cost: AI_CREDIT_COSTS[DIARY_BOOK_ACTION],
      monthlyFree: hasMonthlyFreeDiaryBook(plan),
      freeAvailable: hasFreeDiaryBook(state, { plan, period }),
    },
  };
}

/* ---------- 공개 연산 ---------- */

function assertAction(action) {
  if (!Object.hasOwn(AI_CREDIT_COSTS, action)) {
    throw new EnergyLedgerError("INVALID_AI_ACTION", "지원하지 않는 AI 작업이에요.", 400);
  }
}

function assertRequestId(requestId) {
  const id = String(requestId || "").trim();
  if (!REQUEST_ID_PATTERN.test(id)) {
    throw new EnergyLedgerError("INVALID_REQUEST_ID", "요청 식별자가 올바르지 않아요.", 400);
  }
  return id;
}

async function loadState(storage, { plan, now, timeZone }) {
  const state = normalizeLedgerState(await storage.get(STATE_KEY), now, timeZone);
  const period = getLedgerPeriod(now, state.timeZone);
  rollDaily(state, period);
  reclaimStaleReservations(state, now);
  await applyLazyGrant(storage, state, { plan, period, now });
  return { state, period };
}

async function saveState(storage, state, now) {
  state.revision += 1;
  state.updatedAt = now;
  pruneRequests(state, now);
  await storage.put(STATE_KEY, state);
}

// 예약: 잔액을 아직 빼지 않고 잡아만 둔다. AI 호출이 성공해야 spend로 확정된다.
export async function reserveEnergy(storage, { plan, action, requestId, now = Date.now(), timeZone, trial } = {}) {
  assertAction(action);
  const id = assertRequestId(requestId);
  const { state, period } = await loadState(storage, { plan, now, timeZone });

  const existing = state.requests[id];
  if (existing) {
    if (existing.action !== action) {
      await saveState(storage, state, now);
      throw new EnergyLedgerError("REQUEST_ID_CONFLICT", "같은 requestId를 다른 AI 작업에 사용할 수 없어요.", 409);
    }
    await saveState(storage, state, now);
    return {
      ok: true,
      requestId: id,
      action,
      cost: existing.cost,
      entitlement: existing.entitlement,
      status: existing.status,
      idempotent: true,
      shouldExecute: false,
      usage: buildUsageView(state, { plan, period, trial }),
    };
  }

  const cost = resolveActionCost(state, { plan, action, period });
  const entitlement = cost === 0 && action === DIARY_BOOK_ACTION ? MONTHLY_DIARY_BOOK_ENTITLEMENT : "";
  const dailyLimit = dailySpendLimit(plan);
  if (dailyLimit - state.daily.spent - state.daily.reserved < cost) {
    await saveState(storage, state, now);
    throw new EnergyLedgerError(
      "DAILY_AI_CREDIT_LIMIT_EXCEEDED",
      `이 기능에는 ${cost}크레딧이 필요해요. 오늘 사용할 수 있는 크레딧이 부족해요.`,
      429,
      { requiredCredits: cost, usage: buildUsageView(state, { plan, period, trial }) },
    );
  }
  if (state.balance - state.reserved < cost) {
    await saveState(storage, state, now);
    const code = plan === "trial" ? "TRIAL_AI_CREDITS_EXHAUSTED" : "MONTHLY_AI_CREDITS_EXHAUSTED";
    const message = plan === "trial" ? "체험 AI 크레딧이 부족해요." : "이번 달 AI 크레딧이 부족해요.";
    throw new EnergyLedgerError(code, message, 429, { requiredCredits: cost, usage: buildUsageView(state, { plan, period, trial }) });
  }

  state.reserved += cost;
  state.daily.reserved += cost;
  state.requests[id] = {
    requestId: id,
    action,
    cost,
    status: "reserved",
    createdAt: now,
    updatedAt: now,
    txnId: "",
    entitlement,
    entitlementMonthKey: "",
    errorCode: "",
  };
  await saveState(storage, state, now);

  return {
    ok: true,
    requestId: id,
    action,
    cost,
    entitlement,
    status: "reserved",
    idempotent: false,
    shouldExecute: true,
    usage: buildUsageView(state, { plan, period, trial }),
  };
}

// 확정: 잡아 둔 몫을 실제로 차감하고 spend 거래를 남긴다.
export async function commitEnergy(storage, { plan, requestId, now = Date.now(), timeZone, meta, trial } = {}) {
  const id = assertRequestId(requestId);
  const { state, period } = await loadState(storage, { plan, now, timeZone });
  const request = state.requests[id];
  if (!request) {
    await saveState(storage, state, now);
    throw new EnergyLedgerError("RESERVATION_NOT_FOUND", "확정할 예약을 찾을 수 없어요.", 404);
  }
  if (request.status === "committed") {
    await saveState(storage, state, now);
    return { ok: true, requestId: id, chargedCredits: request.cost, idempotent: true, usage: buildUsageView(state, { plan, period, trial }) };
  }
  if (request.status === "released") {
    await saveState(storage, state, now);
    throw new EnergyLedgerError("RESERVATION_ALREADY_RELEASED", "이미 되돌린 예약이에요.", 409);
  }

  state.reserved = Math.max(0, state.reserved - request.cost);
  state.daily.reserved = Math.max(0, state.daily.reserved - request.cost);
  state.daily.spent += request.cost;
  // 정기 지급분을 먼저 쓰고 구매분은 나중에 쓴다 — 구매분이 유효기간이 길어서
  // 늦게 쓸수록 유저에게 유리하다.
  const grantBalance = Math.max(0, state.balance - state.purchasedBalance);
  const fromPurchased = Math.max(0, request.cost - grantBalance);
  state.balance = Math.max(0, state.balance - request.cost);
  state.purchasedBalance = Math.max(0, state.purchasedBalance - fromPurchased);

  /* 무료 자격으로 만든 요청은 여기서 그 달의 자격을 소진한다. 잔액은 0원어치 움직이지만
     거래는 남긴다 — "이번 달 무료 권을 언제 썼는지"가 CS 분쟁의 대상이기 때문이다. */
  if (request.entitlement === MONTHLY_DIARY_BOOK_ENTITLEMENT) {
    request.entitlementMonthKey = period.monthKey;
    state.freeDiaryBookMonthKey = period.monthKey;
  }

  const txn = await appendTransaction(storage, {
    type: TXN_TYPES.SPEND,
    amount: -request.cost,
    reason: request.action,
    at: now,
    balanceAfter: state.balance,
    meta: {
      requestId: id,
      ...(request.entitlement ? { entitlement: request.entitlement, month: period.monthKey } : {}),
      ...(meta || {}),
    },
  });
  request.status = "committed";
  request.txnId = txn.txnId;
  // 어느 주머니에서 나갔는지 남긴다. 확정 후 환불할 때 같은 주머니로 돌려주기 위해서다.
  request.fromPurchased = fromPurchased;
  request.updatedAt = now;
  await saveState(storage, state, now);

  return {
    ok: true,
    requestId: id,
    chargedCredits: request.cost,
    entitlement: request.entitlement,
    idempotent: false,
    txnId: txn.txnId,
    usage: buildUsageView(state, { plan, period, trial }),
  };
}

// 원복: AI가 실패했을 때 잡아 둔 몫을 놓아 준다. 잔액을 건드린 적이 없으므로
// spend/refund 거래가 남지 않는다 — 실제로 오간 돈이 없기 때문이다.
export async function releaseEnergy(storage, { plan, requestId, now = Date.now(), timeZone, errorCode = "", trial } = {}) {
  const id = assertRequestId(requestId);
  const { state, period } = await loadState(storage, { plan, now, timeZone });
  const request = state.requests[id];
  if (!request) {
    await saveState(storage, state, now);
    throw new EnergyLedgerError("RESERVATION_NOT_FOUND", "되돌릴 예약을 찾을 수 없어요.", 404);
  }
  if (request.status === "released") {
    await saveState(storage, state, now);
    return { ok: true, requestId: id, releasedCredits: 0, idempotent: true, usage: buildUsageView(state, { plan, period, trial }) };
  }
  if (request.status === "committed") {
    /* 무료 자격으로 만든 건을 되돌리면 자격도 돌려준다. 그러지 않으면 실패한 발급 하나로
       그 달의 무료 권이 사라진다. 그 사이 다른 요청이 이미 자격을 가져갔으면 건드리지 않는다. */
    if (request.entitlement === MONTHLY_DIARY_BOOK_ENTITLEMENT && state.freeDiaryBookMonthKey === request.entitlementMonthKey) {
      state.freeDiaryBookMonthKey = "";
    }
    // 이미 확정된 건은 환불 거래로 되돌린다 (기록을 지우지 않는다).
    state.balance += request.cost;
    // 나간 주머니 그대로 돌려준다 — 구매분에서 나갔으면 구매분으로 복구해야
    // 유저가 돈 주고 산 몫이 월 소멸에 휩쓸리지 않는다.
    state.purchasedBalance += nonNegativeInteger(request.fromPurchased);
    state.daily.spent = Math.max(0, state.daily.spent - request.cost);
    const txn = await appendTransaction(storage, {
      type: TXN_TYPES.REFUND,
      amount: request.cost,
      reason: errorCode || "post_commit_refund",
      at: now,
      balanceAfter: state.balance,
      meta: { requestId: id, refundOf: request.txnId },
    });
    request.status = "released";
    request.errorCode = String(errorCode || "");
    request.updatedAt = now;
    await saveState(storage, state, now);
    return { ok: true, requestId: id, releasedCredits: request.cost, refunded: true, txnId: txn.txnId, usage: buildUsageView(state, { plan, period, trial }) };
  }

  state.reserved = Math.max(0, state.reserved - request.cost);
  state.daily.reserved = Math.max(0, state.daily.reserved - request.cost);
  request.status = "released";
  request.errorCode = String(errorCode || "");
  request.updatedAt = now;
  await saveState(storage, state, now);
  return { ok: true, requestId: id, releasedCredits: request.cost, idempotent: false, usage: buildUsageView(state, { plan, period, trial }) };
}

// 팩 충전. 이번 턴에 결제 연동은 하지 않지만 거래 타입과 orderId 멱등 자리는 만들어 둔다.
// 같은 orderId가 두 번 와도 한 번만 충전한다.
export async function purchaseEnergy(storage, { plan, orderId, amount, now = Date.now(), timeZone, expiresAt = 0, meta, trial } = {}) {
  const id = String(orderId || "").trim();
  if (!ORDER_ID_PATTERN.test(id)) {
    throw new EnergyLedgerError("INVALID_ORDER_ID", "주문 식별자가 올바르지 않아요.", 400);
  }
  const credits = Number(amount);
  if (!Number.isSafeInteger(credits) || credits <= 0) {
    throw new EnergyLedgerError("INVALID_PURCHASE_AMOUNT", "충전 수량이 올바르지 않아요.", 400);
  }
  const { state, period } = await loadState(storage, { plan, now, timeZone });

  const existing = state.purchases[id];
  if (existing) {
    await saveState(storage, state, now);
    return { ok: true, orderId: id, credited: 0, idempotent: true, txnId: existing.txnId, usage: buildUsageView(state, { plan, period, trial }) };
  }

  state.balance += credits;
  state.purchasedBalance = nonNegativeInteger(state.purchasedBalance) + credits;
  const txn = await appendTransaction(storage, {
    type: TXN_TYPES.PURCHASE,
    amount: credits,
    reason: "pack_purchase",
    at: now,
    balanceAfter: state.balance,
    meta: { orderId: id, expiresAt: Number(expiresAt) || 0, ...(meta || {}) },
  });
  state.purchases[id] = { orderId: id, amount: credits, txnId: txn.txnId, at: now };
  await saveState(storage, state, now);
  return { ok: true, orderId: id, credited: credits, idempotent: false, txnId: txn.txnId, usage: buildUsageView(state, { plan, period, trial }) };
}

// 조회. 부수 효과가 있는 것처럼 보이지만 lazy-grant는 의도된 것이다 —
// 그 달 첫 접근이 조회여도 지급이 일어나야 잔량 표시가 맞는다.
export async function getEnergyUsage(storage, { plan, now = Date.now(), timeZone, trial } = {}) {
  const { state, period } = await loadState(storage, { plan, now, timeZone });
  await saveState(storage, state, now);
  return buildUsageView(state, { plan, period, trial });
}

// 마이그레이션: 로컬/KV 잔량을 믿지 않고 플랜 기준으로 다시 세운다.
// 이번 달 grant 기록을 지우고 다시 지급하므로 결과는 "그 플랜의 당월 지급액"이 된다.
export async function resetLedgerForPlan(storage, { plan, now = Date.now(), timeZone, reason = "migration", trial } = {}) {
  const state = normalizeLedgerState(await storage.get(STATE_KEY), now, timeZone);
  const period = getLedgerPeriod(now, state.timeZone);
  // 구매분은 절대 건드리지 않는다 — 돈을 낸 재화다.
  const removed = Math.max(0, state.balance - state.purchasedBalance);
  if (removed > 0) {
    state.balance -= removed;
    await appendTransaction(storage, {
      type: TXN_TYPES.REFUND,
      amount: -removed,
      reason: `${reason}_reset`,
      at: now,
      balanceAfter: state.balance,
    });
  }
  state.lastGrantMonthKey = "";
  state.reserved = 0;
  state.daily = { key: period.dayKey, spent: 0, reserved: 0 };
  state.requests = {};
  await applyLazyGrant(storage, state, { plan, period, now });
  await saveState(storage, state, now);
  return buildUsageView(state, { plan, period, trial });
}
