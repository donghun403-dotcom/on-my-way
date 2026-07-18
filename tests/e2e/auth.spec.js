const { test, expect } = require("@playwright/test");
const { createUsageResponse, expectNoHorizontalOverflow, mockExternalAssets, monitorPage, waitForAppReady, waitForBootstrap } = require("./helpers");

const providers = ["kakao", "naver", "google", "apple"];
const androidProviders = ["kakao", "naver", "google"];
const providerNames = {
  kakao: "카카오로 계속하기",
  naver: "네이버로 계속하기",
  google: "Google로 계속하기",
  apple: "Apple로 계속하기",
};

function activeTrialUser(overrides) {
  const trialStartedAt = Date.now() - 60_000;
  return {
    trialStartedAt,
    trialExpiresAt: trialStartedAt + 86_400_000,
    trialUsedAt: trialStartedAt,
    plan: "trial",
    role: "member",
    ...overrides,
  };
}

async function waitForAccountScope(page, expectedScope) {
  await expect(page.locator("html")).not.toHaveClass(/account-storage-pending/, { timeout: 15_000 });
  await waitForBootstrap(page);
  await waitForAppReady(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("onmyway:active-scope"))).toBe(expectedScope);
}

async function mockAccountApi(page, state = { user: null, configured: true }) {
  await mockExternalAssets(page);
  const syncedStates = new Map();
  const revisions = new Map();
  await page.route("**/api/auth/providers", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      providers: providers.map((id) => ({
        id,
        configured: state.configured !== false,
        visible: id !== "apple" || state.appleVisible === true,
      })),
    }),
  }));
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user: state.user }),
  }));
  await page.route("**/api/health", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: '{"ok":true,"services":{"payments":false}}',
  }));
  await page.route("**/api/ai/usage", (route) => {
    if (!state.user) return route.fulfill({ status: 401, contentType: "application/json", body: '{"ok":false,"error":"로그인이 필요합니다."}' });
    const plan = state.user.plan || "free";
    const usage = createUsageResponse({ plan, trialEligible: plan === "free", trialActive: plan === "trial" });
    if (plan === "trial") {
      usage.trial.startedAt = new Date(state.user.trialStartedAt).toISOString();
      usage.trial.endsAt = new Date(state.user.trialExpiresAt).toISOString();
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(usage) });
  });
  await page.route("**/api/auth/logout", (route) => {
    state.user = null;
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await page.route("**/api/account/state", async (route) => {
    if (!state.user) return route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"login required"}' });
    const body = route.request().method() === "GET" ? null : route.request().postDataJSON();
    if (body && body.userId !== state.user.id) {
      return route.fulfill({ status: 409, contentType: "application/json", body: '{"error":"account changed","code":"ACCOUNT_CHANGED"}' });
    }
    const userId = body?.userId || state.user.id;
    const syncedState = syncedStates.get(userId) || {};
    const revision = revisions.get(userId) || 0;
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: syncedState, revision, updatedAt: Date.now() }) });
    }
    if (Number(body.baseRevision || 0) !== revision) {
      return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ state: syncedState, revision, updatedAt: Date.now() }) });
    }
    syncedStates.set(userId, body.state || {});
    revisions.set(userId, revision + 1);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision: revision + 1, updatedAt: Date.now() }) });
  });
}

test("auth bootstrap retries one transient failure before settling the member state", async ({ page }) => {
  const state = { user: activeTrialUser({ id: "usr_bootstrap", provider: "google", name: "Bootstrap User", email: "bootstrap@example.com" }), configured: true };
  await mockAccountApi(page, state);
  await page.unroute("**/api/auth/me");
  let attempts = 0;
  await page.route("**/api/auth/me", (route) => {
    attempts += 1;
    if (attempts === 1) return route.abort("failed");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: state.user }) });
  });

  await page.goto("/app.html");
  await waitForBootstrap(page);
  await waitForAppReady(page);
  await expect.poll(() => attempts).toBeGreaterThanOrEqual(2);
  await expect(page.locator("body")).toHaveAttribute("data-auth-state", "member");
});

test("pricing bootstrap retries a transient module load without masking a valid response", async ({ page }) => {
  await mockAccountApi(page);
  let policyRequests = 0;
  await page.route("**/plan-policy.mjs", (route) => {
    policyRequests += 1;
    if (policyRequests === 1) return route.abort("failed");
    return route.continue();
  });

  await page.goto("/app.html");
  await waitForBootstrap(page);
  await waitForAppReady(page);
  await expect.poll(() => policyRequests).toBeGreaterThan(1);
  await expect(page.locator("body")).toHaveAttribute("data-pricing-state", "ready");
});

test("pricing bootstrap exposes a permanent response failure without marking the app ready", async ({ page }) => {
  await mockAccountApi(page);
  let policyRequests = 0;
  await page.route("**/plan-policy.mjs", (route) => {
    policyRequests += 1;
    return route.fulfill({ status: 503, contentType: "application/javascript", body: "" });
  });

  await page.goto("/app.html");
  await waitForBootstrap(page);
  await expect(page.locator("body")).toHaveAttribute("data-pricing-state", "error");
  await expect(page.locator("body")).toHaveAttribute("data-app-ready", "false");
  expect(policyRequests).toBe(1);
});

test("Android 로그인에는 세 Provider만 표시되고 Apple은 레이아웃과 포커스 순서에서 제외된다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountApi(page);
  await page.goto("/app.html?auth=login");
  for (const provider of androidProviders) await expect(page.getByRole("button", { name: providerNames[provider] })).toBeVisible();
  await expect(page.locator('[data-auth-provider="apple"]')).toBeHidden();
  await expect(page.locator("#authProviderList > .auth-provider:visible")).toHaveCount(3);
  const focusableProviders = await page.locator("#authProviderList > .auth-provider").evaluateAll((buttons) => buttons
    .filter((button) => !button.hidden && !button.disabled && button.tabIndex >= 0)
    .map((button) => button.dataset.authProvider));
  expect(focusableProviders).toEqual(androidProviders);
  await expectNoHorizontalOverflow(page);
  diagnostics.expectClean();
});

test("Apple 노출 플래그가 true일 때만 버튼을 표시하며 Secret이 없으면 시작하지 않는다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountApi(page, { user: null, configured: false, appleVisible: true });
  await page.goto("/app.html?auth=login");
  await expect(page.getByRole("button", { name: "Apple로 계속하기" })).toBeVisible();
  await page.getByRole("button", { name: "Apple로 계속하기" }).click();
  await expect(page.locator("#authProviderStatus")).toContainText("설정이 아직 완료되지 않았습니다");
  diagnostics.expectClean();
});

test("각 Provider는 allowlisted Worker OAuth 시작 URL로 이동한다", async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  const diagnostics = monitorPage(page);
  await mockAccountApi(page);
  const starts = [];
  await page.route(/\/api\/auth\/(kakao|naver|google|apple)\/start/, (route) => {
    starts.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>OAuth handoff</title>" });
  });

  for (const provider of androidProviders) {
    await page.goto("/app.html?auth=login");
    await page.getByRole("button", { name: providerNames[provider] }).click();
    await expect.poll(() => starts.length).toBe(androidProviders.indexOf(provider) + 1);
    const start = new URL(starts.at(-1));
    expect(start.pathname).toBe(`/api/auth/${provider}/start`);
    expect(start.searchParams.get("redirect")).toBe("/app.html");
  }
  diagnostics.expectClean();
});

test("로그인 중 연속 클릭은 OAuth 요청을 한 번만 시작한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountApi(page);
  let starts = 0;
  await page.route("**/api/auth/google/start**", async (route) => {
    starts += 1;
    await new Promise((resolve) => setTimeout(resolve, 100));
    return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>OAuth handoff</title>" });
  });
  await page.goto("/app.html?auth=login");
  await page.getByRole("button", { name: "Google로 계속하기" }).evaluate((button) => {
    button.click();
    button.click();
  });
  await expect.poll(() => starts).toBe(1);
  diagnostics.expectClean();
});

test("노출된 Provider 설정이 없으면 가짜 세션 없이 명확한 안내를 표시한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountApi(page, { user: null, configured: false });
  await page.goto("/app.html?auth=login");
  await page.getByRole("button", { name: "Google로 계속하기" }).click();
  await expect(page.locator("#authProviderStatus")).toContainText("설정이 아직 완료되지 않았습니다");
  await expect(page).toHaveURL(/app\.html/);
  diagnostics.expectClean();
});

test("callback 성공과 실패 query를 안내한 뒤 주소창에서 제거한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountApi(page, { user: null, configured: true });
  await page.goto("/app.html?auth=invalid_state&provider=naver");
  await expect(page.locator(".app-toast")).toContainText("확인 시간이 만료");
  await expect(page).not.toHaveURL(/auth=|provider=/);

  await page.goto("/app.html?auth=success&provider=google");
  await expect(page.locator(".app-toast")).toContainText("로그인되었어요");
  await expect(page).not.toHaveURL(/auth=|provider=/);

  await page.goto("/app.html?auth=deletion_pending&provider=google");
  await expect(page.locator(".app-toast")).toContainText("탈퇴 처리 중");
  await expect(page.locator("#trialPaywall")).toBeHidden();
  await expect(page.locator("#authSheet")).toBeVisible();
  await expect(page.locator("#authSheetTitle")).toHaveText("계정 탈퇴 처리 중");
  await expect(page.locator("#authProviderStatus")).toContainText("삭제가 완료될 때까지 다시 로그인할 수 없습니다");
  await expect(page).not.toHaveURL(/auth=|provider=/);
  diagnostics.expectClean();
});

test("첫 화면에서 연 로그인은 X, 배경, ESC로 취소하면 첫 화면으로 돌아간다", async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  const diagnostics = monitorPage(page);
  await mockAccountApi(page);

  const cancelLogin = async (cancel, { openFromLanding = false } = {}) => {
    if (openFromLanding) {
      await page.goto("/");
      await waitForBootstrap(page);
      await expect(page.locator("html")).not.toHaveClass(/account-storage-pending/, { timeout: 15_000 });
      await page.getByRole("button", { name: "메뉴 열기" }).click();
      const loginLink = page.getByRole("link", { name: "로그인" });
      await expect(loginLink).toBeVisible();
      await Promise.all([page.waitForURL(/\/app\.html\?auth=login/), loginLink.click()]);
    } else {
      await page.goto("/app.html?auth=login&return=%2F");
      await waitForBootstrap(page);
    }
    await expect(page.locator("#authSheet")).toBeVisible();
    await cancel();
    await expect(page).toHaveURL(/\/$/);
    await waitForBootstrap(page);
    await expect(page.locator("#top")).toBeVisible();
  };

  await cancelLogin(() => page.locator("#closeAuthSheet").click(), { openFromLanding: true });
  await cancelLogin(() => page.locator("#accountSheetOverlay").click({ position: { x: 4, y: 4 } }));
  await cancelLogin(() => page.keyboard.press("Escape"));
  diagnostics.expectClean();
});

test("세션 복원 후 로그아웃하면 회원 UI와 활성 데이터가 초기화된다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const state = {
    configured: true,
    user: activeTrialUser({ id: "usr_account_a", provider: "google", name: "계정 A", email: "a@example.com" }),
  };
  await mockAccountApi(page, state);
  await page.goto("/app.html");
  await waitForAccountScope(page, "user:usr_account_a");
  await page.locator("#menuToggle").click();
  await expect(page.locator("#drawerName")).toHaveText("계정 A");
  await page.locator("#drawerLogout").click();
  await expect(page.locator("#trialPaywall")).toBeHidden({ timeout: 15_000 });
  await expect(page.locator("body")).not.toHaveClass(/trial-locked/);
  await expect(page.locator("#view-today")).toBeVisible();
  await expect(page.locator("#drawerGuest")).not.toHaveAttribute("hidden", "");
  await expect(page.locator("#drawerMember")).toHaveAttribute("hidden", "");
  expect(await page.evaluate(() => localStorage.getItem("onmyway:active-scope"))).toMatch(/^anonymous:/);
  diagnostics.expectClean();
});

test("익명 데이터는 확인 후 가져오며 계정 A와 B 상태를 서로 격리한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const state = {
    configured: true,
    user: activeTrialUser({ id: "usr_account_a", provider: "google", name: "계정 A", email: "a@example.com" }),
  };
  await mockAccountApi(page, state);
  await page.addInitScript(() => {
    if (sessionStorage.getItem("auth-scope-seeded")) return;
    localStorage.clear();
    localStorage.setItem("omwExecutionPlan", JSON.stringify({ goal: "익명 목표" }));
    sessionStorage.setItem("auth-scope-seeded", "true");
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.goto("/app.html");
  await waitForAccountScope(page, "user:usr_account_a");
  await page.evaluate(() => localStorage.setItem("omwExecutionPlan", JSON.stringify({ goal: "계정 A 목표" })));

  state.user = activeTrialUser({ id: "usr_account_b", provider: "kakao", name: "계정 B", email: "b@example.com" });
  await page.reload();
  await waitForAccountScope(page, "user:usr_account_b");
  expect(await page.evaluate(() => localStorage.getItem("omwExecutionPlan"))).toBeNull();
  await page.evaluate(() => localStorage.setItem("omwExecutionPlan", JSON.stringify({ goal: "계정 B 목표" })));

  state.user = activeTrialUser({ id: "usr_account_a", provider: "google", name: "계정 A", email: "a@example.com" });
  await page.reload();
  await waitForAccountScope(page, "user:usr_account_a");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("omwExecutionPlan") || "null")?.goal)).toBe("계정 A 목표");
  diagnostics.expectClean();
});
