const { test, expect } = require("@playwright/test");
const { captureAcceptance, expectNoDuplicateIds, expectNoHorizontalOverflow, monitorPage, prepareApp, readStored, waitForAppReady } = require("./helpers");

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
  await expect(page.locator("#executionChecklist").getByText("특수 일정 !@#$%^&*()", { exact: true })).toHaveCount(1);
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

test("같은 제목·시각·legacy id 일정도 stable task key와 완료 상태가 충돌하지 않는다", async ({ page }) => {
  const duplicatePlan = {
    goal: "같은 일정 구분 검증",
    period: 7,
    planId: "stable-key-plan",
    firstAction: "같은 행동",
    planSource: "ai-reviewed-draft",
    createdAt: new Date().toISOString(),
    availability: { availableDays: ["월", "화", "수", "목", "금", "토", "일"], sessionMinutes: 30 },
    aiPreview: {
      firstAction: "같은 행동",
      firstWeekSchedule: Array.from({ length: 7 }, (_, index) => ({
        dayNumber: index + 1,
        dayLabel: ["월", "화", "수", "목", "금", "토", "일"][index],
        isRestDay: false,
        items: index === 0
          ? [0, 1].map(() => ({
              id: "legacy-duplicate-id",
              planId: "stable-key-plan",
              type: "ACTION",
              title: "같은 행동",
              durationMinutes: 15,
              completionRule: "15분 실행",
              scheduledAt: "08:00",
              recurrenceGroupId: "same-time-group",
            }))
          : [{
              id: "legacy-duplicate-id",
              planId: "stable-key-plan",
              type: "ACTION",
              title: "같은 행동",
              durationMinutes: 15,
              completionRule: "15분 실행",
              scheduledAt: "08:00",
              recurrenceGroupId: "same-time-group",
            }],
      })),
    },
  };
  await page.goto("/app.html");
  await waitForAppReady(page);
  await page.evaluate((plan) => {
    localStorage.setItem("omwExecutionPlan", JSON.stringify(plan));
    localStorage.removeItem("omwExecutionState");
  }, duplicatePlan);
  await page.reload();
  await waitForAppReady(page);

  const rows = page.locator("#executionChecklist .task-row");
  await expect(rows).toHaveCount(2);
  const keys = await rows.evaluateAll((items) => items.map((item) => item.dataset.taskKey));
  expect(new Set(keys).size).toBe(2);
  expect(keys.every((key) => key.startsWith("legacy-duplicate-id"))).toBe(true);

  await page.evaluate(([firstKey, secondKey]) => {
    const bundle = getPlanBundle();
    localStorage.setItem("omwExecutionState", JSON.stringify({
      version: 3,
      scheduleKey: bundle.state.scheduleKey,
      planText: bundle.state.planText,
      checkedByDay: { "1": [true, false] },
      checkedTaskKeysByDay: { "1": { [firstKey]: true, [secondKey]: false } },
      completedLog: [{ taskKey: firstKey, day: 1, taskIndex: 0, text: "같은 행동", completedAt: new Date().toISOString() }],
    }));
  }, keys);
  await page.reload();
  await waitForAppReady(page);
  await expect(rows.first().locator(".execution-check")).toBeChecked();
  await expect(rows.nth(1).locator(".execution-check")).not.toBeChecked();
  await rows.first().locator(".execution-check").uncheck();
  await rows.first().locator(".execution-check").check();
  const migratedState = await readStored(page, "omwExecutionState");
  expect(migratedState.completedLog).toHaveLength(1);
  expect(migratedState.completedLog[0].taskKey).toBe(`1:${keys[0]}`);
  await page.reload();
  await waitForAppReady(page);
  await expect(page.locator("#executionChecklist .execution-check").first()).toBeChecked();
  await expect(page.locator("#executionChecklist .execution-check").nth(1)).not.toBeChecked();
});

test("ACTION만 체크 가능하고 REVIEW·TIP은 별도 표시하며 SYSTEM_RULE과 HTML은 실행하지 않는다", async ({ page }) => {
  await page.goto("/app.html");
  await waitForAppReady(page);
  await page.evaluate(() => {
    const planId = "typed-display-plan";
    const typedItems = [
      { id: "action", type: "ACTION", title: "실행 <img src=x onerror=alert(1)>", completionRule: "실행 기록", durationMinutes: 15 },
      { id: "review", type: "REVIEW", title: "결과 <b>점검</b>" },
      { id: "tip", type: "TIP", title: "준비 <img src=x onerror=alert(2)>" },
      { id: "rule", type: "SYSTEM_RULE", title: "놓친 일정은 내부에서 재배치" },
    ].map((item) => ({ ...item, planId, sourceReference: "", quantityOrRange: "1회", scheduledAt: "08:00", status: "pending", recurrenceGroupId: item.id }));
    localStorage.setItem("omwExecutionPlan", JSON.stringify({
      goal: "typed item 표시 검증",
      period: 7,
      planId,
      firstAction: typedItems[0].title,
      planSource: "ai-reviewed-draft",
      createdAt: new Date().toISOString(),
      aiPreview: {
        firstAction: typedItems[0].title,
        firstWeekSchedule: Array.from({ length: 7 }, (_, index) => ({
          dayNumber: index + 1,
          dayLabel: ["월", "화", "수", "목", "금", "토", "일"][index],
          isRestDay: index > 0,
          items: index === 0 ? typedItems : [],
        })),
      },
    }));
    localStorage.removeItem("omwExecutionState");
  });
  await page.reload();
  await waitForAppReady(page);

  await expect(page.locator("#executionChecklist .execution-check")).toHaveCount(1);
  await expect(page.locator("#executionChecklist .today-plan-support")).toContainText("결과 <b>점검</b>");
  await expect(page.locator("#executionChecklist .today-plan-support")).toContainText("준비 <img src=x onerror=alert(2)>");
  await expect(page.locator("#executionChecklist")).not.toContainText("놓친 일정은 내부에서 재배치");
  await expect(page.locator("#executionChecklist img")).toHaveCount(0);
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
    const state = getPlanBundle().state;
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

test("미완료 일정 직접 편집은 크레딧 없이 반영되고 한 번 되돌릴 수 있다", async ({ page }, testInfo) => {
  let aiRequestCount = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/ai/")) aiRequestCount += 1;
  });
  await page.goto("/app.html");
  await waitForAppReady(page);
  await captureAcceptance(page, testInfo, "today-first-action");

  const originalTitle = await page.locator("#focusTaskTitle").textContent();
  const originalState = await readStored(page, "omwExecutionState");
  const editButton = page.locator("#executionChecklist .task-edit-button").first();
  const editButtonBounds = await editButton.boundingBox();
  expect(editButtonBounds.width).toBeGreaterThanOrEqual(44);
  expect(editButtonBounds.height).toBeGreaterThanOrEqual(44);
  await editButton.click();
  await expect(page.locator("#taskEditSheet")).toBeVisible();
  await expect(page.locator("#taskEditSheet")).toHaveAttribute("aria-modal", "true");
  await captureAcceptance(page, testInfo, "task-edit-sheet");
  await page.locator("#taskEditName").fill("직접 수정한 첫 일정");
  await page.locator("#taskEditTime").fill("08:30");
  await page.locator("#taskEditDuration").fill("20");
  await page.locator("#taskEditRange").fill("핵심 범위 1개");
  await page.locator("#taskEditRule").fill("20분 실행 기록을 남기면 완료");
  await page.locator("#taskEditForm button[type='submit']").click();

  await expect(page.locator("#taskEditSheet")).toBeHidden();
  await expect(page.locator("#focusTaskTitle")).toHaveText("직접 수정한 첫 일정");
  await expect(page.locator("#planUndoBanner")).toBeVisible();
  const editedState = await readStored(page, "omwExecutionState");
  expect(Object.keys(editedState.taskEditsByDay["1"] || {})).toHaveLength(1);
  expect(editedState.completedLog).toEqual(originalState?.completedLog || []);
  expect(aiRequestCount).toBe(0);

  await page.locator("#planUndoButton").click();
  await expect(page.locator("#planUndoBanner")).toBeHidden();
  await expect(page.locator("#focusTaskTitle")).toHaveText(originalTitle);
  const restoredState = await readStored(page, "omwExecutionState");
  expect(restoredState.taskEditsByDay).toEqual(originalState?.taskEditsByDay || {});
  expect(restoredState.completedLog).toEqual(originalState?.completedLog || []);
  expect(aiRequestCount).toBe(0);
});

test("일정 날짜 이동과 오늘만 건너뛰기는 완료 기록을 바꾸지 않고 되돌릴 수 있다", async ({ page }) => {
  await page.goto("/app.html");
  await waitForAppReady(page);

  const originalState = await readStored(page, "omwExecutionState");
  await page.locator("#executionChecklist .task-edit-button").first().click();
  await page.locator("#taskEditName").fill("내일로 옮긴 일정");
  await page.locator("#taskEditTargetDay").selectOption("2");
  await page.locator("#taskEditForm").evaluate((form) => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  await expect(page.locator("#taskEditSheet")).toBeHidden();
  const movedState = await readStored(page, "omwExecutionState");
  expect(movedState.hiddenTaskKeysByDay["1"]).toHaveLength(1);
  expect(movedState.customTasksByDay["2"]).toHaveLength(1);
  expect(movedState.customTasksByDay["2"]).toEqual(expect.arrayContaining([
    expect.objectContaining({ text: "내일로 옮긴 일정", movedFromDay: 1 }),
  ]));
  expect(movedState.completedLog).toEqual(originalState?.completedLog || []);

  await page.locator("#planUndoButton").click();
  const restoredAfterMove = await readStored(page, "omwExecutionState");
  expect(restoredAfterMove.hiddenTaskKeysByDay).toEqual(originalState?.hiddenTaskKeysByDay || {});
  expect(restoredAfterMove.customTasksByDay).toEqual(originalState?.customTasksByDay || {});

  await page.locator("#executionChecklist .task-edit-button").first().click();
  await page.locator("#skipTaskButton").click();
  await expect(page.locator("#taskEditSheet")).toBeHidden();
  const skippedState = await readStored(page, "omwExecutionState");
  expect(skippedState.hiddenTaskKeysByDay["1"]).toHaveLength(1);
  expect(skippedState.completedLog).toEqual(originalState?.completedLog || []);
  await page.locator("#planUndoButton").click();
  const restoredAfterSkip = await readStored(page, "omwExecutionState");
  expect(restoredAfterSkip.hiddenTaskKeysByDay).toEqual(originalState?.hiddenTaskKeysByDay || {});
  expect(restoredAfterSkip.completedLog).toEqual(originalState?.completedLog || []);
});

test("반복 일정 범위 편집은 변경 개수를 미리 보여준 뒤에만 적용한다", async ({ page }) => {
  await page.goto("/app.html");
  await waitForAppReady(page);

  const originalState = await readStored(page, "omwExecutionState");
  await page.locator("#executionChecklist .task-edit-button").first().click();
  await page.locator("input[name='taskEditScope'][value='recurrence']").check();
  await page.locator("#taskEditName").fill("남은 회차에 적용할 일정");
  await page.locator("#taskEditSubmitButton").click();

  await expect(page.locator("#taskEditSheet")).toBeVisible();
  await expect(page.locator("#taskEditPreview")).toBeVisible();
  await expect(page.locator("#taskEditPreviewMessage")).toContainText(/반복 일정 \d+개/);
  await expect(page.locator("#taskEditSubmitButton")).toHaveText("확인한 변경 적용");
  const previewState = await readStored(page, "omwExecutionState");
  expect(previewState).toEqual(originalState);

  await page.locator("#taskEditSubmitButton").click();
  await expect(page.locator("#taskEditSheet")).toBeHidden();
  const appliedState = await readStored(page, "omwExecutionState");
  expect(Object.values(appliedState.taskEditsByDay).flatMap((edits) => Object.values(edits)))
    .toEqual(expect.arrayContaining([expect.objectContaining({ text: "남은 회차에 적용할 일정" })]));
  expect(appliedState.completedLog).toEqual(originalState?.completedLog || []);
});
