/* 스토어 결제 배선 — 셸(안드로이드 앱) 안에서만 사는 경로.

   이 파일은 실제로 돈이 사라진 사고에서 나왔다. 테스트 결제가 성공하고 구글이
   SUBSCRIPTION_PURCHASED 알림까지 보냈는데 entitlements 테이블이 비어 있었다.
   /api/billing/google/verify가 한 번도 불리지 않았기 때문이다 — 결제창을 띄운 채
   앱을 벗어나 있는 동안 화면의 180초 대기가 먼저 끝났고, 뒤늦게 도착한 결과를
   "기다리는 쪽이 없다"며 버렸다. 유저는 돈을 내고 권한이 없었다.

   그래서 여기서 보는 것은 화면이 아니라 토큰의 행방이다. 어떤 경로로 오든
   purchaseToken은 서버에 도착해야 한다.

   셸을 흉내 내는 방법: script.js는 평가 시점에 window.OmwBilling을 잡으므로 가짜 다리는
   페이지 스크립트보다 먼저 들어가야 한다. addInitScript가 그 자리다. */
const { test, expect } = require("@playwright/test");
const {
  createUsageResponse,
  mockAccountExperience,
  prepareApp,
  waitForAppReady,
} = require("./helpers");

const STORE_USER = {
  id: "usr_store",
  provider: "google",
  name: "결제 테스트",
  email: "store@example.com",
  plan: "expired",
  role: "member",
  trialStartedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
  trialUsedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
  trialExpiresAt: Date.now() - 24 * 60 * 60 * 1000,
};

async function prepare(page, { bridge = true, restoreReply = null, plan = "expired" } = {}) {
  await prepareApp(page);
  if (bridge) {
    await page.addInitScript((reply) => {
      window.__omwFake = { calls: [], purchaseReply: null, restoreReply: reply };
      window.OmwBilling = {
        purchase(productId, basePlanId) {
          window.__omwFake.calls.push(`purchase:${productId}:${basePlanId}`);
          const payload = window.__omwFake.purchaseReply;
          if (payload) setTimeout(() => window.__omwBilling(payload), 0);
        },
        restore() {
          window.__omwFake.calls.push("restore");
          const payload = window.__omwFake.restoreReply;
          if (payload) setTimeout(() => window.__omwBilling(payload), 0);
        },
      };
    }, restoreReply);
  }

  /* 웹 카드 결제(토스)는 꺼져 있다. 실제 프로덕션이 그렇고 — /api/health의 payments는
     false다 — 셸에서는 앞으로도 그렇다. 다리의 존재만으로 결제가 켜져야 한다. */
  await mockAccountExperience(page, {
    user: { ...STORE_USER, plan },
    usage: createUsageResponse({ plan, paywallEnabled: true, trialEligible: false }),
    paymentsEnabled: false,
  });

  const verified = [];
  await page.route("**/api/billing/google/verify", async (route) => {
    verified.push(JSON.parse(route.request().postData() || "{}"));
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });

  await page.goto("/app.html");
  await waitForAppReady(page);
  return { verified };
}

/* 기기에서 처음 드러난 증상. 버튼이 죽은 게 아니라 disabled였다 — 모든 Pro CTA의 잠금은
   paymentsEnabled 하나가 정하고, 그 값은 웹 카드 결제 연동 여부라 셸에서는 늘 false다. */
test("다리가 있으면 Pro 버튼이 눌린다", async ({ page }) => {
  await prepare(page);
  await expect(page.locator("#drawerUpgrade")).not.toBeDisabled();
});

test("다리가 없으면 웹 그대로 잠겨 있다", async ({ page }) => {
  await prepare(page, { bridge: false });
  await expect(page.locator("#drawerUpgrade")).toBeDisabled();
});

test("구매 버튼이 스토어를 부르고 토큰을 서버로 보낸다", async ({ page }) => {
  const { verified } = await prepare(page);
  await page.evaluate(() => {
    window.__omwFake.purchaseReply = { event: "purchased", purchases: [{ purchaseToken: "tok_direct" }] };
  });

  await page.locator("#trialPaywallAction").click();

  await expect.poll(() => verified.map((body) => body.purchaseToken)).toEqual(["tok_direct"]);
  expect(await page.evaluate(() => window.__omwFake.calls)).toContain("purchase:pro_monthly:monthly");
});

/* 사고 그 자체. 결제창을 띄운 뒤 앱을 벗어나 있으면 대기가 먼저 끝나고, 결과는 아무도
   기다리지 않는 상태로 도착한다. 그때 토큰을 버리면 돈만 나간다. */
test("기다리는 쪽이 없어도 토큰을 버리지 않는다", async ({ page }) => {
  const { verified } = await prepare(page);

  await page.evaluate(() => {
    window.__omwBilling({ event: "purchased", purchases: [{ purchaseToken: "tok_late" }] });
  });

  await expect.poll(() => verified.map((body) => body.purchaseToken)).toEqual(["tok_late"]);
});

/* 결과 콜백은 안 올 수도 있다 — 앱이 죽거나, 기기를 바꿨거나, 지웠다 깔았거나.
   구글이 진실을 쥐고 있으니 열 때마다 한 번 물어본다. */
test("앱을 열면 스토어에 기존 구매를 물어본다", async ({ page }) => {
  const { verified } = await prepare(page, {
    restoreReply: { event: "restored", purchases: [{ purchaseToken: "tok_restored" }] },
  });

  await expect.poll(() => verified.map((body) => body.purchaseToken)).toEqual(["tok_restored"]);
  expect(await page.evaluate(() => window.__omwFake.calls)).toContain("restore");
});

/* 복원은 조용한 확인이라 결과를 기다리지 않는다. 기다리면 대기 자리 하나를 쥐게 되고,
   다리가 답하지 않는 동안(출처 검사에 걸리거나 클라이언트가 안 붙었을 때) 유저가 누른
   구매가 BUSY로 막힌다 — 결제 버튼이 3분 동안 죽는다. */
test("답 없는 복원이 구매를 막지 않는다", async ({ page }) => {
  const { verified } = await prepare(page, { restoreReply: null });
  await page.evaluate(() => {
    window.__omwFake.purchaseReply = { event: "purchased", purchases: [{ purchaseToken: "tok_after_silent_restore" }] };
  });

  await page.locator("#trialPaywallAction").click();

  await expect.poll(() => verified.map((body) => body.purchaseToken)).toEqual(["tok_after_silent_restore"]);
});
