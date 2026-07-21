const { test, expect } = require("@playwright/test");
const { expectNoHorizontalOverflow, mockAccountExperience, monitorPage, prepareApp, waitForBootstrap } = require("./helpers");

const viewports = [
  [320, 568],
  [360, 800],
  [375, 812],
  [390, 844],
  [393, 852],
  [430, 932],
  [768, 1024],
  [1440, 900],
];

test.describe.configure({ mode: "serial", timeout: 90_000 });

for (const [width, height] of [[320, 568], [390, 844], [430, 932], [768, 1024]]) {
  test(`${width}x${height} 목표 추천과 로그인 선택 화면`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const diagnostics = monitorPage(page);
    await mockAccountExperience(page);

    await page.goto("/index.html#designFlow");
    await waitForBootstrap(page);
    await page.getByRole("button", { name: "시험", exact: true }).click();
    await expect(page.locator("#goalExampleSuggestions button")).toHaveCount(3);
    await expect(page.locator("#designGoal")).toBeVisible();
    await expect(page.locator("#diagnosisNextButton")).toBeDisabled();
    await expectNoHorizontalOverflow(page);

    await page.goto("/app.html?auth=login");
    await waitForBootstrap(page);
    await expect(page.locator("#authSheet")).toBeVisible();
    await expect(page.getByRole("button", { name: "카카오로 계속하기" })).toBeVisible();
    await expect(page.getByRole("button", { name: "네이버로 계속하기" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Google로 계속하기" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    diagnostics.expectClean();
  });
}

for (const [width, height] of viewports) {
  test(`${width}x${height} 기준 화면 6종`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await prepareApp(page);
    const diagnostics = monitorPage(page);
    const capture = async (name) => page.screenshot({ path: testInfo.outputPath(`${width}x${height}-${name}.png`), fullPage: true });

    diagnostics.mark("before-index-navigation");
    await page.goto("/index.html");
    diagnostics.mark("after-index-navigation");
    await expectNoHorizontalOverflow(page);
    await capture("landing");

    diagnostics.mark("before-app-navigation");
    await page.goto("/app.html");
    diagnostics.mark("after-app-navigation");
    for (const view of ["today", "plan", "mate", "memory"]) {
      await page.locator(`#tab-${view}`).click();
      await expect(page.locator(`#view-${view}`)).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await capture(view);
    }
    await page.locator("#tab-today").click();
    await page.locator("#addTodayScheduleButton").click();
    await expect(page.locator("#closeAddSchedule")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const sheetBox = await page.locator("#addScheduleSheet").boundingBox();
    expect(sheetBox.y).toBeGreaterThanOrEqual(0);
    expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(height + 1);
    await capture("schedule-sheet");
    diagnostics.mark("before-clean-assertion");
    diagnostics.expectClean();
    if (new URL(page.url()).origin === "https://onmyway.olivenrich.com") {
      const analyticsSummary = diagnostics.getAnalyticsSummary();
      expect(analyticsSummary.completedStatuses.length).toBeGreaterThan(0);
      expect(analyticsSummary.completedStatuses.every((status) => status === 204)).toBe(true);
      expect(analyticsSummary.cspFailureCount).toBe(0);
      console.log(`[production-analytics] ${JSON.stringify({ viewport: `${width}x${height}`, ...analyticsSummary })}`);
    }
  });
}
