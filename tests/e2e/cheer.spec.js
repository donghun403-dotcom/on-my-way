const { test, expect } = require("@playwright/test");
const { monitorPage, prepareApp, readStored } = require("./helpers");

test("로그인 회원이 오늘 전부 완료하면 올리가 AI로 축하하고, 에너지는 차감되지 않는다", async ({ page }) => {
  const cheerRequests = [];
  await prepareApp(page);
  await page.route("**/api/ai/companion-chat", async (route) => {
    cheerRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ headline: "E2E 최고예요!", reply: "오늘 전부 해냈어요. 이 흐름 올리가 기억할게요!" }),
    });
  });
  const diagnostics = monitorPage(page);

  // 데모 로그인으로 회원 상태 만들기 (첫 로그인이라 게스트 계획·체험을 이어받는다)
  await page.goto("/api/auth/start?provider=kakao&redirect=%2Fapp.html");
  await page.locator("#devName").fill("치어링테스터");
  await page.locator("#devLoginForm button[type='submit']").click();
  await expect(page).toHaveURL(/app\.html/);
  await expect(page.locator("#view-today")).toBeVisible();
  await expect(page.locator("#ollieEnergyBalance")).toHaveText("10 / 10");

  await page.locator("#completeTodayButton").click();

  // 축하 요청이 celebrate 이벤트로 전송되고 코치 카드가 AI 축하로 바뀐다
  await expect(page.locator("#dailyCoachKicker")).toContainText("OLLIE CHEER", { timeout: 10_000 });
  await expect(page.locator("#dailyCoachTitle")).toHaveText("E2E 최고예요!");
  expect(cheerRequests).toHaveLength(1);
  expect(cheerRequests[0].eventType).toBe("celebrate");
  expect(cheerRequests[0].context.todayCompletion).toBe(100);

  // 무료 치어링은 올리 에너지를 차감하지 않는다
  await expect(page.locator("#ollieEnergyBalance")).toHaveText("10 / 10");

  const cheerState = await readStored(page, "omwCheerState");
  expect(cheerState.celebrate.source).toBe("ai");

  // 새로고침해도 오늘의 축하가 유지되고, API를 다시 호출하지 않는다
  await page.reload();
  await expect(page.locator("#dailyCoachKicker")).toContainText("OLLIE CHEER");
  await expect(page.locator("#dailyCoachTitle")).toHaveText("E2E 최고예요!");
  expect(cheerRequests).toHaveLength(1);
  diagnostics.expectClean();
});

test("게스트(레거시 체험)는 API 호출 없이 로컬 축하 문구를 받는다", async ({ page }) => {
  const cheerRequests = [];
  await prepareApp(page);
  await page.route("**/api/ai/companion-chat", (route) => {
    cheerRequests.push(route.request().url());
    return route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"login required"}' });
  });
  const diagnostics = monitorPage(page);

  await page.goto("/app.html");
  await page.locator("#completeTodayButton").click();

  await expect(page.locator("#dailyCoachKicker")).toContainText("OLLIE CHEER", { timeout: 10_000 });
  const cheerState = await readStored(page, "omwCheerState");
  expect(cheerState.celebrate.source).toBe("local");
  expect(String(cheerState.celebrate.reply).length).toBeGreaterThan(5);
  expect(cheerRequests).toHaveLength(0);
  await expect(page.locator("#ollieEnergyBalance")).toHaveText("10 / 10");
  diagnostics.expectClean();
});
