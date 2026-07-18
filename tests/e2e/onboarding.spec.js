const { test, expect } = require("@playwright/test");
const { createUsageResponse, mockAccountExperience, monitorPage } = require("./helpers");

test.setTimeout(90_000);

test("첫 진입부터 목표 생성과 새로고침까지 이어진다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const account = await mockAccountExperience(page, {
    user: { id: "usr_onboarding", provider: "google", name: "온보딩 테스트", email: "onboarding@example.com", plan: "free", role: "member" },
    usage: createUsageResponse({ plan: "free", trialEligible: true }),
  });
  const goalPlanRequests = [];
  await page.route("**/api/ai/goal-plan", (route) => {
    goalPlanRequests.push({
      body: route.request().postDataJSON(),
      requestId: route.request().headers()["x-request-id"],
    });
    account.usage = createUsageResponse({ plan: "trial", dailyUsed: 4, monthlyUsed: 4, trialEligible: false, trialActive: true });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        plan: {
          personalitySummary: "작은 실행을 반복할 때 강점이 살아나요.",
          planningStyle: "루틴 점검형 계획",
          firstAction: "오늘 10분 동안 E2E 첫 행동 실행",
          weekTitle: "이번 주에는 시작 가능한 크기로 반복해요",
          weekPlan: ["10분 시작", "완료 체크", "한 줄 기록", "막힌 점 정리", "다음 행동 준비"],
          coachMessage: "완벽하게 끝내기보다 오늘 흐름을 만드는 데 집중해요.",
          dashboard: { goal: "E2E 목표 완주", progress: 20, pace: "첫 주 실행 흐름 만들기" },
          fullSchedule: [
            { phase: "시작", days: "1–2일", focus: "첫 행동 고정", successMetric: "하루 1회 시작" },
            { phase: "반복", days: "3–5일", focus: "작은 실행 반복", successMetric: "3회 이상 완료" },
            { phase: "점검", days: "6–7일", focus: "기록 확인", successMetric: "다음 주 행동 결정" },
          ],
          todaySchedule: [
            { time: "아침", durationMinutes: 10, task: "E2E 첫 행동 실행", completionRule: "10분 타이머 완료" },
            { time: "실행 직후", durationMinutes: 5, task: "한 줄 기록", completionRule: "기록 저장" },
          ],
          checkInRules: ["완료 직후 체크", "놓치면 5분으로 재시작", "주말에 다음 주 조정"],
          fallbackPlan: "어려운 날에는 5분만 시작해요.",
        },
        requestId: "create_plan:e2e",
        chargedCredits: 4,
        usage: account.usage,
      }),
    });
  });
  await page.goto("/index.html");

  await expect(page.getByRole("link", { name: "내 목표로 24시간 무료 체험 시작하기" })).toBeVisible();
  await page.getByRole("link", { name: "내 목표로 24시간 무료 체험 시작하기" }).click();
  await expect(page.locator("#designFlow")).toBeVisible();

  await page.locator("#designGoal").fill("   ");
  await page.locator("#diagnosisNextButton").click();
  await expect(page.locator("#diagnosisStepCount")).toHaveText("1 / 3");

  const longGoal = "아주 긴 목표 ".repeat(20);
  await page.locator("#designGoal").fill(longGoal);
  await expect(page.locator("#designGoal")).toHaveValue(longGoal);
  await page.locator("#designGoal").fill("E2E 목표 완주하기");
  await page.locator("#diagnosisNextButton").click();
  await expect(page.locator("#diagnosisStepCount")).toHaveText("2 / 3");
  await page.locator("#diagnosisBackButton").click();
  await expect(page.locator("#diagnosisStepCount")).toHaveText("1 / 3");
  await page.locator("#diagnosisNextButton").click();
  await page.locator("#diagnosisNextButton").click();
  await page.locator("#aiPreviewButton").click();

  await expect(page.locator("#firstStep")).toHaveClass(/is-ready/, { timeout: 10_000 });
  await expect(page.locator("#aiPreviewStatus")).toHaveText("올리가 AI로 만든 맞춤 계획");
  expect(goalPlanRequests).toHaveLength(1);
  expect(goalPlanRequests[0].requestId).toMatch(/^create_plan:/);
  expect(goalPlanRequests[0].body).not.toHaveProperty("plan");
  expect(goalPlanRequests[0].body).not.toHaveProperty("creditCost");
  const planDetails = page.locator(".result-details-disclosure");
  await planDetails.locator("summary").click();
  await expect(planDetails).toHaveAttribute("open", "");
  await expect(planDetails.locator(".result-details-content")).toBeVisible();
  await expect(planDetails.locator("summary > b")).toHaveText("접기");
  await page.locator("#trialStartInlineLink").click();
  await expect(page).toHaveURL(/app\.html/);
  await expect(page.locator("#view-today")).toBeVisible();
  await expect(page.locator("#ollieEnergyBalance")).toHaveText("11 / 15");
  await page.reload();
  await expect(page.locator("#trialPaywall")).toBeHidden();
  await expect(page.locator("body")).not.toHaveClass(/trial-locked/);
  diagnostics.expectClean();
});
