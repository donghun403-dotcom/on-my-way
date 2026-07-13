const { test, expect } = require("@playwright/test");
const { monitorPage, prepareApp, readStored } = require("./helpers");

test.beforeEach(async ({ page }) => prepareApp(page));

test("올리 대화 실패를 안전하게 안내하고 계획을 자동 적용하지 않는다", async ({ page }) => {
  const diagnostics = monitorPage(page, {
    allowedConsoleMessages: ["status of 503"],
    allowedResponseUrls: ["/api/ai/companion-chat"],
  });
  await page.route("**/api/ai/companion-chat", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"E2E mock failure"}' }),
  );
  await page.goto("/app.html");
  await page.locator("#tab-mate").click();
  await expect(page.locator("#companionHome")).toBeVisible();

  await page.locator("#tab-today").click();
  await page.locator("[data-open-companion-chat]").click();
  await expect(page.locator("#companionChatSheet")).toBeVisible();
  await page.locator("[data-energy='tired']").click();
  await expect(page.locator("#companionChatSheet")).toBeVisible();
  const beforePlan = await readStored(page, "omwExecutionPlan");
  const beforeEnergy = await readStored(page, "omwOllieEnergy");

  await page.locator("#sendCompanionMessage").click();
  await expect(page.locator("#companionChatResponse")).toContainText("한 줄만");
  const longMessage = `긴 메시지 첫 줄\n${"계획을 작게 줄여 주세요. ".repeat(20)}`;
  await page.locator("#companionChatInput").fill(longMessage);
  await page.locator("#sendCompanionMessage").dblclick();
  await expect(page.locator("#sendCompanionMessage")).toBeEnabled();
  await expect(page.locator("#companionChatResponse")).toContainText("답을 만들지 못했어요");
  const afterPlan = await readStored(page, "omwExecutionPlan");
  const afterEnergy = await readStored(page, "omwOllieEnergy");
  expect(afterPlan).toEqual(beforePlan);
  expect(afterEnergy.remaining).toBe(beforeEnergy.remaining);
  expect(await page.locator("#companionChatResponse").innerText()).not.toContain("AI로 만든");
  diagnostics.expectClean();
});

test("추가 에너지는 결제 성공처럼 처리되지 않는다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await page.goto("/app.html");
  const before = await readStored(page, "omwOllieEnergy");
  await page.locator("#openEnergyCharge").click();
  await expect(page.locator("#energyChargeSheet")).toBeVisible();
  await expect(page.locator("#energyChargeSheet .energy-pack")).toHaveCount(3);
  for (const button of await page.locator("#energyChargeSheet .energy-pack").all()) await expect(button).toBeDisabled();
  await expect(page.locator("#energyChargeSheet")).toContainText("실제 결제가 연결되기 전에는 에너지가 충전되지 않습니다");
  expect(await readStored(page, "omwOllieEnergy")).toEqual(before);
  diagnostics.expectClean();
});
