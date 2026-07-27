const { test, expect } = require("@playwright/test");
const {
  createUsageResponse,
  mockAccountExperience,
  monitorPage,
  prepareApp,
  readStored,
  waitForAppReady,
} = require("./helpers");

/* 오늘 계획을 한 번에 완료해 축하 치어링을 발화시킨다. 완료 버튼은 오늘 도구 안에 접혀 있다. */
async function completeToday(page) {
  await page.locator("#todayTools summary").click();
  await page.locator("#completeTodayButton").click();
}

test("로그인 회원이 오늘 전부 완료하면 올리가 AI로 축하하고, 에너지는 차감되지 않는다", async ({ page }) => {
  const cheerRequests = [];
  await prepareApp(page);
  await mockAccountExperience(page, {
    user: { id: "usr_cheer", provider: "google", name: "치어링테스터", email: "cheer@example.com", plan: "pro", role: "member" },
    usage: createUsageResponse({ plan: "pro", dailyUsed: 0, monthlyUsed: 0 }),
  });
  // 무료 치어링은 재화를 쓰지 않으므로 서버도 usage를 돌려주지 않는다 (돌려주면 잔량이 흔들린다).
  await page.route("**/api/ai/companion-chat", (route) => {
    cheerRequests.push(route.request().postDataJSON());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, headline: "E2E 최고예요!", reply: "오늘 전부 해냈어요. 이 흐름 올리가 기억할게요!", chargedCredits: 0 }),
    });
  });
  const diagnostics = monitorPage(page);

  await page.goto("/app.html");
  await waitForAppReady(page);
  await expect(page.locator("#ollieEnergyBalance")).toHaveText("250 / 250");

  await completeToday(page);

  // 축하 요청이 celebrate 이벤트로 전송되고 코치 카드가 AI 축하로 바뀐다
  await expect(page.locator("#dailyCoachKicker")).toContainText("OLLIE CHEER", { timeout: 10_000 });
  await expect(page.locator("#dailyCoachTitle")).toHaveText("E2E 최고예요!");
  expect(cheerRequests).toHaveLength(1);
  expect(cheerRequests[0].eventType).toBe("celebrate");
  expect(cheerRequests[0].context.todayCompletion).toBe(100);

  // 무료 치어링은 올리 에너지를 차감하지 않는다
  await expect(page.locator("#ollieEnergyBalance")).toHaveText("250 / 250");

  const cheerState = await readStored(page, "omwCheerState");
  expect(cheerState.celebrate.source).toBe("ai");
  expect(cheerState.celebrate.headline).toBe("E2E 최고예요!");

  // 새로고침해도 오늘의 축하가 유지되고, API를 다시 호출하지 않는다
  await page.reload();
  await waitForAppReady(page);
  await expect(page.locator("#dailyCoachKicker")).toContainText("OLLIE CHEER");
  await expect(page.locator("#dailyCoachTitle")).toHaveText("E2E 최고예요!");
  expect(cheerRequests).toHaveLength(1);
  diagnostics.expectClean();
});

test("게스트는 API 호출 없이 로컬 축하 문구를 받는다", async ({ page }) => {
  const cheerRequests = [];
  await prepareApp(page);
  await page.route("**/api/ai/companion-chat", (route) => {
    cheerRequests.push(route.request().url());
    return route.fulfill({ status: 401, contentType: "application/json", body: '{"ok":false,"error":"login required"}' });
  });
  const diagnostics = monitorPage(page);

  await page.goto("/app.html");
  await waitForAppReady(page);
  await completeToday(page);

  await expect(page.locator("#dailyCoachKicker")).toContainText("OLLIE CHEER", { timeout: 10_000 });
  const cheerState = await readStored(page, "omwCheerState");
  expect(cheerState.celebrate.source).toBe("local");
  expect(String(cheerState.celebrate.reply).length).toBeGreaterThan(5);
  // 게스트에게는 AI를 시도조차 하지 않는다 (서버가 401을 줄 요청을 만들지 않는다)
  expect(cheerRequests).toHaveLength(0);
  await expect(page.locator("#ollieEnergyBalance")).toHaveText("로그인 필요");
  diagnostics.expectClean();
});
