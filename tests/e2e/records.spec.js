const { test, expect } = require("@playwright/test");
const { monitorPage, prepareApp, readStored } = require("./helpers");

test.beforeEach(async ({ page }) => prepareApp(page));

test("빈 상태와 완료 기록이 저장 상태와 일치한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await page.goto("/app.html");
  await page.locator("#tab-memory").click();
  await expect(page.locator("#memoryCount")).toHaveText("0장");

  await page.locator("#tab-today").click();
  await page.locator("#todayTools summary").click();
  await page.locator("#completeTodayButton").click();
  const state = await readStored(page, "omwExecutionState");
  const checks = state.checkedByDay[String(state.selectedDay)];
  expect(checks.every(Boolean)).toBeTruthy();
  expect(state.completedLog.length).toBe(checks.length);

  await page.locator("#tab-memory").click();
  const completion = Number((await page.locator("#memoryCompletion").innerText()).match(/\d+/)?.[0]);
  expect(completion).toBeGreaterThanOrEqual(0);
  expect(completion).toBeLessThanOrEqual(100);
  await page.reload();
  await page.locator("#tab-memory").click();
  await expect(page.locator("#memoryCompletion")).toContainText("100%");
  diagnostics.expectClean();
});
