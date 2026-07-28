const { test, expect } = require("@playwright/test");
const { captureAcceptance, createUsageResponse, mockAccountExperience, monitorPage, prepareApp, waitForAppReady } = require("./helpers");

/* 이 픽스처는 "1일차 = 2026-07-27(월)"이라는 달력 위에 서 있다. 화요일이 2·9일차라
   difficultDays로 빠지고, 4일차(목)가 excludedDates로 빠지며, 6일차가 2026-08-01이다.
   실행한 날에 따라 오늘이 몇 일차인지 달라지면 그 전제가 통째로 무너지므로(짝수 일차는
   휴식일이라 오늘의 ACTION이 사라진다) 페이지 시계를 1일차 정오에 고정한다.
   setFixedTime은 Date만 고정하고 타이머는 그대로 둔다. 03:00Z를 쓰면 KST(정오)에서도
   UTC(오전)에서도 같은 날짜라 호스트 시간대에 흔들리지 않는다. */
const ROADMAP_PREFERENCE_START = "2026-07-27";
const ROADMAP_PREFERENCE_NOW = new Date(`${ROADMAP_PREFERENCE_START}T03:00:00.000Z`);

function roadmapPreferenceDate(dayNumber) {
  return new Date(Date.parse(`${ROADMAP_PREFERENCE_START}T00:00:00.000Z`) + (dayNumber - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function createRoadmapPreferencePlan(scheduleStartPreference) {
  const planId = "schedule-start-preference-plan";
  const firstWeekSchedule = Array.from({ length: 7 }, (_, index) => ({
    dayNumber: index + 1,
    dayLabel: ["월", "화", "수", "목", "금", "토", "일"][index],
    isRestDay: index % 2 === 1,
    items: index % 2 === 0 ? [{
      id: `preference-action-${index}`,
      planId,
      type: "ACTION",
      title: `선택 보존 행동 ${index + 1}`,
      durationMinutes: 25,
      completionRule: "정한 행동을 끝내면 완료",
      status: "pending",
      recurrenceGroupId: `preference-${index}`,
    }] : [{
      id: `preference-tip-${index}`,
      planId,
      type: "TIP",
      title: "올리의 실행 팁",
      durationMinutes: 0,
      completionRule: "",
      status: "pending",
      recurrenceGroupId: `preference-tip-${index}`,
    }],
  }));
  const scheduleOccurrences = Array.from({ length: 14 }, (_, index) => {
    const source = firstWeekSchedule[index % 7];
    const date = roadmapPreferenceDate(index + 1);
    return {
      dayNumber: index + 1,
      date,
      dayLabel: source.dayLabel,
      isRestDay: source.isRestDay,
      items: source.items.map((item) => ({
        ...item,
        id: `${item.id}-occurrence-${index + 1}`,
        scheduledAt: `${date}T07:00:00+09:00`,
      })),
    };
  });
  return {
    goal: "첫 주 시작 선택 검증",
    period: 14,
    planId,
    firstAction: "선택 보존 행동 1",
    scheduleStartPreference,
    planStartDate: ROADMAP_PREFERENCE_START,
    availability: {
      availableDays: ["월", "화", "수", "목", "금", "토", "일"],
      difficultDays: ["화"],                          // 2·9일차
      excludedDates: [roadmapPreferenceDate(4)],      // 목요일 하루를 통째로 비운다
      weeklyFrequency: 4,
      sessionMinutes: 25,
    },
    planSource: "ai-reviewed-draft",
    createdAt: ROADMAP_PREFERENCE_NOW.toISOString(),
    aiPreview: { firstWeekSchedule, scheduleOccurrences },
  };
}

test.beforeEach(async ({ page }, testInfo) => {
  const roadmapPreference = testInfo.annotations.find(({ type }) => type === "roadmap-preference")?.description;
  if (roadmapPreference) await page.clock.setFixedTime(ROADMAP_PREFERENCE_NOW);
  const storage = roadmapPreference
    ? { omwExecutionPlan: createRoadmapPreferencePlan(roadmapPreference) }
    : {};
  await prepareApp(page, storage);
});

test("모든 탭을 클릭과 키보드로 이동한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await page.goto("/app.html");
  const tabs = ["today", "plan", "mate", "memory"];
  for (const name of tabs) {
    await page.locator(`#tab-${name}`).click();
    await expect(page.locator(`#tab-${name}`)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(`#view-${name}`)).toBeVisible();
  }

  await page.locator("#tab-today").click();
  await page.locator("#tab-today").press("ArrowRight");
  await expect(page.locator("#tab-plan")).toHaveAttribute("aria-selected", "true");
  await page.locator("#tab-plan").press("End");
  await expect(page.locator("#tab-memory")).toHaveAttribute("aria-selected", "true");
  await page.locator("#tab-memory").press("Home");
  await expect(page.locator("#tab-today")).toHaveAttribute("aria-selected", "true");
  await page.locator("#tab-today").click({ clickCount: 3 });
  await expect(page.locator("#view-today")).toBeVisible();
  diagnostics.expectClean();
});

test("계획 홈은 7일 요약과 AI·직접 편집 진입을 구분한다", async ({ page, isMobile }, testInfo) => {
  await page.goto("/app.html");
  await waitForAppReady(page);
  await page.evaluate(() => {
    const plan = JSON.parse(localStorage.getItem("omwExecutionPlan") || "{}");
    plan.period = 30;
    localStorage.setItem("omwExecutionPlan", JSON.stringify(plan));
  });
  await page.reload();
  await waitForAppReady(page);
  await page.locator("#tab-plan").click();
  await captureAcceptance(page, testInfo, "plan-week-view");
  await expect(page.locator("#planWeekStrip .plan-week-day")).toHaveCount(7);
  await expect(page.locator("#weeklyPlanList > li")).toHaveCount(3);
  await expect(page.locator("#planOpenDetailButton")).toContainText("직접 편집");
  await expect(page.locator("#planOpenEditorButton")).toContainText("AI로 조정");
  const actionOrder = await page.evaluate(() => ({
    actionTop: document.querySelector("#planOpenEditorButton").getBoundingClientRect().top,
    weekTop: document.querySelector("#planWeekStrip").getBoundingClientRect().top,
  }));
  expect(actionOrder.actionTop).toBeLessThan(actionOrder.weekTop);
  await expect(page.locator("#planScheduleList")).toBeVisible();
  await expect(page.locator("#planScheduleList > details")).toHaveCount(1);
  const allRange = page.getByRole("button", { name: "전체 일정", exact: true });
  await allRange.click();
  await expect(allRange).toHaveAttribute("aria-pressed", "true");
  await captureAcceptance(page, testInfo, "plan-all-schedule");
  expect(await page.locator("#planScheduleList > details").count()).toBeGreaterThan(1);
  await page.getByRole("button", { name: "주간", exact: true }).click();
  await expect(page.locator("#planScheduleList > details")).toHaveCount(1);
  if (isMobile) await expect(page.locator("#planOpenDetailButton")).not.toHaveCSS("background-color", "rgb(34, 34, 34)");
  await expect(page.locator("#view-plan")).not.toHaveCSS("overflow-x", "scroll");
});

test("Roadmap 고정 시간 줄이기는 AI 재호출 없이 실행 시간을 줄인다", {
  annotation: { type: "roadmap-preference", description: "shorter" },
}, async ({ page }) => {
  const aiRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/ai/")) aiRequests.push(request.url());
  });
  await page.goto("/app.html");
  await waitForAppReady(page);
  await expect(page.locator("#focusTaskMeta")).toContainText("15분");
  expect(aiRequests).toEqual([]);
});

test("Roadmap 고정 요일 변경은 AI 재호출 없이 hard constraint를 적용한다", {
  annotation: { type: "roadmap-preference", description: "change-days" },
}, async ({ page }) => {
  const aiRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/ai/")) aiRequests.push(request.url());
  });
  await page.goto("/app.html");
  await waitForAppReady(page);
  await page.locator("#tab-plan").press("Enter");
  await page.getByRole("button", { name: "전체 일정", exact: true }).press("Enter");
  const scheduledDays = await page.locator("#planScheduleList [data-edit-task]").evaluateAll((buttons) =>
    buttons.map((button) => ({
      day: button.closest("section")?.querySelector("h3")?.textContent || "",
      dayNumber: Number(button.dataset.editDay),
      taskKey: button.dataset.editTask || "",
      time: button.querySelector("small")?.textContent || "",
      scheduledAt: button.dataset.scheduledAt || "",
    })),
  );
  expect(scheduledDays).toHaveLength(8);
  expect(scheduledDays.some(({ dayNumber }) => dayNumber === 6)).toBe(true);
  expect(scheduledDays.every(({ dayNumber }) => ![2, 4, 9].includes(dayNumber))).toBe(true);
  expect(scheduledDays.every(({ taskKey }) => taskKey.startsWith("preference-action-"))).toBe(true);
  expect(new Set(scheduledDays.map(({ taskKey }) => taskKey)).size).toBe(scheduledDays.length);
  expect(scheduledDays.find(({ dayNumber }) => dayNumber === 6)?.time).toContain("07:00");
  expect(scheduledDays.find(({ dayNumber }) => dayNumber === 6)?.scheduledAt).toContain(roadmapPreferenceDate(6));
  expect(aiRequests).toEqual([]);
});

test("완료한 과거 ACTION은 문구와 일정이 바뀐 revision 적용 후에도 같은 occurrence로 남는다", {
  annotation: { type: "roadmap-preference", description: "as-is" },
}, async ({ page }) => {
  await page.goto("/app.html");
  await waitForAppReady(page);
  const result = await page.evaluate(() => {
    const before = getPlanBundle();
    const completedDay = before.schedule[0];
    const completedTask = completedDay.tasks[0];
    setTaskCheckedState(before.state, completedDay, 0, true);
    recordTaskCompletion(before.state, completedDay, 0, { actualMinutes: 20 });
    savePlanBundleState(before.state);
    const completedLog = JSON.stringify(before.state.completedLog);
    const weeklySchedule = ["월", "화", "수", "목", "금", "토", "일"].map((day, index) => ({
      day,
      isRestDay: false,
      tasks: [{
        time: "19:00",
        durationMinutes: 20,
        task: `새 변경 행동 ${index + 1}`,
        completionRule: "새 행동 1회를 끝내면 완료",
      }],
    }));
    const after = getPlanBundle({
      reset: true,
      customText: "새 변경 행동 1\n새 변경 행동 2",
      revisionRequest: "남은 일정의 문구와 시간을 바꿔줘",
      weeklySchedule,
    });
    savePlanBundleState(after.state);
    const persisted = getPlanBundle();
    const firstDay = persisted.schedule[0];
    const completedIndex = firstDay.tasks.findIndex((task) => task._taskKey === completedTask._taskKey);
    return {
      completedIndex,
      completedText: firstDay.tasks[completedIndex]?.text || "",
      checked: Boolean(persisted.state.checkedByDay["1"]?.[completedIndex]),
      futureTexts: persisted.schedule.slice(1).flatMap((day) => day.tasks.map((task) => task.text)),
      completedLogUnchanged: JSON.stringify(persisted.state.completedLog) === completedLog,
    };
  });
  expect(result.completedIndex).toBeGreaterThanOrEqual(0);
  expect(result.completedText).toBe("선택 보존 행동 1");
  expect(result.checked).toBe(true);
  expect(result.futureTexts).toContain("새 변경 행동 2");
  expect(result.completedLogUnchanged).toBe(true);
});

test("오늘·이번 주 AI 변경은 지정한 날짜에만 남고 reload 뒤에도 미래 반복 일정을 바꾸지 않는다", {
  annotation: { type: "roadmap-preference", description: "as-is" },
}, async ({ page }) => {
  await page.goto("/app.html");
  await waitForAppReady(page);
  const before = await page.evaluate(() => {
    const plan = readExecutionPlan();
    plan.planStartDate = getTodayKey();
    localStorage.setItem("omwExecutionPlan", JSON.stringify(plan));
    localStorage.removeItem("omwExecutionState");
    const bundle = getPlanBundle();
    bundle.state.selectedDay = 4;
    savePlanBundleState(bundle.state);
    return {
      day1: JSON.stringify(bundle.schedule[0]),
      day4: JSON.stringify(bundle.schedule[3]),
      day8: JSON.stringify(bundle.schedule[7]),
      scheduleKey: bundle.state.scheduleKey,
    };
  });
  await page.reload();
  await waitForAppReady(page);
  await page.locator("#openPlanAdjustButton").click();
  await page.locator("#planAiAdjustButton").click();
  const todayAnchor = await page.evaluate(() => activePlanAdjustAnchorDay);
  expect(todayAnchor).toBe(1);
  await page.evaluate(() => {
    const bundle = getPlanBundle();
    const weeklySchedule = ["월", "화", "수", "목", "금", "토", "일"].map((day) => ({
      day,
      isRestDay: false,
      tasks: [{
        time: "19:00",
        durationMinutes: 20,
        task: `오늘 범위 변경 ${day}`,
        completionRule: "변경 행동 1회 완료",
      }],
    }));
    bundle.state.pendingPlanText = "오늘 범위 변경";
    bundle.state.pendingRevisionRequest = "오늘만 바꿔줘";
    bundle.state.pendingRevisionDetails = { adjustmentScope: "today" };
    bundle.state.pendingWeeklySchedule = weeklySchedule;
    bundle.state.pendingRevisionAnchorDay = activePlanAdjustAnchorDay;
    bundle.state.pendingRevisionBasePlanIdentity = bundle.state.planIdentity;
    bundle.state.pendingRevisionBaseScheduleKey = bundle.state.scheduleKey;
    savePlanBundleState(bundle.state);
    renderExecutionPage(bundle);
    setPlanScreen("editor");
  });
  await page.locator("#acceptPlanButton").click();
  await expect.poll(() => page.evaluate(() => getPlanBundle().state.pendingPlanText)).toBe("");
  const todayApplied = await page.evaluate(() => {
    const bundle = getPlanBundle();
    return {
      day1: JSON.stringify(bundle.schedule[0]),
      day4: JSON.stringify(bundle.schedule[3]),
      day8: JSON.stringify(bundle.schedule[7]),
      day1Text: bundle.schedule[0].tasks[0]?.text || "",
      scopedDays: Object.keys(bundle.state.scopedRevisionIdByDay || {}),
      scopedScheduleCount: Object.keys(bundle.state.scopedRevisionSchedules || {}).length,
      customTasksByDay: bundle.state.customTasksByDay,
      taskEditsByDay: bundle.state.taskEditsByDay,
      scheduleKey: bundle.state.scheduleKey,
    };
  });
  expect(todayApplied.day1).not.toBe(before.day1);
  expect(todayApplied.day1Text).toContain("오늘 범위 변경");
  expect(todayApplied.day4).toBe(before.day4);
  expect(todayApplied.day8).toBe(before.day8);
  expect(todayApplied.scopedDays).toEqual(["1"]);
  expect(todayApplied.scopedScheduleCount).toBe(1);
  expect(todayApplied.customTasksByDay).toEqual({});
  expect(todayApplied.taskEditsByDay).toEqual({});
  expect(todayApplied.scheduleKey).not.toBe(before.scheduleKey);

  await page.reload();
  await waitForAppReady(page);
  const afterTodayReload = await page.evaluate(() => {
    const bundle = getPlanBundle();
    return {
      day1: JSON.stringify(bundle.schedule[0]),
      day8: JSON.stringify(bundle.schedule[7]),
      scopedDays: Object.keys(bundle.state.scopedRevisionIdByDay || {}),
      scheduleKey: bundle.state.scheduleKey,
    };
  });
  expect(afterTodayReload.day1).toBe(todayApplied.day1);
  expect(afterTodayReload.day8).toBe(before.day8);
  expect(afterTodayReload.scopedDays).toEqual(["1"]);
  expect(afterTodayReload.scheduleKey).toBe(todayApplied.scheduleKey);

  const weekBefore = await page.evaluate(() => {
    const bundle = getPlanBundle();
    const completedDay = bundle.schedule[13];
    setTaskCheckedState(bundle.state, completedDay, 0, true);
    recordTaskCompletion(bundle.state, completedDay, 0, { actualMinutes: 20 });
    savePlanBundleState(bundle.state);
    const refreshed = getPlanBundle();
    const weeklySchedule = ["월", "화", "수", "목", "금", "토", "일"].map((day) => ({
      day,
      isRestDay: false,
      tasks: [{
        time: "18:00",
        durationMinutes: 15,
        task: `주간 범위 변경 ${day}`,
        completionRule: "주간 변경 행동 1회 완료",
      }],
    }));
    refreshed.state.pendingPlanText = "주간 범위 변경";
    refreshed.state.pendingRevisionRequest = "이번 주만 바꿔줘";
    refreshed.state.pendingRevisionDetails = { adjustmentScope: "week" };
    refreshed.state.pendingWeeklySchedule = weeklySchedule;
    refreshed.state.pendingRevisionAnchorDay = 12;
    refreshed.state.pendingRevisionBasePlanIdentity = refreshed.state.planIdentity;
    refreshed.state.pendingRevisionBaseScheduleKey = refreshed.state.scheduleKey;
    savePlanBundleState(refreshed.state);
    renderExecutionPage(refreshed);
    setPlanScreen("editor");
    return {
      day11: JSON.stringify(refreshed.schedule[10]),
      day12: JSON.stringify(refreshed.schedule[11]),
      day14: JSON.stringify(refreshed.schedule[13]),
    };
  });
  await page.locator("#acceptPlanButton").click();
  await expect.poll(() => page.evaluate(() => getPlanBundle().state.pendingPlanText)).toBe("");
  const weekApplied = await page.evaluate(() => {
    const bundle = getPlanBundle();
    return {
      day11: JSON.stringify(bundle.schedule[10]),
      day12: JSON.stringify(bundle.schedule[11]),
      day14: JSON.stringify(bundle.schedule[13]),
      day12Text: bundle.schedule[11].tasks[0]?.text || "",
      scopedDays: Object.keys(bundle.state.scopedRevisionIdByDay || {}).sort((left, right) => Number(left) - Number(right)),
      scopedScheduleCount: Object.keys(bundle.state.scopedRevisionSchedules || {}).length,
      day14Checked: Boolean(bundle.state.checkedByDay["14"]?.[0]),
      scheduleKey: bundle.state.scheduleKey,
    };
  });
  expect(weekApplied.day11).toBe(weekBefore.day11);
  expect(weekApplied.day12).not.toBe(weekBefore.day12);
  expect(weekApplied.day12Text).toContain("주간 범위 변경");
  expect(weekApplied.day14).toBe(weekBefore.day14);
  expect(weekApplied.day14Checked).toBe(true);
  expect(weekApplied.scopedDays).toEqual(["1", "12", "13"]);
  expect(weekApplied.scopedScheduleCount).toBe(2);

  await page.reload();
  await waitForAppReady(page);
  const afterWeekReload = await page.evaluate(() => {
    const bundle = getPlanBundle();
    return {
      day11: JSON.stringify(bundle.schedule[10]),
      day12: JSON.stringify(bundle.schedule[11]),
      day14: JSON.stringify(bundle.schedule[13]),
      scopedDays: Object.keys(bundle.state.scopedRevisionIdByDay || {}).sort((left, right) => Number(left) - Number(right)),
      scheduleKey: bundle.state.scheduleKey,
    };
  });
  expect(afterWeekReload.day11).toBe(weekBefore.day11);
  expect(afterWeekReload.day12).toBe(weekApplied.day12);
  expect(afterWeekReload.day14).toBe(weekBefore.day14);
  expect(afterWeekReload.scopedDays).toEqual(["1", "12", "13"]);
  expect(afterWeekReload.scheduleKey).toBe(weekApplied.scheduleKey);
});

test("explicit uncheck survives reload and revision without deleting history", async ({ page }) => {
  await page.goto("/app.html");
  await waitForAppReady(page);
  const result = await page.evaluate(() => {
    const before = getPlanBundle();
    const completedDay = before.schedule[0];
    const completedTask = completedDay.tasks[0];
    const taskKey = getTaskKey(completedDay.day, 0, completedTask);
    setTaskCheckedState(before.state, completedDay, 0, true);
    recordTaskCompletion(before.state, completedDay, 0, { actualMinutes: 20 });
    before.state.completedLog = before.state.completedLog.map(({ planIdentity, ...item }) => item);
    before.state.dailyMemories = before.state.dailyMemories.map((item) =>
      item.actionReference === taskKey ? { ...item, id: `action:${taskKey}` } : item);
    savePlanBundleState(before.state);
    const adopted = getPlanBundle();
    const adoptedDay = adopted.schedule[0];
    const adoptedIndex = adoptedDay.tasks.findIndex((task) => task._taskKey === completedTask._taskKey);
    const historicalEntry = adopted.state.completedLog.find((item) =>
      item.planIdentity === adopted.state.planIdentity && item.taskKey === taskKey);
    const completedAt = historicalEntry?.completedAt;
    const memorySnapshot = JSON.stringify(adopted.state.dailyMemories);
    const growthSnapshot = JSON.stringify(adopted.state.ollieGrowthState);

    setTaskCheckedState(adopted.state, adoptedDay, adoptedIndex, false);
    savePlanBundleState(adopted.state);
    const reloaded = getPlanBundle();
    const reloadedDay = reloaded.schedule[0];
    const reloadedIndex = reloadedDay.tasks.findIndex((task) => task._taskKey === completedTask._taskKey);

    const weeklySchedule = ["월", "화", "수", "목", "금", "토", "일"].map((day, index) => ({
      day,
      isRestDay: false,
      tasks: [{
        time: "18:00",
        durationMinutes: 15,
        task: `취소 후 새 행동 ${index + 1}`,
        completionRule: "새 행동을 끝내면 완료",
      }],
    }));
    const revised = getPlanBundle({
      reset: true,
      customText: "취소 후 새 행동 1\n취소 후 새 행동 2",
      revisionRequest: "남은 계획을 다시 구성해줘",
      weeklySchedule,
    });
    savePlanBundleState(revised.state);
    const persisted = getPlanBundle();
    const persistedHistoricalEntry = persisted.state.completedLog.find((item) =>
      item.planIdentity === persisted.state.planIdentity && item.taskKey === taskKey);
    return {
      reloadedChecked: reloadedIndex >= 0
        ? Boolean(reloaded.state.checkedByDay[String(completedDay.day)]?.[reloadedIndex])
        : false,
      oldOccurrencePresentAfterRevision: persisted.schedule.some((dayPlan) =>
        dayPlan.tasks.some((task) => task._taskKey === completedTask._taskKey)),
      activeOccurrencePresent: persisted.state.completedOccurrences.some((entry) =>
        entry.day === completedDay.day && entry.taskKey === completedTask._taskKey),
      completionActive: persistedHistoricalEntry?.completionActive,
      completedAtPreserved: persistedHistoricalEntry?.completedAt === completedAt,
      memoriesPreserved: JSON.stringify(persisted.state.dailyMemories) === memorySnapshot,
      growthPreserved: JSON.stringify(persisted.state.ollieGrowthState) === growthSnapshot,
    };
  });
  expect(result.reloadedChecked).toBe(false);
  expect(result.oldOccurrencePresentAfterRevision).toBe(false);
  expect(result.activeOccurrencePresent).toBe(false);
  expect(result.completionActive).toBe(false);
  expect(result.completedAtPreserved).toBe(true);
  expect(result.memoriesPreserved).toBe(true);
  expect(result.growthPreserved).toBe(true);
});

test("365 days x 5 completed ACTIONs survive v5 storage, revision, uncheck and undo under the account limit", async ({ page }) => {
  await page.goto("/app.html");
  await waitForAppReady(page);
  const result = await page.evaluate(() => {
    const pad = (prefix, length, fill) => `${prefix}${fill.repeat(length)}`.slice(0, length);
    const templates = Array.from({ length: 14 }, (_, index) => ({
      title: pad(`행동${index}-`, 240, "가"),
      sourceReference: pad(`자료${index}-`, 200, "나"),
      quantityOrRange: pad(`범위${index}-`, 240, "다"),
      completionRule: pad(`완료${index}-`, 240, "라"),
      recurrenceGroupId: `annual-group-${index}`,
    }));
    const scheduleOccurrences = Array.from({ length: 365 }, (_, dayIndex) => {
      const date = new Date(Date.UTC(2026, 0, 1 + dayIndex)).toISOString().slice(0, 10);
      return {
        dayNumber: dayIndex + 1,
        date,
        dayLabel: ["일", "월", "화", "수", "목", "금", "토"][new Date(`${date}T00:00:00Z`).getUTCDay()],
        isRestDay: false,
        items: Array.from({ length: 5 }, (_, taskIndex) => {
          const template = templates[(dayIndex * 5 + taskIndex) % templates.length];
          const hour = String(7 + taskIndex).padStart(2, "0");
          return {
            id: `task-${String(dayIndex + 1).padStart(3, "0")}-${taskIndex}`,
            planId: "annual-plan",
            type: "ACTION",
            title: template.title,
            sourceReference: template.sourceReference,
            quantityOrRange: template.quantityOrRange,
            durationMinutes: 360,
            completionRule: template.completionRule,
            time: `${hour}:00`,
            scheduledAt: `${date}T${hour}:00:00+09:00`,
            status: "pending",
            recurrenceGroupId: template.recurrenceGroupId,
          };
        }),
      };
    });
    const plan = {
      planId: "annual-plan",
      goal: "연간 실행",
      period: 365,
      firstAction: templates[0].title,
      planStartDate: "2026-01-01",
      planSource: "ai-reviewed-draft",
      createdAt: "2026-01-01T00:00:00.000Z",
      scheduleOccurrences,
      firstWeekSchedule: scheduleOccurrences.slice(0, 7),
      aiPreview: {
        scheduleOccurrences,
        firstWeekSchedule: scheduleOccurrences.slice(0, 7),
        scheduleContract: { startDate: "2026-01-01" },
      },
    };
    writeExecutionPlan(plan);
    localStorage.setItem("omwPersonalityProfile", "{}");
    localStorage.setItem("omwCompanionState", "{}");
    localStorage.setItem("omwCompanionEvents", "[]");
    localStorage.setItem("omwExecutionTheme", "\"system\"");
    const planIdentity = getExecutionPlanIdentity(plan);
    const previousSchedule = scheduleOccurrences.map((dayPlan) => ({
      day: dayPlan.dayNumber,
      tasks: dayPlan.items.map((item, sourceIndex) => ({
        id: item.id,
        planId: item.planId,
        type: "ACTION",
        time: item.time,
        scheduledAt: item.scheduledAt,
        durationMinutes: item.durationMinutes,
        text: item.title,
        sourceReference: item.sourceReference,
        quantityOrRange: item.quantityOrRange,
        completionRule: item.completionRule,
        recurrenceGroupId: item.recurrenceGroupId,
        _sourceIndex: sourceIndex,
        _taskKey: item.id,
      })),
    }));
    const state = migrateExecutionState({
      planIdentity,
      checkedByDay: {},
      checkedTaskKeysByDay: {},
      completedLog: [],
      completedOccurrences: [],
      dailyMemories: [],
    });
    previousSchedule.forEach((dayPlan) => {
      state.checkedByDay[String(dayPlan.day)] = dayPlan.tasks.map(() => true);
      state.checkedTaskKeysByDay[String(dayPlan.day)] = Object.fromEntries(
        dayPlan.tasks.map((task) => [task._taskKey, true]),
      );
      dayPlan.tasks.forEach((task, taskIndex) => {
        const taskKey = getTaskKey(dayPlan.day, taskIndex, task);
        const completedAt = new Date(Date.UTC(2026, 0, 1, 0, dayPlan.day, taskIndex)).toISOString();
        state.completedLog.push({
          planIdentity,
          taskKey,
          day: dayPlan.day,
          taskIndex,
          time: task.time,
          text: task.text,
          completedAt,
          completionActive: true,
        });
        state.completedOccurrences.push({
          day: dayPlan.day,
          taskKey: task._taskKey,
          ...task,
        });
        state.dailyMemories.push(defaultAutoMemoryForCompletion({
          planIdentity,
          day: dayPlan.day,
          taskKey: task._taskKey,
          task,
          completedAt,
          actualMinutes: task.durationMinutes,
        }));
      });
    });
    state.completedLog = normalizeCompletedLog(state.completedLog);
    state.completedOccurrencesPlanIdentity = planIdentity;
    state.completedOccurrences = normalizeCompletedOccurrences(state.completedOccurrences, planIdentity);
    state.undoSnapshot = snapshotExecutionState(state, "ai-plan-apply");
    let persistedBytes;
    try {
      persistedBytes = saveExecutionState(state);
    } catch (error) {
      return {
        capacityErrorBytes: error?.bytes || -1,
        compactPlanBytes: new TextEncoder().encode(localStorage.getItem("omwExecutionPlan") || "").byteLength,
        completionLedgerBytes: new TextEncoder().encode(JSON.stringify(encodeExecutionCompletionLedger(state, readExecutionPlan()))).byteLength,
      };
    }
    const storedState = JSON.parse(localStorage.getItem("omwExecutionState"));
    const persisted = getExecutionState();
    const revisedSchedule = previousSchedule.map((dayPlan) => ({
      day: dayPlan.day,
      tasks: dayPlan.tasks.map((task, taskIndex) => ({
        ...task,
        id: `revised-${dayPlan.day}-${taskIndex}`,
        text: `수정 행동 ${dayPlan.day}-${taskIndex}`,
        _taskKey: `revised-${dayPlan.day}-${taskIndex}`,
      })),
    }));
    preserveCompletedScheduleOccurrences(previousSchedule, revisedSchedule, persisted);
    const remapped = remapCompletedChecks(
      previousSchedule,
      revisedSchedule,
      persisted.checkedByDay,
      getActiveCompletedLog(persisted),
      getActiveCompletedOccurrences(persisted),
    );
    const completedAt = persisted.completedLog[0].completedAt;
    setTaskCheckedState(persisted, previousSchedule[0], 0, false);
    saveExecutionState(persisted);
    const unchecked = getExecutionState();
    const firstTaskKey = previousSchedule[0].tasks[0]._taskKey;
    const uncheckedLog = unchecked.completedLog.find((item) => item.taskKey === `1:${firstTaskKey}`);
    setTaskCheckedState(unchecked, previousSchedule[0], 0, true);
    recordTaskCompletion(unchecked, previousSchedule[0], 0, { actualMinutes: 360 });
    const finalBytes = saveExecutionState(unchecked);
    const restored = getExecutionState();
    const restoredLog = restored.completedLog.find((item) => item.taskKey === `1:${firstTaskKey}`);
    const envelope = captureServerSyncState();
    const serializedBytes = new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
    const restoredFirst = restored.completedOccurrences.find((entry) =>
      entry.day === 1 && entry.taskKey === firstTaskKey);
    return {
      occurrenceCount: restored.completedOccurrences.length,
      historyCount: restored.completedLog.length,
      uniqueOccurrenceCount: new Set(
        restored.completedOccurrences.map((entry) => `${entry.day}:${entry.taskKey}`),
      ).size,
      occurrenceScopeMatches: restored.completedOccurrencesPlanIdentity === planIdentity,
      restoredTaskCount: revisedSchedule.filter((dayPlan) =>
        dayPlan.tasks.filter((task) => task._taskKey.startsWith("task-")).length === 5).length,
      checkedCount: Object.values(remapped).flat().filter(Boolean).length,
      serializedBytes,
      persistedBytes,
      finalBytes,
      envelopeKeys: Object.keys(envelope).sort(),
      storedUsesLedger: storedState.version === 5
        && Array.isArray(storedState.completionLedger?.r)
        && !Object.prototype.hasOwnProperty.call(storedState, "completedLog")
        && !Object.prototype.hasOwnProperty.call(storedState, "dailyMemories"),
      undoKeys: Object.keys(storedState.undoSnapshot?.state || {}),
      uncheckedActive: uncheckedLog?.completionActive,
      recheckedActive: restoredLog?.completionActive,
      completedAtPreserved: restoredLog?.completedAt === completedAt,
      exactFields: restoredFirst?.text === templates[0].title
        && restoredFirst?.sourceReference === templates[0].sourceReference
        && restoredFirst?.quantityOrRange === templates[0].quantityOrRange
        && restoredFirst?.completionRule === templates[0].completionRule,
    };
  });
  expect(result.capacityErrorBytes || 0).toBe(0);
  expect(result.occurrenceCount).toBe(1_825);
  expect(result.historyCount).toBe(1_825);
  expect(result.uniqueOccurrenceCount).toBe(1_825);
  expect(result.occurrenceScopeMatches).toBe(true);
  expect(result.restoredTaskCount).toBe(365);
  expect(result.checkedCount).toBe(1_825);
  expect(result.storedUsesLedger).toBe(true);
  expect(result.undoKeys).not.toContain("completedLog");
  expect(result.undoKeys).not.toContain("completedOccurrences");
  expect(result.undoKeys).not.toContain("dailyMemories");
  expect(result.undoKeys).not.toContain("ollieGrowthState");
  expect(result.uncheckedActive).toBe(false);
  expect(result.recheckedActive).toBe(true);
  expect(result.completedAtPreserved).toBe(true);
  expect(result.exactFields).toBe(true);
  expect(result.envelopeKeys).toEqual([
    "omwCompanionEvents",
    "omwCompanionState",
    "omwExecutionPlan",
    "omwExecutionState",
    "omwExecutionTheme",
    "omwPersonalityProfile",
  ]);
  expect(result.persistedBytes).toBeLessThan(250_000);
  expect(result.finalBytes).toBeLessThan(250_000);
  expect(result.serializedBytes).toBeLessThan(250_000);
});

test("같은 목표의 새 planId는 과거 실행 상태를 재사용하지 않고 기록만 보존한다", {
  annotation: { type: "roadmap-preference", description: "as-is" },
}, async ({ page }) => {
  await page.goto("/app.html");
  await waitForAppReady(page);
  const result = await page.evaluate(() => {
    const previous = getPlanBundle();
    const firstDay = previous.schedule[0];
    const reusedTaskId = firstDay.tasks[0]._taskKey;
    const reusedTaskOccurrenceKey = getTaskKey(firstDay.day, 0, firstDay.tasks[0]);
    setTaskCheckedState(previous.state, firstDay, 0, true);
    recordTaskCompletion(previous.state, firstDay, 0, { actualMinutes: 20 });
    previous.state.pendingPlanText = "이전 계획의 대기 중 변경안";
    previous.state.pendingRevisionRequest = "이전 계획만 바꿔줘";
    previous.state.selectedDay = 4;
    savePlanBundleState(previous.state);
    const oldIdentity = previous.state.planIdentity;
    const historicalLog = JSON.stringify(previous.state.completedLog);
    const historicalMemories = JSON.stringify(previous.state.dailyMemories);
    const nextPlan = {
      ...readExecutionPlan(),
      planId: "same-goal-new-plan-id",
      firstAction: "새 계획 첫 행동",
      createdAt: "2026-07-24T23:59:00.000Z",
      aiPreview: {
        firstWeekSchedule: [{
          dayNumber: 1,
          dayLabel: "월",
          isRestDay: false,
          items: [{
            id: reusedTaskId,
            planId: "same-goal-new-plan-id",
            type: "ACTION",
            title: "새 계획 첫 행동",
            durationMinutes: 20,
            completionRule: "새 계획 행동을 끝내면 완료",
            status: "pending",
          }],
        }],
      },
    };
    localStorage.setItem("omwExecutionPlan", JSON.stringify(nextPlan));
    const next = getPlanBundle();
    const completedLogPreserved = JSON.stringify(next.state.completedLog) === historicalLog;
    const memoriesPreserved = JSON.stringify(next.state.dailyMemories) === historicalMemories;
    const checkedCountBeforeCompletion = Object.values(next.state.checkedByDay).flat().filter(Boolean).length;
    const activeLogCountBeforeCompletion = getActiveCompletedLog(next.state).length;
    const nextFirstDay = next.schedule[0];
    setTaskCheckedState(next.state, nextFirstDay, 0, true);
    const newlyRecorded = recordTaskCompletion(next.state, nextFirstDay, 0, { actualMinutes: 20 });
    savePlanBundleState(next.state);
    const matchingLogs = next.state.completedLog.filter((item) => item.taskKey === reusedTaskOccurrenceKey);
    return {
      oldIdentity,
      newIdentity: next.state.planIdentity,
      planText: next.state.planText,
      pendingPlanText: next.state.pendingPlanText,
      pendingRevisionRequest: next.state.pendingRevisionRequest,
      selectedDay: next.state.selectedDay,
      checkedCountBeforeCompletion,
      activeLogCountBeforeCompletion,
      completedLogPreserved,
      memoriesPreserved,
      newlyRecorded,
      matchingLogPlanIdentities: matchingLogs.map((item) => item.planIdentity),
      activeLogCountAfterCompletion: getActiveCompletedLog(next.state).length,
      memoryCount: next.state.dailyMemories.length,
      historicalMemoryCount: JSON.parse(historicalMemories).length,
    };
  });
  expect(result.newIdentity).not.toBe(result.oldIdentity);
  expect(result.planText).toContain("새 계획 첫 행동");
  expect(result.planText).not.toContain("선택 보존 행동");
  expect(result.pendingPlanText).toBe("");
  expect(result.pendingRevisionRequest).toBe("");
  expect(result.selectedDay).toBe(1);
  expect(result.checkedCountBeforeCompletion).toBe(0);
  expect(result.activeLogCountBeforeCompletion).toBe(0);
  expect(result.completedLogPreserved).toBe(true);
  expect(result.memoriesPreserved).toBe(true);
  expect(result.newlyRecorded).toBe(true);
  expect(result.activeLogCountAfterCompletion).toBe(1);
  expect(new Set(result.matchingLogPlanIdentities)).toEqual(new Set([result.oldIdentity, result.newIdentity]));
  expect(result.memoryCount).toBe(result.historicalMemoryCount + 1);
});

test("주간 날짜에서 상세 시트로 이동하고 Escape로 닫으면 초점이 복원된다", async ({ page, isMobile }) => {
  test.skip(!isMobile, "모바일 시트 동작");
  await page.goto("/app.html");
  await waitForAppReady(page);
  await page.locator("#tab-plan").click();
  const firstDay = page.locator("#planWeekStrip .plan-week-day").first();
  await firstDay.click();
  await expect(page.locator("#view-plan")).toHaveAttribute("data-active-plan-screen", "detail");
  await expect(page.locator("#calendarDayDetail")).toBeVisible();
  await expect(page.locator("#calendarDayDetail")).toHaveAttribute("aria-modal", "true");
  const sheetBounds = await page.evaluate(() => {
    const sheet = document.querySelector("#calendarDayDetail").getBoundingClientRect();
    const tabbar = document.querySelector(".execution-tabbar").getBoundingClientRect();
    const firstTask = document.querySelector("#calendarDayDetailList li")?.getBoundingClientRect();
    return { sheetBottom: sheet.bottom, tabbarTop: tabbar.top, firstTaskTop: firstTask?.top, firstTaskBottom: firstTask?.bottom, sheetTop: sheet.top, scrollTop: document.querySelector("#calendarDayDetail").scrollTop };
  });
  expect(sheetBounds.sheetBottom).toBeLessThanOrEqual(sheetBounds.tabbarTop + 1);
  expect(sheetBounds.firstTaskTop).toBeGreaterThanOrEqual(sheetBounds.sheetTop);
  expect(sheetBounds.firstTaskBottom).toBeLessThanOrEqual(sheetBounds.sheetBottom);
  expect(sheetBounds.scrollTop).toBe(0);
  const editButtonBounds = await page.locator("#calendarDayDetailList li button").first().boundingBox();
  expect(editButtonBounds.width).toBeGreaterThanOrEqual(44);
  expect(editButtonBounds.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Escape");
  await expect(page.locator("#calendarDayDetail")).toBeHidden();
  await expect(page.locator("#scheduleCalendar .calendar-day.selected")).toBeFocused();
});

test("계획 수정은 다중 빠른 선택을 자유 입력에 안전하게 반영하고 승인 전 액션을 숨긴다", async ({ page }) => {
  await page.goto("/app.html");
  await waitForAppReady(page);
  await page.locator("#tab-plan").click();
  await page.locator("#planOpenEditorButton").click();
  await expect(page.locator("#planAdjustSheet")).toBeVisible();
  await expect(page.locator("[data-plan-adjust-scope='remaining']")).toHaveAttribute("aria-pressed", "true");
  await page.locator("[data-plan-adjust-scope='week']").click();
  await expect(page.locator("[data-plan-adjust-scope='week']")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#planAiAdjustButton").click();
  const timeChip = page.getByRole("button", { name: "시간 바꾸기" });
  const restChip = page.getByRole("button", { name: "휴식일 넣기" });
  await timeChip.click();
  await restChip.click();
  await expect(timeChip).toHaveAttribute("aria-pressed", "true");
  await expect(restChip).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#planRevisionRequest")).toHaveValue(/집중 시간대.*\n.*휴식일/s);
  await expect(page.locator("#regeneratePlanButton")).toBeEnabled();
  await expect(page.locator("#planReviewStep")).toBeHidden();
  await timeChip.click();
  await expect(page.locator("#planRevisionRequest")).not.toHaveValue(/집중 시간대/);
});

test("계획 조정 범위는 오늘 직접 편집과 주간 일정 목록에 각각 연결된다", async ({ page }, testInfo) => {
  await page.goto("/app.html");
  await waitForAppReady(page);

  const adjustTrigger = page.locator("#openPlanAdjustButton");
  await adjustTrigger.click();
  await expect(page.locator("[data-plan-adjust-scope='today']")).toHaveAttribute("aria-pressed", "true");
  const closeAdjust = page.locator("#closePlanAdjust");
  await expect(closeAdjust).toBeFocused();
  const closeAdjustBox = await closeAdjust.boundingBox();
  expect(closeAdjustBox.width).toBeGreaterThanOrEqual(44);
  expect(closeAdjustBox.height).toBeGreaterThanOrEqual(44);
  await captureAcceptance(page, testInfo, "plan-adjust-sheet");
  await page.locator("#planDirectAdjustButton").click();
  await expect(page.locator("#taskEditSheet")).toBeVisible();
  const closeTaskEdit = page.locator("#closeTaskEdit");
  await expect(closeTaskEdit).toBeFocused();
  const closeTaskEditBox = await closeTaskEdit.boundingBox();
  expect(closeTaskEditBox.width).toBeGreaterThanOrEqual(44);
  expect(closeTaskEditBox.height).toBeGreaterThanOrEqual(44);
  await closeTaskEdit.click();
  await expect(adjustTrigger).toBeFocused();

  await page.locator("#tab-plan").click();
  await page.locator("#planOpenEditorButton").click();
  await page.locator("[data-plan-adjust-scope='week']").click();
  await page.locator("#planDirectAdjustButton").click();
  await expect(page.locator("#view-plan")).toHaveAttribute("data-active-plan-screen", "home");
  await expect(page.locator("[data-plan-range='week']")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#planScheduleList [data-edit-task]").first()).toBeVisible();
});

test("AI 변경안 중복 submit은 요청 한 번만 만들고 승인 전 원본을 유지한다", async ({ page }, testInfo) => {
  const user = { id: "plan-race-user", provider: "google", name: "계획 사용자", email: "plan@example.test", plan: "pro", role: "member" };
  const account = await mockAccountExperience(page, { user, usage: createUsageResponse({ plan: "pro" }) });
  const plan = {
    goal: "창업 고객 검증",
    period: 14,
    firstAction: "고객 한 명에게 인터뷰 요청",
    planStartDate: "2026-07-27",
    availability: {
      availableDays: ["월", "화", "수", "목", "금", "토", "일"],
      difficultDays: [],
      excludedDates: ["7/29–7/30"],
      sessionMinutes: 20,
    },
    planSource: "ai-reviewed-draft",
    createdAt: new Date().toISOString(),
  };
  let revisionCalls = 0;
  let releaseRevision;
  const revisionGate = new Promise((resolve) => { releaseRevision = resolve; });
  await page.route("**/api/ai/plan-revision", async (route) => {
    revisionCalls += 1;
    expect(route.request().postDataJSON().currentAvailability.excludedDates).toEqual(["7/29–7/30"]);
    await revisionGate;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        chargedCredits: 2,
        revision: {
          revisedTasks: ["고객 후보 5명 정리", "인터뷰 요청 3건 발송", "응답 한 줄 기록", "다음 제안 준비"],
          weeklySchedule: ["월", "화", "수", "목", "금", "토", "일"].map((day) => ({ day, isRestDay: false, tasks: [{ time: "19:00", durationMinutes: 20, task: "고객 인터뷰 요청", completionRule: "요청 1건 발송" }] })),
          revisionSummary: { goalAlignment: "고객 검증", resourcePlan: "고객 후보", timePlan: "20분", weeklyRule: "매일 1건", assumptions: [] },
          changes: ["고객 접촉 우선"],
          ollieMessage: "변경안을 준비했어요.",
        },
        usage: createUsageResponse({ plan: "pro" }),
      }),
    });
  });

  await page.goto("/app.html");
  await waitForAppReady(page);
  account.accountState = { omwExecutionPlan: JSON.stringify(plan) };
  await page.evaluate((nextPlan) => {
    localStorage.setItem("omwExecutionPlan", JSON.stringify(nextPlan));
    localStorage.removeItem("omwExecutionState");
  }, plan);
  await page.reload();
  await waitForAppReady(page);
  await page.locator("#tab-plan").click();
  await page.locator("#planOpenEditorButton").click();
  await page.locator("#planAiAdjustButton").click();
  await page.locator("#planRevisionRequest").fill("고객 접촉을 우선해줘");
  const originalPlan = await page.evaluate(() => localStorage.getItem("omwExecutionPlan"));
  await page.locator("#regeneratePlanButton").evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await expect.poll(() => revisionCalls).toBe(1);
  releaseRevision();
  await expect(page.locator("#planReviewStep")).toBeVisible();
  await captureAcceptance(page, testInfo, "plan-change-preview");
  expect(revisionCalls).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("omwExecutionPlan"))).toBe(originalPlan);
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("omwExecutionState") || "{}"));
  expect(state.pendingPlanText).toContain("고객 후보 5명 정리");
  expect(state.planText).not.toContain("고객 후보 5명 정리");
  await page.locator("#acceptPlanButton").click();
  const appliedDays = page.locator("#planScheduleList section");
  await expect(appliedDays.nth(2).locator("[data-edit-task]")).toHaveCount(0);
  await expect(appliedDays.nth(3).locator("[data-edit-task]")).toHaveCount(0);
  await expect(appliedDays.nth(4).locator("[data-edit-task]")).toHaveCount(1);
});
