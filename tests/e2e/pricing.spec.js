const { test, expect } = require("@playwright/test");
const {
  AI_CREDIT_COSTS,
  createUsageResponse,
  expectNoHorizontalOverflow,
  mockAccountExperience,
  monitorPage,
  waitForBootstrap,
} = require("./helpers");

test("비로그인 가격표는 확정 정책과 체험 조건을 표시하고 결제로 오인시키지 않는다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await mockAccountExperience(page);
  await page.goto("/index.html#pricing");

  const pricing = page.locator("#pricing");
  const freeCard = page.locator("#pricingFreeCard");
  const proCard = page.locator("#pricingProCard");
  await expect(pricing).toBeVisible();
  await expect(page.locator("#pricingPolicyStatus")).toContainText("Free와 Pro 정책을 확인했어요");
  await expect(page.locator("#pricingFreePrice")).toHaveText("₩0");
  await expect(page.locator("#pricingProPrice")).toHaveText("₩4,900");
  await expect(freeCard.locator('[data-policy-field="monthly-credits"]')).toHaveText("5개");
  await expect(freeCard.locator('[data-policy-field="daily-limit"]')).toHaveText("2크레딧");
  await expect(proCard.locator('[data-policy-field="monthly-credits"]')).toHaveText("250개");
  await expect(proCard.locator('[data-policy-field="daily-limit"]')).toHaveText("30크레딧");
  await expect(proCard.locator('[data-policy-field="trial-duration"]')).toHaveText("24시간");
  await expect(proCard.locator('[data-policy-field="trial-credits"]')).toHaveText("15개");

  const creditCosts = pricing.locator("[data-policy-cost]");
  await expect(creditCosts).toHaveCount(6);
  await expect(creditCosts).toHaveText(Object.values(AI_CREDIT_COSTS).map((cost) => `${cost}크레딧`));

  const pricingCopy = await pricing.innerText();
  expect(pricingCopy).not.toMatch(/2,900|300\s*(?:에너지|크레딧)|올리 에너지|AI 무제한|무제한 AI|추가 에너지|주간 최적화|목표 전체 재설계/);
  await expect(page.locator("#pricingPaymentState")).toContainText("운영 결제는 비활성화");
  await expect(page.locator("#pricingProCta")).toHaveText("무료 체험 시작하기");
  await expectNoHorizontalOverflow(page);

  await page.locator("#pricingProCta").click();
  await expect(page).toHaveURL(/app\.html/);
  await expect(page.locator("#authSheet")).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]auth=/);
  diagnostics.expectClean();
});

test("로그인 Free 사용자는 서버 사용량 progress와 결제 비활성 CTA를 본다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountExperience(page, {
    user: { id: "usr_pricing", provider: "google", name: "가격표 테스트", email: "pricing@example.com", plan: "free", role: "member" },
    usage: createUsageResponse({ plan: "free", dailyUsed: 1, monthlyUsed: 3, trialEligible: false }),
    paymentsEnabled: false,
  });
  const paymentRequests = [];
  const tossSdkRequests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/\/api\/(?:billing|subscription|payments?)/.test(url.pathname)) paymentRequests.push(request.url());
    if (url.hostname === "js.tosspayments.com") tossSdkRequests.push(request.url());
  });
  await page.goto("/index.html#pricing");

  const usagePanel = page.locator("#pricingUsagePanel");
  await expect(usagePanel).toBeVisible();
  await expect(page.locator("#pricingUsagePlan")).toHaveText("Free");
  await expect(page.locator("#pricingFreeCard")).toHaveAttribute("aria-current", "true");
  await expect(page.locator("#pricingFreeCard [data-current-plan-label]")).toBeVisible();
  await expect(page.locator('[data-policy-usage="daily.used"]')).toHaveText("1");
  await expect(page.locator('[data-policy-usage="daily.limit"]')).toHaveText("2");
  await expect(page.locator('[data-policy-usage="monthly.used"]')).toHaveText("3");
  await expect(page.locator('[data-policy-usage="monthly.limit"]')).toHaveText("5");

  const dailyProgress = page.locator("#pricingDailyProgress");
  const monthlyProgress = page.locator("#pricingMonthlyProgress");
  await expect(dailyProgress).toHaveAttribute("role", "progressbar");
  await expect(dailyProgress).toHaveAttribute("aria-valuenow", "1");
  await expect(dailyProgress).toHaveAttribute("aria-valuemax", "2");
  await expect(dailyProgress).toHaveAttribute("aria-valuetext", /2크레딧 중 1크레딧 사용, 1크레딧 남음/);
  await expect(monthlyProgress).toHaveAttribute("aria-valuenow", "3");
  await expect(monthlyProgress).toHaveAttribute("aria-valuemax", "5");
  await expect(monthlyProgress).toHaveAttribute("aria-valuetext", /5크레딧 중 3크레딧 사용, 2크레딧 남음/);

  const proCta = page.locator("#pricingProCta");
  await expect(proCta).toHaveText("Pro 시작하기");
  await expect(proCta).toBeDisabled();
  await expect(proCta).toHaveAttribute("aria-disabled", "true");
  await proCta.evaluate((button) => button.click());
  expect(paymentRequests).toEqual([]);
  expect(tossSdkRequests).toEqual([]);
  await expect(page.locator("#pricingPaymentState")).toContainText("실제 결제는 발생하지 않습니다");
  diagnostics.expectClean();
});

test("Free 회원은 무료 체험을 한 번 시작한 뒤 같은 CTA로 Pro 결제에 진입한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await page.addInitScript(() => {
    window.__billingAuthCalls = [];
    window.TossPayments = (clientKey) => ({
      payment: ({ customerKey }) => ({
        requestBillingAuth: async (options) => {
          window.__billingAuthCalls.push({
            clientKey,
            customerKey,
            method: options.method,
            successUrl: options.successUrl,
            failUrl: options.failUrl,
          });
        },
      }),
    });
  });
  await mockAccountExperience(page, {
    user: { id: "usr_trial_conversion", provider: "google", name: "무료 체험 회원", email: "trial@example.com", plan: "free", role: "member" },
    usage: createUsageResponse({ plan: "free", trialEligible: true }),
    paymentsEnabled: true,
  });
  await page.route("**/api/billing/config", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      configured: true,
      enabled: true,
      environment: "test",
      clientKey: "test_ck_BROWSER_FIXTURE",
      customerKey: "omw_BROWSER_FIXTURE",
      demo: false,
    }),
  }));
  let trialStartRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/ai/trial/start") trialStartRequests += 1;
  });

  await page.goto("/index.html#pricing");

  const proCta = page.locator("#pricingProCta");
  await expect(page.locator("#pricingUsagePlan")).toHaveText("Free");
  await expect(proCta).toHaveText("24시간 무료 체험 시작");
  await proCta.click();

  await expect(page.locator("#pricingUsagePlan")).toHaveText("무료 체험 중");
  await expect(page.locator("#pricingFreeCard")).toHaveAttribute("aria-current", "true");
  await expect(page.locator("#pricingProCard")).toHaveAttribute("aria-current", "false");
  await expect(page.locator("#pricingFreeCard [data-current-plan-label]")).toHaveText("무료 체험 중");
  await expect(page.locator("#pricingTrialUsage")).toContainText("남은 시간");
  await expect(proCta).toHaveText("지금 Pro로 전환하기");
  await expect(proCta).toBeEnabled();
  await proCta.click();

  const billingDialog = page.locator("#billingConfirmDialog");
  await expect(billingDialog).toBeVisible();
  await expect(page.locator("#billingConfirmButton")).toHaveText("4,900원 결제하고 Pro 시작");
  await expect(page.locator("#billingContinueTrialButton")).toHaveText("체험 계속하기");
  await page.locator("#billingContinueTrialButton").click();
  await expect(billingDialog).not.toBeVisible();
  expect(await page.evaluate(() => window.__billingAuthCalls)).toEqual([]);

  await proCta.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(billingDialog).toBeVisible();
  await page.locator("#billingConfirmButton").click();
  await expect(billingDialog).not.toBeVisible();

  const billingCalls = await page.evaluate(() => window.__billingAuthCalls);
  expect(trialStartRequests).toBe(1);
  expect(billingCalls).toHaveLength(1);
  expect(billingCalls[0]).toMatchObject({ method: "CARD" });
  expect(new URL(billingCalls[0].successUrl).searchParams.get("billing")).toBe("success");
  expect(new URL(billingCalls[0].failUrl).searchParams.get("billing")).toBe("fail");
  diagnostics.expectClean();
});

test("무료 체험 중 결제가 비활성이면 체험은 유지하고 Pro 결제 CTA를 비활성화한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountExperience(page, {
    user: { id: "usr_trial_disabled", provider: "google", name: "체험 유지 회원", email: "trial-disabled@example.com", plan: "trial", role: "member" },
    usage: createUsageResponse({ plan: "trial", trialEligible: false, trialActive: true }),
    paymentsEnabled: false,
  });
  const accountRequests = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/billing/") || path === "/api/ai/trial/start") accountRequests.push(path);
  });

  await page.goto("/index.html#pricing");

  const proCta = page.locator("#pricingProCta");
  await expect(page.locator("#pricingUsagePlan")).toHaveText("무료 체험 중");
  await expect(page.locator("#pricingTrialUsage")).toBeVisible();
  await expect(page.locator("#pricingTrialUsage")).toContainText(/남은 시간\s+\d+(?:시간|분)/);
  await expect(proCta).toHaveText("Pro 결제 준비 중");
  await expect(proCta).toBeDisabled();
  await proCta.evaluate((button) => button.click());
  expect(accountRequests).toEqual([]);
  diagnostics.expectClean();
});

test("무료 체험 중 결제 인증을 취소하면 체험 상태를 유지하고 승인 API를 호출하지 않는다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const usage = createUsageResponse({ plan: "trial", trialEligible: false, trialActive: true });
  await mockAccountExperience(page, {
    user: {
      id: "usr_trial_cancel",
      provider: "google",
      name: "결제 취소 회원",
      email: "trial-cancel@example.com",
      plan: "trial",
      role: "member",
      trialStartedAt: Date.parse(usage.trial.startedAt),
      trialExpiresAt: Date.parse(usage.trial.endsAt),
    },
    usage,
    paymentsEnabled: true,
  });
  const activationRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/billing/activate") activationRequests.push(request.url());
  });

  await page.goto("/app.html?billing=fail");
  await waitForBootstrap(page);

  await expect(page.locator("#drawerPlanBadge")).toHaveText("무료 체험 중");
  await expect(page.locator("#trialStatusBanner")).toBeVisible();
  await expect(page.locator("#trialTimeRemaining")).toContainText("남음");
  await expect(page).not.toHaveURL(/[?&]billing=/);
  expect(activationRequests).toEqual([]);
  diagnostics.expectClean();
});

test("무료 체험 중 결제가 성공하면 최신 서버 사용량을 읽고 즉시 Pro 상태로 전환한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const trialUsage = createUsageResponse({ plan: "trial", trialEligible: false, trialActive: true });
  const account = await mockAccountExperience(page, {
    user: {
      id: "usr_trial_success",
      provider: "google",
      name: "결제 성공 회원",
      email: "trial-success@example.com",
      plan: "trial",
      role: "member",
      trialStartedAt: Date.parse(trialUsage.trial.startedAt),
      trialExpiresAt: Date.parse(trialUsage.trial.endsAt),
    },
    usage: trialUsage,
    paymentsEnabled: true,
  });
  let activationRequests = 0;
  await page.route("**/api/billing/activate", (route) => {
    activationRequests += 1;
    account.user = {
      ...account.user,
      plan: "pro",
      subscriptionStatus: "active",
      trialEndedAt: Date.now(),
      proSince: Date.now(),
    };
    account.usage = createUsageResponse({ plan: "pro", trialEligible: false });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: account.user }),
    });
  });

  await page.goto("/app.html?billing=success&authKey=browser-fixture&customerKey=browser-fixture");
  await waitForBootstrap(page);

  await expect(page.locator("#drawerPlanBadge")).toHaveText("Pro");
  await expect(page.locator("#trialStatusBanner")).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]billing=/);
  expect(activationRequests).toBe(1);
  diagnostics.expectClean();
});

test("유료 Pro 회원은 현재 이용 중 상태로 중복 결제를 막는다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountExperience(page, {
    user: { id: "usr_paid_pro", provider: "google", name: "유료 Pro 회원", email: "pro@example.com", plan: "pro", subscriptionStatus: "active", role: "member" },
    usage: createUsageResponse({ plan: "pro", trialEligible: false }),
    paymentsEnabled: true,
  });
  const billingRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/billing/")) billingRequests.push(request.url());
  });

  await page.goto("/index.html#pricing");

  const proCta = page.locator("#pricingProCta");
  await expect(page.locator("#pricingUsagePlan")).toHaveText("Pro");
  await expect(page.locator("#pricingProCard")).toHaveAttribute("aria-current", "true");
  await expect(proCta).toHaveText("현재 이용 중");
  await expect(proCta).toBeDisabled();
  await proCta.evaluate((button) => button.click());
  expect(billingRequests).toEqual([]);
  diagnostics.expectClean();
});

test("FAQ는 명확한 레이블과 네이티브 키보드 토글을 제공한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountExperience(page);
  await page.goto("/index.html#pricing");

  const faq = page.locator(".pricing-faq");
  await expect(faq).toHaveAttribute("aria-labelledby", "pricingFaqTitle");
  await expect(faq.locator("details")).toHaveCount(5);
  const firstDetails = faq.locator("details").first();
  const firstSummary = firstDetails.locator("summary");
  await expect(firstSummary).toHaveAccessibleName(/AI 크레딧은 무엇인가요\?/);
  await firstSummary.focus();
  await expect(firstSummary).toBeFocused();
  await expect(firstDetails).not.toHaveAttribute("open", "");
  await page.keyboard.press("Enter");
  await expect(firstDetails).toHaveAttribute("open", "");
  await page.keyboard.press("Space");
  await expect(firstDetails).not.toHaveAttribute("open", "");
  diagnostics.expectClean();
});
