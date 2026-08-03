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
  revise_plan: 2,
  recovery_plan: 3,
  reschedule_plan: 4,
  diary_book: 10,
};

const AI_ACTION_LABELS = {
  companion_chat: "올리와 지금 대화",
  revise_plan: "계획 일부 수정",
  recovery_plan: "회복 계획 생성",
  reschedule_plan: "전체 일정 재조정",
  diary_book: "다이어리 북 만들기",
};

const PRO_ONLY_LOCK_REASON = "PRO로 전환하면 내 기록으로 만들 수 있어요.";

function createUsageResponse({
  plan = "expired",
  dailyUsed = 0,
  monthlyUsed = 0,
  trialEligible = false,
  trialActive = plan === "trial",
  // 차단 여부는 배포 설정이라 서버가 알려 준다. 기본값은 꺼짐 — 실제 기본 배포와 같다.
  paywallEnabled = false,
} = {}) {
  const dailyLimit = plan === "expired" ? 2 : 30;
  const monthlyLimit = plan === "expired" ? 5 : plan === "trial" ? 15 : 250;
  const trialStartedAt = trialActive ? new Date(Date.now() - 60 * 1000).toISOString() : null;
  const trialEndsAt = trialActive ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
  return {
    ok: true,
    schemaVersion: 1,
    policyVersion: "2026-07-15.v1",
    timeZone: "Asia/Seoul",
    plan,
    planLabel: plan === "trial" ? "무료 체험 중" : plan === "pro" ? "Pro" : "이용 종료",
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
    paywallEnabled,
    /* 북은 PRO 전용이고 판정은 서버가 한다 — allowed는 유효 플랜이 정확히 "pro"인지다.
       체험도 false여야 한다(getPlanConfig("trial")이 pro 설정을 돌려주는 함정과 무관하게). */
    diaryBook: {
      cost: AI_CREDIT_COSTS.diary_book,
      proOnly: true,
      allowed: plan === "pro",
      lockReason: plan === "pro" ? "" : PRO_ONLY_LOCK_REASON,
    },
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

/* 수동 빌더 4단계(목표 → 리듬 → 할 일 → 마무리)를 끝까지 진행한다.
   AI 호출은 한 번도 일어나지 않는다. tasks를 주면 3단계 초안을 덮어쓴다. */
/* 단계가 바뀌면 revealActiveDiagnosisStep()이 requestAnimationFrame 안에서 폼을 스크롤해
   올린다. 그 프레임과 다음 클릭이 겹치면 Playwright가 잡아둔 좌표에서 버튼이 비켜나 탭이
   빗나가고, 위저드가 그 단계에 그대로 머문다(부하가 걸린 병렬 실행에서만 드물게 재현).
   단계가 활성화된 뒤 한 프레임을 흘려보내 스크롤이 끝난 좌표에서 클릭하게 한다. */
async function settleWizardStep(page, stepTitle) {
  await expect(page.locator(".diagnosis-step.active")).toHaveAttribute("data-step-title", stepTitle);
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function completeManualPlan(page, { goal = "3개월 안에 토익 900점 달성하기", tasks = null, everyDay = false } = {}) {
  await page.locator("#designGoal").fill(goal);
  const next = page.locator("#diagnosisNextButton");
  await next.click();                       // 1 → 2 (리듬)
  await settleWizardStep(page, "언제, 얼마나 해볼까요?");
  /* 빌더의 기본 실행 요일은 월~금이라 토·일에 만든 계획은 그날이 휴식일로 비어 있다.
     "만든 할 일이 오늘 화면에 보인다"를 확인하는 테스트는 그대로 두면 주말마다 깨지므로,
     그런 테스트만 7일 실행으로 만들어 요일에 기대지 않게 한다.
     체크박스를 label이 감싸고 있어 포인터 클릭이 가로채인다 — 입력 요소를 직접 클릭해
     change 이벤트까지 정상적으로 발생시킨다. */
  if (everyDay) {
    await page.locator("[data-design-day]").evaluateAll((inputs) => {
      inputs.forEach((input) => { if (!input.checked) input.click(); });
    });
    await expect(page.locator("[data-design-day]:not(:checked)")).toHaveCount(0);
  }
  await next.click();                       // 2 → 3 (할 일)
  await settleWizardStep(page, "어떤 일을 하면 될까요?");
  await page.locator("#taskBuilderList .task-builder-item").first().waitFor();

  if (tasks) {
    const rows = page.locator("#taskBuilderList .task-builder-item");
    while (await rows.count() > tasks.length) {
      await rows.last().locator("[data-task-remove]").click();
    }
    while (await rows.count() < tasks.length) {
      await page.locator("#addTaskButton").click();
    }
    const fillRow = async (index, task) => {
      const row = rows.nth(index);
      if (task.time) await row.locator("[data-task-field='time']").fill(task.time);
      await row.locator("[data-task-field='text']").fill(task.text);
      if (task.minutes) await row.locator("[data-task-field='minutes']").fill(String(task.minutes));
      if (task.rule) await row.locator("[data-task-field='rule']").fill(task.rule);
    };
    for (const [index, task] of tasks.entries()) await fillRow(index, task);

    /* renderTaskBuilder는 replaceChildren로 행을 통째로 갈아끼운다. 초안 재생성이
       입력 사이에 끼어들면 방금 채운 값이 detached 노드와 함께 사라지고(그 input
       이벤트는 리스트에 닿지 못한다) 그 행만 템플릿 문구로 남는다 — 뒷행을 채우는
       동안 앞행이 되돌아가므로 행 단위 재시도로는 못 잡는다. 전체를 한 번 더 확인하고
       어긋난 행만 다시 채운다. */
    await expect.poll(async () => {
      const values = [];
      for (const [index, task] of tasks.entries()) {
        const textField = rows.nth(index).locator("[data-task-field='text']");
        if ((await textField.inputValue()) !== task.text) await fillRow(index, task);
        values.push(await textField.inputValue());
      }
      return values.join(" | ");
    }, { timeout: 10_000 }).toBe(tasks.map((task) => task.text).join(" | "));
  }

  await next.click();                       // 3 → 4 (마무리)
  await settleWizardStep(page, "이대로 시작해볼까요?");
  await page.locator("#aiPreviewButton").click();
  await expect(page.locator("#firstStep")).toBeVisible();
}

/* 대화 기능은 최초 사용 시점에 별도 동의를 받는다(개인정보 정책 프레임 7장 1항).
   동의 화면 자체를 보는 테스트가 아니면 "이미 동의한 기기"로 시작한다. */
const CHAT_CONSENT_STORAGE = Object.freeze({
  omwChatConsent: { agreed: true, agreedAt: "2026-07-29T00:00:00.000Z", version: 1 },
});

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

/* data-app-ready는 한 번 true가 되면 되돌아가지 않는다. 그래서 앱이 스스로
   location.reload()를 부르는 흐름(계획 선택 적용, 구독 해지 등)에서는 waitForAppReady가
   "새로고침 전 문서"에 즉시 매칭돼 그냥 통과하고, 그 뒤의 page.evaluate가 항해 도중에
   떨어져 "Execution context was destroyed"로 죽는다. 로드마다 바뀌는 토큰을 기준으로
   "새로운 ready"를 기다린다. */
async function readAppReadyToken(page) {
  return page.locator("body").evaluate((body) => body.dataset.appReadyToken || "");
}

async function waitForNewAppReady(page, previousToken) {
  await page.waitForFunction(
    (token) => document.body?.dataset.appReady === "true"
      && Boolean(document.body.dataset.appReadyToken)
      && document.body.dataset.appReadyToken !== token,
    previousToken,
    { timeout: 15_000 },
  );
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
  usage = user ? createUsageResponse({ plan: user.plan || "expired" }) : null,
  paymentsEnabled = false,
} = {}) {
  await mockExternalAssets(page);
  const state = { user, usage, paymentsEnabled, accountState: {}, revision: 0 };

  /* 처음부터 로그인된 사용자를 모킹하는 테스트는 "이미 이 계정으로 쓰던 기기"를 뜻한다.
     스코프를 비워 두면 부팅 때 익명 → 계정 전환이 일어나 계획 선택 시트가 열리고,
     그 테스트가 보려던 화면을 가린다. 첫 로그인 승계 자체를 보는 테스트는 user 없이
     시작해 나중에 account.user를 채우므로 여기 걸리지 않는다. */
  if (user?.id) {
    await page.addInitScript((scope) => {
      if (!localStorage.getItem("onmyway:active-scope")) localStorage.setItem("onmyway:active-scope", scope);
    }, `user:${user.id}`);
  }

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

/* allowedRequestFailureUrls는 테스트가 일부러 끊은 요청에만 쓴다. 예: 셸이 OAuth 시작 URL을
   가로채 문서가 살아남는 상황은 navigation을 끊어야만 재현되는데, 그 끊김이 곧 ERR_ABORTED다.
   제품이 실제로 실패시킨 요청을 덮는 데 쓰면 안 된다. */
function monitorPage(page, { allowedConsoleMessages = [], allowedResponseUrls = [], allowedRequestFailureUrls = [] } = {}) {
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
    let isCanceledStaticAsset = false;
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
      isCanceledStaticAsset =
        isNavigationCancellation &&
        ["image", "font"].includes(request.resourceType()) &&
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
    if (isExpectedFirefoxLogoAbort || isCanceledStaticAsset || isCanceledFunnelEvent || isCanceledStartupRequest) return;
    if (allowedRequestFailureUrls.some((pattern) => request.url().includes(pattern))) return;
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

async function captureAcceptance(page, testInfo, name, { fullPage = true } = {}) {
  const outputDir = process.env.ACCEPTANCE_CAPTURE_DIR;
  if (!outputDir) return;
  const width = page.viewportSize()?.width || "auto";
  await page.screenshot({
    path: path.join(outputDir, `${testInfo.project.name}-${width}-${name}.png`),
    fullPage,
  });
}

/* 가격은 배포된 /plan-policy.mjs에서 읽는다. 테스트가 숫자를 다시 적으면 화면과 정책이
   갈라져도 통과해 버린다 — 이 스펙이 막으려는 것이 정확히 그 상황이다. */
async function readProPriceKRW(page) {
  const price = await page.evaluate(() => import("/plan-policy.mjs").then((module) => module.PLAN_CONFIG.pro.priceKRW));
  expect(Number.isFinite(price)).toBe(true);
  return price;
}

function formatPriceWon(price) {
  return `${price.toLocaleString("ko-KR")}원`;
}

function formatPriceSymbol(price) {
  return `₩${price.toLocaleString("ko-KR")}`;
}

async function readStored(page, key) {
  return page.evaluate((storageKey) => {
    const value = localStorage.getItem(storageKey);
    return value == null ? null : JSON.parse(value);
  }, key);
}

module.exports = {
  AI_CREDIT_COSTS,
  PRO_ONLY_LOCK_REASON,
  CHAT_CONSENT_STORAGE,
  captureAcceptance,
  createUsageResponse,
  expectNoDuplicateIds,
  expectNoHorizontalOverflow,
  formatPriceSymbol,
  formatPriceWon,
  readProPriceKRW,
  isCompletedRumNavigationLifecycle,
  isExpectedFirefoxNavigationImageAbort,
  completeManualPlan,
  mockAccountExperience,
  mockExternalAssets,
  monitorPage,
  prepareApp,
  waitForBootstrap,
  waitForAppReady,
  readAppReadyToken,
  waitForNewAppReady,
  readStored,
  testPlan,
};
