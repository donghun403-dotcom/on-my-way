const { test, expect } = require("@playwright/test");
const { expectNoHorizontalOverflow, mockExternalAssets, monitorPage } = require("./helpers");

const providers = ["kakao", "naver", "google", "apple"];
const providerNames = {
  kakao: "카카오로 계속하기",
  naver: "네이버로 계속하기",
  google: "Google로 계속하기",
  apple: "Apple로 계속하기",
};

async function mockAccountApi(page, state = { user: null, configured: true }) {
  await mockExternalAssets(page);
  await page.route("**/api/auth/providers", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ providers: providers.map((id) => ({ id, configured: state.configured !== false })) }),
  }));
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user: state.user }),
  }));
  await page.route("**/api/auth/logout", (route) => {
    state.user = null;
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
}

test("네 Provider 로그인 버튼과 Apple 접근성이 모바일 레이아웃에 표시된다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountApi(page);
  await page.goto("/app.html?auth=login");
  for (const provider of providers) await expect(page.getByRole("button", { name: providerNames[provider] })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apple로 계속하기" })).toHaveAttribute("aria-label", "Apple로 계속하기");
  await expectNoHorizontalOverflow(page);
  diagnostics.expectClean();
});

test("각 Provider는 allowlisted Worker OAuth 시작 URL로 이동한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountApi(page);
  const starts = [];
  await page.route(/\/api\/auth\/(kakao|naver|google|apple)\/start/, (route) => {
    starts.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>OAuth handoff</title>" });
  });

  for (const provider of providers) {
    await page.goto("/app.html?auth=login");
    await page.getByRole("button", { name: providerNames[provider] }).click();
    await expect.poll(() => starts.length).toBe(providers.indexOf(provider) + 1);
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

test("Provider 설정이 없으면 가짜 세션 없이 명확한 안내를 표시한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountApi(page, { user: null, configured: false });
  await page.goto("/app.html?auth=login");
  await page.getByRole("button", { name: "Apple로 계속하기" }).click();
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
  diagnostics.expectClean();
});

test("세션 복원 후 로그아웃하면 회원 UI와 활성 데이터가 초기화된다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const state = {
    configured: true,
    user: { id: "usr_account_a", provider: "google", name: "계정 A", email: "a@example.com", plan: "trial", role: "member" },
  };
  await mockAccountApi(page, state);
  await page.goto("/app.html");
  await page.locator("#menuToggle").click();
  await expect(page.locator("#drawerName")).toHaveText("계정 A");
  await page.locator("#drawerLogout").click();
  await expect(page.locator("#drawerGuest")).toBeVisible();
  const scope = await page.evaluate(() => localStorage.getItem("onmyway:active-scope"));
  expect(scope).toMatch(/^anonymous:/);
  diagnostics.expectClean();
});

test("익명 데이터는 확인 후 가져오며 계정 A와 B 상태를 서로 격리한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const state = {
    configured: true,
    user: { id: "usr_account_a", provider: "google", name: "계정 A", email: "a@example.com", plan: "trial", role: "member" },
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
  await expect.poll(() => page.evaluate(() => localStorage.getItem("onmyway:active-scope"))).toBe("user:usr_account_a");
  await page.evaluate(() => localStorage.setItem("omwExecutionPlan", JSON.stringify({ goal: "계정 A 목표" })));

  state.user = { id: "usr_account_b", provider: "kakao", name: "계정 B", email: "b@example.com", plan: "trial", role: "member" };
  await page.reload();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("onmyway:active-scope"))).toBe("user:usr_account_b");
  expect(await page.evaluate(() => localStorage.getItem("omwExecutionPlan"))).toBeNull();
  await page.evaluate(() => localStorage.setItem("omwExecutionPlan", JSON.stringify({ goal: "계정 B 목표" })));

  state.user = { id: "usr_account_a", provider: "google", name: "계정 A", email: "a@example.com", plan: "trial", role: "member" };
  await page.reload();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("onmyway:active-scope"))).toBe("user:usr_account_a");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("omwExecutionPlan") || "null")?.goal)).toBe("계정 A 목표");
  diagnostics.expectClean();
});
