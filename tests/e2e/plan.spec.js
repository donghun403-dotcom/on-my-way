const { test, expect } = require("@playwright/test");
const { monitorPage, prepareApp, waitForAppReady } = require("./helpers");

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

test("계획 홈은 7일 요약과 단일 주요 CTA를 제공한다", async ({ page, isMobile }) => {
  await page.goto("/app.html");
  await waitForAppReady(page);
  await page.locator("#tab-plan").click();
  await expect(page.locator("#planWeekStrip .plan-week-day")).toHaveCount(7);
  await expect(page.locator("#weeklyPlanList > li")).toHaveCount(3);
  await expect(page.locator("#planOpenDetailButton")).toContainText("전체 계획 보기");
  await expect(page.locator("#planOpenEditorButton")).toContainText("계획 수정하기");
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
  await page.keyboard.press("Escape");
  await expect(page.locator("#calendarDayDetail")).toBeHidden();
  await expect(page.locator("#scheduleCalendar .calendar-day.selected")).toBeFocused();
});

test("계획 수정은 다중 빠른 선택을 자유 입력에 안전하게 반영하고 승인 전 액션을 숨긴다", async ({ page }) => {
  await page.goto("/app.html");
  await waitForAppReady(page);
  await page.locator("#tab-plan").click();
  await page.locator("#planOpenEditorButton").click();
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
