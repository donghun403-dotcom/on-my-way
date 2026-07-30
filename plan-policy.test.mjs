import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  AI_ACTION_LABELS,
  AI_CREDIT_COSTS,
  CREDIT_POLICY_VERSION,
  DEFAULT_TIME_ZONE,
  PAYMENT_FAILURE_GRACE_MS,
  PAYWALL_OFF_EXPIRED_GRANT,
  PLAN_CONFIG,
  PRO_ONLY_AI_ACTIONS,
  allowsProOnlyFeature,
  canStartTrial,
  getAiCreditCost,
  getPlanConfig,
  isHardPaywallEnabled,
  isProOnlyAiAction,
  resolveEffectivePlan,
  resolveTrialEndsAt,
} from "./plan-policy.mjs";

const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;

test("플랜은 trial_pending·expired·pro 셋이고 값은 한 곳에서만 정의된다", () => {
  assert.deepEqual(Object.keys(PLAN_CONFIG), ["trial_pending", "expired", "pro"]);
  assert.equal(PLAN_CONFIG.free, undefined, "영구 무료 티어는 폐지됐다");
  assert.deepEqual(PLAN_CONFIG.expired, {
    displayName: "이용 종료",
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
  });
  assert.deepEqual(PLAN_CONFIG.pro, {
    displayName: "Pro",
    priceKRW: 3_900,
    monthlyCredits: 250,
    dailyCreditLimit: 30,
    maxGoals: null,
    maxActivePlans: null,
    creditsRollover: false,
    trial: { enabled: true, endsAfterDays: 1, credits: 15 },
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
  assert.equal(getPlanConfig("free"), null, "폐지된 플랜은 설정을 돌려주지 않는다");
  assert.equal(getPlanConfig("unknown"), null);
  assert.ok(Object.isFrozen(PLAN_CONFIG));
  assert.ok(Object.isFrozen(PLAN_CONFIG.expired.features));
});

/* www와 android는 검증용 Capacitor 셸이 만드는 생성물이다(mobile/scripts/prepare.mjs).
   www에는 제품 파일의 **사본**이 들어 있어서, 빼지 않으면 모든 폐지 스캔이 같은 위반을
   두 번 세고 오래된 로컬 번들 하나가 초록 브랜치를 빨갛게 만든다. 커밋되지 않는
   디렉터리라 CI에서는 보이지도 않는데 로컬에서만 깨지는 것이 더 나쁘다. */
const SKIP_DIRECTORIES = new Set(["node_modules", ".git", "test-results", "playwright-report", "output", "outputs", "tmp", "_to_delete", "www", "android"]);

/* 폐지된 이름을 인용해 "없어졌다"를 검사하는 파일들. 이 스캔에서 제외해야 한다 —
   제외하지 않으면 폐지를 확인하는 테스트가 폐지 위반으로 잡힌다. 여기 파일을 더 넣을 때는
   그 파일이 정말 "없어졌음을 확인하는" 목적인지 보라. 구현 파일은 절대 들어오면 안 된다. */
const REMOVAL_GUARD_FILES = new Set([
  "./plan-policy.test.mjs",
  // reserveEnergy가 trial_letter를 INVALID_AI_ACTION으로 거절하는지 실제로 부른다.
  "./energy-ledger.test.mjs",
  // 폐지된 라우트가 404인지 실제로 부른다.
  "./worker-energy-ledger.test.mjs",
]);

/* 저장소 전체를 훑어 폐지한 것의 잔재를 찾는다. */
function findSourceOffenders(checks) {
  const offenders = [];
  const walk = (directory) => {
    for (const entry of readdirSync(new URL(directory, import.meta.url), { withFileTypes: true })) {
      if (entry.name.startsWith(".") || SKIP_DIRECTORIES.has(entry.name)) continue;
      const path = `${directory}${entry.name}`;
      if (entry.isDirectory()) {
        walk(`${path}/`);
        continue;
      }
      if (!/\.(mjs|js|cjs|html)$/.test(entry.name)) continue;
      if (REMOVAL_GUARD_FILES.has(path)) continue;
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      for (const [label, pattern] of checks) {
        if (pattern.test(source)) offenders.push(label ? `${path} (${label})` : path);
      }
    }
  };
  walk("./");
  return offenders;
}

/* 폐지한 것이 이름만 남고 값이 살아 있으면 폐지가 아니다. 소스에 PLAN_CONFIG.free 참조가
   하나라도 남으면 여기서 걸린다 — 남은 참조는 런타임에 undefined 접근으로 터진다. */
test("PLAN_CONFIG.free 참조가 소스에 하나도 없다", () => {
  assert.deepEqual(findSourceOffenders([
    ["", /PLAN_CONFIG\s*(?:\.free\b|\[\s*["']free["']\s*\])/],
    ["data-policy-plan", /data-policy-plan="free"/],
  ]), []);
});

/* 체험 종료 편지(B)와 월 1권 무료 북 엔타이틀먼트(C)는 폐지했다.
   둘 다 에너지 원장 밖에서 AI 호출을 일으키던 경로라, 이름 하나가 되살아나면 상한에
   구멍이 다시 생긴다. 라우트·자격 키·정책 값이 남아 있으면 여기서 걸린다. */
test("체험 종료 편지와 무료 북 자격의 잔재가 소스에 하나도 없다", () => {
  assert.deepEqual(findSourceOffenders([
    ["trial_letter", /\btrial_letter\b/],
    ["trialLetter", /\btrialLetter[A-Za-z]*\b/],
    ["/api/ai/trial-letter", /api\/ai\/trial-letter/],
    ["ai-trial-letter 모듈", /ai-trial-letter/],
    ["freeDiaryBookMonthKey", /\bfreeDiaryBookMonthKey\b/],
    ["monthly_diary_book 자격", /monthly_diary_book/],
    ["hasMonthlyFreeDiaryBook", /\bhasMonthlyFreeDiaryBook\b/],
    ["MONTHLY_FREE_DIARY_BOOK_PLANS", /\bMONTHLY_FREE_DIARY_BOOK_PLANS\b/],
  ]), []);
});

/* 위 검사는 식별자만 본다. 그래서 화면에 그대로 찍히는 한글 문구는 빠져나간다 —
   실제로 admin.html의 데모 표에 "체험 종료 편지 미열람"이 남아 폐지된 기능 이름이
   관리자 화면에 보이고 있었다.

   .js를 함께 보지 않는 이유: 폐지를 설명하는 주석과 "이 문구가 없어야 한다"는 음성
   단언이 전부 걸린다. 그 둘은 지우면 안 되는 것들이다. 마크업만 본다. */
test("폐지한 기능 이름이 화면 마크업에 남아 있지 않다", () => {
  const offenders = [];
  for (const entry of readdirSync(new URL("./", import.meta.url), { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".html")) continue;
    const source = readFileSync(new URL(`./${entry.name}`, import.meta.url), "utf8");
    for (const [label, pattern] of [
      ["체험 종료 편지", /체험 종료 편지/],
      ["월 1권 무료", /월 1권 무료|월 1회 무료/],
      ["올리의 편지가 도착", /올리의 편지가 도착/],
      // 출생지 수집 폐지. 아래 식별자 스캔이 못 보는 라벨 텍스트를 여기서 잡는다.
      ["출생지", /출생지/],
    ]) {
      if (pattern.test(source)) offenders.push(`${entry.name} (${label})`);
    }
  }
  assert.deepEqual(offenders, []);
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
  // 체험 종료 편지는 폐지됐다. 값도 라벨도 남아 있으면 UI가 없는 기능을 광고하게 된다.
  assert.equal(getAiCreditCost("trial_letter"), null);
  assert.equal(AI_ACTION_LABELS.trial_letter, undefined);
});

/* 체험 크레딧은 15에서 올리지 않는다. 체험은 시간으로 끝나므로 에너지는 벽이 아니고,
   예산은 창을 채울 만큼이 아니라 루프를 한 번 보여줄 만큼이면 된다. 전환하지 않는 사람 몫까지
   전부 마케팅 비용이고 다중 provider 우회를 막지 않으므로 1인당 최대 4배로 증폭된다. */
test("체험 크레딧은 15이고 하루 상한은 그것을 하루에 다 쓸 수 있게 둔다", () => {
  assert.equal(PLAN_CONFIG.pro.trial.credits, 15);
  assert.ok(PLAN_CONFIG.pro.dailyCreditLimit >= PLAN_CONFIG.pro.trial.credits);
});

/* 북은 플랜과 무관하게 항상 10이고 PRO 전용이다. 값을 바꾸거나 목록을 늘리려면
   이 테스트가 먼저 걸리게 해서 결정이 눈에 보이게 한다. */
test("다이어리 북 비용과 PRO 전용 판정이 정책과 일치한다", () => {
  assert.equal(AI_CREDIT_COSTS.diary_book, 10);
  assert.ok(AI_CREDIT_COSTS.diary_book > PAYWALL_OFF_EXPIRED_GRANT.dailyCreditLimit, "만료 계정은 하루 상한으로도 북을 만들 수 없다");
  assert.ok(AI_CREDIT_COSTS.diary_book <= PLAN_CONFIG.pro.dailyCreditLimit, "PRO는 하루 안에 한 권을 만들 수 있어야 한다");

  // 현재 PRO 전용인 것은 북뿐이다. 나머지는 체험이 PRO와 똑같이 쓴다.
  assert.deepEqual([...PRO_ONLY_AI_ACTIONS], ["diary_book"]);
  assert.equal(isProOnlyAiAction("diary_book"), true);
  for (const action of ["companion_chat", "revise_plan", "recovery_plan", "reschedule_plan"]) {
    assert.equal(isProOnlyAiAction(action), false, `${action}은 체험에서도 열려 있어야 한다`);
  }
});

/* 게이트를 features나 getPlanConfig로 판정하면 체험이 통과한다. 그 함정을 테스트로 고정한다. */
test("PRO 전용 판정은 유효 플랜 문자열이 정확히 pro일 때만 참이다", () => {
  assert.equal(allowsProOnlyFeature("pro"), true);
  assert.equal(allowsProOnlyFeature("trial"), false);
  assert.equal(allowsProOnlyFeature("expired"), false);
  assert.equal(allowsProOnlyFeature("free"), false);
  assert.equal(allowsProOnlyFeature(""), false);
  assert.equal(allowsProOnlyFeature(undefined), false);
  assert.equal(allowsProOnlyFeature(null), false);

  // 왜 features로는 안 되는지: 체험의 설정은 PRO의 설정과 같은 객체다.
  assert.equal(getPlanConfig("trial"), PLAN_CONFIG.pro);
  assert.equal(getPlanConfig("trial").features.detailedInsights, true);
  assert.equal(allowsProOnlyFeature("trial"), false, "설정이 같아도 PRO 전용은 열리지 않는다");
});

/* ---------- 체험 종료 경계 ---------- */

const KST = (text) => Date.parse(`${text}+09:00`);

test("체험은 가입 다음 날 23:59:59.999 KST에 끝난다", () => {
  // 아침 가입 — 약 38시간
  assert.equal(resolveTrialEndsAt(KST("2026-07-29T10:00:00.000")), KST("2026-07-30T23:59:59.999"));
  // 자정 직후 가입 — 가장 긴 48시간
  assert.equal(resolveTrialEndsAt(KST("2026-07-29T00:00:00.000")), KST("2026-07-30T23:59:59.999"));
  // 자정 직전 가입 — 가장 짧은 24시간. "가입 + 24시간"이면 한 시간짜리 체험이 됐을 자리다.
  assert.equal(resolveTrialEndsAt(KST("2026-07-29T23:59:59.000")), KST("2026-07-30T23:59:59.999"));
  // 월·연 경계를 넘어가도 달력이 맞는다.
  assert.equal(resolveTrialEndsAt(KST("2026-07-31T22:00:00.000")), KST("2026-08-01T23:59:59.999"));
  assert.equal(resolveTrialEndsAt(KST("2026-12-31T09:00:00.000")), KST("2027-01-01T23:59:59.999"));
  assert.equal(resolveTrialEndsAt(0), 0);
  assert.equal(resolveTrialEndsAt(null), 0);
});

test("만료 판정은 23:59:59와 00:00:00 KST 양쪽에서 정확하다", () => {
  const startedAt = KST("2026-07-29T10:00:00.000");
  const user = { plan: "trial", trialStartedAt: startedAt, trialUsedAt: startedAt, trialExpiresAt: resolveTrialEndsAt(startedAt) };

  assert.equal(resolveEffectivePlan(user, KST("2026-07-30T23:59:59.000")), "trial", "마지막 날 23:59:59는 아직 체험 중이다");
  assert.equal(resolveEffectivePlan(user, KST("2026-07-30T23:59:59.999")), "expired", "경계 그 밀리초에 끝난다");
  assert.equal(resolveEffectivePlan(user, KST("2026-07-31T00:00:00.000")), "expired", "다음 날 자정에는 만료다");
});

/* ---------- 상태 머신 ---------- */

test("가입한 계정은 체험, 체험이 끝나면 만료다", () => {
  const now = Date.parse("2026-07-29T01:00:00.000Z");
  assert.equal(resolveEffectivePlan(null, now), "expired");
  /* 체험 기록이 없으면 "끝난 것"이 아니라 "아직 시작 전"이다. 영구 무료가 아니라는 것은
     라벨이 아니라 지급액이 지킨다 — 아래에서 그것까지 확인한다. */
  assert.equal(resolveEffectivePlan({}, now), "trial_pending", "체험을 시작한 적이 없으면 시작 전이다");
  assert.equal(resolveEffectivePlan({ trialUsedAt: now - DAY }, now), "expired", "자격을 쓴 계정은 만료다");
  assert.equal(resolveEffectivePlan({ plan: "trial", trialExpiresAt: now + HOUR }, now), "trial");
  assert.equal(resolveEffectivePlan({ plan: "trial", trialExpiresAt: now - 1 }, now), "expired");
  // 저장된 plan이 낡아도 판정은 사실(trialExpiresAt)을 따른다.
  assert.equal(resolveEffectivePlan({ plan: "expired", trialExpiresAt: now + HOUR }, now), "trial");

  // 영구 무료 티어가 없다는 것은 지급액이 지킨다. trial_pending도 받는 것이 0이다.
  assert.equal(PLAN_CONFIG.trial_pending.monthlyCredits, 0, "시작 전 상태가 영구 무료가 됐다");
  assert.equal(PLAN_CONFIG.trial_pending.dailyCreditLimit, 0);
});

test("해지한 PRO는 결제 기간 끝까지 PRO이고 그 뒤 만료다", () => {
  const now = Date.parse("2026-07-29T01:00:00.000Z");
  const canceled = { plan: "pro", subscriptionStatus: "canceled", currentPeriodEnd: now + 5 * DAY };
  assert.equal(resolveEffectivePlan(canceled, now), "pro", "해지해도 이미 낸 기간은 PRO다");
  assert.equal(resolveEffectivePlan(canceled, now + 5 * DAY), "expired", "기간이 끝나면 크론을 기다리지 않고 만료다");

  // 관리자 제공(complimentary)은 기간이 없다. 0을 "이미 지났다"로 읽으면 안 된다.
  assert.equal(resolveEffectivePlan({ plan: "pro", subscriptionStatus: "complimentary" }, now), "pro");
});

test("결제 실패는 3일 유예 뒤에 만료된다", () => {
  const failedAt = Date.parse("2026-07-29T01:00:00.000Z");
  const graceUntil = failedAt + PAYMENT_FAILURE_GRACE_MS;
  const pastDue = { plan: "pro", subscriptionStatus: "past_due", paymentGraceUntil: graceUntil, currentPeriodEnd: failedAt };

  assert.equal(PAYMENT_FAILURE_GRACE_MS, 3 * DAY);
  assert.equal(resolveEffectivePlan(pastDue, failedAt), "pro", "카드 만료로 정상 유저가 즉시 잠기지 않는다");
  assert.equal(resolveEffectivePlan(pastDue, graceUntil - 1), "pro", "유예 마지막 순간까지 PRO");
  assert.equal(resolveEffectivePlan(pastDue, graceUntil), "expired", "유예가 끝나면 만료");

  // 재시도를 다 쓴 뒤에도 유예가 남아 있으면 PRO다 — 차단 시점은 유예 창이 정한다.
  const failed = { ...pastDue, subscriptionStatus: "payment_failed" };
  assert.equal(resolveEffectivePlan(failed, graceUntil - 1), "pro");
  assert.equal(resolveEffectivePlan(failed, graceUntil), "expired");

  // 유예 창이 없는 예전 레코드는 유예를 받은 적이 없으므로 즉시 만료다.
  assert.equal(resolveEffectivePlan({ plan: "pro", subscriptionStatus: "payment_failed" }, failedAt), "expired");
});

test("체험은 계정당 1회다 — 시작 이력이 있으면 다시 열리지 않는다", () => {
  assert.equal(canStartTrial(null), false);
  assert.equal(canStartTrial({}), true);
  assert.equal(canStartTrial({ trialStartedAt: 1 }), false);
  assert.equal(canStartTrial({ trialUsedAt: 1 }), false, "시작 시각이 지워져도 사용 이력이 남으면 막는다");
  assert.equal(canStartTrial({ plan: "pro" }), false);
});

test("차단은 기본값이 꺼짐이고 문자열 \"true\"에서만 켜진다", () => {
  assert.equal(isHardPaywallEnabled(undefined), false);
  assert.equal(isHardPaywallEnabled({}), false);
  assert.equal(isHardPaywallEnabled({ HARD_PAYWALL_ENABLED: "false" }), false);
  assert.equal(isHardPaywallEnabled({ HARD_PAYWALL_ENABLED: "1" }), false, "실수로 켜지지 않게 값을 좁게 본다");
  assert.equal(isHardPaywallEnabled({ HARD_PAYWALL_ENABLED: "true" }), true);
  assert.equal(isHardPaywallEnabled({ HARD_PAYWALL_ENABLED: "TRUE" }), true);
});

/* 차단이 꺼져 있는 동안은 아무도 잠기지 않아야 한다. 그 한도가 폐지 전 Free와 같은지
   확인한다 — 값이 달라지면 "플래그를 꺼도 동작이 같다"는 약속이 깨진다. */
test("차단이 꺼져 있는 동안 만료 계정에 열어 두는 한도는 폐지 전 Free와 같다", () => {
  assert.deepEqual(PAYWALL_OFF_EXPIRED_GRANT, { monthlyCredits: 10, dailyCreditLimit: 4 });
  assert.ok(Object.isFrozen(PAYWALL_OFF_EXPIRED_GRANT));
});

/* 출생지 수집 폐지. 만세력은 생년월일·시각만 받고(calculateSimpleManse) 다른 사용처가
   하나도 없었다 — 저장하고 다음에 시트를 열 때 입력칸에 되돌려 넣는 것이 전부였다.
   목적 없는 개인정보 수집은 최소수집 원칙에 어긋나고, 구글 데이터 안전 양식은 항목마다
   목적을 요구하는데 적을 목적이 없다(docs/play-store-submission.md §1.2 ①).

   여기서 검사하는 것은 **되살아나는 경로**다. 프로퍼티 접근(.birthPlace)과 객체 리터럴
   키(birthPlace:)와 입력 요소 id와 화면 문구 넷. script.js의 RETIRED_PROFILE_FIELDS에
   있는 문자열 "birthPlace"는 이 넷 중 어디에도 걸리지 않는다 — 그 목록은 값을 지우는
   쪽이지 읽는 쪽이 아니기 때문이다. 그래서 정리 코드를 예외 파일로 빼지 않아도 된다.
   구현 파일을 REMOVAL_GUARD_FILES에 넣는 순간 이 스캔은 아무것도 지키지 못한다. */
test("출생지 수집의 잔재가 소스에 하나도 없다", () => {
  assert.deepEqual(findSourceOffenders([
    ["profile.birthPlace 접근", /\.birthPlace\b/],
    ["birthPlace 객체 키", /\bbirthPlace\s*:/],
    ["profileBirthPlace 입력", /\bprofileBirthPlace\b/],
  ]), []);
});

/* 위 스캔은 "이름이 없다"만 본다. 이미 저장된 값이 지워지는지는 다른 질문이라
   tests/e2e/storage-recovery.spec.js가 실제 브라우저에서 잰다. 둘 다 있어야 한다 —
   이름만 지우면 기기와 서버에 남은 값은 그대로다. */
test("폐지 항목 정리 경로가 세 자리에 모두 걸려 있다", () => {
  const client = readFileSync(new URL("./script.js", import.meta.url), "utf8");
  assert.match(client, /const RETIRED_PROFILE_FIELDS = \["birthPlace"\]/);
  assert.match(client, /^purgeRetiredProfileFields\(\);$/m, "시작할 때 로컬을 훑는다");
  assert.match(
    client,
    /SERVER_SYNC_STORAGE_KEYS\s*\n?\s*\.map\(\(key\) => \[key, stripRetiredProfileFields\(localStorage\.getItem\(key\)\)\]\)/,
    "서버로 올라가는 길목에서 거른다",
  );
  assert.match(
    client,
    /localStorage\.setItem\(key, stripRetiredProfileFields\(value\)\)/,
    "서버에서 내려오는 길목에서 거른다",
  );
});
