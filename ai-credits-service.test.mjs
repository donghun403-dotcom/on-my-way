import test from "node:test";
import assert from "node:assert/strict";
import {
  AiCreditsError,
  commitAiCredits,
  getAiCreditUsage,
  getCreditPeriod,
  getSeoulCreditPeriod,
  releaseAiCredits,
  reserveAiCredits,
  startAiTrial,
} from "./ai-credits-service.mjs";

const HOUR = 60 * 60 * 1_000;
const SEOUL_JAN_15_NOON = Date.parse("2026-01-15T03:00:00.000Z");

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function memoryStore(...users) {
  const records = new Map(users.map((user) => [user.id, clone(user)]));
  const settings = new Map();
  const settingOptions = new Map();
  return {
    records,
    settings,
    settingOptions,
    async getUser(id) {
      return clone(records.get(id) || null);
    },
    async putUser(user) {
      records.set(user.id, clone(user));
    },
    async getSetting(name) {
      return clone(settings.get(name) ?? null);
    },
    async putSetting(name, value, options = {}) {
      if (value === null || value === undefined) settings.delete(name);
      else settings.set(name, clone(value));
      settingOptions.set(name, clone(options));
    },
    async deleteSetting(name) {
      settings.delete(name);
      settingOptions.delete(name);
    },
  };
}

function freeUser(id = "free-user") {
  return { id, status: "active", plan: "free", createdAt: SEOUL_JAN_15_NOON - HOUR };
}

async function expectCode(promise, code) {
  await assert.rejects(
    promise,
    (error) => error instanceof AiCreditsError && error.code === code,
  );
}

test("schema-on-read gives a Free user 5 monthly credits, a daily limit of 2, and one trial eligibility", async () => {
  const store = memoryStore(freeUser());
  const usage = await getAiCreditUsage({ store, userId: "free-user", now: SEOUL_JAN_15_NOON });

  assert.equal(usage.plan, "free");
  assert.deepEqual(usage.daily, {
    used: 0,
    reserved: 0,
    limit: 2,
    remaining: 2,
    resetsAt: "2026-01-15T15:00:00.000Z",
  });
  assert.equal(usage.monthly.limit, 5);
  assert.equal(usage.monthly.remaining, 5);
  assert.equal(usage.monthly.resetsAt, "2026-01-31T15:00:00.000Z");
  assert.deepEqual(usage.trial, {
    eligible: true,
    active: false,
    startedAt: null,
    endsAt: null,
    remainingCredits: 0,
  });

  const stored = store.records.get("free-user");
  assert.equal(stored.timezone, "Asia/Seoul");
  assert.equal(stored.aiCredits.policyVersion, usage.policyVersion);
  assert.equal(stored.aiCredits.usage.day.key, "2026-01-15");
  assert.ok(stored.aiCredits.freeSignupCreditsGrantedAt);
});

test("Asia/Seoul day and calendar month boundaries are server-derived", () => {
  const beforeMidnight = getSeoulCreditPeriod(Date.parse("2026-01-31T14:59:59.999Z"));
  const atMidnight = getSeoulCreditPeriod(Date.parse("2026-01-31T15:00:00.000Z"));

  assert.equal(beforeMidnight.dayKey, "2026-01-31");
  assert.equal(beforeMidnight.monthKey, "2026-01");
  assert.equal(beforeMidnight.dailyResetsAt, "2026-01-31T15:00:00.000Z");
  assert.equal(beforeMidnight.monthlyResetsAt, "2026-01-31T15:00:00.000Z");
  assert.equal(atMidnight.dayKey, "2026-02-01");
  assert.equal(atMidnight.monthKey, "2026-02");
  assert.equal(atMidnight.dailyResetsAt, "2026-02-01T15:00:00.000Z");
  assert.equal(atMidnight.monthlyResetsAt, "2026-02-28T15:00:00.000Z");
});

test("an existing valid user timezone controls day and month resets, with Seoul as fallback", async () => {
  const now = Date.parse("2026-07-15T16:00:00.000Z");
  const period = getCreditPeriod(now, "America/New_York");
  assert.equal(period.timeZone, "America/New_York");
  assert.equal(period.dayKey, "2026-07-15");
  assert.equal(period.dailyResetsAt, "2026-07-16T04:00:00.000Z");
  assert.equal(period.monthlyResetsAt, "2026-08-01T04:00:00.000Z");

  const store = memoryStore({ ...freeUser("ny-user"), timezone: "America/New_York" });
  const usage = await getAiCreditUsage({ store, userId: "ny-user", now });
  assert.equal(usage.timeZone, "America/New_York");
  assert.equal(usage.daily.resetsAt, period.dailyResetsAt);
});

test("Free reservations enforce exact costs and both daily and monthly accounting", async () => {
  const store = memoryStore(freeUser());
  const first = await reserveAiCredits({
    store,
    userId: "free-user",
    action: "companion_chat",
    requestId: "chat-1",
    now: SEOUL_JAN_15_NOON,
    plan: "pro",
    cost: 0,
  });
  assert.equal(first.cost, 1);
  assert.equal(first.usage.plan, "free");
  assert.equal(first.usage.dailyRemaining, 1);

  await commitAiCredits({
    store,
    userId: "free-user",
    requestId: "chat-1",
    providerUsage: { input_tokens: 10, output_tokens: 4, total_tokens: 14, estimated_cost_usd: 0.001 },
    providerRequestId: "openai-1",
    model: "test-model",
    now: SEOUL_JAN_15_NOON + 1,
  });
  await reserveAiCredits({
    store,
    userId: "free-user",
    action: "companion_chat",
    requestId: "chat-2",
    now: SEOUL_JAN_15_NOON + 2,
  });
  await commitAiCredits({
    store,
    userId: "free-user",
    requestId: "chat-2",
    now: SEOUL_JAN_15_NOON + 3,
  });

  await expectCode(
    reserveAiCredits({
      store,
      userId: "free-user",
      action: "companion_chat",
      requestId: "chat-3",
      now: SEOUL_JAN_15_NOON + 4,
    }),
    "DAILY_AI_CREDIT_LIMIT_EXCEEDED",
  );
  const usage = await getAiCreditUsage({ store, userId: "free-user", now: SEOUL_JAN_15_NOON + 5 });
  assert.equal(usage.daily.used, 2);
  assert.equal(usage.monthly.used, 2);
  assert.equal(usage.metrics.apiCalls, 2);
  assert.equal(usage.metrics.successfulCalls, 2);
  assert.equal(usage.metrics.inputTokens, 10);
  assert.equal(usage.actionUsage.companion_chat.lifetimeChargedCredits, 2);
});

test("a Free user with only two daily credits cannot reserve a four-credit action", async () => {
  const store = memoryStore(freeUser());
  await expectCode(
    reserveAiCredits({
      store,
      userId: "free-user",
      action: "create_plan",
      requestId: "expensive-plan",
      now: SEOUL_JAN_15_NOON,
      plan: "pro",
      creditCost: 0,
    }),
    "DAILY_AI_CREDIT_LIMIT_EXCEEDED",
  );
  const usage = await getAiCreditUsage({ store, userId: "free-user", now: SEOUL_JAN_15_NOON });
  assert.equal(usage.daily.used, 0);
  assert.equal(usage.daily.reserved, 0);
});

test("Free monthly exhaustion is enforced even when a new Seoul day restores the daily allowance", async () => {
  const store = memoryStore(freeUser());
  let sequence = 0;
  for (const [dayOffset, count] of [[0, 2], [24 * HOUR, 2], [48 * HOUR, 1]]) {
    for (let index = 0; index < count; index += 1) {
      sequence += 1;
      const now = SEOUL_JAN_15_NOON + dayOffset + index;
      const requestId = `monthly-${sequence}`;
      await reserveAiCredits({ store, userId: "free-user", action: "companion_chat", requestId, now });
      await commitAiCredits({ store, userId: "free-user", requestId, now: now + 10 });
    }
  }

  await expectCode(
    reserveAiCredits({
      store,
      userId: "free-user",
      action: "companion_chat",
      requestId: "monthly-overflow",
      now: SEOUL_JAN_15_NOON + 48 * HOUR + 100,
    }),
    "MONTHLY_AI_CREDITS_EXHAUSTED",
  );
});

test("Pro reservations can use exactly 30 daily credits but not the thirty-first", async () => {
  const store = memoryStore({ id: "pro-user", status: "active", plan: "pro", createdAt: SEOUL_JAN_15_NOON });
  const actions = [
    "reschedule_plan",
    "reschedule_plan",
    "reschedule_plan",
    "reschedule_plan",
    "reschedule_plan",
    "reschedule_plan",
    "reschedule_plan",
    "revise_plan",
  ];
  for (const [index, action] of actions.entries()) {
    const requestId = `pro-daily-${index}`;
    await reserveAiCredits({ store, userId: "pro-user", action, requestId, now: SEOUL_JAN_15_NOON + index * 2 });
    await commitAiCredits({ store, userId: "pro-user", requestId, now: SEOUL_JAN_15_NOON + index * 2 + 1 });
  }
  const usage = await getAiCreditUsage({ store, userId: "pro-user", now: SEOUL_JAN_15_NOON + 100 });
  assert.equal(usage.daily.used, 30);
  assert.equal(usage.daily.remaining, 0);
  await expectCode(
    reserveAiCredits({
      store,
      userId: "pro-user",
      action: "companion_chat",
      requestId: "pro-daily-overflow",
      now: SEOUL_JAN_15_NOON + 101,
    }),
    "DAILY_AI_CREDIT_LIMIT_EXCEEDED",
  );
});

test("existing Pro and a valid legacy trial are preserved during schema-on-read migration", async () => {
  const trialStartedAt = SEOUL_JAN_15_NOON - 2 * HOUR;
  const store = memoryStore(
    { id: "pro-user", status: "active", plan: "pro", createdAt: SEOUL_JAN_15_NOON - HOUR },
    {
      id: "trial-user",
      status: "active",
      plan: "trial",
      trialStartedAt,
      trialExpiresAt: trialStartedAt + 24 * HOUR,
      trialCreditUsed: 3,
      createdAt: trialStartedAt - HOUR,
    },
  );

  const pro = await getAiCreditUsage({ store, userId: "pro-user", now: SEOUL_JAN_15_NOON });
  assert.equal(pro.plan, "pro");
  assert.equal(pro.daily.limit, 30);
  assert.equal(pro.monthly.limit, 250);
  assert.equal(store.records.get("pro-user").plan, "pro");

  const trial = await getAiCreditUsage({ store, userId: "trial-user", now: SEOUL_JAN_15_NOON });
  assert.equal(trial.plan, "trial");
  assert.equal(trial.daily.limit, 30);
  assert.equal(trial.monthly.limit, 15);
  assert.equal(trial.monthly.used, 3);
  assert.equal(trial.trial.remainingCredits, 12);
  assert.equal(trial.trial.endsAt, new Date(trialStartedAt + 24 * HOUR).toISOString());
});

test("expired active, canceled, and payment-failed subscriptions are resolved to Free at request time", async () => {
  const store = memoryStore(
    {
      id: "expired-active-pro",
      status: "active",
      plan: "pro",
      subscriptionStatus: "active",
      currentPeriodEnd: SEOUL_JAN_15_NOON - 1,
      createdAt: SEOUL_JAN_15_NOON - HOUR,
    },
    {
      id: "canceled-pro",
      status: "active",
      plan: "pro",
      subscriptionStatus: "canceled",
      currentPeriodEnd: SEOUL_JAN_15_NOON - 1,
      createdAt: SEOUL_JAN_15_NOON - HOUR,
    },
    {
      id: "failed-pro",
      status: "active",
      plan: "pro",
      subscriptionStatus: "payment_failed",
      currentPeriodEnd: SEOUL_JAN_15_NOON + HOUR,
      createdAt: SEOUL_JAN_15_NOON - HOUR,
    },
    {
      id: "canceling-pro",
      status: "active",
      plan: "pro",
      subscriptionStatus: "canceled",
      currentPeriodEnd: SEOUL_JAN_15_NOON + HOUR,
      createdAt: SEOUL_JAN_15_NOON - HOUR,
    },
  );

  assert.equal((await getAiCreditUsage({ store, userId: "expired-active-pro", now: SEOUL_JAN_15_NOON })).plan, "free");
  assert.equal((await getAiCreditUsage({ store, userId: "canceled-pro", now: SEOUL_JAN_15_NOON })).plan, "free");
  assert.equal((await getAiCreditUsage({ store, userId: "failed-pro", now: SEOUL_JAN_15_NOON })).plan, "free");
  assert.equal((await getAiCreditUsage({ store, userId: "canceling-pro", now: SEOUL_JAN_15_NOON })).plan, "pro");
});

test("trial starts once for exactly 24 hours, is idempotent while active, then returns to Free", async () => {
  const store = memoryStore(freeUser());
  const started = await startAiTrial({ store, userId: "free-user", now: SEOUL_JAN_15_NOON });
  assert.equal(started.started, true);
  assert.equal(started.usage.plan, "trial");
  assert.equal(started.usage.trial.remainingCredits, 15);
  assert.equal(started.usage.trial.endsAt, new Date(SEOUL_JAN_15_NOON + 24 * HOUR).toISOString());
  assert.equal(
    store.settingOptions.get("ai-trial-used:free-user").expiresAt,
    SEOUL_JAN_15_NOON + 365 * 24 * HOUR,
  );

  const repeated = await startAiTrial({ store, userId: "free-user", now: SEOUL_JAN_15_NOON + HOUR });
  assert.equal(repeated.started, false);
  assert.equal(repeated.idempotent, true);
  assert.equal(repeated.usage.trial.endsAt, started.usage.trial.endsAt);

  const expired = await getAiCreditUsage({
    store,
    userId: "free-user",
    now: SEOUL_JAN_15_NOON + 24 * HOUR,
  });
  assert.equal(expired.plan, "free");
  assert.equal(expired.trial.active, false);
  assert.equal(expired.trial.eligible, false);
  assert.equal(expired.trial.remainingCredits, 0);
  assert.equal(store.records.get("free-user").plan, "free");
  await expectCode(
    startAiTrial({ store, userId: "free-user", now: SEOUL_JAN_15_NOON + 24 * HOUR + 1 }),
    "TRIAL_ALREADY_USED",
  );
});

test("a retained pseudonymous trial marker blocks immediate trial reissue after account deletion", async () => {
  const store = memoryStore(freeUser("stable-provider-user"));
  await startAiTrial({ store, userId: "stable-provider-user", now: SEOUL_JAN_15_NOON });
  store.records.delete("stable-provider-user");
  store.records.set("stable-provider-user", freeUser("stable-provider-user"));

  const retainedUsage = await getAiCreditUsage({
    store,
    userId: "stable-provider-user",
    now: SEOUL_JAN_15_NOON + 30 * 24 * HOUR,
  });
  assert.equal(retainedUsage.trial.eligible, false);

  await expectCode(
    startAiTrial({ store, userId: "stable-provider-user", now: SEOUL_JAN_15_NOON + 30 * 24 * HOUR }),
    "TRIAL_ALREADY_USED",
  );

  const afterRetention = SEOUL_JAN_15_NOON + 365 * 24 * HOUR + 1;
  const restarted = await startAiTrial({ store, userId: "stable-provider-user", now: afterRetention });
  assert.equal(restarted.started, true);
});

test("using all 15 trial credits ends the trial immediately and discards no charge history", async () => {
  const store = memoryStore(freeUser());
  await startAiTrial({ store, userId: "free-user", now: SEOUL_JAN_15_NOON });
  const actions = ["create_plan", "create_plan", "create_plan", "recovery_plan"];
  let finalCommit;
  for (const [index, action] of actions.entries()) {
    const requestId = `trial-exhaust-${index}`;
    await reserveAiCredits({ store, userId: "free-user", action, requestId, now: SEOUL_JAN_15_NOON + index * 2 + 1 });
    finalCommit = await commitAiCredits({
      store,
      userId: "free-user",
      requestId,
      now: SEOUL_JAN_15_NOON + index * 2 + 2,
    });
  }

  assert.equal(finalCommit.chargedCredits, 3);
  assert.equal(finalCommit.usage.plan, "free");
  const usage = await getAiCreditUsage({ store, userId: "free-user", now: SEOUL_JAN_15_NOON + 20 });
  assert.equal(usage.plan, "free");
  assert.equal(usage.trial.eligible, false);
  assert.equal(usage.trial.remainingCredits, 0);
  assert.equal(usage.metrics.chargedCredits, 15);
  assert.equal(store.records.get("free-user").aiCredits.trial.endedReason, "credits_exhausted");
});

test("duplicate requestId reservation and commit never reserve or charge twice", async () => {
  const store = memoryStore({ id: "pro-user", status: "active", plan: "pro", createdAt: SEOUL_JAN_15_NOON });
  const first = await reserveAiCredits({
    store,
    userId: "pro-user",
    action: "create_plan",
    requestId: "same-request",
    now: SEOUL_JAN_15_NOON,
  });
  assert.equal(first.usage.dailyReserved, 4);
  await expectCode(
    reserveAiCredits({
      store,
      userId: "pro-user",
      action: "create_plan",
      requestId: "same-request",
      now: SEOUL_JAN_15_NOON + 1,
    }),
    "AI_REQUEST_IN_PROGRESS",
  );

  const committed = await commitAiCredits({
    store,
    userId: "pro-user",
    requestId: "same-request",
    now: SEOUL_JAN_15_NOON + 2,
  });
  const duplicateCommit = await commitAiCredits({
    store,
    userId: "pro-user",
    requestId: "same-request",
    now: SEOUL_JAN_15_NOON + 3,
  });
  assert.equal(committed.chargedCredits, 4);
  assert.equal(duplicateCommit.chargedCredits, 0);
  assert.equal(duplicateCommit.idempotent, true);
  await expectCode(
    reserveAiCredits({
      store,
      userId: "pro-user",
      action: "create_plan",
      requestId: "same-request",
      now: SEOUL_JAN_15_NOON + 3,
    }),
    "AI_REQUEST_ALREADY_COMMITTED",
  );
  const usage = await getAiCreditUsage({ store, userId: "pro-user", now: SEOUL_JAN_15_NOON + 4 });
  assert.equal(usage.daily.used, 4);
  assert.equal(usage.monthly.used, 4);
  assert.equal(usage.metrics.chargedCredits, 4);
  assert.equal(usage.metrics.successfulCalls, 1);
});

test("different requests for one user are serialized inside the same worker isolate", async () => {
  const store = memoryStore(freeUser());
  const [first, second] = await Promise.all([
    reserveAiCredits({
      store,
      userId: "free-user",
      action: "companion_chat",
      requestId: "parallel-1",
      now: SEOUL_JAN_15_NOON,
    }),
    reserveAiCredits({
      store,
      userId: "free-user",
      action: "companion_chat",
      requestId: "parallel-2",
      now: SEOUL_JAN_15_NOON,
    }),
  ]);

  assert.equal(first.shouldExecute, true);
  assert.equal(second.shouldExecute, true);
  const usage = await getAiCreditUsage({ store, userId: "free-user", now: SEOUL_JAN_15_NOON + 1 });
  assert.equal(usage.daily.reserved, 2);
  assert.equal(usage.monthly.reserved, 2);
  assert.equal(usage.daily.remaining, 0);
});

test("failed AI calls release the reservation and restore availability exactly once", async () => {
  const store = memoryStore(freeUser());
  await reserveAiCredits({
    store,
    userId: "free-user",
    action: "revise_plan",
    requestId: "failed-request",
    now: SEOUL_JAN_15_NOON,
  });
  const released = await releaseAiCredits({
    store,
    userId: "free-user",
    requestId: "failed-request",
    providerCalled: true,
    errorCode: "AI_TIMEOUT",
    now: SEOUL_JAN_15_NOON + 1,
  });
  assert.equal(released.refundedCredits, 2);
  assert.equal(released.usage.dailyRemaining, 2);

  const duplicateRelease = await releaseAiCredits({
    store,
    userId: "free-user",
    requestId: "failed-request",
    now: SEOUL_JAN_15_NOON + 2,
  });
  assert.equal(duplicateRelease.refundedCredits, 0);
  assert.equal(duplicateRelease.idempotent, true);

  const usage = await getAiCreditUsage({ store, userId: "free-user", now: SEOUL_JAN_15_NOON + 3 });
  assert.equal(usage.daily.used, 0);
  assert.equal(usage.daily.reserved, 0);
  assert.equal(usage.monthly.used, 0);
  assert.equal(usage.metrics.failedCalls, 1);
  assert.equal(usage.metrics.releasedCredits, 2);
  assert.equal(usage.metrics.chargedCredits, 0);
});

test("an abandoned reservation is automatically released after the server safety window", async () => {
  const store = memoryStore(freeUser());
  await reserveAiCredits({
    store,
    userId: "free-user",
    action: "revise_plan",
    requestId: "abandoned-request",
    now: SEOUL_JAN_15_NOON,
  });
  const usage = await getAiCreditUsage({
    store,
    userId: "free-user",
    now: SEOUL_JAN_15_NOON + 10 * 60 * 1_000 + 1,
  });
  assert.equal(usage.daily.reserved, 0);
  assert.equal(usage.monthly.reserved, 0);
  assert.equal(usage.metrics.releasedCredits, 2);
  assert.equal(store.records.get("free-user").aiCredits.requests["abandoned-request"].status, "released");
  await expectCode(
    commitAiCredits({
      store,
      userId: "free-user",
      requestId: "abandoned-request",
      now: SEOUL_JAN_15_NOON + 10 * 60 * 1_000 + 2,
    }),
    "AI_CREDIT_RESERVATION_RELEASED",
  );
  const afterLateCommit = await getAiCreditUsage({
    store,
    userId: "free-user",
    now: SEOUL_JAN_15_NOON + 10 * 60 * 1_000 + 3,
  });
  assert.equal(afterLateCommit.daily.used, 0);
  assert.equal(afterLateCommit.daily.reserved, 0);
  assert.equal(afterLateCommit.metrics.chargedCredits, 0);
  assert.equal(afterLateCommit.metrics.successfulCalls, 0);
});

test("a reservation keeps its server-stored cost across later policy normalization", async () => {
  const store = memoryStore(freeUser());
  await reserveAiCredits({
    store,
    userId: "free-user",
    action: "companion_chat",
    requestId: "stored-policy-cost",
    now: SEOUL_JAN_15_NOON,
  });
  const stored = store.records.get("free-user");
  stored.aiCredits.requests["stored-policy-cost"].cost = 2;
  stored.aiCredits.usage.day.reserved = 2;
  stored.aiCredits.usage.day.byAction.companion_chat.reserved = 2;
  stored.aiCredits.usage.month.reserved = 2;
  stored.aiCredits.usage.month.byAction.companion_chat.reserved = 2;
  store.records.set("free-user", clone(stored));

  const released = await releaseAiCredits({
    store,
    userId: "free-user",
    requestId: "stored-policy-cost",
    now: SEOUL_JAN_15_NOON + 1,
  });
  assert.equal(released.refundedCredits, 2);
  const usage = await getAiCreditUsage({ store, userId: "free-user", now: SEOUL_JAN_15_NOON + 2 });
  assert.equal(usage.daily.reserved, 0);
  assert.equal(usage.monthly.reserved, 0);
});

test("day and month usage reset at Seoul calendar boundaries without rollover", async () => {
  const jan31 = Date.parse("2026-01-31T14:59:00.000Z");
  const feb1 = Date.parse("2026-01-31T15:00:00.000Z");
  const store = memoryStore({ id: "pro-user", status: "active", plan: "pro", createdAt: jan31 - HOUR });
  await reserveAiCredits({ store, userId: "pro-user", action: "companion_chat", requestId: "jan", now: jan31 });
  await commitAiCredits({ store, userId: "pro-user", requestId: "jan", now: jan31 + 1 });
  const january = await getAiCreditUsage({ store, userId: "pro-user", now: jan31 + 2 });
  assert.equal(january.daily.used, 1);
  assert.equal(january.monthly.used, 1);

  const february = await getAiCreditUsage({ store, userId: "pro-user", now: feb1 });
  assert.equal(february.daily.used, 0);
  assert.equal(february.monthly.used, 0);
  assert.equal(february.daily.remaining, 30);
  assert.equal(february.monthly.remaining, 250);
});
