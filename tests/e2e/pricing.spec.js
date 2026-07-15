const { test, expect } = require("@playwright/test");
const {
  AI_CREDIT_COSTS,
  createUsageResponse,
  expectNoHorizontalOverflow,
  mockAccountExperience,
  monitorPage,
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
  await expect(proCta).toHaveText("Pro 출시 준비 중");
  await expect(proCta).toBeDisabled();
  await expect(proCta).toHaveAttribute("aria-disabled", "true");
  await proCta.evaluate((button) => button.click());
  expect(paymentRequests).toEqual([]);
  expect(tossSdkRequests).toEqual([]);
  await expect(page.locator("#pricingPaymentState")).toContainText("실제 결제는 발생하지 않습니다");
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
