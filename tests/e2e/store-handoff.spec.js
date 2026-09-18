/* 웹 → Play 인계.

   웹에서는 구독할 방법이 없다(/api/health의 payments가 false). 그런데 웹에는 앱으로
   가는 링크도 없어서, 사려는 사람이 "Pro 시작하기"를 눌러도 비활성 버튼과 "출시 준비 중"
   이라는 (이미 출시된 제품에 대한) 거짓 안내를 만난다. 여기서 보는 것은 그 막다른 길이
   사라졌는지다.

   판별은 플랫폼이 아니라 "여기서 살 수 있는가"로 한다 — 다리(window.OmwBilling)가 있으면
   앱 안이므로 인계하지 않는다. 그래서 가짜 다리는 store-billing.spec.js와 같은 이유로
   페이지 스크립트보다 먼저 들어가야 한다. */
const { test, expect } = require("@playwright/test");
const { createUsageResponse, mockAccountExperience, prepareApp, waitForAppReady } = require("./helpers");

const PLAY_URL = "https://play.google.com/store/apps/details?id=com.olivenrich.onmyway";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const HANDOFF_USER = {
  id: "usr_handoff",
  provider: "google",
  name: "인계 테스트",
  email: "handoff@example.com",
  plan: "expired",
  role: "member",
  trialStartedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
  trialUsedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
  trialExpiresAt: Date.now() - 24 * 60 * 60 * 1000,
};

async function prepare(page, { plan = "expired", bridge = false, trialEligible = false } = {}) {
  await prepareApp(page);
  if (bridge) {
    await page.addInitScript(() => {
      window.OmwBilling = { purchase() {}, restore() {} };
    });
  }
  await mockAccountExperience(page, {
    user: { ...HANDOFF_USER, plan },
    usage: createUsageResponse({ plan, paywallEnabled: true, trialEligible }),
    paymentsEnabled: false,
  });
}

test.describe("안드로이드 웹", () => {
  test.use({ userAgent: ANDROID_UA });

  /* #pricingProCta는 앵커가 아니라 버튼이라 href가 아니라 클릭으로 움직인다.
     그래서 속성이 아니라 "어디로 가려 했는가"를 본다 — 실제 스토어로 나가지 않도록
     가로채 둔다. */
  test("가격 화면의 Pro 버튼이 Play 스토어로 보낸다", async ({ page }) => {
    await prepare(page);
    const navigated = [];
    await page.route("**play.google.com/**", async (route) => {
      navigated.push(route.request().url());
      await route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>store</body></html>" });
    });
    await page.goto("/index.html#pricing");
    const cta = page.locator("#pricingProCta");
    await expect(cta).toHaveText("Google Play에서 구독하기");
    await expect(cta).toHaveAttribute("aria-disabled", "false");
    await cta.click();
    await expect.poll(() => navigated[0]).toBe(PLAY_URL);
  });

  /* 잠금 화면의 앵커는 웹에서 index.html#pricing으로 간다. 거기서 또 막히면
     잠금 → 가격 → 막다른 길이 되므로 목적지까지 한 번에 보낸다. */
  test("잠금 화면 버튼이 Play로 바로 간다", async ({ page }) => {
    await prepare(page);
    await page.goto("/app.html");
    await waitForAppReady(page);
    const action = page.locator("#trialPaywallAction");
    await expect(action).toHaveAttribute("href", PLAY_URL);
    await expect(action).toHaveText("Google Play에서 계속하기");
  });
});

test.describe("아이폰 웹", () => {
  test.use({ userAgent: IPHONE_UA });

  test("Play를 권하지 않고 안드로이드 전용임을 밝힌다", async ({ page }) => {
    await prepare(page);
    await page.goto("/index.html#pricing");
    const cta = page.locator("#pricingProCta");
    await expect(cta).toHaveText("안드로이드 앱에서 구독");
    await expect(cta).toHaveAttribute("aria-disabled", "true");
  });

  /* 이미 출시된 제품을 두고 준비 중이라고 말하면, 사려는 사람을 그 자리에서 돌려보낸다. */
  test("출시 준비 중이라고 말하지 않는다", async ({ page }) => {
    await prepare(page);
    await page.goto("/index.html#pricing");
    await expect(page.locator("body")).not.toContainText("출시 준비 중");
  });

  test("잠금 화면이 안드로이드 전용임을 밝히고 링크를 주지 않는다", async ({ page }) => {
    await prepare(page);
    await page.goto("/app.html");
    await waitForAppReady(page);
    const action = page.locator("#trialPaywallAction");
    await expect(action).toHaveText("지금은 안드로이드 앱에서만 구독할 수 있어요");
    await expect(action).not.toHaveAttribute("href", /.*/);
  });
});

/* 앱 안에서는 이 인계가 아무것도 하지 않아야 한다 — 이미 그 자리에서 살 수 있고,
   앵커는 위임 리스너가 결제창으로 연결한다. */
test.describe("앱 안", () => {
  test.use({ userAgent: ANDROID_UA });

  test("다리가 있으면 앵커를 건드리지 않는다", async ({ page }) => {
    await prepare(page, { bridge: true });
    await page.goto("/app.html");
    await waitForAppReady(page);
    await expect(page.locator("#trialPaywallAction")).toHaveText("Pro 시작하기");
  });
});
