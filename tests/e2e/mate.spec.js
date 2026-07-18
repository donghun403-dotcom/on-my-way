const { test, expect } = require("@playwright/test");
const { AI_CREDIT_COSTS, createUsageResponse, mockAccountExperience, monitorPage, prepareApp, readStored, waitForAppReady } = require("./helpers");

async function prepareMate(page, usage = createUsageResponse({ plan: "free", dailyUsed: 0, monthlyUsed: 1, trialEligible: false })) {
  await prepareApp(page);
  await mockAccountExperience(page, {
    user: { id: "usr_mate", provider: "google", name: "메이트 테스트", email: "mate@example.com", plan: "free", role: "member" },
    usage,
  });
}

async function openMateApp(page) {
  await page.goto("/app.html");
  await waitForAppReady(page);
}

test("올리 대화 실패를 안전하게 안내하고 계획을 자동 적용하지 않는다", async ({ page }) => {
  await prepareMate(page);
  const diagnostics = monitorPage(page, {
    allowedConsoleMessages: ["status of 503"],
    allowedResponseUrls: ["/api/ai/companion-chat"],
  });
  await page.route("**/api/ai/companion-chat", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: "E2E mock failure",
        code: "UPSTREAM_UNAVAILABLE",
        usage: createUsageResponse({ plan: "free", dailyUsed: 0, monthlyUsed: 1, trialEligible: false }),
      }),
    }),
  );
  await openMateApp(page);
  await page.locator("#tab-mate").click();
  await expect(page.locator("#companionHome")).toBeVisible();

  await page.locator("#tab-today").click();
  await page.locator("[data-open-companion-chat]").click();
  await expect(page.locator("#companionChatSheet")).toBeVisible();
  await page.locator("[data-energy='tired']").click();
  await expect(page.locator("#companionChatSheet")).toBeVisible();
  const beforePlan = await readStored(page, "omwExecutionPlan");
  await expect(page.locator("#ollieEnergyBalance")).toHaveText("4 / 5");
  const beforeCredits = await page.locator("#ollieEnergyBalance").innerText();

  await page.locator("#sendCompanionMessage").click();
  await expect(page.locator("#companionChatResponse")).toContainText("한 줄만");
  const longMessage = `긴 메시지 첫 줄\n${"계획을 작게 줄여 주세요. ".repeat(20)}`;
  await page.locator("#companionChatInput").fill(longMessage);
  await page.locator("#sendCompanionMessage").dblclick();
  await expect(page.locator("#sendCompanionMessage")).toBeEnabled();
  await expect(page.locator("#companionChatResponse")).toContainText("E2E mock failure");
  await expect(page.locator("#companionChatResponse")).toContainText("확정 차감되지 않아요");
  const afterPlan = await readStored(page, "omwExecutionPlan");
  expect(afterPlan).toEqual(beforePlan);
  await expect(page.locator("#ollieEnergyBalance")).toHaveText(beforeCredits);
  expect(await readStored(page, "omwOllieEnergy")).toBeNull();
  expect(await page.locator("#companionChatResponse").innerText()).not.toContain("AI로 만든");
  diagnostics.expectClean();
});

test("AI 크레딧 안내는 서버 제공량과 기능별 비용만 표시하고 구매 상태를 만들지 않는다", async ({ page }) => {
  await prepareMate(page);
  const diagnostics = monitorPage(page);
  await openMateApp(page);
  await expect(page.locator("#ollieEnergyBalance")).toHaveText("4 / 5");
  const beforeCredits = await page.locator("#ollieEnergyBalance").innerText();
  await page.getByRole("button", { name: "AI 크레딧 이용 안내" }).click();
  const creditDialog = page.getByRole("dialog", { name: "AI 크레딧 이용 안내" });
  await expect(creditDialog).toBeVisible();
  await expect(creditDialog.locator(".credit-cost-summary > span")).toHaveCount(6);
  const costValues = creditDialog.locator("[data-ai-credit-cost]");
  await expect(costValues).toHaveText(Object.values(AI_CREDIT_COSTS).map(String));
  await expect(creditDialog.locator(".energy-pack")).toHaveCount(0);
  await expect(creditDialog).toContainText("추가 크레딧 판매는 현재 제공하지 않습니다");
  await expect(page.locator("#ollieEnergyBalance")).toHaveText(beforeCredits);
  expect(await readStored(page, "omwOllieEnergy")).toBeNull();
  diagnostics.expectClean();
});

test("Free 일일 한도를 모두 쓰면 올리 API를 호출하지 않고 초기화 시점을 안내한다", async ({ page }) => {
  await prepareMate(page, createUsageResponse({ plan: "free", dailyUsed: 2, monthlyUsed: 2, trialEligible: false }));
  const diagnostics = monitorPage(page);
  let apiCalls = 0;
  await page.route("**/api/ai/companion-chat", (route) => {
    apiCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, reply: "호출되면 안 되는 응답", chargedCredits: 1 }),
    });
  });
  await openMateApp(page);
  await page.locator("[data-open-companion-chat]").first().click();
  await page.locator("#companionChatInput").fill("오늘 할 일을 작게 정리해 줘");
  await page.locator("#sendCompanionMessage").click();

  await expect(page.locator(".app-toast")).toContainText("오늘 사용할 수 있는 크레딧이 부족");
  await expect(page.locator(".app-toast")).toContainText("다시 제공돼요");
  await expect(page.getByRole("dialog", { name: "AI 크레딧 이용 안내" })).toBeVisible();
  expect(apiCalls).toBe(0);
  diagnostics.expectClean();
});

test("Free 월간 크레딧을 모두 쓰면 올리 API를 호출하지 않고 다음 제공 시점을 안내한다", async ({ page }) => {
  await prepareMate(page, createUsageResponse({ plan: "free", dailyUsed: 0, monthlyUsed: 5, trialEligible: false }));
  const diagnostics = monitorPage(page);
  let apiCalls = 0;
  await page.route("**/api/ai/companion-chat", (route) => {
    apiCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, reply: "호출되면 안 되는 응답", chargedCredits: 1 }),
    });
  });
  await openMateApp(page);
  await page.locator("[data-open-companion-chat]").first().click();
  await page.locator("#companionChatInput").fill("이번 달 계획을 확인해 줘");
  await page.locator("#sendCompanionMessage").click();

  await expect(page.locator(".app-toast")).toContainText("이번 달 AI 크레딧이 부족");
  await expect(page.locator(".app-toast")).toContainText("다시 제공돼요");
  await expect(page.getByRole("dialog", { name: "AI 크레딧 이용 안내" })).toBeVisible();
  expect(apiCalls).toBe(0);
  diagnostics.expectClean();
});
