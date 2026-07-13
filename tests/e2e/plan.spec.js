const { test, expect } = require("@playwright/test");
const { monitorPage, prepareApp } = require("./helpers");

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
