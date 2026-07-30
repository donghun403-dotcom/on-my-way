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
  PAYWALL_OFF_EXPIRED_GRANT,
  PLAN_CONFIG,
  PLAN_LABELS,
  PRO_ONLY_LOCK_REASON,
  allowsProOnlyFeature,
  getPlanConfig,
  isProOnlyAiAction,
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

/* 다이어리 북은 자격이 아니라 값이다. 플랜과 무관하게 AI_CREDIT_COSTS의 10을 소비한다.
   무료 엔타이틀먼트(월 1권)를 두면 그 발급만 원장 밖에서 일어나 원장이 AI 비용의 상한이라는
   성질이 깨진다 — 북은 앱에서 가장 비싼 단일 동작이라 그 구멍이 가장 크다.
   원장에는 이제 어떤 종류의 무료 자격도 없다. */
export const DIARY_BOOK_ACTION = "diary_book";

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
    /* 마지막으로 지급한 체험 회차 키(회원 레코드의 trialStartedAt). 같은 회차로 다시
       오면 grantTrialCredits가 아무 일도 하지 않는다 — 체험 크레딧 재충전을 막는 근거다. */
    trialGrantKey: "",
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
    trialGrantKey: String(value.trialGrantKey || ""),
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
   (체험 15 / PRO 250)가 다른 상태라 값이 확정되면 plan-policy.mjs 한 곳만 고치면 된다.

   paywallEnabled는 만료 계정에만 의미가 있다. 차단이 꺼져 있는 동안은 폐지 전 Free와
   같은 양을 지급해 아무도 잠기지 않게 하고, 켜면 0이 된다.

   지급은 lazy-grant다. 그래서 달 중간에 플래그를 켜거나 플랜이 만료로 넘어가도 그 달 이미
   지급된 몫은 잔액에 남고, 다음 달 첫 요청부터 0이 된다. 이것은 구현의 부산물이 아니라
   의도된 동작이다 — 이미 "이번 달 N크레딧"으로 지급한 것을 사후에 회수하면 제공하겠다고
   표시한 것을 없애는 셈이라 표시광고법상 문제가 된다. 소급 회수 로직을 넣지 마라. */

export function monthlyGrantAmount(plan, { paywallEnabled = true } = {}) {
  if (plan === "trial") return PLAN_CONFIG.pro.trial.credits;
  if (plan === "expired" && !paywallEnabled) return PAYWALL_OFF_EXPIRED_GRANT.monthlyCredits;
  const config = getPlanConfig(plan);
  return config ? config.monthlyCredits : 0;
}

export function dailySpendLimit(plan, { paywallEnabled = true } = {}) {
  if (plan === "expired" && !paywallEnabled) return PAYWALL_OFF_EXPIRED_GRANT.dailyCreditLimit;
  const config = getPlanConfig(plan);
  return config ? config.dailyCreditLimit : 0;
}

/* 값은 플랜이나 원장 상태로 갈리지 않는다. AI_CREDIT_COSTS가 유일한 근거다 —
   무료 자격이 사라진 뒤로 값을 깎을 조건이 하나도 남아 있지 않다. */
export function resolveActionCost(state, { action } = {}) {
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
async function applyLazyGrant(storage, state, { plan, period, now, paywallEnabled }) {
  if (state.lastGrantMonthKey === period.monthKey) return null;
  const amount = monthlyGrantAmount(plan, { paywallEnabled });
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

export function buildUsageView(state, { plan, period, trial = null, paywallEnabled = true } = {}) {
  const grant = monthlyGrantAmount(plan, { paywallEnabled });
  const dailyLimit = dailySpendLimit(plan, { paywallEnabled });
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
    /* 북은 항상 값이 있고 PRO 전용이다. 무료 권이 없어졌으므로 클라이언트가 읽을 것은
       값과 "이 플랜이 만들 수 있는가" 두 가지뿐이다. 판정은 서버가 하고 화면은 결과만 읽는다.
       allowed는 반드시 유효 플랜 문자열 비교여야 한다 — features를 보면 체험이 통과한다. */
    diaryBook: {
      cost: AI_CREDIT_COSTS[DIARY_BOOK_ACTION],
      proOnly: true,
      allowed: allowsProOnlyFeature(plan),
      lockReason: allowsProOnlyFeature(plan) ? "" : PRO_ONLY_LOCK_REASON,
    },
    // 차단이 켜져 있는지. 화면이 잠금을 그릴지 말지를 서버 판정으로 정한다.
    paywallEnabled: Boolean(paywallEnabled),
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

async function loadState(storage, { plan, now, timeZone, paywallEnabled }) {
  const state = normalizeLedgerState(await storage.get(STATE_KEY), now, timeZone);
  const period = getLedgerPeriod(now, state.timeZone);
  rollDaily(state, period);
  reclaimStaleReservations(state, now);
  await applyLazyGrant(storage, state, { plan, period, now, paywallEnabled });
  return { state, period };
}

async function saveState(storage, state, now) {
  state.revision += 1;
  state.updatedAt = now;
  pruneRequests(state, now);
  await storage.put(STATE_KEY, state);
}

// 예약: 잔액을 아직 빼지 않고 잡아만 둔다. AI 호출이 성공해야 spend로 확정된다.
export async function reserveEnergy(storage, { plan, action, requestId, now = Date.now(), timeZone, trial, paywallEnabled = true } = {}) {
  assertAction(action);
  const id = assertRequestId(requestId);
  const { state, period } = await loadState(storage, { plan, now, timeZone, paywallEnabled });

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
      status: existing.status,
      idempotent: true,
      shouldExecute: false,
      usage: buildUsageView(state, { plan, period, trial, paywallEnabled }),
    };
  }

  /* PRO 전용 동작(북)은 값을 재기 전에 플랜으로 막는다. 유효 플랜이 정확히 "pro"가 아니면
     예약을 잡지 않으므로 체험 계정의 잔액은 1도 움직이지 않는다. worker가 앞단에서 이미
     같은 판정을 하지만 원장에도 두는 이유는, 원장이 차감의 마지막 관문이고 새 호출 경로가
     생겼을 때 게이트를 빠뜨려도 여기서 걸리게 하기 위해서다. */
  if (isProOnlyAiAction(action) && !allowsProOnlyFeature(plan)) {
    await saveState(storage, state, now);
    throw new EnergyLedgerError(
      "PRO_ONLY_ACTION",
      `${AI_ACTION_LABELS[action] || "이 기능"}은 Pro 전용이에요. ${PRO_ONLY_LOCK_REASON}`,
      403,
      { plan, usage: buildUsageView(state, { plan, period, trial, paywallEnabled }) },
    );
  }

  const cost = resolveActionCost(state, { action });
  const dailyLimit = dailySpendLimit(plan, { paywallEnabled });
  if (dailyLimit - state.daily.spent - state.daily.reserved < cost) {
    await saveState(storage, state, now);
    throw new EnergyLedgerError(
      "DAILY_AI_CREDIT_LIMIT_EXCEEDED",
      `이 기능에는 ${cost}크레딧이 필요해요. 오늘 사용할 수 있는 크레딧이 부족해요.`,
      429,
      { requiredCredits: cost, usage: buildUsageView(state, { plan, period, trial, paywallEnabled }) },
    );
  }
  if (state.balance - state.reserved < cost) {
    await saveState(storage, state, now);
    const code = plan === "trial" ? "TRIAL_AI_CREDITS_EXHAUSTED" : "MONTHLY_AI_CREDITS_EXHAUSTED";
    const message = plan === "trial" ? "체험 AI 크레딧이 부족해요." : "이번 달 AI 크레딧이 부족해요.";
    throw new EnergyLedgerError(code, message, 429, { requiredCredits: cost, usage: buildUsageView(state, { plan, period, trial, paywallEnabled }) });
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
    errorCode: "",
  };
  await saveState(storage, state, now);

  return {
    ok: true,
    requestId: id,
    action,
    cost,
    status: "reserved",
    idempotent: false,
    shouldExecute: true,
    usage: buildUsageView(state, { plan, period, trial, paywallEnabled }),
  };
}

// 확정: 잡아 둔 몫을 실제로 차감하고 spend 거래를 남긴다.
export async function commitEnergy(storage, { plan, requestId, now = Date.now(), timeZone, meta, trial, paywallEnabled = true } = {}) {
  const id = assertRequestId(requestId);
  const { state, period } = await loadState(storage, { plan, now, timeZone, paywallEnabled });
  const request = state.requests[id];
  if (!request) {
    await saveState(storage, state, now);
    throw new EnergyLedgerError("RESERVATION_NOT_FOUND", "확정할 예약을 찾을 수 없어요.", 404);
  }
  if (request.status === "committed") {
    await saveState(storage, state, now);
    return { ok: true, requestId: id, chargedCredits: request.cost, idempotent: true, usage: buildUsageView(state, { plan, period, trial, paywallEnabled }) };
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

  const txn = await appendTransaction(storage, {
    type: TXN_TYPES.SPEND,
    amount: -request.cost,
    reason: request.action,
    at: now,
    balanceAfter: state.balance,
    meta: { requestId: id, ...(meta || {}) },
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
    idempotent: false,
    txnId: txn.txnId,
    usage: buildUsageView(state, { plan, period, trial, paywallEnabled }),
  };
}

// 원복: AI가 실패했을 때 잡아 둔 몫을 놓아 준다. 잔액을 건드린 적이 없으므로
// spend/refund 거래가 남지 않는다 — 실제로 오간 돈이 없기 때문이다.
export async function releaseEnergy(storage, { plan, requestId, now = Date.now(), timeZone, errorCode = "", trial, paywallEnabled = true } = {}) {
  const id = assertRequestId(requestId);
  const { state, period } = await loadState(storage, { plan, now, timeZone, paywallEnabled });
  const request = state.requests[id];
  if (!request) {
    await saveState(storage, state, now);
    throw new EnergyLedgerError("RESERVATION_NOT_FOUND", "되돌릴 예약을 찾을 수 없어요.", 404);
  }
  if (request.status === "released") {
    await saveState(storage, state, now);
    return { ok: true, requestId: id, releasedCredits: 0, idempotent: true, usage: buildUsageView(state, { plan, period, trial, paywallEnabled }) };
  }
  if (request.status === "committed") {
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
    return { ok: true, requestId: id, releasedCredits: request.cost, refunded: true, txnId: txn.txnId, usage: buildUsageView(state, { plan, period, trial, paywallEnabled }) };
  }

  state.reserved = Math.max(0, state.reserved - request.cost);
  state.daily.reserved = Math.max(0, state.daily.reserved - request.cost);
  request.status = "released";
  request.errorCode = String(errorCode || "");
  request.updatedAt = now;
  await saveState(storage, state, now);
  return { ok: true, requestId: id, releasedCredits: request.cost, idempotent: false, usage: buildUsageView(state, { plan, period, trial, paywallEnabled }) };
}

// 팩 충전. 이번 턴에 결제 연동은 하지 않지만 거래 타입과 orderId 멱등 자리는 만들어 둔다.
// 같은 orderId가 두 번 와도 한 번만 충전한다.
export async function purchaseEnergy(storage, { plan, orderId, amount, now = Date.now(), timeZone, expiresAt = 0, meta, trial, paywallEnabled = true } = {}) {
  const id = String(orderId || "").trim();
  if (!ORDER_ID_PATTERN.test(id)) {
    throw new EnergyLedgerError("INVALID_ORDER_ID", "주문 식별자가 올바르지 않아요.", 400);
  }
  const credits = Number(amount);
  if (!Number.isSafeInteger(credits) || credits <= 0) {
    throw new EnergyLedgerError("INVALID_PURCHASE_AMOUNT", "충전 수량이 올바르지 않아요.", 400);
  }
  const { state, period } = await loadState(storage, { plan, now, timeZone, paywallEnabled });

  const existing = state.purchases[id];
  if (existing) {
    await saveState(storage, state, now);
    return { ok: true, orderId: id, credited: 0, idempotent: true, txnId: existing.txnId, usage: buildUsageView(state, { plan, period, trial, paywallEnabled }) };
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
  return { ok: true, orderId: id, credited: credits, idempotent: false, txnId: txn.txnId, usage: buildUsageView(state, { plan, period, trial, paywallEnabled }) };
}

// 조회. 부수 효과가 있는 것처럼 보이지만 lazy-grant는 의도된 것이다 —
// 그 달 첫 접근이 조회여도 지급이 일어나야 잔량 표시가 맞는다.
export async function getEnergyUsage(storage, { plan, now = Date.now(), timeZone, trial, paywallEnabled = true } = {}) {
  const { state, period } = await loadState(storage, { plan, now, timeZone, paywallEnabled });
  await saveState(storage, state, now);
  return buildUsageView(state, { plan, period, trial, paywallEnabled });
}

/* 체험 회차별 지급 — 같은 회차에는 두 번 지급하지 않는다.

   왜 resetLedgerForPlan을 쓰지 않는가: 그건 "플랜 기준으로 통째로 다시 세운다"는 blunt한
   연산이라 몇 번을 부르든 매번 재지급한다. 체험 시작 엔드포인트가 그것을 불렀기 때문에
   /api/ai/trial/start를 반복 호출해 크레딧을 무한히 채울 수 있었다.

   여기서는 회차 키(trialStartedAt)를 상태에 남긴다. 같은 회차로 다시 오면 아무 일도
   하지 않고 현재 잔량을 그대로 돌려준다. 그래서 두 가지가 동시에 성립한다:
     ① 몇 번을 불러도 재지급이 불가능하다
     ② 지급이 실패했을 때 같은 회차로 다시 불러 안전하게 복구할 수 있다
   ②는 blunt reset을 조건부로 막기만 해서는 얻을 수 없었다 — 막으면 복구도 함께 막혔다.

   회차 키는 회원 레코드의 trialStartedAt이다. 원장이 만들지 않고 worker가 넘긴다.
   체험은 계정당 1회지만 키를 시각으로 두는 이유는, 나중에 재발급 정책이 생기더라도
   회차가 달라지면 자연스럽게 새 지급이 되게 하기 위해서다. */
export async function grantTrialCredits(storage, { plan, trialKey, now = Date.now(), timeZone, trial, paywallEnabled = true } = {}) {
  const key = String(trialKey || "").trim();
  if (!key) {
    throw new EnergyLedgerError("TRIAL_KEY_REQUIRED", "체험 회차를 확인할 수 없어요.", 400);
  }

  const state = normalizeLedgerState(await storage.get(STATE_KEY), now, timeZone);
  const period = getLedgerPeriod(now, state.timeZone);

  if (state.trialGrantKey === key) {
    // 이미 이 회차에 지급했다. 잔량을 건드리지 않고 사실만 알린다.
    await saveState(storage, state, now);
    return {
      ...buildUsageView(state, { plan, period, trial, paywallEnabled }),
      granted: false,
      idempotent: true,
      trialGrantKey: key,
    };
  }

  /* 체험 지급은 "이번 달 지급"의 자리를 쓴다. 가입 직후 만료 플랜으로 당월 지급이 이미
     찍혀 있으면 lastGrantMonthKey가 세팅돼 lazy grant가 다시 돌지 않으므로, 그 자리를
     비워 체험 플랜 기준으로 다시 지급받게 한다. 구매분은 건드리지 않는다 — 돈을 낸 재화다. */
  const removed = Math.max(0, state.balance - state.purchasedBalance);
  if (removed > 0) {
    state.balance -= removed;
    await appendTransaction(storage, {
      type: TXN_TYPES.REFUND,
      amount: -removed,
      reason: "trial_grant_reset",
      at: now,
      balanceAfter: state.balance,
    });
  }
  state.lastGrantMonthKey = "";
  await applyLazyGrant(storage, state, { plan, period, now, paywallEnabled });
  state.trialGrantKey = key;
  await saveState(storage, state, now);

  return {
    ...buildUsageView(state, { plan, period, trial, paywallEnabled }),
    granted: true,
    idempotent: false,
    trialGrantKey: key,
  };
}

// 마이그레이션: 로컬/KV 잔량을 믿지 않고 플랜 기준으로 다시 세운다.
// 이번 달 grant 기록을 지우고 다시 지급하므로 결과는 "그 플랜의 당월 지급액"이 된다.
export async function resetLedgerForPlan(storage, { plan, now = Date.now(), timeZone, reason = "migration", trial, paywallEnabled = true } = {}) {
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

  /* 요청 레코드는 지우지 않는다. 이것이 requestId 멱등성의 유일한 근거라, 여기서
     비우면 플랜 전환 한 번에 그때까지 쓴 모든 requestId가 다시 통하게 된다.
     멱등성 보장이 플랜 전환 이벤트에 의존해서는 안 된다.

     무한 증가는 이 함수가 막을 일이 아니다 — loadState가 부르는 pruneRequests가
     종료된 요청을 나이순으로 걷어 간다(keep 200). 감사 기록은 txn: 키에 따로 남는다.

     다만 진행 중이던 예약은 위에서 카운터를 0으로 되돌렸으므로 레코드도 해제로
     맞춘다. 레코드 자체는 남으므로 그 requestId의 재사용은 계속 막힌다. */
  for (const request of Object.values(state.requests)) {
    if (request.status !== "reserved") continue;
    request.status = "released";
    request.errorCode = `${reason}_reset`;
    request.updatedAt = now;
  }

  await applyLazyGrant(storage, state, { plan, period, now, paywallEnabled });
  await saveState(storage, state, now);
  return buildUsageView(state, { plan, period, trial, paywallEnabled });
}
