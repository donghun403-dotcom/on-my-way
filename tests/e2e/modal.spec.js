const { test, expect } = require("@playwright/test");
const { monitorPage, prepareApp } = require("./helpers");

test.beforeEach(async ({ page }) => prepareApp(page));

test("시트는 하나만 열리고 ESC, 배경, 닫기 버튼과 포커스 복원이 동작한다", async ({ page, browserName }) => {
  const diagnostics = monitorPage(page);
  await page.goto("/app.html");
  const opener = page.locator("#addTodayScheduleButton");
  await opener.focus();
  await opener.click();
  await expect(page.locator("body")).toHaveClass(/sheet-open/);
  await expect(page.locator("#addScheduleSheet")).toBeVisible();
  await expect(page.locator("#closeAddSchedule")).toBeFocused();

  const creditInfoButton = page.getByRole("button", { name: "AI 크레딧 이용 안내" });
  const creditInfoDialog = page.getByRole("dialog", { name: "AI 크레딧 이용 안내" });
  await creditInfoButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#addScheduleSheet")).toBeHidden();
  await expect(creditInfoDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(creditInfoDialog).toBeHidden();
  await expect(page.locator("body")).not.toHaveClass(/sheet-open/);

  await opener.click();
  await page.locator("#addScheduleOverlay").click({ position: { x: 4, y: 4 } });
  await expect(page.locator("#addScheduleSheet")).toBeHidden();
  if (browserName !== "webkit") await expect(opener).toBeFocused();

  await opener.click();
  await page.locator("#closeAddSchedule").click();
  await expect(page.locator("#addScheduleOverlay")).toBeHidden();
  if (browserName !== "webkit") await expect(opener).toBeFocused();
  diagnostics.expectClean();
});
