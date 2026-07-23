const { expect } = require("@playwright/test");
const path = require("path");

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
  const trialStartedAt = trialActive ? new Date(Date.now() - 60 * 1000).toISOString() : null;
  const trialEndsAt = trialActive ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
  return {
    ok: true,
    schemaVersion: 1,
    policyVersion: "2026-07-15.v1",
    timeZone: "Asia/Seoul",
    plan,
    planLabel: plan === "trial" ? "무료 체험 중" : plan === "pro" ? "Pro" : "Free",
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
  await expect.poll(async () => {
    try {
      return await page.locator("body").evaluate((body) => [
        body.dataset.authReady,
        body.dataset.authState,
        body.dataset.pricingReady,
      ].join("|"));
    } catch (error) {
      return "navigation|pending|navigation";
    }
  }, { timeout: 15_000 }).toMatch(/^true\|(anonymous|member|error)\|true$/);
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
    const startedAt = Date.now();
    const expiresAt = startedAt + 24 * 60 * 60 * 1000;
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

function isExpectedFirefoxNavigationImageAbort({
  browserName,
  errorText,
  method,
  navigationLinked,
  pagePathname,
  pathname,
  resourceType,
  sameOrigin,
}) {
  return browserName === "firefox" &&
    errorText === "NS_BINDING_ABORTED" &&
    method === "GET" &&
    navigationLinked === true &&
    pagePathname === "/app.html" &&
    pathname === "/assets/logo-ollie-symbol.png" &&
    resourceType === "image" &&
    sameOrigin === true;
}

function isCompletedRumNavigationLifecycle({
  errorText,
  method,
  navigationCommitted,
  pathname,
  priorSuccessfulStatus,
  resourceType,
  sameOrigin,
}) {
  return sameOrigin === true &&
    method === "POST" &&
    pathname === "/cdn-cgi/rum" &&
    resourceType === "ping" &&
    errorText === "net::ERR_ABORTED" &&
    Number.isInteger(priorSuccessfulStatus) &&
    priorSuccessfulStatus >= 200 &&
    priorSuccessfulStatus < 300 &&
    navigationCommitted === true;
}

function monitorPage(page, { allowedConsoleMessages = [], allowedResponseUrls = [] } = {}) {
  const issues = [];
  const browserName = page.context().browser()?.browserType().name() || "";
  const monitorStartedAt = Date.now();
  const analyticsRequests = new Map();
  const analyticsTimeline = [];
  const analyticsNavigationAborts = [];
  const expectedNavigationLogoRequests = new WeakSet();
  const seenNavigationLogoRequests = new Set();
  let mainNavigationSequence = 0;
  let lastCommittedPathname = "";
  const recordAnalyticsEvent = (event, details = {}) => {
    analyticsTimeline.push({
      elapsedMs: Date.now() - monitorStartedAt,
      event,
      ...details,
    });
  };
  const isSameOriginRumRequest = (request) => {
    try {
      const requestUrl = new URL(request.url());
      const pageUrl = new URL(page.url());
      return request.method() === "POST" &&
        requestUrl.origin === pageUrl.origin &&
        requestUrl.pathname === "/cdn-cgi/rum";
    } catch {
      return false;
    }
  };
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      mainNavigationSequence += 1;
      lastCommittedPathname = new URL(frame.url()).pathname;
      recordAnalyticsEvent("main-frame-navigated", { pathname: lastCommittedPathname });
    }
  });
  page.on("request", (request) => {
    if (isSameOriginRumRequest(request)) {
      analyticsRequests.set(request, {
        state: "started",
        pathname: lastCommittedPathname,
      });
      recordAnalyticsEvent("rum-request-started", {
        method: request.method(),
        pathname: "/cdn-cgi/rum",
        resourceType: request.resourceType(),
      });
    }
    if (mainNavigationSequence === 0 || request.method() !== "GET" || request.resourceType() !== "image") return;
    try {
      const requestUrl = new URL(request.url());
      const pageUrl = new URL(page.url());
      if (requestUrl.origin !== pageUrl.origin || pageUrl.pathname !== "/app.html" || requestUrl.pathname !== "/assets/logo-ollie-symbol.png") return;
      if (seenNavigationLogoRequests.has(mainNavigationSequence)) return;
      seenNavigationLogoRequests.add(mainNavigationSequence);
      expectedNavigationLogoRequests.add(request);
    } catch {}
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (allowedConsoleMessages.some((pattern) => message.text().includes(pattern))) return;
    issues.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText || "";
    let pendingRumNavigationAbort = null;
    if (analyticsRequests.has(request)) {
      const requestState = analyticsRequests.get(request);
      const priorSuccessfulRequest = [...analyticsRequests.values()].find((entry) =>
        entry.pathname === requestState.pathname &&
        entry.state === "finished" &&
        Number.isInteger(entry.status) &&
        entry.status >= 200 &&
        entry.status < 300
      );
      pendingRumNavigationAbort = {
        elapsedMs: Date.now() - monitorStartedAt,
        errorText,
        method: request.method(),
        pathname: "/cdn-cgi/rum",
        priorSuccessfulStatus: priorSuccessfulRequest?.status,
        resourceType: request.resourceType(),
        sameOrigin: true,
        sourcePathname: requestState.pathname,
      };
      analyticsRequests.set(request, { ...requestState, state: "failed", errorText });
      analyticsNavigationAborts.push(pendingRumNavigationAbort);
      recordAnalyticsEvent("rum-request-failed", {
        method: request.method(),
        pathname: "/cdn-cgi/rum",
        errorText,
        priorSuccessfulStatus: pendingRumNavigationAbort.priorSuccessfulStatus,
        sourcePathname: pendingRumNavigationAbort.sourcePathname,
      });
    }
    const isNavigationCancellation =
      errorText.includes("net::ERR_ABORTED") || /Load request cancel(?:l)?ed/i.test(errorText);
    let isCanceledStaticImage = false;
    let isCanceledFunnelEvent = false;
    let isCanceledStartupRequest = false;
    let isExpectedFirefoxLogoAbort = false;
    try {
      const requestUrl = new URL(request.url());
      const pageUrl = new URL(page.url());
      const isSameOrigin = requestUrl.origin === pageUrl.origin;
      isExpectedFirefoxLogoAbort = isExpectedFirefoxNavigationImageAbort({
        browserName,
        errorText,
        method: request.method(),
        navigationLinked: expectedNavigationLogoRequests.has(request),
        pagePathname: pageUrl.pathname,
        pathname: requestUrl.pathname,
        resourceType: request.resourceType(),
        sameOrigin: isSameOrigin,
      });
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
    if (pendingRumNavigationAbort &&
      pendingRumNavigationAbort.method === "POST" &&
      pendingRumNavigationAbort.pathname === "/cdn-cgi/rum" &&
      pendingRumNavigationAbort.resourceType === "ping" &&
      pendingRumNavigationAbort.errorText === "net::ERR_ABORTED") return;
    if (isExpectedFirefoxLogoAbort || isCanceledStaticImage || isCanceledFunnelEvent || isCanceledStartupRequest) return;
    issues.push(`requestfailed: ${request.method()} ${request.url()} ${errorText}`);
  });
  page.on("response", (response) => {
    const analyticsRequest = response.request();
    if (analyticsRequests.has(analyticsRequest)) {
      const prior = analyticsRequests.get(analyticsRequest);
      analyticsRequests.set(analyticsRequest, { ...prior, state: "responded", status: response.status() });
      recordAnalyticsEvent("rum-response", {
        method: analyticsRequest.method(),
        pathname: "/cdn-cgi/rum",
        status: response.status(),
      });
    }
    if (response.status() < 400) return;
    if (allowedResponseUrls.some((pattern) => response.url().includes(pattern))) return;
    issues.push(`response ${response.status()}: ${response.url()}`);
  });
  page.on("requestfinished", (request) => {
    if (!analyticsRequests.has(request)) return;
    const prior = analyticsRequests.get(request);
    analyticsRequests.set(request, { ...prior, state: "finished" });
    recordAnalyticsEvent("rum-request-finished", {
      method: request.method(),
      pathname: "/cdn-cgi/rum",
      status: prior.status,
    });
  });
  page.on("close", () => recordAnalyticsEvent("page-closed"));
  page.context().on("close", () => recordAnalyticsEvent("context-closed"));
  return {
    issues,
    analyticsTimeline,
    mark(label) {
      recordAnalyticsEvent("test-checkpoint", { label });
    },
    expectClean() {
      for (const abort of analyticsNavigationAborts) {
        const navigationCommitted = analyticsTimeline.some((entry) =>
          entry.event === "main-frame-navigated" &&
          entry.elapsedMs >= abort.elapsedMs &&
          entry.pathname !== abort.sourcePathname
        );
        const completedLifecycle = isCompletedRumNavigationLifecycle({
          ...abort,
          navigationCommitted,
        });
        recordAnalyticsEvent("rum-navigation-lifecycle-checked", {
          completed: completedLifecycle,
          pathname: abort.pathname,
          priorSuccessfulStatus: abort.priorSuccessfulStatus,
        });
        if (!completedLifecycle) {
          issues.push(`requestfailed: ${abort.method} ${abort.pathname} ${abort.errorText}`);
        }
      }
      const timeline = analyticsTimeline.map((entry) => JSON.stringify(entry)).join("\n");
      expect(issues, [issues.join("\n"), "Analytics lifecycle:", timeline].filter(Boolean).join("\n")).toEqual([]);
    },
    getAnalyticsSummary() {
      return {
        completedStatuses: [...analyticsRequests.values()]
          .filter((entry) => entry.state === "finished" && Number.isInteger(entry.status))
          .map((entry) => entry.status),
        lifecycleAbortCount: analyticsNavigationAborts.length,
        cspFailureCount: analyticsNavigationAborts.filter((entry) => /csp/i.test(entry.errorText)).length,
      };
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

async function captureAcceptance(page, testInfo, name) {
  const outputDir = process.env.ACCEPTANCE_CAPTURE_DIR;
  if (!outputDir) return;
  const width = page.viewportSize()?.width || "auto";
  await page.screenshot({
    path: path.join(outputDir, `${testInfo.project.name}-${width}-${name}.png`),
    fullPage: true,
  });
}

async function readStored(page, key) {
  return page.evaluate((storageKey) => {
    const value = localStorage.getItem(storageKey);
    return value == null ? null : JSON.parse(value);
  }, key);
}

module.exports = {
  AI_CREDIT_COSTS,
  captureAcceptance,
  createUsageResponse,
  expectNoDuplicateIds,
  expectNoHorizontalOverflow,
  isCompletedRumNavigationLifecycle,
  isExpectedFirefoxNavigationImageAbort,
  mockAccountExperience,
  mockExternalAssets,
  monitorPage,
  prepareApp,
  waitForBootstrap,
  waitForAppReady,
  readStored,
  testPlan,
};
