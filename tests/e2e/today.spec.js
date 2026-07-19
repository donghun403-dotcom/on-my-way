const { test, expect } = require("@playwright/test");
const { expectNoDuplicateIds, monitorPage, prepareApp, readStored, waitForAppReady } = require("./helpers");

test.beforeEach(async ({ page }) => prepareApp(page));

test("일정을 검증하고 한 번만 추가해 새로고침 후 유지한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await page.goto("/app.html");
  await waitForAppReady(page);
  const initialRows = await page.locator("#executionChecklist .task-row").count();

  await page.locator("#addTodayScheduleButton").click();
  await page.locator("#newScheduleName").fill("   ");
  await page.locator("#addScheduleForm button[type='submit']").click();
  await expect(page.locator("#addScheduleSheet")).toBeVisible();

  await page.locator("#newScheduleName").fill("특수 일정 !@#$%^&*()");
  await page.locator("#newScheduleTime").fill("18:00");
  await page.locator("#addScheduleForm").evaluate((form) => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await expect(page.locator("#executionChecklist .task-row")).toHaveCount(initialRows + 1);

  await page.locator("#addTodayScheduleButton").click();
  await page.locator("#newScheduleName").fill("특수 일정 !@#$%^&*()");
  await page.locator("#newScheduleTime").fill("18:00");
  await page.locator("#addScheduleForm button[type='submit']").click();
  await expect(page.locator("#addScheduleSheet")).toBeVisible();
  await page.locator("#closeAddSchedule").press("Enter");
  await expect(page.locator("#addScheduleSheet")).toBeHidden();

  await page.reload();
  await expect(page.getByText("특수 일정 !@#$%^&*()", { exact: true })).toHaveCount(1);
  await expectNoDuplicateIds(page);
  const state = await readStored(page, "omwExecutionState");
  expect(state.customTasksByDay["1"]).toHaveLength(1);
  diagnostics.expectClean();
});

test("완료, 해제, 재완료에도 XP와 완료 기록이 중복되지 않는다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await page.goto("/app.html");
  await waitForAppReady(page);
  await page.locator("#completeTodayButton").click();
  const rewarded = await readStored(page, "omwCompanionState");
  const firstState = await readStored(page, "omwExecutionState");
  const firstLogCount = firstState.completedLog.length;
  expect(Number.isFinite(rewarded.xp)).toBeTruthy();
  expect(rewarded.xp).toBeGreaterThanOrEqual(0);

  const firstCheckbox = page.locator("#executionChecklist .execution-check").first();
  await firstCheckbox.uncheck();
  await firstCheckbox.check();
  const repeated = await readStored(page, "omwCompanionState");
  const repeatedState = await readStored(page, "omwExecutionState");
  expect(repeated.xp).toBe(rewarded.xp);
  expect(repeatedState.completedLog).toHaveLength(firstLogCount);
  expect(new Set(repeatedState.completedLog.map((entry) => entry.taskKey)).size).toBe(firstLogCount);
  expect(Object.values(repeatedState.dailyCompletionRewardedByDay).filter(Boolean)).toHaveLength(1);

  await page.reload();
  expect((await readStored(page, "omwCompanionState")).xp).toBe(rewarded.xp);
  diagnostics.expectClean();
});
