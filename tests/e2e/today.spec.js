const { test, expect } = require("@playwright/test");
const { expectNoDuplicateIds, expectNoHorizontalOverflow, monitorPage, prepareApp, readStored, waitForAppReady } = require("./helpers");

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
  await page.locator("#todayTools summary").click();
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

test("모바일 첫 화면은 오늘의 한 걸음과 CTA를 우선하고 가로로 넘치지 않는다", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 800 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/app.html");
    await waitForAppReady(page);
    await expectNoHorizontalOverflow(page);
    await expect(page.locator("#focusTaskTitle")).toBeVisible();
    await expect(page.locator("#startFocusButton")).toBeVisible();
    const cta = await page.locator("#startFocusButton").boundingBox();
    expect(cta.y + cta.height).toBeLessThanOrEqual(viewport.height);
    await expect(page.locator(".execution-header .ghost-link")).toBeHidden();
    await expect(page.locator(".execution-tabbar .tab")).toHaveCount(4);
  }
});

test("일정이 많으면 세 개만 보여주고 펼치고 다시 접는다", async ({ page }) => {
  await page.goto("/app.html");
  await waitForAppReady(page);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("omwExecutionState") || "{}");
    state.selectedDay = 1;
    state.customTasksByDay = {
      "1": Array.from({ length: 4 }, (_, index) => ({
          id: `extra-${index}`,
          text: `추가 일정 ${index + 1}`,
          time: `${14 + index}:00`,
          durationMinutes: 15,
          completionRule: "15분 실행",
          custom: true,
      })),
    };
    localStorage.setItem("omwExecutionState", JSON.stringify(state));
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await waitForAppReady(page);
  await expect(page.locator("#executionChecklist .task-row:visible")).toHaveCount(3);
  await expect(page.locator("#scheduleListToggle")).toHaveAttribute("aria-expanded", "false");
  await page.locator("#scheduleListToggle").click();
  await expect(page.locator("#executionChecklist .task-row:visible")).toHaveCount(7);
  await expect(page.locator("#scheduleListToggle")).toHaveAttribute("aria-expanded", "true");
  await page.locator("#scheduleListToggle").click();
  await expect(page.locator("#executionChecklist .task-row:visible")).toHaveCount(3);
});
