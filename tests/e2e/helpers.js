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

const PRODUCTION_CUSTOM_ORIGIN = "https://onmyway.olivenrich.com";
const CLOUDFLARE_BEACON_ORIGIN = "https://static.cloudflareinsights.com";
const RUM_XHR_NAVIGATION_WINDOW_MS = 100;

function isCloudflareBeaconScriptUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === CLOUDFLARE_BEACON_ORIGIN &&
      (url.pathname === "/beacon.min.js" || url.pathname.startsWith("/beacon.min.js/"));
  } catch {
    return false;
  }
}

function classifyRumXhrNavigationLifecycle({
  canceled,
  consoleCspErrorCount,
  contextClosedEpochMs,
  destinationCommittedEpochMs,
  destinationDocumentUrl,
  destinationFrameId,
  destinationLoaderId,
  errorText,
  failedEpochMs,
  hiddenEpochMs,
  initiatorScriptUrls,
  initiatorType,
  loadingFailed,
  loadingFinished,
  mainFrameId,
  method,
  pageClosedEpochMs,
  pagehideEpochMs,
  pathname,
  requestCspFailureCount,
  requestOrigin,
  requestStartedEpochMs,
  resourceType,
  responseStatus,
  sourceDocumentUrl,
  sourceFrameId,
  sourceLoaderId,
} = {}) {
  const elapsed = (later, earlier) => Number(later) - Number(earlier);
  const pagehideToRequestMs = elapsed(requestStartedEpochMs, pagehideEpochMs);
  const hiddenToRequestMs = elapsed(requestStartedEpochMs, hiddenEpochMs);
  const requestToAbortMs = elapsed(failedEpochMs, requestStartedEpochMs);
  const requestToCommitMs = elapsed(destinationCommittedEpochMs, requestStartedEpochMs);
  const hasLifecycleTiming = [pagehideToRequestMs, hiddenToRequestMs, requestToAbortMs, requestToCommitMs]
    .every((value) => Number.isFinite(value) && value >= 0 && value <= RUM_XHR_NAVIGATION_WINDOW_MS) &&
    Number(destinationCommittedEpochMs) >= Number(failedEpochMs);
  const closeDidNotCauseAbort = [pageClosedEpochMs, contextClosedEpochMs]
    .every((value) => value == null || Number(value) > Number(destinationCommittedEpochMs));
  const isCloudflareInitiated = initiatorType === "script" &&
    Array.isArray(initiatorScriptUrls) &&
    initiatorScriptUrls.some(isCloudflareBeaconScriptUrl);
  const navigationLifecycleCompleted = requestOrigin === PRODUCTION_CUSTOM_ORIGIN &&
    method === "POST" &&
    pathname === "/cdn-cgi/rum" &&
    resourceType === "xhr" &&
    errorText === "net::ERR_ABORTED" &&
    canceled === true &&
    loadingFailed === true &&
    loadingFinished === false &&
    responseStatus == null &&
    isCloudflareInitiated &&
    Boolean(sourceDocumentUrl) &&
    Boolean(destinationDocumentUrl) &&
    Boolean(sourceFrameId) &&
    sourceFrameId === mainFrameId &&
    destinationFrameId === mainFrameId &&
    Boolean(sourceLoaderId) &&
    Boolean(destinationLoaderId) &&
    sourceLoaderId !== destinationLoaderId &&
    hasLifecycleTiming &&
    closeDidNotCauseAbort &&
    consoleCspErrorCount === 0 &&
    requestCspFailureCount === 0;
  return {
    httpCompleted: false,
    navigationLifecycleCompleted,
    classification: navigationLifecycleCompleted
      ? "xhr-navigation-abort-classified"
      : "unclassified-failure",
  };
}

async function createChromiumRumLifecycleDiagnostics(page) {
  const browserName = page.context().browser()?.browserType().name() || "";
  const externalOrigin = (() => {
    try {
      return new URL(process.env.E2E_BASE_URL || "").origin;
    } catch {
      return "";
    }
  })();
  const startedAt = Date.now();
  const timeline = [];
  const rumRequests = new Map();
  const executionContexts = new Map();
  let session = null;

  const cleanUrl = (value) => {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    } catch {
      return String(value || "").split(/[?#]/, 1)[0];
    }
  };
  const isRumUrl = (value) => {
    try {
      const url = new URL(value);
      return Boolean(externalOrigin) &&
        url.origin === externalOrigin &&
        url.pathname === "/cdn-cgi/rum";
    } catch {
      return false;
    }
  };
  const record = (event, details = {}) => {
    timeline.push({
      elapsedMs: Date.now() - startedAt,
      epochMs: Date.now(),
      event,
      ...details,
    });
  };
  const initiatorScriptUrls = (initiator) => {
    const urls = [];
    const visit = (stack) => {
      for (const frame of stack?.callFrames || []) {
        if (frame?.url) urls.push(cleanUrl(frame.url));
      }
      if (stack?.parent) visit(stack.parent);
    };
    visit(initiator?.stack);
    return [...new Set(urls)];
  };
  const unsupported = {
    supported: false,
    timeline,
    markTestEnd() { record("test-ended"); },
    getSanitizedTimeline() { return [...timeline]; },
    getRumRequests() { return []; },
    classifyRumXhrNavigationAbort() {
      return {
        httpCompleted: false,
        navigationLifecycleCompleted: false,
        classification: "unclassified-failure",
      };
    },
    async dispose() {},
  };
  if (browserName !== "chromium" || !externalOrigin) return unsupported;

  await page.exposeBinding("__omwRumLifecycleEvent", ({ frame }, payload = {}) => {
    const allowedEvent = ["document-initialized", "pagehide", "visibilitychange-hidden"].includes(payload.event);
    if (!allowedEvent) return;
    record("dom-lifecycle", {
      lifecycleEvent: payload.event,
      documentUrl: cleanUrl(frame?.url() || payload.documentUrl),
      emittedAtEpochMs: Number(payload.emittedAtEpochMs || 0),
      visibilityState: payload.visibilityState === "hidden" ? "hidden" : "visible",
      persisted: payload.persisted === true,
    });
  });
  await page.addInitScript(() => {
    const emit = (event, extra = {}) => {
      const binding = globalThis.__omwRumLifecycleEvent;
      if (typeof binding !== "function") return;
      binding({
        event,
        documentUrl: location.origin + location.pathname,
        emittedAtEpochMs: Date.now(),
        visibilityState: document.visibilityState,
        ...extra,
      }).catch(() => {});
    };
    emit("document-initialized");
    addEventListener("pagehide", (event) => emit("pagehide", { persisted: event.persisted }), { capture: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") emit("visibilitychange-hidden");
    }, { capture: true });
  });

  session = await page.context().newCDPSession(page);
  await Promise.all([
    session.send("Network.enable"),
    session.send("Page.enable"),
    session.send("Runtime.enable"),
    session.send("Page.setLifecycleEventsEnabled", { enabled: true }),
  ]);
  session.on("Network.requestWillBeSent", (event) => {
    if (!isRumUrl(event.request?.url)) return;
    const entry = {
      requestId: event.requestId,
      requestEpochMs: Number(event.wallTime || 0) * 1000,
      requestTimestamp: Number(event.timestamp || 0),
      loaderId: event.loaderId || "",
      frameId: event.frameId || "",
      documentUrl: cleanUrl(event.documentURL),
      url: cleanUrl(event.request.url),
      method: event.request.method,
      resourceType: String(event.type || "").toLowerCase(),
      initiatorType: event.initiator?.type || "",
      initiatorScriptUrls: initiatorScriptUrls(event.initiator),
      responseStatus: null,
      loadingFinished: false,
      loadingFailed: false,
      errorText: "",
      canceled: false,
    };
    rumRequests.set(event.requestId, entry);
    record("cdp-rum-request-started", entry);
  });
  session.on("Network.responseReceived", (event) => {
    const entry = rumRequests.get(event.requestId);
    if (!entry) return;
    entry.responseStatus = event.response?.status ?? null;
    record("cdp-rum-response", { requestId: event.requestId, status: entry.responseStatus });
  });
  session.on("Network.loadingFinished", (event) => {
    const entry = rumRequests.get(event.requestId);
    if (!entry) return;
    entry.loadingFinished = true;
    entry.finishedEpochMs = entry.requestEpochMs + (Number(event.timestamp || 0) - entry.requestTimestamp) * 1000;
    record("cdp-rum-loading-finished", { requestId: event.requestId, finishedEpochMs: entry.finishedEpochMs });
  });
  session.on("Network.loadingFailed", (event) => {
    const entry = rumRequests.get(event.requestId);
    if (!entry) return;
    entry.loadingFailed = true;
    entry.errorText = event.errorText || "";
    entry.canceled = event.canceled === true;
    entry.failedEpochMs = entry.requestEpochMs + (Number(event.timestamp || 0) - entry.requestTimestamp) * 1000;
    record("cdp-rum-loading-failed", {
      requestId: event.requestId,
      errorText: entry.errorText,
      canceled: entry.canceled,
      failedEpochMs: entry.failedEpochMs,
    });
  });
  session.on("Page.frameNavigated", (event) => {
    if (event.frame?.parentId) return;
    record("cdp-main-frame-navigated", {
      frameId: event.frame.id || "",
      loaderId: event.frame.loaderId || "",
      documentUrl: cleanUrl(event.frame.url),
    });
  });
  session.on("Page.navigatedWithinDocument", (event) => {
    record("cdp-main-frame-navigated-within-document", {
      frameId: event.frameId || "",
      documentUrl: cleanUrl(event.url),
      navigationType: event.navigationType || "",
    });
  });
  session.on("Page.lifecycleEvent", (event) => {
    record("cdp-page-lifecycle", {
      frameId: event.frameId || "",
      loaderId: event.loaderId || "",
      lifecycleEvent: event.name || "",
      cdpTimestamp: Number(event.timestamp || 0),
    });
  });
  session.on("Runtime.executionContextCreated", (event) => {
    const context = event.context || {};
    executionContexts.set(context.id, {
      frameId: context.auxData?.frameId || "",
      isDefault: context.auxData?.isDefault === true,
      origin: cleanUrl(context.origin || ""),
    });
  });
  session.on("Runtime.executionContextDestroyed", (event) => {
    const context = executionContexts.get(event.executionContextId) || {};
    record("cdp-execution-context-destroyed", {
      executionContextId: event.executionContextId,
      frameId: context.frameId || "",
      isDefault: context.isDefault === true,
      origin: context.origin || "",
    });
    executionContexts.delete(event.executionContextId);
  });
  page.on("close", () => record("page-closed"));
  page.context().on("close", () => record("context-closed"));

  return {
    supported: true,
    timeline,
    markTestEnd() { record("test-ended"); },
    getSanitizedTimeline() { return [...timeline]; },
    getRumRequests() { return [...rumRequests.values()].map((entry) => ({ ...entry })); },
    classifyRumXhrNavigationAbort(abort, {
      consoleCspErrorCount = 0,
      requestCspFailureCount = 0,
    } = {}) {
      const failedCandidates = [...rumRequests.values()]
        .filter((entry) => entry.method === abort.method &&
          entry.resourceType === "xhr" &&
          entry.loadingFailed === true &&
          entry.errorText === abort.errorText &&
          Math.abs(Number(entry.failedEpochMs) - Number(abort.failureEpochMs)) <= RUM_XHR_NAVIGATION_WINDOW_MS)
        .sort((left, right) =>
          Math.abs(Number(left.failedEpochMs) - Number(abort.failureEpochMs)) -
          Math.abs(Number(right.failedEpochMs) - Number(abort.failureEpochMs))
        );
      if (failedCandidates.length !== 1) {
        return {
          httpCompleted: false,
          navigationLifecycleCompleted: false,
          classification: "unclassified-failure",
        };
      }
      const request = failedCandidates[0];
      const domEvents = timeline.filter((entry) =>
        entry.event === "dom-lifecycle" &&
        entry.documentUrl === request.documentUrl &&
        Number(entry.emittedAtEpochMs) <= Number(request.requestEpochMs) &&
        Number(request.requestEpochMs) - Number(entry.emittedAtEpochMs) <= RUM_XHR_NAVIGATION_WINDOW_MS
      );
      const pagehide = [...domEvents].reverse().find((entry) => entry.lifecycleEvent === "pagehide");
      const hidden = [...domEvents].reverse().find((entry) => entry.lifecycleEvent === "visibilitychange-hidden");
      const navigation = timeline.find((entry) =>
        entry.event === "cdp-main-frame-navigated" &&
        entry.frameId === request.frameId &&
        entry.loaderId !== request.loaderId &&
        Number(entry.epochMs) >= Number(request.failedEpochMs) &&
        Number(entry.epochMs) - Number(request.requestEpochMs) <= RUM_XHR_NAVIGATION_WINDOW_MS
      );
      const pageClosed = timeline.find((entry) => entry.event === "page-closed");
      const contextClosed = timeline.find((entry) => entry.event === "context-closed");
      const requestUrl = new URL(request.url);
      return classifyRumXhrNavigationLifecycle({
        canceled: request.canceled,
        consoleCspErrorCount,
        contextClosedEpochMs: contextClosed?.epochMs,
        destinationCommittedEpochMs: navigation?.epochMs,
        destinationDocumentUrl: navigation?.documentUrl,
        destinationFrameId: navigation?.frameId,
        destinationLoaderId: navigation?.loaderId,
        errorText: request.errorText,
        failedEpochMs: request.failedEpochMs,
        hiddenEpochMs: hidden?.emittedAtEpochMs,
        initiatorScriptUrls: request.initiatorScriptUrls,
        initiatorType: request.initiatorType,
        loadingFailed: request.loadingFailed,
        loadingFinished: request.loadingFinished,
        mainFrameId: request.frameId,
        method: request.method,
        pageClosedEpochMs: pageClosed?.epochMs,
        pagehideEpochMs: pagehide?.emittedAtEpochMs,
        pathname: requestUrl.pathname,
        requestCspFailureCount,
        requestOrigin: requestUrl.origin,
        requestStartedEpochMs: request.requestEpochMs,
        resourceType: request.resourceType,
        responseStatus: request.responseStatus,
        sourceDocumentUrl: request.documentUrl,
        sourceFrameId: request.frameId,
        sourceLoaderId: request.loaderId,
      });
    },
    async dispose() {
      if (!session) return;
      await session.detach().catch(() => {});
      session = null;
    },
  };
}

function monitorPage(page, { allowedConsoleMessages = [], allowedResponseUrls = [], rumLifecycleDiagnostics = null } = {}) {
  const issues = [];
  const browserName = page.context().browser()?.browserType().name() || "";
  const monitorStartedAt = Date.now();
  const analyticsRequests = new Map();
  const analyticsTimeline = [];
  const analyticsNavigationAborts = [];
  const analyticsLifecycleResults = [];
  const expectedNavigationLogoRequests = new WeakSet();
  const seenNavigationLogoRequests = new Set();
  let consoleCspErrorCount = 0;
  let requestCspFailureCount = 0;
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
    if (/content security policy|\bcsp\b/i.test(message.text())) consoleCspErrorCount += 1;
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
        failureEpochMs: Date.now(),
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
      if (/\bcsp\b/i.test(errorText)) requestCspFailureCount += 1;
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
    if (pendingRumNavigationAbort &&
      rumLifecycleDiagnostics?.supported === true &&
      pendingRumNavigationAbort.method === "POST" &&
      pendingRumNavigationAbort.pathname === "/cdn-cgi/rum" &&
      pendingRumNavigationAbort.resourceType === "xhr" &&
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
      rumLifecycleDiagnostics?.markTestEnd();
      for (const abort of analyticsNavigationAborts) {
        let lifecycleResult;
        if (abort.resourceType === "xhr") {
          lifecycleResult = rumLifecycleDiagnostics?.classifyRumXhrNavigationAbort(abort, {
            consoleCspErrorCount,
            requestCspFailureCount,
          }) || {
            httpCompleted: false,
            navigationLifecycleCompleted: false,
            classification: "unclassified-failure",
          };
        } else {
          const navigationCommitted = analyticsTimeline.some((entry) =>
            entry.event === "main-frame-navigated" &&
            entry.elapsedMs >= abort.elapsedMs &&
            entry.pathname !== abort.sourcePathname
          );
          const navigationLifecycleCompleted = isCompletedRumNavigationLifecycle({
            ...abort,
            navigationCommitted,
          });
          lifecycleResult = {
            httpCompleted: false,
            navigationLifecycleCompleted,
            classification: navigationLifecycleCompleted
              ? "ping-navigation-abort-classified"
              : "unclassified-failure",
          };
        }
        analyticsLifecycleResults.push(lifecycleResult);
        recordAnalyticsEvent("rum-navigation-lifecycle-checked", {
          classification: lifecycleResult.classification,
          httpCompleted: lifecycleResult.httpCompleted,
          navigationLifecycleCompleted: lifecycleResult.navigationLifecycleCompleted,
          pathname: abort.pathname,
          priorSuccessfulStatus: abort.priorSuccessfulStatus,
        });
        if (!lifecycleResult.navigationLifecycleCompleted) {
          issues.push(`requestfailed: ${abort.method} ${abort.pathname} ${abort.errorText}`);
        }
      }
      const timeline = analyticsTimeline.map((entry) => JSON.stringify(entry)).join("\n");
      const cdpTimeline = rumLifecycleDiagnostics?.getSanitizedTimeline().map((entry) => JSON.stringify(entry)).join("\n") || "";
      expect(issues, [
        issues.join("\n"),
        "Analytics lifecycle:",
        timeline,
        cdpTimeline ? "Chromium lifecycle diagnostics:" : "",
        cdpTimeline,
      ].filter(Boolean).join("\n")).toEqual([]);
    },
    getAnalyticsSummary() {
      return {
        completedStatuses: [...analyticsRequests.values()]
          .filter((entry) => entry.state === "finished" && Number.isInteger(entry.status))
          .map((entry) => entry.status),
        lifecycleAbortCount: analyticsNavigationAborts.length,
        lifecycleResults: [...analyticsLifecycleResults],
        cspFailureCount: consoleCspErrorCount + requestCspFailureCount,
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

async function readStored(page, key) {
  return page.evaluate((storageKey) => {
    const value = localStorage.getItem(storageKey);
    return value == null ? null : JSON.parse(value);
  }, key);
}

module.exports = {
  AI_CREDIT_COSTS,
  classifyRumXhrNavigationLifecycle,
  createUsageResponse,
  createChromiumRumLifecycleDiagnostics,
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
