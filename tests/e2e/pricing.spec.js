const { test, expect } = require("@playwright/test");
const {
  AI_CREDIT_COSTS,
  createUsageResponse,
  expectNoHorizontalOverflow,
  formatPriceSymbol,
  formatPriceWon,
  mockAccountExperience,
  monitorPage,
  readProPriceKRW,
  waitForBootstrap,
  waitForAppReady,
} = require("./helpers");

// 화면에 보이는 금액 표기. 정책과 어긋나면 여기서 잡힌다.
const VISIBLE_PRICE = /₩\s*\d{1,3},\d{3}|\d{1,3},\d{3}\s*원/g;

test("비로그인 가격표는 확정 정책과 체험 조건을 표시하고 결제로 오인시키지 않는다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await mockAccountExperience(page);
  await page.goto("/index.html#pricing");
  await waitForBootstrap(page);

  const pricing = page.locator("#pricing");
  const freeCard = page.locator("#pricingFreeCard");
  const proCard = page.locator("#pricingProCard");
  await expect(pricing).toBeVisible();
  await expect(page.locator("#pricingPolicyStatus")).toContainText("무료 체험과 Pro 정책을 확인했어요");
  const proPrice = await readProPriceKRW(page);
  await expect(page.locator("#pricingFreePrice")).toHaveText("₩0");
  await expect(page.locator("#pricingProPrice")).toHaveText(formatPriceSymbol(proPrice));
  // 체험 카드는 종료 시점과 체험 크레딧을 말한다. 폐지된 Free의 월 한도는 더 이상 없다.
  await expect(freeCard.locator('[data-policy-field="trial-duration"]').first()).toHaveText("가입 다음 날 밤 11시 59분까지");
  await expect(freeCard.locator('[data-policy-field="trial-credits"]')).toHaveText("15개");
  await expect(freeCard).toContainText("결제 수단을 받지 않으니");
  await expect(freeCard).toContainText("Pro를 결제해야 AI 기능을 이어서 쓸 수 있어요");
  await expect(proCard.locator('[data-policy-field="monthly-credits"]')).toHaveText("250개");
  await expect(proCard.locator('[data-policy-field="daily-limit"]')).toHaveText("30크레딧");
  await expect(proCard.locator('[data-policy-field="trial-duration"]')).toHaveText("가입 다음 날 밤 11시 59분까지");
  await expect(proCard.locator('[data-policy-field="trial-credits"]')).toHaveText("15개");

  /* 가격표가 광고하는 행동만 값을 싣는다. 값 목록을 통째로 비교하지 않고 화면이 고른 행동의
     값이 정책과 같은지 본다 — 표에 무엇을 싣느냐는 화면의 결정이다. */
  const creditCosts = pricing.locator("[data-policy-cost]");
  await expect(creditCosts).toHaveCount(5);
  const advertised = await creditCosts.evaluateAll((nodes) => nodes.map((node) => node.dataset.policyCost));
  await expect(creditCosts).toHaveText(advertised.map((action) => `${AI_CREDIT_COSTS[action]}크레딧`));
  await expect(pricing.getByText("매일 축하·위로")).toBeVisible();

  /* 북과 인쇄·PDF는 PRO 전용이다. 비교표의 체험 칸에 "제공"이나 "무료"가 남아 있으면
     표시광고법 문제가 되므로 두 줄을 문자열로 고정한다. */
  const bookRow = pricing.locator(".pricing-comparison-row", { hasText: "올리의 북 만들기" });
  await expect(bookRow).toContainText("Pro 전용");
  await expect(bookRow).toContainText(`에너지 ${AI_CREDIT_COSTS.diary_book}`);
  await expect(pricing.locator(".pricing-comparison-row", { hasText: "인쇄·PDF 저장" })).toContainText("Pro 전용");
  // 무료 쪽은 .md 텍스트 하나뿐이다.
  await expect(pricing.locator(".pricing-comparison-row", { hasText: "원본 내보내기" })).toContainText("종료 후에도 무료");
  // 폐지한 약속이 남아 있으면 여기서 걸린다.
  expect(await pricing.innerText()).not.toMatch(/월 1권 무료|체험 종료 편지|올리의 편지가 도착/);

  const pricingCopy = await pricing.innerText();
  // 라우트가 사라진 기능을 가격표가 계속 광고하지 않는지 함께 고정한다.
  expect(pricingCopy).not.toMatch(/300\s*(?:에너지|크레딧)|올리 에너지|AI 무제한|무제한 AI|추가 에너지|주간 최적화|목표 전체 재설계|새 목표 계획 생성|오늘의 한 걸음 생성/);
  // 가격표에 보이는 금액은 전부 정책 값이어야 한다. 다른 숫자가 남아 있으면 여기서 걸린다.
  expect(pricingCopy.match(VISIBLE_PRICE) || []).toEqual([formatPriceSymbol(proPrice)]);
  await expect(page.locator("#pricingPaymentState")).toContainText("운영 결제는 비활성화");
  await expect(page.locator("#pricingProCta")).toHaveText("무료 체험 시작하기");
  await expectNoHorizontalOverflow(page);

  await page.locator("#pricingProCta").click();
  await expect(page).toHaveURL(/app\.html/);
  await waitForAppReady(page);
  await expect(page.locator("#authSheet")).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]auth=/);
  diagnostics.expectClean();
});

test("체험이 끝난 사용자는 서버 사용량 progress와 결제 비활성 CTA를 본다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountExperience(page, {
    user: { id: "usr_pricing", provider: "google", name: "가격표 테스트", email: "pricing@example.com", plan: "expired", role: "member" },
    usage: createUsageResponse({ plan: "expired", dailyUsed: 1, monthlyUsed: 3, trialEligible: false }),
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
  await waitForBootstrap(page);

  const usagePanel = page.locator("#pricingUsagePanel");
  await expect(usagePanel).toBeVisible();
  await expect(page.locator("#pricingUsagePlan")).toHaveText("이용 종료");
  /* 체험이 끝난 계정은 어느 카드의 '현재 플랜'도 아니다 — 머무를 수 있는 무료 티어가 없기 때문이다.
     체험 카드는 다시 시작할 수 없다는 사실을 버튼으로 말한다. */
  await expect(page.locator("#pricingFreeCard")).toHaveAttribute("aria-current", "false");
  await expect(page.locator("#pricingFreeCard [data-current-plan-label]")).toBeHidden();
  await expect(page.locator("#pricingFreeCta")).toHaveText("무료 체험 종료됨");
  await expect(page.locator("#pricingFreeCta")).toHaveAttribute("aria-disabled", "true");
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

test("체험 자격이 남은 회원은 무료 체험을 한 번 시작한 뒤 같은 CTA로 Pro 결제에 진입한다", async ({ page }) => {
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
    user: { id: "usr_trial_conversion", provider: "google", name: "무료 체험 회원", email: "trial@example.com", plan: "expired", role: "member" },
    usage: createUsageResponse({ plan: "expired", trialEligible: true }),
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
  await waitForBootstrap(page);

  const proCta = page.locator("#pricingProCta");
  await expect(page.locator("#pricingUsagePlan")).toHaveText("이용 종료");
  await expect(proCta).toHaveText("무료 체험 시작");
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
  const proPrice = await readProPriceKRW(page);
  await expect(page.locator("#billingConfirmButton")).toHaveText(`${formatPriceWon(proPrice)} 결제하고 Pro 시작`);
  await expect(page.locator("#billingConfirmTitle")).toHaveText(`월 ${formatPriceWon(proPrice)}으로 Pro를 시작할까요?`);
  // 결제 동의 화면의 금액은 서버가 청구할 금액과 같은 정책에서 나와야 한다.
  expect((await billingDialog.innerText()).match(VISIBLE_PRICE) || []).toEqual([
    formatPriceWon(proPrice),
    formatPriceWon(proPrice),
  ]);
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
  await expect.poll(() => page.evaluate(() => window.__billingAuthCalls.length)).toBe(1);

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
  await waitForBootstrap(page);

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

  const usageLoaded = page.waitForResponse((response) =>
    response.request().method() === "GET" && new URL(response.url()).pathname === "/api/ai/usage" && response.status() === 200,
  );
  await page.goto("/index.html#pricing");
  await Promise.all([
    waitForBootstrap(page),
    usageLoaded.then((response) => response.finished()),
  ]);

  const proCta = page.locator("#pricingProCta");
  await expect(page.locator("#pricingUsagePlan")).toHaveText("Pro");
  await expect(page.locator("#pricingProCard")).toHaveAttribute("aria-current", "true");
  await expect(proCta).toHaveText("현재 이용 중");
  await expect(proCta).toBeDisabled();
  await proCta.evaluate((button) => button.click());
  expect(billingRequests).toEqual([]);
  diagnostics.expectClean();
});

test("앱 화면의 PRO 금액은 모두 정책 값 하나를 따른다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountExperience(page, {
    user: { id: "usr_price_copy", provider: "google", name: "가격 문구 회원", email: "price-copy@example.com", plan: "expired", role: "member" },
    usage: createUsageResponse({ plan: "expired", trialEligible: false }),
    paymentsEnabled: false,
  });
  await page.goto("/app.html");
  await waitForAppReady(page);

  const proPrice = await readProPriceKRW(page);
  await page.locator("#menuToggle").click();
  await page.locator("#drawerMyPage").click();
  await expect(page.locator("#myPageSheet")).toBeVisible();
  // 정책이 붙기 전 자리표시자("월 요금 확인 중")가 그대로 남지 않는지까지 본다.
  await expect(page.locator("#myPageSubscribe em")).toHaveText(`월 ${formatPriceSymbol(proPrice)}`);

  const visible = (await page.locator("body").innerText()).match(VISIBLE_PRICE) || [];
  const wrong = visible.filter((token) => token !== formatPriceSymbol(proPrice) && token !== formatPriceWon(proPrice));
  expect(wrong).toEqual([]);
  diagnostics.expectClean();
});

test("FAQ는 명확한 레이블과 네이티브 키보드 토글을 제공한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountExperience(page);
  await page.goto("/index.html#pricing");
  await waitForBootstrap(page);

  const faq = page.locator(".pricing-faq");
  await expect(faq).toHaveAttribute("aria-labelledby", "pricingFaqTitle");
  await expect(faq.locator("details")).toHaveCount(6);
  /* 무료 내보내기와 유료 북이 다른 것임을 FAQ에서도 밝힌다 — 둘을 같은 것으로 읽으면
     "이미 무료인데 왜 돈을 내나"라는 오해가 생긴다. */
  await expect(faq).toContainText("내보내기와 올리의 북은 어떻게 다른가요?");
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

/* 원장을 읽지 못하면 서버는 숫자 대신 degraded 상태를 보낸다(worker.mjs의 unavailableUsage).
   폐지한 KV 레코드를 대신 읽으면 "그럴듯하지만 틀린" 잔량이 나오기 때문이다.
   화면은 그때 숫자를 만들어 내지 말고 못 읽는다는 사실을 말해야 한다 —
   0으로 두면 잔량이 없다고 거짓말하고, "확인 중"으로 두면 영영 로딩처럼 보인다. */
test("원장을 읽지 못하면 잔량 자리에 숫자 대신 확인 불가를 보여 준다", async ({ page }) => {
  await mockAccountExperience(page, {
    user: {
      id: "usr_degraded",
      provider: "google",
      name: "원장 장애",
      email: "degraded@example.com",
      plan: "pro",
      role: "member",
    },
    // 서버가 실제로 내보내는 모양: 잔량 없음, 플랜 판정은 그대로.
    usage: {
      available: false,
      degraded: true,
      reason: "ENERGY_LEDGER_UNAVAILABLE",
      plan: "pro",
      planLabel: "Pro",
      paywallEnabled: false,
    },
  });
  await page.goto("/app.html");
  await waitForAppReady(page);

  await expect(page.locator("#ollieEnergyBalance")).toHaveText("확인 불가");
  // 잔량처럼 읽히는 "N / M" 표기가 남아 있으면 안 된다.
  await expect(page.locator("#ollieEnergyBalance")).not.toHaveText(/\d+\s*\/\s*\d+/);
  // 만료가 아니므로 잠금 화면은 뜨지 않는다 — 판정은 degraded에도 실려 온다.
  await expect(page.locator("#trialPaywall")).toBeHidden();
});
