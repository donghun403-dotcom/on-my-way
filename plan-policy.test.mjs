import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_ACTION_LABELS,
  AI_CREDIT_COSTS,
  CREDIT_POLICY_VERSION,
  DEFAULT_TIME_ZONE,
  MONTHLY_FREE_DIARY_BOOK_PLANS,
  PLAN_CONFIG,
  getAiCreditCost,
  getPlanConfig,
  hasMonthlyFreeDiaryBook,
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
    priceKRW: 3_900,
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
    diary_book: 10,
  });
  assert.deepEqual(AI_ACTION_LABELS, {
    companion_chat: "올리와 지금 대화",
    revise_plan: "계획 일부 수정",
    recovery_plan: "회복 계획 생성",
    reschedule_plan: "전체 일정 재조정",
    diary_book: "다이어리 북 만들기",
  });
  assert.equal(getAiCreditCost("recovery_plan"), 3);
  assert.equal(getAiCreditCost("not_real"), null);
  assert.ok(Object.isFrozen(AI_CREDIT_COSTS));
});

/* 다이어리 북은 무료 플랜의 하루 상한(4)보다 비싸다. 이건 사고가 아니라 현재 정책의
   결과다 — Free는 북을 만들 수 없고, 90일 만료 안내가 PRO·팩 구매로 이어지는 자리다.
   값을 바꾸려면 이 테스트가 먼저 걸리게 해서 결정이 눈에 보이게 한다. */
test("다이어리 북 비용과 플랜별 접근 가능 여부가 정책과 일치한다", () => {
  assert.equal(AI_CREDIT_COSTS.diary_book, 10);
  assert.ok(AI_CREDIT_COSTS.diary_book > PLAN_CONFIG.free.dailyCreditLimit, "Free는 하루 상한에 걸려 북을 만들 수 없다");
  assert.ok(AI_CREDIT_COSTS.diary_book <= PLAN_CONFIG.pro.dailyCreditLimit, "PRO는 무료 1권을 쓴 뒤에도 에너지로 더 만들 수 있어야 한다");
  assert.deepEqual([...MONTHLY_FREE_DIARY_BOOK_PLANS], ["pro", "trial"]);
  assert.equal(hasMonthlyFreeDiaryBook("pro"), true);
  assert.equal(hasMonthlyFreeDiaryBook("trial"), true);
  assert.equal(hasMonthlyFreeDiaryBook("free"), false);
});
