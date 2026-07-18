const { expect } = require("@playwright/test");

const testPlan = {
  goal: "E2E 목표 완주하기",
  period: 7,
  routineTime: "아침",
  routineReadiness: "계획이 있으면 실행해요",
  style: { title: "루틴 점검형" },
  firstAction: "첫 행동 10분 실행하기",
  coachMessage: "작게 시작해요.",
  planSource: "local-template",
  createdAt: "2026-07-13T00:00:00.000Z",
};

const AI_CREDIT_COSTS = {
  companion_chat: 1,
  create_daily_step: 2,
  revise_plan: 2,
  recovery_plan: 3,
  create_plan: 4,
  reschedule_plan: 4,
};

const AI_ACTION_LABELS = {
  companion_chat: "올리와 지금 대화",
  create_daily_step: "오늘의 한 걸음 생성",
  revise_plan: "계획 일부 수정",
  recovery_plan: "회복 계획 생성",
  create_plan: "새 목표 계획 생성",
  reschedule_plan: "전체 일정 재조정",
};

function createUsageResponse({
  plan = "free",
  dailyUsed = 0,
  monthlyUsed = 0,
  trialEligible = plan === "free",
  trialActive = plan === "trial",
} = {}) {
  const dailyLimit = plan === "free" ? 2 : 30;
  const monthlyLimit = plan === "free" ? 5 : plan === "trial" ? 15 : 250;
  const trialStartedAt = trialActive ? "2026-07-15T00:00:00.000Z" : null;
  const trialEndsAt = trialActive ? "2026-07-16T00:00:00.000Z" : null;
  return {
    ok: true,
    schemaVersion: 1,
    policyVersion: "2026-07-15.v1",
    timeZone: "Asia/Seoul",
    plan,
    planLabel: plan === "trial" ? "Pro 체험" : plan === "pro" ? "Pro" : "Free",
    trial: {
      eligible: trialEligible,
      active: trialActive,
      startedAt: trialStartedAt,
      endsAt: trialEndsAt,
      remainingCredits: trialActive ? Math.max(0, monthlyLimit - monthlyUsed) : 0,
    },
    daily: {
      used: dailyUsed,
      reserved: 0,
      limit: dailyLimit,
      remaining: Math.max(0, dailyLimit - dailyUsed),
      resetsAt: "2026-07-15T15:00:00.000Z",
    },
    monthly: {
      used: monthlyUsed,
      reserved: 0,
      limit: monthlyLimit,
      remaining: Math.max(0, monthlyLimit - monthlyUsed),
      resetsAt: trialEndsAt || "2026-07-31T15:00:00.000Z",
    },
    creditCosts: { ...AI_CREDIT_COSTS },
    actionLabels: { ...AI_ACTION_LABELS },
    actionUsage: {},
    metrics: {
      apiCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      chargedCredits: monthlyUsed,
      totalTokens: 0,
      estimatedCostUsd: 0,
    },
  };
}

async function mockExternalAssets(page) {
  await page.route("https://js.tosspayments.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: "window.TossPayments = undefined;" }),
  );
  await page.route("https://fastly.jsdelivr.net/**", (route) =>
    route.fulfill({ status: 204, contentType: "font/woff", body: "" }),
  );
  await page.route("**/api/funnel", (route) => route.fulfill({ status: 204, body: "" }));
}

async function prepareApp(page, storage = {}) {
  await mockExternalAssets(page);
  await page.addInitScript(
    ({ plan, overrides }) => {
      if (sessionStorage.getItem("__omw_e2e_seeded") === "true") return;
      localStorage.clear();
      localStorage.setItem("omwExecutionPlan", JSON.stringify(plan));
      for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) continue;
        localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      }
      sessionStorage.setItem("__omw_e2e_seeded", "true");
    },
    { plan: testPlan, overrides: storage },
  );
}

async function waitForAppReady(page) {
  await expect(page.locator("body")).toHaveAttribute("data-app-ready", "true", { timeout: 15_000 });
}

async function waitForBootstrap(page) {
  await expect(page.locator("body")).toHaveAttribute("data-auth-ready", "true", { timeout: 15_000 });
  await expect(page.locator("body")).toHaveAttribute("data-auth-state", /^(anonymous|member|error)$/);
  await expect(page.locator("body")).toHaveAttribute("data-pricing-ready", "true", { timeout: 15_000 });
}

async function mockAccountExperience(page, {
  user = null,
  usage = user ? createUsageResponse({ plan: user.plan || "free" }) : null,
  paymentsEnabled = false,
} = {}) {
  await mockExternalAssets(page);
  const state = { user, usage, paymentsEnabled, accountState: {}, revision: 0 };

  await page.route("**/api/auth/providers", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ providers: ["kakao", "naver", "google", "apple"].map((id) => ({ id, configured: true })) }),
  }));
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user: state.user }),
  }));
  await page.route("**/api/auth/logout", (route) => {
    state.user = null;
    state.usage = null;
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await page.route("**/api/health", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, services: { payments: state.paymentsEnabled } }),
  }));
  await page.route("**/api/ai/usage", (route) => {
    if (!state.user || !state.usage) {
      return route.fulfill({ status: 401, contentType: "application/json", body: '{"ok":false,"error":"로그인이 필요합니다."}' });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state.usage) });
  });
  await page.route("**/api/ai/trial/start", (route) => {
    if (!state.user || !state.usage) {
      return route.fulfill({ status: 401, contentType: "application/json", body: '{"ok":false,"error":"로그인이 필요합니다."}' });
    }
    if (state.usage.plan === "trial" && state.usage.trial?.active) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, started: false, idempotent: true, user: state.user, usage: state.usage }),
      });
    }
    const startedAt = Date.parse("2026-07-15T00:00:00.000Z");
    const expiresAt = Date.parse("2026-07-16T00:00:00.000Z");
    state.user = { ...state.user, plan: "trial", trialStartedAt: startedAt, trialExpiresAt: expiresAt };
    state.usage = createUsageResponse({ plan: "trial", trialEligible: false, trialActive: true });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, started: true, idempotent: false, user: state.user, usage: state.usage }),
    });
  });
  await page.route("**/api/account/state", (route) => {
    if (!state.user) {
      return route.fulfill({ status: 401, contentType: "application/json", body: '{"ok":false,"error":"로그인이 필요합니다."}' });
    }
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ state: state.accountState, revision: state.revision, updatedAt: Date.now() }),
      });
    }
    const body = route.request().postDataJSON();
    state.accountState = body.state || {};
    state.revision += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: state.revision, updatedAt: Date.now() }),
    });
  });

  return state;
}

function monitorPage(page, { allowedConsoleMessages = [], allowedResponseUrls = [] } = {}) {
  const issues = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (allowedConsoleMessages.some((pattern) => message.text().includes(pattern))) return;
    issues.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText || "";
    const isNavigationCancellation =
      errorText.includes("net::ERR_ABORTED") || /Load request cancel(?:l)?ed/i.test(errorText);
    let isCanceledStaticImage = false;
    let isCanceledFunnelEvent = false;
    let isCanceledStartupRequest = false;
    try {
      const requestUrl = new URL(request.url());
      const pageUrl = new URL(page.url());
      const isSameOrigin = requestUrl.origin === pageUrl.origin;
      isCanceledStaticImage =
        isNavigationCancellation &&
        request.resourceType() === "image" &&
        isSameOrigin &&
        requestUrl.pathname.startsWith("/assets/");
      isCanceledFunnelEvent =
        isNavigationCancellation &&
        isSameOrigin &&
        request.method() === "POST" &&
        requestUrl.pathname === "/api/funnel";
      isCanceledStartupRequest =
        isNavigationCancellation &&
        isSameOrigin &&
        request.method() === "GET" &&
        ["/api/health", "/plan-policy.mjs"].includes(requestUrl.pathname);
    } catch {}
    if (isCanceledStaticImage || isCanceledFunnelEvent || isCanceledStartupRequest) return;
    issues.push(`requestfailed: ${request.method()} ${request.url()} ${errorText}`);
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    if (allowedResponseUrls.some((pattern) => response.url().includes(pattern))) return;
    issues.push(`response ${response.status()}: ${response.url()}`);
  });
  return {
    issues,
    expectClean() {
      expect(issues, issues.join("\n")).toEqual([]);
    },
  };
}

async function expectNoDuplicateIds(page) {
  const duplicates = await page.evaluate(() => {
    const counts = new Map();
    document.querySelectorAll("[id]").forEach((element) => counts.set(element.id, (counts.get(element.id) || 0) + 1));
    return [...counts.entries()].filter(([, count]) => count > 1);
  });
  expect(duplicates).toEqual([]);
}

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(Math.max(dimensions.body, dimensions.document)).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function readStored(page, key) {
  return page.evaluate((storageKey) => {
    const value = localStorage.getItem(storageKey);
    return value == null ? null : JSON.parse(value);
  }, key);
}

module.exports = {
  AI_CREDIT_COSTS,
  createUsageResponse,
  expectNoDuplicateIds,
  expectNoHorizontalOverflow,
  mockAccountExperience,
  mockExternalAssets,
  monitorPage,
  prepareApp,
  waitForBootstrap,
  waitForAppReady,
  readStored,
  testPlan,
};
