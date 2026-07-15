import {
  AI_ACTION_LABELS,
  AI_ACTION_REQUIRED_FEATURE,
  AI_CREDIT_COSTS,
  CREDIT_POLICY_VERSION,
  DEFAULT_TIME_ZONE,
  PLAN_CONFIG,
  PLAN_LABELS,
  getPlanConfig,
} from "./plan-policy.mjs";

export const AI_CREDITS_SCHEMA_VERSION = 1;

const TRIAL_DURATION_MS = PLAN_CONFIG.pro.trial.durationHours * 60 * 60 * 1_000;
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

  if (startedAt && !endsAt) endsAt = startedAt + TRIAL_DURATION_MS;
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
      sourcePlan: ["free", "trial", "pro"].includes(raw.sourcePlan) ? raw.sourcePlan : "free",
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

function resolvePlan(user, state, nowMs) {
  if (user.plan === "pro") {
    const subscriptionStatus = String(user.subscriptionStatus || "");
    const periodEnded = finiteTimestamp(user.currentPeriodEnd) !== null
      && finiteTimestamp(user.currentPeriodEnd) <= nowMs;
    const entitlementEnded = subscriptionStatus === "payment_failed"
      || (["active", "canceled"].includes(subscriptionStatus) && periodEnded);
    if (entitlementEnded) {
      user.plan = "free";
    } else {
      mirrorTrialFields(user, state.trial);
      return "pro";
    }
  }

  const trial = state.trial;
  const hasValidTrial = Boolean(
    trial.usedAt
      && trial.startedAt
      && trial.endsAt
      && !trial.endedAt
      && nowMs < trial.endsAt
      && trial.creditsUsed < trial.creditsGranted,
  );

  if (hasValidTrial) {
    user.plan = "trial";
    mirrorTrialFields(user, trial);
    return "trial";
  }

  if (trial.usedAt && !trial.endedAt) {
    trial.endedAt = trial.endsAt && nowMs >= trial.endsAt ? trial.endsAt : nowMs;
    trial.endedReason = trial.creditsUsed >= trial.creditsGranted ? "credits_exhausted" : "expired";
    trial.creditsReserved = 0;
  }
  if (!["free", "pro"].includes(user.plan)) user.plan = "free";
  mirrorTrialFields(user, trial);
  return "free";
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
    endsAt: nowMs + TRIAL_DURATION_MS,
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
