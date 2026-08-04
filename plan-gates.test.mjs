/* 플랜 값이 모든 게이트에서 명시적으로 처리되는지 검사한다.
 *
 * 왜 필요한가: 플랜 값을 추가하면 그것을 나열하지 않은 게이트는 조용히 else 분기로
 * 흘려보낸다. 잠가야 할 계정이 통과하거나, 열어야 할 계정이 0을 받고 잠긴다. 둘 다
 * 예외를 던지지 않으므로 실제 계정이 그 상태에 떨어질 때까지 아무도 모른다.
 *
 * 이 리포에서 오늘 잡은 결함이 전부 그 형태였다 — 공유 라벨 + 필수 부가검사는
 * 빠뜨려도 조용하다.
 *
 * 여기서 강제하는 것:
 *   ⓐ EFFECTIVE_PLANS가 resolveEffectivePlan이 실제로 돌려주는 값과 같다
 *   ⓑ 모든 게이트 행이 모든 플랜 값에 대해 기대값을 선언한다 (빠지면 실패)
 *   ⓒ 선언한 기대값이 실제 동작과 일치한다
 *
 * 새 플랜 값은 표의 모든 행에 등록될 때까지 들어오지 못한다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EFFECTIVE_PLANS,
  PAYWALL_BLOCKED_PLANS,
  PERSONALIZED_COMPANION_PLANS,
  PLAN_CONFIG,
  PLAN_LABELS,
  allowsProOnlyFeature,
  canStartTrial,
  getPlanConfig,
  resolveEffectivePlan,
  resolveTrialEndsAt,
} from "./plan-policy.mjs";
import { dailySpendLimit, monthlyGrantAmount } from "./energy-ledger.mjs";

const NOW = Date.UTC(2026, 6, 30, 3, 0, 0);
const TRIAL_CREDITS = PLAN_CONFIG.pro.trial.credits;
const PRO_CREDITS = PLAN_CONFIG.pro.monthlyCredits;
const PRO_DAILY = PLAN_CONFIG.pro.dailyCreditLimit;

/* ---------- ⓐ 플랜 값 목록이 실제 반환값과 같은가 ---------- */

/* 소스에서 직접 읽는다. 런타임으로는 "이 함수가 돌려줄 수 있는 값 전부"를 알 수 없고,
   실제 계정을 만들어 보는 방식은 아직 도달하지 않는 값(trial_pending)을 놓친다. */
function planLiteralsReturnedBy(functionName) {
  const source = readFileSync(new URL("./plan-policy.mjs", import.meta.url), "utf8");
  const start = source.indexOf(`export function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName}을 찾지 못했다`);
  const rest = source.slice(start);
  const end = rest.indexOf("\n}");
  const body = rest.slice(0, end);
  return [...new Set([...body.matchAll(/return\s+"([a-z_]+)"/g)].map((match) => match[1]))];
}

test("EFFECTIVE_PLANS가 resolveEffectivePlan의 반환값을 빠짐없이 덮는다", () => {
  assert.deepEqual(
    planLiteralsReturnedBy("resolveEffectivePlan").sort(),
    [...EFFECTIVE_PLANS].sort(),
    "새 플랜 값이 EFFECTIVE_PLANS에 등록되지 않았다 — 아래 게이트 표가 그 값을 검사하지 않는다",
  );
});

test("모든 플랜 값이 PLAN_CONFIG로 해석된다", () => {
  for (const plan of EFFECTIVE_PLANS) {
    assert.ok(getPlanConfig(plan), `${plan}: getPlanConfig가 null을 돌려준다 — 원장이 0으로 떨어진다`);
  }
});

/* ---------- ⓑ·ⓒ 게이트 표 ---------- */

/* 각 행은 게이트 하나다. 모든 플랜 값에 기대값이 있어야 하고, 그 값이 실제 동작과
   같아야 한다. 값을 적는 행위 자체가 "이 게이트는 이 플랜을 이렇게 다룬다"는 결정이다. */
const GATES = {
  "PLAN_LABELS": {
    read: (plan) => PLAN_LABELS[plan],
    expect: { pro: "Pro", trial: "무료 체험 중", trial_pending: "체험 시작 전", expired: "이용 종료" },
  },
  "allowsProOnlyFeature (다이어리 북)": {
    read: (plan) => allowsProOnlyFeature(plan),
    expect: { pro: true, trial: false, trial_pending: false, expired: false },
  },
  "monthlyGrantAmount (페이월 켬)": {
    read: (plan) => monthlyGrantAmount(plan, { paywallEnabled: true }),
    expect: { pro: PRO_CREDITS, trial: TRIAL_CREDITS, trial_pending: 0, expired: 0 },
  },
  /* 페이월이 꺼져 있는 동안은 아무도 잠기지 않아야 한다. 새 플랜 값을 여기서 빠뜨리면
     그 값을 가진 계정만 0을 받아 조용히 잠긴다. */
  "monthlyGrantAmount (페이월 끔)": {
    read: (plan) => monthlyGrantAmount(plan, { paywallEnabled: false }),
    expect: { pro: PRO_CREDITS, trial: TRIAL_CREDITS, trial_pending: 10, expired: 10 },
  },
  "dailySpendLimit (페이월 켬)": {
    read: (plan) => dailySpendLimit(plan, { paywallEnabled: true }),
    expect: { pro: PRO_DAILY, trial: PRO_DAILY, trial_pending: 0, expired: 0 },
  },
  "dailySpendLimit (페이월 끔)": {
    read: (plan) => dailySpendLimit(plan, { paywallEnabled: false }),
    expect: { pro: PRO_DAILY, trial: PRO_DAILY, trial_pending: 4, expired: 4 },
  },
  /* AI 라우트의 402. trial_pending은 지금 막는다 — 오늘 이 값을 갖는 계정은 어제까지
     expired였다. 체험 앵커가 첫 AI 사용으로 옮겨지면 이 행이 바뀐다. */
  "PAYWALL_BLOCKED_PLANS (402 게이트)": {
    read: (plan) => PAYWALL_BLOCKED_PLANS.includes(plan),
    expect: { pro: false, trial: false, trial_pending: true, expired: true },
  },
  "PERSONALIZED_COMPANION_PLANS (올리 개인화)": {
    read: (plan) => PERSONALIZED_COMPANION_PLANS.includes(plan),
    expect: { pro: true, trial: true, trial_pending: false, expired: false },
  },
  /* 기록 열람·내보내기는 AI를 쓰지 않는다. 어떤 플랜에서도 막지 않는다
     (개인정보 자기결정권 — 내 기록을 못 꺼내는 상태를 만들지 않는다). */
  "features.basicRecords (기록 열람)": {
    read: (plan) => Boolean(getPlanConfig(plan)?.features?.basicRecords),
    expect: { pro: true, trial: true, trial_pending: true, expired: true },
  },
};

test("게이트 표의 모든 행이 모든 플랜 값을 선언한다", () => {
  for (const [name, gate] of Object.entries(GATES)) {
    assert.deepEqual(
      Object.keys(gate.expect).sort(),
      [...EFFECTIVE_PLANS].sort(),
      `${name}: 이 게이트가 다루지 않는 플랜 값이 있다 — 조용히 else로 흘러간다`,
    );
  }
});

test("게이트가 선언한 대로 동작한다", () => {
  for (const [name, gate] of Object.entries(GATES)) {
    for (const plan of EFFECTIVE_PLANS) {
      assert.deepEqual(gate.read(plan), gate.expect[plan], `${name} / ${plan}`);
    }
  }
});

/* 같은 것을 두 곳에서 말하던 features.companionPersonalization은 2026-08-04에 지웠다 —
   성향 프로필(생년월일·MBTI) 기능이 사라지면서 그 플래그를 읽는 곳이 없어졌다.
   올리 개인화 판정은 PERSONALIZED_COMPANION_PLANS 하나로 남는다(worker.mjs). */

/* ---------- resolveEffectivePlan이 각 값에 실제로 도달하는가 ---------- */

/* 표는 값이 주어졌을 때의 처리를 본다. 여기서는 그 값이 어떤 계정에서 나오는지 본다.
   둘 다 있어야 "선언했지만 아무도 도달하지 않는 값"이 생기지 않는다. */
const ACCOUNTS = {
  pro: { plan: "pro", currentPeriodEnd: NOW + 86_400_000 },
  trial: { plan: "trial", trialStartedAt: NOW - 1_000, trialUsedAt: NOW - 1_000, trialExpiresAt: resolveTrialEndsAt(NOW - 1_000) },
  // 가입은 했지만 체험을 시작한 적이 없다. 오늘은 탈퇴 후 재가입해 마커에 막힌 계정이 여기 온다.
  trial_pending: { plan: "expired", trialStartedAt: null, trialUsedAt: null, trialExpiresAt: null },
  expired: { plan: "expired", trialStartedAt: NOW - 300_000_000, trialUsedAt: NOW - 300_000_000, trialExpiresAt: NOW - 200_000_000 },
};

test("각 플랜 값에 실제로 도달하는 계정 모양이 있다", () => {
  assert.deepEqual(Object.keys(ACCOUNTS).sort(), [...EFFECTIVE_PLANS].sort(), "도달 예시가 없는 플랜 값이 있다");
  for (const [plan, user] of Object.entries(ACCOUNTS)) {
    assert.equal(resolveEffectivePlan(user, NOW), plan, `${plan}에 도달하지 못한다`);
  }
});

/* trial_pending 판정과 체험 자격 판정이 갈라지면, 자격이 없는데 시작 전으로 보이거나
   그 반대가 된다. 같은 조건을 쓰는지 못 박는다. */
test("trial_pending과 canStartTrial의 판정이 갈라지지 않는다", () => {
  for (const [plan, user] of Object.entries(ACCOUNTS)) {
    if (plan === "pro") continue; // pro는 앞단에서 갈린다
    assert.equal(
      resolveEffectivePlan(user, NOW) === "trial_pending",
      canStartTrial(user),
      `${plan}: 시작 전 판정과 체험 자격 판정이 다르다`,
    );
  }
});

/* ---------- 동작 유지 ---------- */

/* 이 PR은 라벨과 계측만 나눈다. trial_pending이 갖는 권한은 expired와 완전히 같아야
   한다 — 하나라도 다르면 어제까지 expired였던 계정의 동작이 바뀐다. */
test("trial_pending의 권한은 expired와 완전히 같다", () => {
  for (const [name, gate] of Object.entries(GATES)) {
    if (name === "PLAN_LABELS") continue; // 라벨이 다른 것이 이 PR의 전부다
    assert.deepEqual(
      gate.read("trial_pending"), gate.read("expired"),
      `${name}: trial_pending과 expired의 처리가 다르다 — 이 PR은 동작을 바꾸지 않는다`,
    );
  }
});
