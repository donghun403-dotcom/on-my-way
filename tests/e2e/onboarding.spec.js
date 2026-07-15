const { test, expect } = require("@playwright/test");
const { mockExternalAssets, monitorPage } = require("./helpers");

test("첫 진입부터 목표 생성과 새로고침까지 이어진다", async ({ page }) => {
  const diagnostics = monitorPage(page, {
    allowedConsoleMessages: ["status of 503"],
    allowedResponseUrls: ["/api/ai/goal-plan"],
  });
  await mockExternalAssets(page);
  await page.route("**/api/ai/goal-plan", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"E2E mock"}' }));
  await page.goto("/index.html");

  await expect(page.getByRole("link", { name: "내 목표로 1일 무료 체험 시작하기" })).toBeVisible();
  await page.getByRole("link", { name: "내 목표로 1일 무료 체험 시작하기" }).click();
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
  await expect(page.locator("#aiPreviewStatus")).toContainText("기본 계획 템플릿");
  await page.locator("#trialStartInlineLink").click();
  await expect(page).toHaveURL(/app\.html/);
  await expect(page.locator("#view-today")).toBeVisible();
  await page.reload();
  await expect(page.locator("#trialPaywall")).toBeHidden();
  diagnostics.expectClean();
});
