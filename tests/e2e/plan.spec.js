const { test, expect } = require("@playwright/test");
const { captureAcceptance, createUsageResponse, mockAccountExperience, monitorPage, prepareApp, waitForAppReady } = require("./helpers");

test.beforeEach(async ({ page }) => prepareApp(page));

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
    period: 30,
    firstAction: "고객 한 명에게 인터뷰 요청",
    planSource: "ai-reviewed-draft",
    createdAt: new Date().toISOString(),
  };
  account.accountState = { omwExecutionPlan: JSON.stringify(plan) };
  let revisionCalls = 0;
  let releaseRevision;
  const revisionGate = new Promise((resolve) => { releaseRevision = resolve; });
  await page.route("**/api/ai/plan-revision", async (route) => {
    revisionCalls += 1;
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
});
