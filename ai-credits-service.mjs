/* KV 기반 AI 크레딧 회계 — 배포 경로에서는 더 이상 차감에 쓰이지 않는다.
 *
 * ┌─ 읽기 전에 알아야 할 것 ────────────────────────────────────────────────────┐
 * │ 배포된 워커의 예약·커밋·해제·조회는 전부 EnergyLedger Durable Object가 한다   │
 * │ (energy-ledger.mjs / energy-ledger-client.mjs). worker.mjs는 이 모듈의        │
 * │ reserveAiCredits·commitAiCredits·releaseAiCredits·getAiCreditUsage를          │
 * │ import하지 않으며, worker-ledger-only.test.mjs가 그것을 고정한다.             │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * 왜 다시 배선하면 안 되는가: 이 모듈은 user 레코드를 read-modify-write하고, 그 직렬화를
 * withAiCreditUserLock에 의존한다. 그 락은 모듈 스코프 Map이라 한 아이솔레이트 안에서만
 * 유효하다. Workers는 colo마다 아이솔레이트가 따로 뜨므로 동시 요청이 서로를 못 보고
 * 이중 차감이 난다. DO를 도입한 이유가 정확히 이것이다 — KV에는 CAS가 없다.
 * 원장이 죽었을 때 여기로 물러나는 폴백도 그래서 없앴다. 청구 원장에서 조용한 성능
 * 저하는 실패보다 나쁘다.
 *
 * 그래서 지금 무엇이 이 코드를 쓰는가:
 *   ① serve-local.cjs — 로컬 개발 서버. worker.mjs의 fetch를 실행하지 않고 API를 직접
 *      구현하며, DO가 없으므로 이 모듈로 회계한다. 로컬은 유저 한 명이라 경합이 없다.
 *   ② worker.mjs가 쓰는 하나: startAiTrial(회원 레코드의 체험 필드). 재화 차감이 아니다.
 *      무료 치어링 하루 1회 상한도 withAiCreditUserLock으로 직렬화했었지만, 그 락으로는
 *      colo 간 상호배제가 안 돼 상한이 실질적으로 없었다. 상한이 묶는 것이 provider
 *      호출이라 새는 것이 실제 AI 비용이어서 EnergyLedger DO로 옮겼다(claimCheer).
 *   ③ auth-service.mjs — 체험 남용 마커와 탈퇴 정리. 재화 회계가 아니다.
 *   ④ ai-credits-service.test.mjs — 이 모듈 자체의 회귀 테스트.
 *
 * 정책 값(비용·한도·플랜 판정)은 plan-policy.mjs 한 곳에서 오므로 원장과 갈라지지 않는다.
 */
import {
  AI_ACTION_LABELS,
  AI_ACTION_REQUIRED_FEATURE,
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
  resolveEffectivePlan,
  resolveTrialEndsAt,
} from "./plan-policy.mjs";

export const AI_CREDITS_SCHEMA_VERSION = 1;
const ACTIONS = Object.keys(AI_CREDIT_COSTS);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const TRIAL_MARKER_PREFIX = "ai-trial-used:";
const TRIAL_ABUSE_RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;
const RESERVATION_TTL_MS = 10 * 60 * 1_000;
const userOperationLocks = new Map();

export async function withAiCreditUserLock(userId, operation) {
  const id = String(userId || "");
  if (typeof operation !== "function") throw new TypeError("operation must be a function");
  const previous = userOperationLocks.get(id) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const queued = previous.catch(() => {}).then(() => current);
  userOperationLocks.set(id, queued);
  await previous.catch(() => {});
  try {
    return await operation();
  } finally {
    release();
    if (userOperationLocks.get(id) === queued) userOperationLocks.delete(id);
  }
}

export class AiCreditsError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = "AiCreditsError";
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}

function asNowMs(value) {
  const result = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(result)) throw new TypeError("now must be a valid timestamp or Date");
  return Math.trunc(result);
}

function iso(value) {
  return Number.isFinite(value) ? new Date(value).toISOString() : null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function validTimeZone(value) {
  const candidate = String(value || "").trim() || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(0);
    return candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function zonedParts(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
}

function timeZoneOffsetMs(timestamp, timeZone) {
  const parts = zonedParts(timestamp, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.trunc(timestamp / 1_000) * 1_000;
}

function zonedMidnightToUtc(year, monthIndex, day, timeZone) {
  const localAsUtc = Date.UTC(year, monthIndex, day);
  let result = localAsUtc - timeZoneOffsetMs(localAsUtc, timeZone);
  result = localAsUtc - timeZoneOffsetMs(result, timeZone);
  return result;
}

export function getCreditPeriod(now = Date.now(), requestedTimeZone = DEFAULT_TIME_ZONE) {
  const nowMs = asNowMs(now);
  const timeZone = validTimeZone(requestedTimeZone);
  const current = zonedParts(nowMs, timeZone);
  const year = current.year;
  const monthIndex = current.month - 1;
  const day = current.day;
  const dailyResetsAtMs = zonedMidnightToUtc(year, monthIndex, day + 1, timeZone);
  const monthlyResetsAtMs = zonedMidnightToUtc(year, monthIndex + 1, 1, timeZone);

  return {
    timeZone,
    dayKey: `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`,
    monthKey: `${year}-${pad2(monthIndex + 1)}`,
    dailyResetsAt: iso(dailyResetsAtMs),
    monthlyResetsAt: iso(monthlyResetsAtMs),
    dailyResetsAtMs,
    monthlyResetsAtMs,
  };
}

export function getSeoulCreditPeriod(now = Date.now()) {
  return getCreditPeriod(now, DEFAULT_TIME_ZONE);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : fallback;
}

function finiteTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : null;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function emptyActionBucket() {
  return { used: 0, reserved: 0, calls: 0 };
}

function normalizeActionBuckets(value) {
  const source = isRecord(value) ? value : {};
  const result = {};
  for (const action of ACTIONS) {
    const entry = isRecord(source[action]) ? source[action] : {};
    result[action] = {
      used: nonNegativeInteger(entry.used),
      reserved: nonNegativeInteger(entry.reserved),
      calls: nonNegativeInteger(entry.calls),
    };
  }
  return result;
}

function emptyBucket(scope = "", key = "") {
  return {
    scope,
    key,
    used: 0,
    reserved: 0,
    byAction: Object.fromEntries(ACTIONS.map((action) => [action, emptyActionBucket()])),
  };
}

function normalizeBucket(value) {
  const source = isRecord(value) ? value : {};
  return {
    scope: typeof source.scope === "string" ? source.scope : "",
    key: typeof source.key === "string" ? source.key : "",
    used: nonNegativeInteger(source.used),
    reserved: nonNegativeInteger(source.reserved),
    byAction: normalizeActionBuckets(source.byAction),
  };
}

function emptyActionMetrics() {
  return {
    reservations: 0,
    apiCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    chargedCredits: 0,
    releasedCredits: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };
}

function normalizeActionMetrics(value) {
  const source = isRecord(value) ? value : {};
  const result = {};
  for (const action of ACTIONS) {
    const entry = isRecord(source[action]) ? source[action] : {};
    result[action] = {
      reservations: nonNegativeInteger(entry.reservations),
      apiCalls: nonNegativeInteger(entry.apiCalls),
      successfulCalls: nonNegativeInteger(entry.successfulCalls),
      failedCalls: nonNegativeInteger(entry.failedCalls),
      chargedCredits: nonNegativeInteger(entry.chargedCredits),
      releasedCredits: nonNegativeInteger(entry.releasedCredits),
      inputTokens: nonNegativeInteger(entry.inputTokens),
      outputTokens: nonNegativeInteger(entry.outputTokens),
      totalTokens: nonNegativeInteger(entry.totalTokens),
      estimatedCostUsd: finiteNumber(entry.estimatedCostUsd),
    };
  }
  return result;
}

function emptyMetrics() {
  return {
    reservationCount: 0,
    apiCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    chargedCredits: 0,
    releasedCredits: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    byAction: Object.fromEntries(ACTIONS.map((action) => [action, emptyActionMetrics()])),
  };
}

function normalizeMetrics(value) {
  const source = isRecord(value) ? value : {};
  return {
    reservationCount: nonNegativeInteger(source.reservationCount),
    apiCalls: nonNegativeInteger(source.apiCalls),
    successfulCalls: nonNegativeInteger(source.successfulCalls),
    failedCalls: nonNegativeInteger(source.failedCalls),
    chargedCredits: nonNegativeInteger(source.chargedCredits),
    releasedCredits: nonNegativeInteger(source.releasedCredits),
    inputTokens: nonNegativeInteger(source.inputTokens),
    outputTokens: nonNegativeInteger(source.outputTokens),
    totalTokens: nonNegativeInteger(source.totalTokens),
    estimatedCostUsd: finiteNumber(source.estimatedCostUsd),
    byAction: normalizeActionMetrics(source.byAction),
  };
}

function readProviderUsage(value) {
  const source = isRecord(value) ? value : {};
  const inputTokens = nonNegativeInteger(source.inputTokens ?? source.input_tokens);
  const outputTokens = nonNegativeInteger(source.outputTokens ?? source.output_tokens);
  const totalTokens = nonNegativeInteger(source.totalTokens ?? source.total_tokens, inputTokens + outputTokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: finiteNumber(source.estimatedCostUsd ?? source.estimated_cost_usd),
  };
}

function normalizeTrial(user, value, nowMs) {
  const source = isRecord(value) ? value : {};
  let startedAt = finiteTimestamp(source.startedAt ?? user.trialStartedAt ?? user.trial_started_at);
  let endsAt = finiteTimestamp(source.endsAt ?? user.trialExpiresAt ?? user.trial_ends_at);
  let usedAt = finiteTimestamp(source.usedAt ?? user.trialUsedAt ?? user.trial_used_at);
  const endedAt = finiteTimestamp(source.endedAt ?? user.trialEndedAt);

  if (startedAt && !endsAt) endsAt = resolveTrialEndsAt(startedAt);
  if (startedAt && !usedAt) usedAt = startedAt;

  // A legacy `trial` marker without a valid interval is treated as consumed,
  // not as an invitation to silently grant a second trial.
  if (user.plan === "trial" && !startedAt) {
    startedAt = usedAt || nowMs;
    endsAt = startedAt;
    usedAt ||= startedAt;
  }

  const creditsGranted = startedAt ? PLAN_CONFIG.pro.trial.credits : 0;
  const creditsUsed = clamp(
    nonNegativeInteger(source.creditsUsed ?? user.trialCreditUsed ?? user.trial_credit_used),
    0,
    creditsGranted,
  );
  const creditsReserved = clamp(
    nonNegativeInteger(source.creditsReserved),
    0,
    Math.max(0, creditsGranted - creditsUsed),
  );

  return {
    usedAt,
    startedAt,
    endsAt,
    endedAt,
    endedReason: typeof source.endedReason === "string" ? source.endedReason : null,
    creditsGranted,
    creditsUsed,
    creditsReserved,
  };
}

function normalizeRequests(value) {
  if (!isRecord(value)) return {};
  const requests = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!REQUEST_ID_PATTERN.test(key) || !isRecord(raw) || !Object.hasOwn(AI_CREDIT_COSTS, raw.action)) continue;
    const status = ["reserved", "committed", "released"].includes(raw.status) ? raw.status : "released";
    const storedCost = nonNegativeInteger(raw.cost);
    requests[key] = {
      requestId: key,
      action: raw.action,
      cost: storedCost > 0 ? storedCost : AI_CREDIT_COSTS[raw.action],
      status,
      // "free"는 폐지된 플랜이지만 예전 요청 레코드에는 남아 있다. 값은 그대로 읽되 새로 만들지는 않는다.
      sourcePlan: ["free", "expired", "trial", "pro"].includes(raw.sourcePlan) ? raw.sourcePlan : "expired",
      policyVersion: typeof raw.policyVersion === "string" ? raw.policyVersion : CREDIT_POLICY_VERSION,
      dayKey: typeof raw.dayKey === "string" ? raw.dayKey : "",
      dayScope: typeof raw.dayScope === "string" ? raw.dayScope : "",
      monthKey: typeof raw.monthKey === "string" ? raw.monthKey : "",
      monthScope: typeof raw.monthScope === "string" ? raw.monthScope : "",
      attempts: Math.max(1, nonNegativeInteger(raw.attempts, 1)),
      createdAt: finiteTimestamp(raw.createdAt),
      updatedAt: finiteTimestamp(raw.updatedAt),
      committedAt: finiteTimestamp(raw.committedAt),
      releasedAt: finiteTimestamp(raw.releasedAt),
      providerRequestId: typeof raw.providerRequestId === "string" ? raw.providerRequestId.slice(0, 256) : "",
      model: typeof raw.model === "string" ? raw.model.slice(0, 128) : "",
      providerUsage: readProviderUsage(raw.providerUsage),
      errorCode: typeof raw.errorCode === "string" ? raw.errorCode.slice(0, 128) : "",
    };
  }
  return requests;
}

function normalizeState(user, nowMs) {
  const source = isRecord(user.aiCredits) ? user.aiCredits : {};
  const isExistingPro = user.plan === "pro";
  return {
    schemaVersion: AI_CREDITS_SCHEMA_VERSION,
    policyVersion: CREDIT_POLICY_VERSION,
    timeZone: validTimeZone(user.timezone || source.timeZone),
    revision: nonNegativeInteger(source.revision),
    enrolledAt: finiteTimestamp(source.enrolledAt) || finiteTimestamp(user.createdAt) || nowMs,
    freeSignupCreditsGrantedAt:
      finiteTimestamp(source.freeSignupCreditsGrantedAt) || (isExistingPro ? null : finiteTimestamp(user.createdAt) || nowMs),
    trial: normalizeTrial(user, source.trial, nowMs),
    usage: {
      day: normalizeBucket(source.usage?.day),
      month: normalizeBucket(source.usage?.month),
    },
    requests: normalizeRequests(source.requests),
    metrics: normalizeMetrics(source.metrics),
    updatedAt: finiteTimestamp(source.updatedAt) || nowMs,
  };
}

function mirrorTrialFields(user, trial) {
  user.trialStartedAt = trial.startedAt;
  user.trialExpiresAt = trial.endsAt;
  user.trialUsedAt = trial.usedAt;
  user.trialEndedAt = trial.endedAt;
  user.trialCreditGranted = trial.creditsGranted;
  user.trialCreditUsed = trial.creditsUsed;
}

/* 판정 자체는 plan-policy.mjs의 resolveEffectivePlan이 한다. 여기서는 그 결과를 이 모듈의
   상태(trial 레코드, user.plan 미러)에 반영하는 일만 한다 — 같은 규칙이 두 벌 존재하면
   원장 경로와 레거시 KV 경로가 서로 다른 답을 내놓는다. */
function resolvePlan(user, state, nowMs) {
  const trial = state.trial;
  // resolveEffectivePlan은 user 레코드를 본다. 체험 필드를 먼저 맞춰 두어야 판정이 맞는다.
  mirrorTrialFields(user, trial);
  const effective = resolveEffectivePlan(user, nowMs);

  if (effective === "pro") return "pro";

  /* 체험 크레딧을 다 쓴 경우는 상태 머신이 모른다(원장의 사실이다). 기간은 남았지만
     크레딧이 바닥난 체험은 여기서 종료로 본다 — 레거시 경로에서만 쓰는 판정이다. */
  const creditsLeft = trial.creditsUsed < trial.creditsGranted;
  if (effective === "trial" && !trial.endedAt && creditsLeft) {
    user.plan = "trial";
    return "trial";
  }

  if (trial.usedAt && !trial.endedAt) {
    trial.endedAt = trial.endsAt && nowMs >= trial.endsAt ? trial.endsAt : nowMs;
    trial.endedReason = creditsLeft ? "expired" : "credits_exhausted";
    trial.creditsReserved = 0;
  }
  user.plan = "expired";
  mirrorTrialFields(user, trial);
  return "expired";
}

function normalizePeriods(state, plan, nowMs) {
  const period = getCreditPeriod(nowMs, state.timeZone);
  const expectedDayScope = plan;
  const expectedDayKey = period.dayKey;
  if (state.usage.day.scope !== expectedDayScope || state.usage.day.key !== expectedDayKey) {
    state.usage.day = emptyBucket(expectedDayScope, expectedDayKey);
  }

  const expectedMonthScope = plan;
  const expectedMonthKey = plan === "trial" ? `trial:${state.trial.startedAt}` : period.monthKey;
  if (state.usage.month.scope !== expectedMonthScope || state.usage.month.key !== expectedMonthKey) {
    state.usage.month = emptyBucket(expectedMonthScope, expectedMonthKey);
  }

  if (plan === "trial") {
    state.usage.month.used = state.trial.creditsUsed;
    state.usage.month.reserved = state.trial.creditsReserved;
  }
  return period;
}

function reclaimStaleReservations(state, nowMs) {
  for (const request of Object.values(state.requests)) {
    const reservedAt = request.updatedAt || request.createdAt || 0;
    if (request.status !== "reserved" || nowMs - reservedAt < RESERVATION_TTL_MS) continue;
    if (requestMatchesBucket(request, state.usage.day, "day")) {
      decrementReserved(state.usage.day, request.action, request.cost);
    }
    if (requestMatchesBucket(request, state.usage.month, "month")) {
      decrementReserved(state.usage.month, request.action, request.cost);
    }
    if (request.sourcePlan === "trial") {
      state.trial.creditsReserved = Math.max(0, state.trial.creditsReserved - request.cost);
    }
    request.status = "released";
    request.updatedAt = nowMs;
    request.releasedAt = nowMs;
    request.errorCode = "AI_RESERVATION_EXPIRED";
    addUsageMetrics(state.metrics, request.action, readProviderUsage(null), {
      success: false,
      releasedCredits: request.cost,
      apiCalled: false,
    });
  }
}

function reconcileUser(user, nowMs) {
  const before = JSON.stringify({
    plan: user.plan,
    timezone: user.timezone,
    trialStartedAt: user.trialStartedAt,
    trialExpiresAt: user.trialExpiresAt,
    trialUsedAt: user.trialUsedAt,
    trialEndedAt: user.trialEndedAt,
    trialCreditGranted: user.trialCreditGranted,
    trialCreditUsed: user.trialCreditUsed,
    aiCredits: user.aiCredits,
  });

  user.timezone = validTimeZone(user.timezone);
  const state = normalizeState(user, nowMs);
  user.aiCredits = state;
  const plan = resolvePlan(user, state, nowMs);
  const period = normalizePeriods(state, plan, nowMs);
  reclaimStaleReservations(state, nowMs);

  const after = JSON.stringify({
    plan: user.plan,
    timezone: user.timezone,
    trialStartedAt: user.trialStartedAt,
    trialExpiresAt: user.trialExpiresAt,
    trialUsedAt: user.trialUsedAt,
    trialEndedAt: user.trialEndedAt,
    trialCreditGranted: user.trialCreditGranted,
    trialCreditUsed: user.trialCreditUsed,
    aiCredits: user.aiCredits,
  });
  const changed = before !== after;
  if (changed) {
    state.revision += 1;
    state.updatedAt = nowMs;
  }
  return { state, plan, period, changed };
}

function assertStore(store) {
  if (!store || typeof store.getUser !== "function" || typeof store.putUser !== "function") {
    throw new TypeError("store must provide getUser(id) and putUser(user)");
  }
}

async function readTrialAbuseMarker(store, userId, nowMs) {
  if (typeof store.getSetting !== "function") return null;
  const key = `${TRIAL_MARKER_PREFIX}${userId}`;
  const value = await store.getSetting(key);
  if (!isRecord(value) || !finiteTimestamp(value.usedAt)) return null;
  if (finiteTimestamp(value.expiresAt) <= nowMs) {
    if (typeof store.deleteSetting === "function") await store.deleteSetting(key);
    else if (typeof store.putSetting === "function") await store.putSetting(key, null);
    return null;
  }
  return value;
}

async function writeTrialAbuseMarker(store, userId, usedAt, nowMs = Date.now()) {
  if (typeof store.putSetting !== "function") return false;
  const normalizedUserId = String(userId || "").trim();
  const normalizedUsedAt = finiteTimestamp(usedAt);
  if (!normalizedUserId || !normalizedUsedAt) return false;
  const expiresAt = normalizedUsedAt + TRIAL_ABUSE_RETENTION_MS;
  if (expiresAt <= asNowMs(nowMs)) return false;
  await store.putSetting(`${TRIAL_MARKER_PREFIX}${normalizedUserId}`, {
    usedAt: normalizedUsedAt,
    expiresAt,
    policyVersion: CREDIT_POLICY_VERSION,
    purpose: "single-trial-abuse-prevention",
  }, { expiresAt });
  return true;
}

export function ensureAiTrialAbuseMarker({ store, userId, usedAt, now = Date.now() }) {
  return writeTrialAbuseMarker(store, userId, usedAt, now);
}

/* 이 계정이 예전에 체험을 쓴 적이 있는가. 회원 레코드가 지워져도 이 마커는 남으므로
   탈퇴 후 같은 소셜 계정으로 재가입해도 체험이 다시 열리지 않는다. userId가
   provider:providerUserId의 HMAC이라 재가입해도 같은 키가 나오는 것이 이 방어의 전제다. */
export async function hasUsedAiTrial({ store, userId, now = Date.now() }) {
  return Boolean(await readTrialAbuseMarker(store, userId, asNowMs(now)));
}

async function loadUser(store, userId, nowMs) {
  assertStore(store);
  const id = String(userId || "").trim();
  if (!id) throw new AiCreditsError("INVALID_USER_ID", "사용자 ID가 필요해요.", 400);
  const user = await store.getUser(id);
  if (!user) throw new AiCreditsError("USER_NOT_FOUND", "사용자를 찾을 수 없어요.", 404);
  if (user.status && user.status !== "active") {
    throw new AiCreditsError("ACCOUNT_INACTIVE", "현재 사용할 수 없는 계정이에요.", 403);
  }
  return { user, ...reconcileUser(user, nowMs) };
}

function touchState(state, nowMs) {
  state.revision += 1;
  state.updatedAt = nowMs;
}

function planLimits(plan) {
  /* 이 모듈은 ENERGY_LEDGER 바인딩이 없는 환경에서만 도는 폴백이다(배포 환경에는 항상 있고
     CI 설정 검증이 그것을 고정한다). 여기에는 HARD_PAYWALL_ENABLED가 닿지 않으므로 만료
     계정에는 차단을 켜기 전 값을 준다 — 실제 차단은 worker의 게이트가 한다. */
  if (plan === "expired") {
    return { daily: PAYWALL_OFF_EXPIRED_GRANT.dailyCreditLimit, period: PAYWALL_OFF_EXPIRED_GRANT.monthlyCredits };
  }
  const config = getPlanConfig(plan);
  return {
    daily: config.dailyCreditLimit,
    period: plan === "trial" ? PLAN_CONFIG.pro.trial.credits : config.monthlyCredits,
  };
}

function remaining(limit, bucket) {
  return Math.max(0, limit - bucket.used - bucket.reserved);
}

function buildOperationUsage(user, state, plan, period) {
  const limits = planLimits(plan);
  const trialReset = plan === "trial" ? state.trial.endsAt : null;
  const dailyResetMs = trialReset ? Math.min(period.dailyResetsAtMs, trialReset) : period.dailyResetsAtMs;
  const monthlyResetMs = trialReset || period.monthlyResetsAtMs;
  return {
    plan,
    dailyUsed: state.usage.day.used,
    dailyReserved: state.usage.day.reserved,
    dailyLimit: limits.daily,
    dailyRemaining: remaining(limits.daily, state.usage.day),
    dailyResetsAt: iso(dailyResetMs),
    monthlyUsed: state.usage.month.used,
    monthlyReserved: state.usage.month.reserved,
    monthlyLimit: limits.period,
    monthlyRemaining: remaining(limits.period, state.usage.month),
    monthlyResetsAt: iso(monthlyResetMs),
  };
}

function copyMetrics(metrics) {
  return {
    reservationCount: metrics.reservationCount,
    apiCalls: metrics.apiCalls,
    successfulCalls: metrics.successfulCalls,
    failedCalls: metrics.failedCalls,
    chargedCredits: metrics.chargedCredits,
    releasedCredits: metrics.releasedCredits,
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    totalTokens: metrics.totalTokens,
    estimatedCostUsd: metrics.estimatedCostUsd,
    byAction: Object.fromEntries(ACTIONS.map((action) => [action, { ...metrics.byAction[action] }])),
  };
}

function buildUsageResponse(user, state, plan, period, { trialEligible } = {}) {
  const operation = buildOperationUsage(user, state, plan, period);
  const activeTrial = plan === "trial";
  const actionUsage = {};
  for (const action of ACTIONS) {
    const day = state.usage.day.byAction[action];
    const month = state.usage.month.byAction[action];
    const lifetime = state.metrics.byAction[action];
    actionUsage[action] = {
      label: AI_ACTION_LABELS[action],
      cost: AI_CREDIT_COSTS[action],
      dailyUsedCredits: day.used,
      dailyReservedCredits: day.reserved,
      periodUsedCredits: month.used,
      periodReservedCredits: month.reserved,
      lifetimeSuccessfulCalls: lifetime.successfulCalls,
      lifetimeFailedCalls: lifetime.failedCalls,
      lifetimeChargedCredits: lifetime.chargedCredits,
      lifetimeInputTokens: lifetime.inputTokens,
      lifetimeOutputTokens: lifetime.outputTokens,
      lifetimeTotalTokens: lifetime.totalTokens,
      lifetimeEstimatedCostUsd: lifetime.estimatedCostUsd,
    };
  }

  return {
    ok: true,
    schemaVersion: AI_CREDITS_SCHEMA_VERSION,
    policyVersion: CREDIT_POLICY_VERSION,
    timeZone: state.timeZone,
    plan,
    planLabel: PLAN_LABELS[plan],
    trial: {
      eligible: typeof trialEligible === "boolean"
        ? trialEligible
        : !state.trial.usedAt && user.plan !== "pro",
      active: activeTrial,
      startedAt: iso(state.trial.startedAt),
      endsAt: iso(state.trial.endsAt),
      remainingCredits: activeTrial
        ? Math.max(0, state.trial.creditsGranted - state.trial.creditsUsed - state.trial.creditsReserved)
        : 0,
    },
    daily: {
      used: operation.dailyUsed,
      reserved: operation.dailyReserved,
      limit: operation.dailyLimit,
      remaining: operation.dailyRemaining,
      resetsAt: operation.dailyResetsAt,
    },
    monthly: {
      used: operation.monthlyUsed,
      reserved: operation.monthlyReserved,
      limit: operation.monthlyLimit,
      remaining: operation.monthlyRemaining,
      resetsAt: operation.monthlyResetsAt,
    },
    creditCosts: { ...AI_CREDIT_COSTS },
    actionLabels: { ...AI_ACTION_LABELS },
    actionUsage,
    metrics: copyMetrics(state.metrics),
  };
}

function assertAction(action) {
  if (!Object.hasOwn(AI_CREDIT_COSTS, action)) {
    throw new AiCreditsError("INVALID_AI_ACTION", "지원하지 않는 AI 작업이에요.", 400);
  }
}

function assertRequestId(requestId) {
  if (!REQUEST_ID_PATTERN.test(String(requestId || ""))) {
    throw new AiCreditsError(
      "INVALID_REQUEST_ID",
      "requestId는 1~128자의 영문, 숫자, 점, 밑줄, 콜론 또는 하이픈이어야 해요.",
      400,
    );
  }
}

function incrementReserved(bucket, action, cost) {
  bucket.reserved += cost;
  bucket.byAction[action].reserved += cost;
}

function decrementReserved(bucket, action, cost) {
  bucket.reserved = Math.max(0, bucket.reserved - cost);
  bucket.byAction[action].reserved = Math.max(0, bucket.byAction[action].reserved - cost);
}

function commitToBucket(bucket, action, cost) {
  decrementReserved(bucket, action, cost);
  bucket.used += cost;
  bucket.byAction[action].used += cost;
  bucket.byAction[action].calls += 1;
}

function requestMatchesBucket(request, bucket, kind) {
  return kind === "day"
    ? request.dayScope === bucket.scope && request.dayKey === bucket.key
    : request.monthScope === bucket.scope && request.monthKey === bucket.key;
}

function addUsageMetrics(metrics, action, providerUsage, { success, releasedCredits = 0, chargedCredits = 0, apiCalled = true }) {
  const actionMetrics = metrics.byAction[action];
  if (apiCalled) {
    metrics.apiCalls += 1;
    actionMetrics.apiCalls += 1;
  }
  if (success) {
    metrics.successfulCalls += 1;
    actionMetrics.successfulCalls += 1;
  } else if (apiCalled) {
    metrics.failedCalls += 1;
    actionMetrics.failedCalls += 1;
  }
  metrics.chargedCredits += chargedCredits;
  metrics.releasedCredits += releasedCredits;
  actionMetrics.chargedCredits += chargedCredits;
  actionMetrics.releasedCredits += releasedCredits;
  for (const key of ["inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd"]) {
    metrics[key] += providerUsage[key];
    actionMetrics[key] += providerUsage[key];
  }
}

function existingRequestError(request) {
  const codes = {
    reserved: "AI_REQUEST_IN_PROGRESS",
    committed: "AI_REQUEST_ALREADY_COMMITTED",
    released: "AI_REQUEST_PREVIOUSLY_RELEASED",
  };
  const messages = {
    reserved: "같은 requestId의 AI 요청을 처리하고 있어요.",
    committed: "같은 requestId의 AI 요청은 이미 완료됐어요.",
    released: "같은 requestId의 이전 AI 요청은 실패 처리됐어요. 새 requestId로 다시 시도해 주세요.",
  };
  return new AiCreditsError(codes[request.status], messages[request.status], 409, {
    requestId: request.requestId,
    action: request.action,
    status: request.status,
  });
}

async function getAiCreditUsageUnlocked({ store, userId, now = Date.now() }) {
  const nowMs = asNowMs(now);
  const loaded = await loadUser(store, userId, nowMs);
  if (loaded.changed) await store.putUser(loaded.user);
  let trialEligible;
  if (!loaded.state.trial.usedAt && loaded.plan !== "pro") {
    trialEligible = !(await readTrialAbuseMarker(store, loaded.user.id, nowMs));
  }
  return buildUsageResponse(loaded.user, loaded.state, loaded.plan, loaded.period, { trialEligible });
}

async function startAiTrialUnlocked({ store, userId, now = Date.now() }) {
  const nowMs = asNowMs(now);
  const loaded = await loadUser(store, userId, nowMs);
  const { user, state } = loaded;

  if (loaded.plan === "pro") {
    if (loaded.changed) await store.putUser(user);
    throw new AiCreditsError("PRO_ALREADY_ACTIVE", "이미 Pro 플랜을 사용 중이에요.", 409);
  }
  if (loaded.plan === "trial") {
    await writeTrialAbuseMarker(store, user.id, state.trial.usedAt || nowMs, nowMs);
    if (loaded.changed) await store.putUser(user);
    return {
      ok: true,
      started: false,
      idempotent: true,
      usage: buildUsageResponse(user, state, loaded.plan, loaded.period),
    };
  }
  const retainedTrialMarker = await readTrialAbuseMarker(store, user.id, nowMs);
  if (state.trial.usedAt || retainedTrialMarker) {
    if (loaded.changed) await store.putUser(user);
    throw new AiCreditsError("TRIAL_ALREADY_USED", "무료 체험은 계정당 한 번만 이용할 수 있어요.", 409);
  }

  state.trial = {
    usedAt: nowMs,
    startedAt: nowMs,
    endsAt: resolveTrialEndsAt(nowMs),
    endedAt: null,
    endedReason: null,
    creditsGranted: PLAN_CONFIG.pro.trial.credits,
    creditsUsed: 0,
    creditsReserved: 0,
  };
  user.plan = "trial";
  mirrorTrialFields(user, state.trial);
  const period = normalizePeriods(state, "trial", nowMs);
  touchState(state, nowMs);
  await store.putUser(user);
  await writeTrialAbuseMarker(store, user.id, nowMs, nowMs);

  return {
    ok: true,
    started: true,
    idempotent: false,
    usage: buildUsageResponse(user, state, "trial", period),
  };
}

async function reserveAiCreditsUnlocked({ store, userId, action, requestId, now = Date.now() }) {
  assertAction(action);
  assertRequestId(requestId);
  const nowMs = asNowMs(now);
  const loaded = await loadUser(store, userId, nowMs);
  const { user, state, plan, period } = loaded;
  const id = String(requestId);
  const existing = state.requests[id];
  const operationUsage = buildOperationUsage(user, state, plan, period);

  if (existing) {
    if (existing.action !== action) {
      if (loaded.changed) await store.putUser(user);
      throw new AiCreditsError(
        "REQUEST_ID_CONFLICT",
        "같은 requestId를 다른 AI 작업에 사용할 수 없어요.",
        409,
      );
    }
    if (loaded.changed) await store.putUser(user);
    throw existingRequestError(existing);
  }

  /* PRO 전용 동작(북)은 features가 아니라 유효 플랜 문자열로 막는다.
     getPlanConfig("trial")은 PLAN_CONFIG.pro를 돌려주므로 features를 보면 체험이 통과한다.
     라우트 단에서 이미 같은 판정을 하지만, 이 경로도 차감의 관문이므로 여기서도 막는다. */
  if (isProOnlyAiAction(action) && !allowsProOnlyFeature(plan)) {
    if (loaded.changed) await store.putUser(user);
    throw new AiCreditsError(
      "PRO_ONLY_ACTION",
      `${AI_ACTION_LABELS[action] || "이 기능"}은 Pro 전용이에요. ${PRO_ONLY_LOCK_REASON}`,
      403,
      { action, plan },
    );
  }

  /* 여기서 features를 보는 것은 맞다. 이 플래그들(recoveryPlan·fullReschedule)은
     "체험이 PRO와 같아도 되는 것"이라 getPlanConfig("trial") === PLAN_CONFIG.pro가 의도된 동작이다. */
  const config = getPlanConfig(plan);
  const requiredFeature = AI_ACTION_REQUIRED_FEATURE[action];
  if (requiredFeature && !config.features[requiredFeature]) {
    if (loaded.changed) await store.putUser(user);
    throw new AiCreditsError(
      "AI_ACTION_NOT_AVAILABLE",
      "이 AI 기능은 Pro 플랜에서 사용할 수 있어요.",
      403,
      { action, plan },
    );
  }

  const cost = AI_CREDIT_COSTS[action];
  const limits = planLimits(plan);
  if (remaining(limits.daily, state.usage.day) < cost) {
    if (loaded.changed) await store.putUser(user);
    throw new AiCreditsError(
      "DAILY_AI_CREDIT_LIMIT_EXCEEDED",
      `이 기능에는 ${cost}크레딧이 필요해요. 오늘 사용할 수 있는 크레딧이 부족해요.`,
      429,
      { requiredCredits: cost, usage: operationUsage },
    );
  }
  if (remaining(limits.period, state.usage.month) < cost) {
    if (loaded.changed) await store.putUser(user);
    const code = plan === "trial" ? "TRIAL_AI_CREDITS_EXHAUSTED" : "MONTHLY_AI_CREDITS_EXHAUSTED";
    const message = plan === "trial"
      ? "체험 AI 크레딧이 부족해요."
      : "이번 달 AI 크레딧이 부족해요.";
    throw new AiCreditsError(code, message, 429, { requiredCredits: cost, usage: operationUsage });
  }

  incrementReserved(state.usage.day, action, cost);
  incrementReserved(state.usage.month, action, cost);
  if (plan === "trial") state.trial.creditsReserved += cost;
  state.requests[id] = {
    requestId: id,
    action,
    cost,
    status: "reserved",
    sourcePlan: plan,
    policyVersion: CREDIT_POLICY_VERSION,
    dayKey: state.usage.day.key,
    dayScope: state.usage.day.scope,
    monthKey: state.usage.month.key,
    monthScope: state.usage.month.scope,
    attempts: 1,
    createdAt: nowMs,
    updatedAt: nowMs,
    committedAt: null,
    releasedAt: null,
    providerRequestId: "",
    model: "",
    providerUsage: readProviderUsage(null),
    errorCode: "",
  };
  state.metrics.reservationCount += 1;
  state.metrics.byAction[action].reservations += 1;
  mirrorTrialFields(user, state.trial);
  touchState(state, nowMs);
  await store.putUser(user);

  return {
    ok: true,
    requestId: id,
    action,
    cost,
    status: "reserved",
    idempotent: false,
    shouldExecute: true,
    chargedCredits: 0,
    usage: buildOperationUsage(user, state, plan, period),
  };
}

async function commitAiCreditsUnlocked({
  store,
  userId,
  requestId,
  providerUsage = {},
  providerRequestId = "",
  model = "",
  now = Date.now(),
}) {
  assertRequestId(requestId);
  const nowMs = asNowMs(now);
  const loaded = await loadUser(store, userId, nowMs);
  const { user, state } = loaded;
  const request = state.requests[String(requestId)];
  if (!request) {
    if (loaded.changed) await store.putUser(user);
    throw new AiCreditsError("AI_CREDIT_RESERVATION_NOT_FOUND", "크레딧 예약을 찾을 수 없어요.", 404);
  }

  if (request.status === "committed") {
    if (loaded.changed) await store.putUser(user);
    return {
      ok: true,
      requestId: request.requestId,
      action: request.action,
      cost: request.cost,
      status: request.status,
      idempotent: true,
      chargedCredits: 0,
      usage: buildUsageResponse(user, state, loaded.plan, loaded.period),
    };
  }
  if (request.status === "released") {
    if (loaded.changed) await store.putUser(user);
    throw new AiCreditsError(
      "AI_CREDIT_RESERVATION_RELEASED",
      "이미 실패 처리된 AI 요청은 나중에 확정할 수 없어요.",
      409,
      { requestId: request.requestId, action: request.action },
    );
  }

  if (requestMatchesBucket(request, state.usage.day, "day")) {
    commitToBucket(state.usage.day, request.action, request.cost);
  }
  if (requestMatchesBucket(request, state.usage.month, "month")) {
    commitToBucket(state.usage.month, request.action, request.cost);
  }
  if (request.sourcePlan === "trial") {
    state.trial.creditsReserved = Math.max(0, state.trial.creditsReserved - request.cost);
    state.trial.creditsUsed = Math.min(state.trial.creditsGranted, state.trial.creditsUsed + request.cost);
  }

  const usage = readProviderUsage(providerUsage);
  request.status = "committed";
  request.updatedAt = nowMs;
  request.committedAt = nowMs;
  request.providerRequestId = String(providerRequestId || "").slice(0, 256);
  request.model = String(model || "").slice(0, 128);
  request.providerUsage = usage;
  request.errorCode = "";
  addUsageMetrics(state.metrics, request.action, usage, {
    success: true,
    chargedCredits: request.cost,
    apiCalled: true,
  });

  const plan = resolvePlan(user, state, nowMs);
  const period = normalizePeriods(state, plan, nowMs);
  mirrorTrialFields(user, state.trial);
  touchState(state, nowMs);
  await store.putUser(user);

  return {
    ok: true,
    requestId: request.requestId,
    action: request.action,
    cost: request.cost,
    status: "committed",
    idempotent: false,
    chargedCredits: request.cost,
    usage: buildUsageResponse(user, state, plan, period),
  };
}

async function releaseAiCreditsUnlocked({
  store,
  userId,
  requestId,
  providerCalled = true,
  providerUsage = {},
  providerRequestId = "",
  model = "",
  errorCode = "AI_REQUEST_FAILED",
  now = Date.now(),
}) {
  assertRequestId(requestId);
  const nowMs = asNowMs(now);
  const loaded = await loadUser(store, userId, nowMs);
  const { user, state } = loaded;
  const request = state.requests[String(requestId)];
  if (!request) {
    if (loaded.changed) await store.putUser(user);
    throw new AiCreditsError("AI_CREDIT_RESERVATION_NOT_FOUND", "크레딧 예약을 찾을 수 없어요.", 404);
  }

  if (request.status !== "reserved") {
    if (loaded.changed) await store.putUser(user);
    return {
      ok: true,
      requestId: request.requestId,
      action: request.action,
      cost: request.cost,
      status: request.status,
      idempotent: true,
      refundedCredits: 0,
      usage: buildOperationUsage(user, state, loaded.plan, loaded.period),
    };
  }

  if (requestMatchesBucket(request, state.usage.day, "day")) {
    decrementReserved(state.usage.day, request.action, request.cost);
  }
  if (requestMatchesBucket(request, state.usage.month, "month")) {
    decrementReserved(state.usage.month, request.action, request.cost);
  }
  if (request.sourcePlan === "trial") {
    state.trial.creditsReserved = Math.max(0, state.trial.creditsReserved - request.cost);
  }

  const usage = readProviderUsage(providerUsage);
  request.status = "released";
  request.updatedAt = nowMs;
  request.releasedAt = nowMs;
  request.providerRequestId = String(providerRequestId || "").slice(0, 256);
  request.model = String(model || "").slice(0, 128);
  request.providerUsage = usage;
  request.errorCode = String(errorCode || "AI_REQUEST_FAILED").slice(0, 128);
  addUsageMetrics(state.metrics, request.action, usage, {
    success: false,
    releasedCredits: request.cost,
    apiCalled: Boolean(providerCalled),
  });

  const plan = resolvePlan(user, state, nowMs);
  const period = normalizePeriods(state, plan, nowMs);
  mirrorTrialFields(user, state.trial);
  touchState(state, nowMs);
  await store.putUser(user);

  return {
    ok: true,
    requestId: request.requestId,
    action: request.action,
    cost: request.cost,
    status: "released",
    idempotent: false,
    refundedCredits: request.cost,
    usage: buildOperationUsage(user, state, plan, period),
  };
}

export function getAiCreditUsage(args) {
  return withAiCreditUserLock(args?.userId, () => getAiCreditUsageUnlocked(args));
}

export function startAiTrial(args) {
  return withAiCreditUserLock(args?.userId, () => startAiTrialUnlocked(args));
}

export function reserveAiCredits(args) {
  return withAiCreditUserLock(args?.userId, () => reserveAiCreditsUnlocked(args));
}

export function commitAiCredits(args) {
  return withAiCreditUserLock(args?.userId, () => commitAiCreditsUnlocked(args));
}

export function releaseAiCredits(args) {
  return withAiCreditUserLock(args?.userId, () => releaseAiCreditsUnlocked(args));
}
