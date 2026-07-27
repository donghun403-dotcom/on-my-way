const { test, expect } = require("@playwright/test");
const { mockExternalAssets, monitorPage, readStored } = require("./helpers");

test("수동 온보딩: 4단계로 계획을 직접 만들고 로그인 후 체험이 시작된다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockExternalAssets(page);
  await page.goto("/index.html");

  await expect(page.getByRole("link", { name: "내 목표로 1일 무료 체험 시작하기" })).toBeVisible();
  await page.getByRole("link", { name: "내 목표로 1일 무료 체험 시작하기" }).click();
  await expect(page.locator("#designFlow")).toBeVisible();

  // STEP 1 · 목표: 빈 목표는 다음 단계로 넘어가지 않는다
  await page.locator("#designGoal").fill("   ");
  await page.locator("#diagnosisNextButton").click();
  await expect(page.locator("#diagnosisStepCount")).toHaveText("1 / 4");
  await page.locator("#designGoal").fill("E2E 목표 완주하기");
  await page.locator("#diagnosisNextButton").click();
  await expect(page.locator("#diagnosisStepCount")).toHaveText("2 / 4");

  // 뒤로 갔다가 다시 진행해도 값이 유지된다
  await page.locator("#diagnosisBackButton").click();
  await expect(page.locator("#diagnosisStepCount")).toHaveText("1 / 4");
  await expect(page.locator("#designGoal")).toHaveValue("E2E 목표 완주하기");
  await page.locator("#diagnosisNextButton").click();

  // STEP 2 · 리듬: 기간·요일 선택 (주말도 실행일에 포함)
  await page.locator("#goalPeriod").selectOption("30");
  for (const day of ["토", "일"]) {
    await page.locator(`[data-design-day][value='${day}']`).check();
  }
  await page.locator("#diagnosisNextButton").click();
  await expect(page.locator("#diagnosisStepCount")).toHaveText("3 / 4");

  // STEP 3 · 할 일: 올리 초안이 채워져 있고, 직접 수정·추가할 수 있다
  await expect(page.locator(".task-builder-item").first()).toBeVisible();
  const starterCount = await page.locator(".task-builder-item").count();
  expect(starterCount).toBeGreaterThanOrEqual(2);
  await page.locator(".task-builder-item").first().locator("[data-task-field='text']").fill("E2E 첫 할 일");
  await page.locator("#addTaskButton").click();
  await page.locator(".task-builder-item").last().locator("[data-task-field='text']").fill("E2E 추가 할 일");
  await expect(page.locator(".task-builder-item")).toHaveCount(starterCount + 1);
  await page.locator("#diagnosisNextButton").click();
  await expect(page.locator("#diagnosisStepCount")).toHaveText("4 / 4");

  // STEP 4 · 마무리: 완료 기준은 선택 입력, 제출하면 AI 호출 없이 계획이 저장된다
  await page.locator("#designOutcome").fill("30일 뒤 E2E 완주 인증");
  await page.locator("#aiPreviewButton").click();
  await expect(page.locator("#firstStep")).toHaveClass(/is-ready/, { timeout: 10_000 });
  await expect(page.locator("#aiPreviewStatus")).toContainText("직접 만든");

  const plan = await readStored(page, "omwExecutionPlan");
  expect(plan.planSource).toBe("manual");
  expect(plan.manualWeeklySchedule).toHaveLength(7);
  expect(JSON.stringify(plan.manualWeeklySchedule)).toContain("E2E 첫 할 일");
  expect(await readStored(page, "omwTrialAccess")).toBeNull();

  // '내 계획 자세히 보기'가 펼쳐지고 로드맵까지 스크롤로 닿는다 (그리드 압축 잘림 회귀 방지)
  await page.locator(".result-details-disclosure summary").click();
  await page.locator("#aiGoalRoadmap").scrollIntoViewIfNeeded();
  await expect(page.locator("#aiGoalRoadmap")).toBeInViewport();
  await page.locator(".result-details-disclosure summary").click();

  // 가입 게이트: 비로그인 상태로 앱에 들어가면 로그인 시트가 열린다
  await page.locator("#trialStartInlineLink").click();
  await expect(page).toHaveURL(/app\.html/);
  await expect(page.locator("#trialPaywall")).toBeVisible();
  await expect(page.locator("#trialPaywall")).toHaveAttribute("data-mode", "need-login");
  await expect(page.locator("#authSheet")).toBeVisible();

  // 데모 소셜 로그인 → 체험 시작 + 게스트 계획 승계
  await page.locator("[data-auth-provider='kakao']").click();
  await page.locator("#devName").fill("E2E올리");
  await page.locator("#devLoginForm button[type='submit']").click();
  await expect(page).toHaveURL(/app\.html/);
  await expect(page.locator("#trialPaywall")).toBeHidden({ timeout: 10_000 });
  await expect(page.locator("#trialStatusBanner")).toBeVisible();
  await expect(page.locator("#view-today")).toBeVisible();

  const adoptedPlan = await readStored(page, "omwExecutionPlan");
  expect(adoptedPlan.planSource).toBe("manual");
  const trial = await readStored(page, "omwTrialAccess");
  expect(trial.plan).toBe("trial");
  expect(Number(trial.expiresAt)).toBeGreaterThan(Date.now());

  await page.reload();
  await expect(page.locator("#trialPaywall")).toBeHidden();
  diagnostics.expectClean();
});

test("계획 없이 앱에 진입하면 온보딩으로 안내한다", async ({ page }) => {
  await mockExternalAssets(page);
  await page.goto("/app.html");
  await expect(page.locator("#trialPaywall")).toBeVisible();
  await expect(page.locator("#trialPaywall")).toHaveAttribute("data-mode", "no-plan");
  await expect(page.locator("#trialPaywallAction")).toHaveAttribute("href", "index.html#designFlow");
});
