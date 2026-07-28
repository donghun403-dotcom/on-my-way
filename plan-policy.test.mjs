import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_ACTION_LABELS,
  AI_CREDIT_COSTS,
  CREDIT_POLICY_VERSION,
  DEFAULT_TIME_ZONE,
  PLAN_CONFIG,
  getAiCreditCost,
  getPlanConfig,
} from "./plan-policy.mjs";

test("Free and Pro policy values have one authoritative definition", () => {
  assert.deepEqual(PLAN_CONFIG.free, {
    displayName: "Free",
    priceKRW: 0,
    monthlyCredits: 10,
    dailyCreditLimit: 4,
    maxGoals: 1,
    maxActivePlans: 1,
    creditsRollover: false,
    features: {
      basicRecords: true,
      fullReschedule: false,
      recoveryPlan: false,
      detailedInsights: false,
      companionPersonalization: false,
    },
  });
  assert.deepEqual(PLAN_CONFIG.pro, {
    displayName: "Pro",
    priceKRW: 4_900,
    monthlyCredits: 250,
    dailyCreditLimit: 30,
    maxGoals: null,
    maxActivePlans: null,
    creditsRollover: false,
    trial: { enabled: true, durationHours: 24, credits: 15 },
    features: {
      basicRecords: true,
      fullReschedule: true,
      recoveryPlan: true,
      detailedInsights: true,
      companionPersonalization: true,
    },
  });
  assert.equal(DEFAULT_TIME_ZONE, "Asia/Seoul");
  assert.match(CREDIT_POLICY_VERSION, /^2026-07-27/);
  assert.equal(getPlanConfig("trial"), PLAN_CONFIG.pro);
  assert.equal(getPlanConfig("unknown"), null);
  assert.ok(Object.isFrozen(PLAN_CONFIG));
  assert.ok(Object.isFrozen(PLAN_CONFIG.free.features));
});

test("every AI action has the exact server-side cost and a user-facing label", () => {
  // 라우트가 있는 행동만 값을 가진다 — 값이 붙어 있으면 UI가 없는 기능을 광고하게 된다.
  assert.deepEqual(AI_CREDIT_COSTS, {
    companion_chat: 1,
    revise_plan: 2,
    recovery_plan: 3,
    reschedule_plan: 4,
  });
  assert.deepEqual(AI_ACTION_LABELS, {
    companion_chat: "올리와 지금 대화",
    revise_plan: "계획 일부 수정",
    recovery_plan: "회복 계획 생성",
    reschedule_plan: "전체 일정 재조정",
  });
  assert.equal(getAiCreditCost("recovery_plan"), 3);
  assert.equal(getAiCreditCost("not_real"), null);
  assert.ok(Object.isFrozen(AI_CREDIT_COSTS));
});
