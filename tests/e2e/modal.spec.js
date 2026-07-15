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

  await page.locator("#openEnergyCharge").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#addScheduleSheet")).toBeHidden();
  await expect(page.locator("#energyChargeSheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#energyChargeSheet")).toBeHidden();
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

test("운영자 마이페이지는 유료 구독이나 해지 대상으로 표시하지 않는다", async ({ page }) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: "admin:password", name: "관리자", role: "admin", provider: "password", plan: "pro" },
      }),
    }),
  );

  await page.goto("/app.html?auth=my");
  await expect(page.locator("#myPageSheet")).toBeVisible();
  await expect(page.locator("#myPagePlanTitle")).toHaveText("운영자 이용권");
  await expect(page.locator("#myPagePlanMeta")).toHaveText("결제 없이 모든 기능 이용");
  await expect(page.locator("#myPagePaymentNote")).toContainText("운영자 계정은 결제 대상이 아니며");
  await expect(page.locator("#myPageSubscribe")).toBeHidden();
  await expect(page.locator("#myPageCancelPro")).toBeHidden();
});

test("앱의 추가 에너지 예정안은 가격 페이지의 최종 정책과 일치한다", async ({ page }) => {
  await page.goto("/app.html");
  await page.locator("#openEnergyCharge").click();

  const packs = page.locator("#energyChargeSheet .energy-pack");
  await expect(packs).toHaveCount(3);
  await expect(packs.nth(0)).toContainText("+100");
  await expect(packs.nth(0)).toContainText("990원 예정");
  await expect(packs.nth(1)).toContainText("+300");
  await expect(packs.nth(1)).toContainText("1,990원 예정");
  await expect(packs.nth(2)).toContainText("+1,000");
  await expect(packs.nth(2)).toContainText("4,900원 예정");
});
