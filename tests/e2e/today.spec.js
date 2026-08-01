const { test, expect } = require("@playwright/test");
const { captureAcceptance, expectNoDuplicateIds, expectNoHorizontalOverflow, monitorPage, prepareApp, readStored, waitForAppReady } = require("./helpers");

test.beforeEach(async ({ page }) => prepareApp(page));

test("날짜가 바뀌면 Today는 실제 계획 일차로 이동하고 Plan의 선택일은 보존한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await page.goto("/app.html");
  await waitForAppReady(page);
  const fixture = await page.evaluate(() => {
    const current = new Date();
    const start = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1);
    const startDate = getLocalDateKey(start);
    const planId = "today-rollover-plan";
    const scheduleOccurrences = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const dateKey = getLocalDateKey(date);
      return {
        dayNumber: index + 1,
        date: dateKey,
        dayLabel: ["일", "월", "화", "수", "목", "금", "토"][date.getDay()],
        isRestDay: false,
        items: [{
          id: `today-rollover-action-${index + 1}`,
          planId,
          type: "ACTION",
          title: `날짜 경과 행동 ${index + 1}`,
          sourceReference: "",
          quantityOrRange: "",
          durationMinutes: 15,
          completionRule: `${index + 1}일차 행동 완료`,
          time: "07:00",
          scheduledAt: `${dateKey}T07:00:00+09:00`,
          status: "pending",
          recurrenceGroupId: `today-rollover-group-${index + 1}`,
        }],
      };
    });
    const plan = {
      ...readExecutionPlan(),
      planId,
      goal: "날짜 경과에도 오늘 일정 유지",
      period: 7,
      planStartDate: startDate,
      firstAction: "날짜 경과 행동 1",
      scheduleStartPreference: "as-is",
      aiPreview: {
        firstWeekSchedule: scheduleOccurrences,
        scheduleOccurrences,
      },
    };
    localStorage.setItem("omwExecutionPlan", JSON.stringify(plan));
    localStorage.removeItem("omwExecutionState");
    const bundle = getPlanBundle({ reset: true });
    bundle.state.selectedDay = 1;
    bundle.state.lastSeenDate = startDate;
    bundle.state.planStartDate = startDate;
    savePlanBundleState(bundle.state);
    return { expectedTodayDay: 2, expectedRolloverDay: 1, selectedDay: 1, startDate };
  });

  await page.reload();
  await waitForAppReady(page);
  await expect(page.locator("#focusTaskTitle")).toHaveText("날짜 경과 행동 2");
  const stateAfterRollover = await page.evaluate(() => getExecutionState());
  expect(stateAfterRollover.selectedDay).toBe(fixture.selectedDay);
  const migratedRollover = await page.evaluate((startDate) => {
    const plan = readExecutionPlan();
    const state = getExecutionState();
    const migrated = migrateExecutionState({
      ...state,
      selectedDay: 5,
      lastSeenDate: startDate,
    }, plan);
    return migrated.rolloverNotice;
  }, fixture.startDate);
  expect(migratedRollover?.day).toBe(fixture.expectedRolloverDay);

  const completedBeforeStaleClick = await page.evaluate(() => {
    const bundle = getPlanBundle();
    const todayDay = resolveTodayPlanDay(bundle);
    return getDayCompletion(bundle.schedule[todayDay - 1], bundle.state.checkedByDay).completed;
  });
  await page.locator("#executionChecklist").evaluate((checklist) => {
    checklist.dataset.planDay = "1";
  });
  await page.locator("#executionChecklist .execution-check").first().click();
  await expect(page.locator("#executionChecklist")).toHaveAttribute("data-plan-day", String(fixture.expectedTodayDay));
  const completedAfterStaleClick = await page.evaluate(() => {
    const bundle = getPlanBundle();
    const todayDay = resolveTodayPlanDay(bundle);
    return getDayCompletion(bundle.schedule[todayDay - 1], bundle.state.checkedByDay).completed;
  });
  expect(completedAfterStaleClick).toBe(completedBeforeStaleClick);

  await page.locator("#tab-plan").click();
  /* 달력이 계획 홈의 첫 카드라 서브뷰로 들어갈 필요가 없다.
     픽스처의 계획은 어제 시작한다. 달력은 오늘이 속한 달로 열리므로 매달 1일에는
     보존된 선택일(1일차 = 어제)이 지난달에 있어 이번 달 격자에서 찾을 수 없다.
     날짜에 기대지 않도록, 없으면 지난달로 넘겨서 확인한다. */
  if ((await page.locator(".calendar-day.selected").count()) === 0) {
    await page.locator("#previousCalendarMonth").click();
  }
  await expect(page.locator(".calendar-day.selected")).toHaveAttribute("data-day", String(fixture.selectedDay));
  await page.locator("#tab-today").click();
  await page.locator("#openPlanAdjustButton").click();
  expect(await page.evaluate(() => activePlanAdjustAnchorDay)).toBe(fixture.expectedTodayDay);
  diagnostics.expectClean();
});

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
  const state = await page.evaluate(() => getExecutionState());
  expect(state.customTasksByDay["1"]).toHaveLength(1);
  diagnostics.expectClean();
});

test("완료, 해제, 재완료에도 XP와 완료 기록이 중복되지 않는다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await page.goto("/app.html");
  await waitForAppReady(page);
  await page.locator("#completeTodayButton").click();
  const rewarded = await readStored(page, "omwCompanionState");
  const firstState = await page.evaluate(() => getExecutionState());
  const firstLogCount = firstState.completedLog.length;
  expect(Number.isFinite(rewarded.xp)).toBeTruthy();
  expect(rewarded.xp).toBeGreaterThanOrEqual(0);

  const firstCheckbox = page.locator("#executionChecklist .execution-check").first();
  await firstCheckbox.uncheck();
  await firstCheckbox.check();
  const repeated = await readStored(page, "omwCompanionState");
  const repeatedState = await page.evaluate(() => getExecutionState());
  expect(repeated.xp).toBe(rewarded.xp);
  expect(repeatedState.completedLog).toHaveLength(firstLogCount);
  expect(new Set(repeatedState.completedLog.map((entry) => entry.taskKey)).size).toBe(firstLogCount);
  expect(Object.values(repeatedState.dailyCompletionRewardedByDay).filter(Boolean)).toHaveLength(1);

  await page.reload();
  expect((await readStored(page, "omwCompanionState")).xp).toBe(rewarded.xp);
  diagnostics.expectClean();
});

test("올리와 첫 행동을 완료하면 기본 기록과 성장 상태를 먼저 저장하고 선택 회고를 덧붙인다", async ({ page }, testInfo) => {
  const diagnostics = monitorPage(page);
  await page.goto("/app.html");
  await waitForAppReady(page);
  const actionTitle = await page.locator("#focusTaskTitle").textContent();

  await page.locator("#startFocusButton").click();
  await expect(page.locator("#focusMode")).toBeVisible();
  await captureAcceptance(page, testInfo, "focus", { fullPage: false });
  await page.locator("#finishFocusButton").click();
  await expect(page.locator("#completionReflectionSheet")).toBeVisible();
  await expect(page.locator("#completionReflectionTask")).toContainText(actionTitle);
  await captureAcceptance(page, testInfo, "reflection", { fullPage: false });

  let state = await page.evaluate(() => getExecutionState());
  expect(state.dailyMemories).toHaveLength(1);
  expect(state.dailyMemories[0]).toMatchObject({
    title: actionTitle,
    note: "",
    mood: "",
    autoCreated: true,
    actualMinutes: 1,
  });
  expect(state.dailyMemories[0].actionReference).toBeTruthy();
  expect(state.dailyMemories[0].autoSummary).toContain("완료");
  expect(state.ollieGrowthState.completedActionCount).toBe(1);
  expect(state.ollieGrowthState.firstLeafAt).toBeTruthy();

  await page.getByRole("button", { name: "힘들었어요" }).click();
  await page.locator("#completionReflectionNote").fill("시작 전에는 망설였지만 한 걸음을 마쳤어요.");
  await page.locator("#saveCompletionReflection").click();
  await expect(page.locator("#completionReflectionSheet")).toBeHidden();
  await expect(page.locator("#startFocusButton")).toBeFocused();

  state = await page.evaluate(() => getExecutionState());
  expect(state.dailyMemories[0]).toMatchObject({
    difficulty: "hard",
    mood: "tired",
    note: "시작 전에는 망설였지만 한 걸음을 마쳤어요.",
  });

  await page.locator("#tab-memory").click();
  await page.locator(".memory-history-disclosure > summary").click();
  await expect(page.locator("#memoryList")).toContainText(actionTitle);
  await expect(page.locator("#memoryList")).toContainText("시작 전에는 망설였지만 한 걸음을 마쳤어요.");
  await captureAcceptance(page, testInfo, "record", { fullPage: false });
  await page.locator("#tab-mate").click();
  await expect(page.locator("[data-growth-count='1']")).toHaveClass(/is-grown/);
  await captureAcceptance(page, testInfo, "ollie-growth", { fullPage: false });

  await page.reload();
  await waitForAppReady(page);
  state = await page.evaluate(() => getExecutionState());
  expect(state.dailyMemories).toHaveLength(1);
  expect(state.ollieGrowthState.firstLeafAt).toBeTruthy();
  diagnostics.expectClean();
});

test("놓친 날 회복은 위협 문구나 AI 호출 없이 5분 행동·기록·다시 걷기 성장을 남긴다", async ({ page }, testInfo) => {
  const diagnostics = monitorPage(page);
  const aiRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/ai/")) aiRequests.push(request.url());
  });
  await page.goto("/app.html");
  await waitForAppReady(page);
  await page.evaluate(() => {
    const bundle = getPlanBundle();
    bundle.state.rolloverNotice = { day: bundle.state.selectedDay, missedCount: 1, date: "2026-07-23" };
    localStorage.setItem("omwExecutionState", JSON.stringify(bundle.state));
  });
  await page.reload();
  await waitForAppReady(page);

  const recovery = page.locator("#recoveryCard");
  await expect(recovery).toBeVisible();
  const recoveryCopy = await recovery.innerText();
  expect(recoveryCopy).toContain("원래 계획을 다 하지 않아도 괜찮아요");
  expect(recoveryCopy).not.toMatch(/실패|연속 기록 종료|뒤처짐|진행률 0%/);
  await expect(recovery.locator("[data-recovery-action]")).toHaveCount(3);
  await captureAcceptance(page, testInfo, "recovery", { fullPage: false });
  await recovery.getByRole("button", { name: "5분짜리 한 걸음으로 줄이기" }).click();

  const state = await page.evaluate(() => getExecutionState());
  expect(Object.values(state.taskEditsByDay).flatMap((value) => Object.values(value))).toEqual(
    expect.arrayContaining([expect.objectContaining({ durationMinutes: 5 })]),
  );
  expect(state.dailyMemories).toEqual(expect.arrayContaining([
    expect.objectContaining({ title: "다시 걷기", recoveryAction: "five" }),
  ]));
  expect(state.ollieGrowthState.recoveredAt).toBeTruthy();
  expect(aiRequests).toHaveLength(0);
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
  const migratedState = await page.evaluate(() => getExecutionState());
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

// WebKit은 Touch·TouchEvent 생성자를 제공하지 않으므로, 핸들러가 실제로 읽는
// touches/changedTouches만 실은 이벤트를 직접 만들어 네 브라우저에서 같게 검증한다.
async function swipeView(page, direction) {
  await page.evaluate((swipeDirection) => {
    const main = document.querySelector(".execution-app");
    const rect = main.getBoundingClientRect();
    const clientY = rect.top + Math.min(rect.height, 400) / 2;
    const start = swipeDirection === "left" ? rect.right - 30 : rect.left + 30;
    const end = swipeDirection === "left" ? rect.left + 30 : rect.right - 30;
    const fire = (type, touches, changedTouches) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", { value: touches });
      Object.defineProperty(event, "changedTouches", { value: changedTouches });
      main.dispatchEvent(event);
    };
    fire("touchstart", [{ clientX: start, clientY }], [{ clientX: start, clientY }]);
    fire("touchend", [], [{ clientX: end, clientY }]);
  }, direction);
}

test("앱은 항상 오늘 탭에서 열리고 좌우 스와이프로 탭을 넘긴다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await page.goto("/app.html");
  await waitForAppReady(page);
  await expect(page.locator("#tab-today")).toHaveAttribute("aria-selected", "true");

  await swipeView(page, "left");
  await expect(page.locator("#tab-plan")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#view-plan")).toBeVisible();

  await swipeView(page, "left");
  await expect(page.locator("#tab-mate")).toHaveAttribute("aria-selected", "true");

  await swipeView(page, "right");
  await expect(page.locator("#tab-plan")).toHaveAttribute("aria-selected", "true");

  // 첫 탭보다 더 오른쪽으로 넘겨도 순환하지 않고 그대로 머문다.
  await swipeView(page, "right");
  await expect(page.locator("#tab-today")).toHaveAttribute("aria-selected", "true");
  await swipeView(page, "right");
  await expect(page.locator("#tab-today")).toHaveAttribute("aria-selected", "true");

  // 같은 세션의 새로고침은 보던 탭을 유지한다.
  await page.locator("#tab-memory").click();
  await page.reload();
  await waitForAppReady(page);
  await expect(page.locator("#tab-memory")).toHaveAttribute("aria-selected", "true");

  // 앱을 새로 열면(세션이 바뀌면) 마지막 탭이 남아 있지 않고 항상 오늘에서 시작한다.
  expect(await page.evaluate(() => localStorage.getItem("onmyway.activeView"))).toBeNull();
  await page.evaluate(() => sessionStorage.removeItem("onmyway.activeView"));
  await page.reload();
  await waitForAppReady(page);
  await expect(page.locator("#tab-today")).toHaveAttribute("aria-selected", "true");
  diagnostics.expectClean();
});

test("시트가 열려 있으면 스와이프로 탭이 바뀌지 않는다", async ({ page }) => {
  await page.goto("/app.html");
  await waitForAppReady(page);
  await page.locator("#addTodayScheduleButton").click();
  await expect(page.locator("#addScheduleSheet")).toBeVisible();
  await swipeView(page, "left");
  await expect(page.locator("#tab-today")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#addScheduleSheet")).toBeVisible();
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
  const originalState = await page.evaluate(() => getExecutionState());
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
  const editedState = await page.evaluate(() => getExecutionState());
  expect(Object.keys(editedState.taskEditsByDay["1"] || {})).toHaveLength(1);
  expect(editedState.completedLog).toEqual(originalState?.completedLog || []);
  expect(aiRequestCount).toBe(0);

  await page.locator("#planUndoButton").click();
  await expect(page.locator("#planUndoBanner")).toBeHidden();
  await expect(page.locator("#focusTaskTitle")).toHaveText(originalTitle);
  const restoredState = await page.evaluate(() => getExecutionState());
  expect(restoredState.taskEditsByDay).toEqual(originalState?.taskEditsByDay || {});
  expect(restoredState.completedLog).toEqual(originalState?.completedLog || []);
  expect(aiRequestCount).toBe(0);
});

test("일정 날짜 이동과 오늘만 건너뛰기는 완료 기록을 바꾸지 않고 되돌릴 수 있다", async ({ page }) => {
  await page.goto("/app.html");
  await waitForAppReady(page);

  const originalState = await page.evaluate(() => getExecutionState());
  await page.locator("#executionChecklist .task-edit-button").first().click();
  await page.locator("#taskEditName").fill("내일로 옮긴 일정");
  await page.locator("#taskEditTargetDay").selectOption("2");
  await page.locator("#taskEditForm").evaluate((form) => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  await expect(page.locator("#taskEditSheet")).toBeHidden();
  const movedState = await page.evaluate(() => getExecutionState());
  expect(movedState.hiddenTaskKeysByDay["1"]).toHaveLength(1);
  expect(movedState.customTasksByDay["2"]).toHaveLength(1);
  expect(movedState.customTasksByDay["2"]).toEqual(expect.arrayContaining([
    expect.objectContaining({ text: "내일로 옮긴 일정", movedFromDay: 1 }),
  ]));
  expect(movedState.completedLog).toEqual(originalState?.completedLog || []);

  await page.locator("#planUndoButton").click();
  const restoredAfterMove = await page.evaluate(() => getExecutionState());
  expect(restoredAfterMove.hiddenTaskKeysByDay).toEqual(originalState?.hiddenTaskKeysByDay || {});
  expect(restoredAfterMove.customTasksByDay).toEqual(originalState?.customTasksByDay || {});

  await page.locator("#executionChecklist .task-edit-button").first().click();
  await page.locator("#skipTaskButton").click();
  await expect(page.locator("#taskEditSheet")).toBeHidden();
  const skippedState = await page.evaluate(() => getExecutionState());
  expect(skippedState.hiddenTaskKeysByDay["1"]).toHaveLength(1);
  expect(skippedState.completedLog).toEqual(originalState?.completedLog || []);
  await page.locator("#planUndoButton").click();
  const restoredAfterSkip = await page.evaluate(() => getExecutionState());
  expect(restoredAfterSkip.hiddenTaskKeysByDay).toEqual(originalState?.hiddenTaskKeysByDay || {});
  expect(restoredAfterSkip.completedLog).toEqual(originalState?.completedLog || []);
});

test("반복 일정 범위 편집은 변경 개수를 미리 보여준 뒤에만 적용한다", async ({ page }) => {
  await page.goto("/app.html");
  await waitForAppReady(page);

  const originalState = await page.evaluate(() => getExecutionState());
  await page.locator("#executionChecklist .task-edit-button").first().click();
  await page.locator("input[name='taskEditScope'][value='recurrence']").check();
  await page.locator("#taskEditName").fill("남은 회차에 적용할 일정");
  await page.locator("#taskEditSubmitButton").click();

  await expect(page.locator("#taskEditSheet")).toBeVisible();
  await expect(page.locator("#taskEditPreview")).toBeVisible();
  await expect(page.locator("#taskEditPreviewMessage")).toContainText(/반복 일정 \d+개/);
  await expect(page.locator("#taskEditSubmitButton")).toHaveText("확인한 변경 적용");
  const previewState = await page.evaluate(() => getExecutionState());
  expect(previewState).toEqual(originalState);

  await page.locator("#taskEditSubmitButton").click();
  await expect(page.locator("#taskEditSheet")).toBeHidden();
  const appliedState = await page.evaluate(() => getExecutionState());
  expect(Object.values(appliedState.taskEditsByDay).flatMap((edits) => Object.values(edits)))
    .toEqual(expect.arrayContaining([expect.objectContaining({ text: "남은 회차에 적용할 일정" })]));
  expect(appliedState.completedLog).toEqual(originalState?.completedLog || []);
});

/* 예전에는 완료 순간에 별빛만 쏟아지고, 올리의 축하는 올리 탭까지 가야 보였다.
   이제는 완료한 그 자리에서 올리가 잠깐 나타나 도장을 찍는다. */
test("일정을 완료하면 오늘 탭에서 올리가 직접 축하하고 잠시 뒤 사라진다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await page.goto("/app.html");
  await waitForAppReady(page);

  const celebration = page.locator("#ollieCelebration");
  await expect(celebration).toBeHidden();

  await page.locator("#executionChecklist .execution-check").first().check();
  await expect(celebration).toBeVisible();
  await expect(page.locator("#ollieCelebrationStamp")).toHaveText("참 잘했어요");
  await expect(page.locator("#ollieCelebrationImage")).toHaveAttribute("src", /ollie-celebrate\.png/);
  await expect(page.locator("#ollieCelebrationMessage")).not.toBeEmpty();
  // 화면을 막지 않는다 — 축하가 떠 있는 동안에도 다음 일정을 바로 체크할 수 있어야 한다.
  await expect(celebration).toHaveCSS("pointer-events", "none");
  await expect(celebration).toBeHidden({ timeout: 4000 });

  /* 탭하면 기다리지 않고 즉시 닫힌다. 체크로 다시 띄우면 1.8초 자동 종료 타이머와
     경쟁하게 되고(webkit은 진입 애니메이션 안정화를 기다리다 그 창을 다 써버린다)
     클릭 배선이 아니라 머신 속도를 재게 된다. 창을 새로 열어 그 경쟁을 없앤다. */
  await page.evaluate(() => showOllieCelebration({ stamp: "참 잘했어요", message: "탭 종료 확인" }));
  await expect(celebration).toBeVisible();
  await page.locator(".ollie-celebration-card").click({ force: true });
  await expect(celebration).toBeHidden({ timeout: 1000 });

  diagnostics.expectClean();
});

test("하루를 모두 완료하면 완주 도장으로 축하한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await page.goto("/app.html");
  await waitForAppReady(page);

  await page.locator("#completeTodayButton").click();
  await expect(page.locator("#ollieCelebration")).toBeVisible();
  await expect(page.locator("#ollieCelebrationStamp")).toHaveText("오늘 완주");

  diagnostics.expectClean();
});
