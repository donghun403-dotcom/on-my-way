export const CREDIT_POLICY_VERSION = "2026-07-27.v1";
export const POLICY_VERSION = CREDIT_POLICY_VERSION;
export const DEFAULT_TIME_ZONE = "Asia/Seoul";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

/* 플랜은 pro · trial · trial_pending · expired 네 가지다. 영구 무료 티어(free)는 폐지됐다 —
   체험이 끝나면 결제하지 않는 한 AI 기능은 열리지 않는다.
   expired에도 설정을 두는 이유는 "없는 플랜"이 아니라 "지급이 0인 플랜"으로 다뤄야
   원장·사용량 화면이 특수 분기 없이 그대로 돌기 때문이다.

   플랜 값을 추가하면 plan-gates.test.mjs의 게이트 표에 모든 값이 등록될 때까지 실패한다.
   그 표가 "이 값을 여기서 어떻게 다루는가"를 게이트마다 명시적으로 답하게 만든다. */
export const PLAN_CONFIG = deepFreeze({
  /* 가입은 했지만 체험이 아직 시작되지 않은 상태.

     왜 expired와 라벨을 공유하지 않는가: 둘은 퍼널의 다른 단계다. "아직 안 써 본 사람"과
     "다 쓴 사람"을 같은 값으로 묶으면 지표에서 구분되지 않고, 무엇보다 공유 라벨 +
     필수 부가검사(trialStartedAt이 비었는지 따로 보기)는 빠뜨려도 조용하다.
     이 리포에서 오늘 잡은 결함이 전부 그 형태였다.

     권한은 expired와 같다(지급 0 · 한도 0 · PRO 전용 잠김). 다른 것은 라벨과 계측뿐이다.
     체험 앵커가 "첫 AI 사용"으로 옮겨지면(PR-B) 이 값이 가입 직후의 정상 상태가 되고,
     그때 게이트 몇 개의 처리가 바뀐다. */
  trial_pending: {
    displayName: "체험 시작 전",
    priceKRW: 0,
    monthlyCredits: 0,
    dailyCreditLimit: 0,
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
  expired: {
    displayName: "이용 종료",
    priceKRW: 0,
    monthlyCredits: 0,
    dailyCreditLimit: 0,
    maxGoals: 1,
    maxActivePlans: 1,
    creditsRollover: false,
    features: {
      // 기록 열람·내보내기는 AI를 쓰지 않는다. 만료돼도 막지 않는다(개인정보 자기결정권).
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
      // 체험 종료는 "가입 + N시간"이 아니라 달력 경계다. 가입한 날의 endsAfterDays일 뒤,
      // 그 날 23:59:59.999 KST에 끝난다(resolveTrialEndsAt). 1이면 "가입 다음 날 끝".
      endsAfterDays: 1,
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

/* HARD_PAYWALL_ENABLED가 꺼져 있는 동안 만료 계정에 열어 두는 한도.
   플래그의 목적은 "실결제가 검증되기 전에는 아무도 잠기지 않게 한다"이므로,
   꺼져 있을 때는 폐지 전 Free와 같은 양을 그대로 준다. 플래그를 켜면 이 값은 쓰이지 않는다.
   페이월이 정식 배포되고 되돌릴 일이 없어지면 이 상수와 참조를 통째로 지운다. */
export const PAYWALL_OFF_EXPIRED_GRANT = deepFreeze({ monthlyCredits: 10, dailyCreditLimit: 4 });

/* 결제 실패로 바로 잠그지 않는다. 카드 만료 같은 사유로 정상 유저가 잠기는 것을 막으려고
   첫 실패로부터 3일은 PRO 권한을 유지하고 결제 수단 갱신을 안내한다. */
export const PAYMENT_FAILURE_GRACE_MS = 3 * 24 * 60 * 60 * 1_000;

// 계획 생성과 목표 이해 정리는 수동 온보딩으로 대체돼 라우트가 사라졌다.
// 여기 남는 것은 실제로 호출할 수 있는 행동뿐이다 — 매일 축하·위로는 무료라 값이 없다.
export const AI_CREDIT_COSTS = deepFreeze({
  companion_chat: 1,
  revise_plan: 2,
  recovery_plan: 3,
  reschedule_plan: 4,
  /* 다이어리 북 1권 (AI 호출은 머리말 + 편지 2회). 플랜과 무관하게 항상 10이다 —
     무료 엔타이틀먼트를 두면 그 발급은 에너지 원장 밖에서 일어나고, 원장이 AI 비용의
     상한이라는 성질이 깨진다. 북은 앱에서 가장 비싼 단일 동작이라 그 구멍이 가장 크다.
     PRO는 월 250이므로 10은 실질 장벽이 아니고, 회계만 정직해진다. */
  diary_book: 10,
});

export const AI_ACTION_LABELS = deepFreeze({
  companion_chat: "올리와 지금 대화",
  revise_plan: "계획 일부 수정",
  recovery_plan: "회복 계획 생성",
  reschedule_plan: "전체 일정 재조정",
  diary_book: "다이어리 북 만들기",
});

/* ---------- PRO 전용 기능 ----------

   유료로만 열리는 것의 목록이다. 여기 있는 것은 체험(trial)에서도 잠긴다.

   왜 features 플래그나 getPlanConfig로 판정하지 않는가: getPlanConfig("trial")은
   PLAN_CONFIG.pro를 그대로 돌려준다. 체험은 PRO를 미리 보는 기간이라 그게 맞다.
   그래서 features를 보면 체험 계정이 전부 통과한다. PRO 전용 판정은 반드시
   resolveEffectivePlan(user, now) === "pro" 문자열 비교로만 한다.

   현재 목록은 다이어리 북과 인쇄/PDF뿐이다. 나머지 AI 기능은 체험이 PRO와 똑같이 쓴다 —
   체험의 목적이 "PRO가 어떤 것인지 보여 준다"이기 때문이다. 북만 예외인 이유는
   하루~이틀 기록으로 만든 한 권은 품질이 안 나오고, 차별점이어야 할 북의 인상을
   미리 깎기 때문이다. */
export const PRO_ONLY_AI_ACTIONS = deepFreeze(["diary_book"]);

export function isProOnlyAiAction(action) {
  return PRO_ONLY_AI_ACTIONS.includes(action);
}

/* PRO 전용 기능의 유일한 판정 함수. 인자는 resolveEffectivePlan의 결과여야 한다.
   저장된 user.plan을 그대로 넣으면 해지·결제 실패·체험 만료가 반영되지 않는다. */
export function allowsProOnlyFeature(effectivePlan) {
  return effectivePlan === "pro";
}

export const PRO_ONLY_LOCK_REASON = "PRO로 전환하면 내 기록으로 만들 수 있어요.";

/* ---------- 플랜 값을 나열하는 게이트 ----------

   worker 안에 배열 리터럴로 흩어 두면 새 플랜 값이 생겼을 때 어디를 고쳐야 하는지
   찾는 방법이 grep밖에 없다. 여기 모아 두면 plan-gates.test.mjs가 각 목록을 모든 플랜
   값에 대해 명시적으로 검사한다. */

// 하드 페이월이 켜져 있을 때 AI 라우트에서 402로 막는 플랜.
// trial_pending은 체험 앵커가 옮겨지면 여기서 빠진다(worker.mjs의 게이트 주석 참고).
export const PAYWALL_BLOCKED_PLANS = deepFreeze(["expired", "trial_pending"]);

// 올리가 기록을 참조해 개인화된 답을 만들 수 있는 플랜. 체험은 PRO 미리보기라 포함된다.
export const PERSONALIZED_COMPANION_PLANS = deepFreeze(["pro", "trial"]);

// resolveEffectivePlan이 돌려줄 수 있는 값 전부. 게이트 표의 축이다.
export const EFFECTIVE_PLANS = deepFreeze(["pro", "trial", "trial_pending", "expired"]);

export const PLAN_LABELS = deepFreeze({
  expired: "이용 종료",
  // "체험 준비됨"처럼 자격을 약속하는 말은 쓰지 않는다. 남용 마커에 막힌 계정도 이 값을
  // 가질 수 있어서, 자격 판정은 별도(canStartTrial)로 남겨 둔다.
  trial_pending: "체험 시작 전",
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

/* ---------- 체험 종료 경계 ---------- */

function zonedDateParts(timestamp, timeZone) {
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
  if (parts.hour === 24) parts.hour = 0;
  return parts;
}

function zoneOffsetMs(timestamp, timeZone) {
  const parts = zonedDateParts(timestamp, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(timestamp / 1_000) * 1_000;
}

/* 체험 종료 시각 — 가입한 날의 다음 날 23:59:59.999 (KST).
   "가입 + 24시간"이 아니라 달력 경계인 이유: 밤 11시에 가입한 사람이 사실상 한 시간짜리
   체험을 받는 일이 없어야 하고, 종료 시각을 날짜로 말할 수 있어야 가입 화면에 적을 수 있다.
   그래서 체험 길이는 24~48시간 사이에서 가입 시각에 따라 달라진다.

   경계는 DEFAULT_TIME_ZONE(Asia/Seoul) 기준으로 잡는다. KST는 서머타임이 없어 연중
   UTC+9로 고정이므로 오프셋을 한 번만 재서 빼도 경계가 어긋나지 않는다. 서머타임이 있는
   시간대로 바꾸면 이 전제가 깨지고 종료 경계가 한 시간 밀린다. */
export function resolveTrialEndsAt(startedAt, timeZone = DEFAULT_TIME_ZONE) {
  const start = Number(startedAt);
  if (!Number.isFinite(start) || start <= 0) return 0;
  const parts = zonedDateParts(start, timeZone);
  const endsAfterDays = PLAN_CONFIG.pro.trial.endsAfterDays;
  // 종료일 '다음 날 자정'을 만든 뒤 1ms를 빼서 23:59:59.999로 맞춘다.
  const exclusiveEndUtc = Date.UTC(parts.year, parts.month - 1, parts.day + endsAfterDays + 1);
  return exclusiveEndUtc - zoneOffsetMs(start, timeZone) - 1;
}

/* ---------- 플랜 상태 머신 ----------

   trialExpiresAt을 읽는 유일한 지점이다. 플랜 판정이 필요한 곳은 전부 이 함수를 거친다
   (worker의 AI 라우트, 에너지 원장의 월 지급, 레거시 KV 크레딧 경로, 계정 API).
   저장된 user.plan은 힌트일 뿐 권위가 아니다 — 크론이 늦게 돌아도 판정이 밀리지 않아야 한다.

   상태 전이
     가입           → trial   (계정당 1회, trialStartedAt이 있으면 재발급하지 않는다)
     체험 만료      → expired
     결제           → pro     (currentPeriodEnd 설정)
     해지           → currentPeriodEnd까지 pro, 그 뒤 expired
     결제 실패      → 첫 실패 + 3일까지 pro(유예), 그 뒤 expired
     구독 갱신 실패 → expired
     체험 미시작    → trial_pending

   trial_pending은 지금 거의 도달하지 않는다. 가입이 곧 체험 시작이라(auth-service의
   ensureAccount) 새 계정은 즉시 trial이 되기 때문이다. 오늘 여기 떨어지는 것은 탈퇴 후
   재가입해 남용 마커에 막힌 계정뿐이고, 그 계정의 권한은 이전과 똑같이 expired와 같다 —
   이 PR은 라벨과 계측만 나눈다.

   체험 앵커가 "첫 AI 사용"으로 옮겨지면 이것이 가입 직후의 정상 상태가 된다. */
export function resolveEffectivePlan(user, now = Date.now()) {
  if (!user) return "expired";
  const nowMs = Number.isFinite(Number(now)) ? Number(now) : Date.now();

  if (user.plan === "pro") {
    const status = String(user.subscriptionStatus || "");
    if (status === "past_due" || status === "payment_failed") {
      // 유예 창이 없는 예전 레코드는 유예를 받은 적이 없으므로 즉시 만료로 본다.
      return Number(user.paymentGraceUntil || 0) > nowMs ? "pro" : "expired";
    }
    const periodEnd = Number(user.currentPeriodEnd || 0);
    // complimentary(관리자 제공)는 기간이 없다. 0은 "만료 시점 없음"이라는 뜻이다.
    if (periodEnd > 0 && periodEnd <= nowMs) return "expired";
    return "pro";
  }

  if (Number(user.trialExpiresAt || 0) > nowMs) return "trial";
  /* 체험을 한 번도 시작한 적이 없으면 "끝난 것"이 아니라 "아직 시작 전"이다.
     canStartTrial과 같은 조건을 쓰므로 판정이 갈라지지 않는다. */
  if (canStartTrial(user)) return "trial_pending";
  return "expired";
}

/* 이 계정이 체험을 받을 자격이 있는가. 체험은 계정당 1회이므로 시작 이력이 한 번이라도
   있으면 다시 주지 않는다. 탈퇴 후 재가입을 막는 것은 이 필드가 아니라 저장소에 남는
   체험 사용 마커다(ai-credits-service의 ai-trial-used:*). */
export function canStartTrial(user) {
  if (!user) return false;
  if (user.plan === "pro") return false;
  /* 체험 흔적이 하나라도 있으면 자격은 없다. trialExpiresAt까지 보는 이유는, 종료 시각만
     남고 시작 시각이 비어 있는 레코드(부분 기록·구버전)를 "아직 시작 전"으로 읽으면
     체험이 다시 열리기 때문이다. 세 필드 중 하나라도 있으면 이 계정은 체험을 겪었다. */
  return !user.trialStartedAt && !user.trialUsedAt && !user.trialExpiresAt;
}

/* 가입 시점의 체험 처리 두 결정.

   왜 함수로 빼는가: 이 둘은 지금 같은 자리에서 일어나지만 수명이 다르다. 체험 앵커가
   "첫 AI 사용"으로 옮겨지면 startTrial의 소비자는 그 경로로 가고 copyUsedMarker는 가입에
   남는다. 둘을 if/else로 엮어 두면 한쪽이 옮겨질 때 남은 쪽의 조건이 조용히 넓어진다 —
   "마커 있는 신규 계정"이 "모든 신규 계정"이 되어 모든 가입자에게 체험 자격 소진이 찍히고
   아무도 체험을 시작할 수 없게 된다.

   또한 지금은 두 경로의 결과가 겉으로 같다. 마커 없는 신규 가입은 어차피 체험이 시작되어
   trialUsedAt이 찍히므로, 조건이 넓어져도 관측되는 값이 같다. 그래서 라우트 테스트로는
   이 불변식을 잴 수 없다. 결정을 순수 함수로 꺼내야 네 조합을 직접 확인할 수 있다. */
export function resolveTrialAdmission({ isFreshRecord = false, trialAlreadyUsed = false } = {}) {
  return {
    // 새 레코드이고 이 소셜 계정이 체험을 쓴 적이 없을 때만 연다.
    startTrial: Boolean(isFreshRecord) && !trialAlreadyUsed,
    /* 마커가 있으면 그 판정을 레코드에 복사한다. 다른 어떤 조건도 보지 않는다 —
       마커와 레코드가 다른 말을 하면 회원 레코드만 보는 판정이 없는 자격을 보여 준다. */
    copyUsedMarker: Boolean(trialAlreadyUsed),
  };
}

/* 차단 동작 전체가 이 플래그 뒤에 있다. 기본값은 false다 —
   PAYMENTS_ENABLED가 true이고 실결제가 검증되기 전에 켜면 결제할 방법이 없는 유저가 잠긴다. */
export function isHardPaywallEnabled(env) {
  return String(env?.HARD_PAYWALL_ENABLED || "").toLowerCase() === "true";
}
