export const CREDIT_POLICY_VERSION = "2026-07-27.v1";
export const POLICY_VERSION = CREDIT_POLICY_VERSION;
export const DEFAULT_TIME_ZONE = "Asia/Seoul";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const PLAN_CONFIG = deepFreeze({
  free: {
    displayName: "Free",
    priceKRW: 0,
    // dailyCreditLimit stays at 2 x AI_CREDIT_COSTS.revise_plan so a Free user can
    // still adjust their own plan twice a day — the only paid action they can reach
    // without Pro. monthlyCredits is the loss cap per free user.
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
  },
  pro: {
    displayName: "Pro",
    priceKRW: 3_900,
    monthlyCredits: 250,
    dailyCreditLimit: 30,
    maxGoals: null,
    maxActivePlans: null,
    creditsRollover: false,
    trial: {
      enabled: true,
      durationHours: 24,
      credits: 15,
    },
    features: {
      basicRecords: true,
      fullReschedule: true,
      recoveryPlan: true,
      detailedInsights: true,
      companionPersonalization: true,
    },
  },
});

// 계획 생성과 목표 이해 정리는 수동 온보딩으로 대체돼 라우트가 사라졌다.
// 여기 남는 것은 실제로 호출할 수 있는 행동뿐이다 — 매일 축하·위로는 무료라 값이 없다.
export const AI_CREDIT_COSTS = deepFreeze({
  companion_chat: 1,
  revise_plan: 2,
  recovery_plan: 3,
  reschedule_plan: 4,
});

export const AI_ACTION_LABELS = deepFreeze({
  companion_chat: "올리와 지금 대화",
  revise_plan: "계획 일부 수정",
  recovery_plan: "회복 계획 생성",
  reschedule_plan: "전체 일정 재조정",
});

export const PLAN_LABELS = deepFreeze({
  free: "Free",
  trial: "무료 체험 중",
  pro: "Pro",
});

export const POLICY_LABELS = deepFreeze({
  credit: "AI 크레딧",
  dailyCredits: "오늘 사용한 AI 크레딧",
  monthlyCredits: "이번 달 사용한 AI 크레딧",
  trialCredits: "체험 AI 크레딧",
  noRollover: "사용하지 않은 크레딧은 다음 기간으로 이월되지 않아요.",
});

export const AI_ACTION_REQUIRED_FEATURE = deepFreeze({
  recovery_plan: "recoveryPlan",
  reschedule_plan: "fullReschedule",
});

export function getPlanConfig(plan) {
  if (plan === "trial") return PLAN_CONFIG.pro;
  return PLAN_CONFIG[plan] || null;
}

export function getAiCreditCost(action) {
  return Object.hasOwn(AI_CREDIT_COSTS, action) ? AI_CREDIT_COSTS[action] : null;
}
