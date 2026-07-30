/* 하드 페이월 (P1) — 잠금 "화면"만 본다. 서버 게이트는 여기서 검증하지 않는다.

   차단 여부는 서버가 정하고(usage.paywallEnabled + usage.plan) 화면은 그 판정만 읽는다.
   이 파일이 검증하는 것은 그중 뒷부분뿐이다: 주어진 판정에 대해 화면이 무엇을 그리는가.
   helpers.js의 mockAccountExperience가 /api/auth/me·/api/ai/usage·/api/account/state를
   전부 page.route로 가로채므로 아래 테스트는 서버에 닿지 않는다. plan과 paywallEnabled는
   서버 응답이 아니라 테스트 입력이다.

   서버 게이트(만료 계정의 402 PLAN_EXPIRED, provider 호출 0, 원장 무변경, 체험·PRO 통과,
   차단이 꺼졌을 때의 통과)는 worker-energy-ledger.test.mjs의 "하드 페이월 (P1)" 절이
   스텁 env로 워커 핸들러를 직접 불러 검증한다. e2e는 배선을, 유닛은 분기 판정을 맡는다.

   잠긴 화면에서도 기록 열람·내보내기와 탈퇴·결제는 반드시 열려 있어야 한다(법적 요건). */
const { test, expect } = require("@playwright/test");
const {
  createUsageResponse,
  mockAccountExperience,
  monitorPage,
  prepareApp,
  waitForAppReady,
} = require("./helpers");

const EXPIRED_USER = {
  id: "usr_paywall",
  provider: "google",
  name: "만료 테스트",
  email: "paywall@example.com",
  plan: "expired",
  role: "member",
  trialStartedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
  trialUsedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
  trialExpiresAt: Date.now() - 24 * 60 * 60 * 1000,
};

async function prepare(page, { plan = "expired", paywallEnabled = true, storage = {} } = {}) {
  await prepareApp(page, storage);
  const account = await mockAccountExperience(page, {
    user: { ...EXPIRED_USER, plan },
    usage: createUsageResponse({ plan, paywallEnabled, trialEligible: false }),
  });
  await page.goto("/app.html");
  await waitForAppReady(page);
  return account;
}

test("차단이 켜지면 만료 계정은 잠금 화면을 먼저 본다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await prepare(page);

  const paywall = page.locator("#trialPaywall");
  await expect(paywall).toBeVisible();
  await expect(page.locator("#trialPaywallTitle")).toHaveText("무료 체험이 끝났어요");
  await expect(page.locator("body")).toHaveClass(/trial-locked/);
  diagnostics.expectClean();
});

test("차단이 꺼져 있으면 잠금 화면이 뜨지 않는다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await prepare(page, { paywallEnabled: false });

  await expect(page.locator("#trialPaywall")).toBeHidden();
  await expect(page.locator("body")).not.toHaveClass(/trial-locked/);
  diagnostics.expectClean();
});

test("체험 중·PRO 계정에는 잠금 화면이 뜨지 않는다", async ({ page }) => {
  await prepare(page, { plan: "pro" });
  await expect(page.locator("#trialPaywall")).toBeHidden();
});

/* 결제와 무관하게 항상 열려 있어야 하는 세 통로가 잠금 화면에서 눈에 띄는지. */
test("잠금 화면은 기록 보기·내보내기·탈퇴 경로를 함께 보여 준다", async ({ page }) => {
  await prepare(page);

  await expect(page.locator("#paywallBrowseRecords")).toBeVisible();
  await expect(page.locator("#paywallExportRecords")).toBeVisible();
  await expect(page.locator("#paywallDeleteAccount")).toBeVisible();
  await expect(page.locator("#paywallDeleteAccount")).toHaveAttribute("href", "delete-account.html");
  // 결제 화면도 같은 자리에서 열려 있어야 한다 — 잠그기만 하고 낼 방법이 없으면 안 된다.
  await expect(page.locator("#trialPaywallAction")).toBeVisible();
});

/* 무료 내보내기와 유료 북이 서로 다른 것으로 읽혀야 한다. 같은 것처럼 읽히면
   "이미 무료로 되는데 왜 돈을 내나" 또는 반대로 "무료가 없다"는 오해가 생긴다. */
test("잠금 화면은 무료 텍스트 내보내기와 유료 북을 다른 것으로 구분해 말한다", async ({ page }) => {
  await prepare(page);

  await expect(page.locator("#paywallExportRecords")).toContainText("무료로 내보내기");
  await expect(page.locator("#paywallExportRecords")).toContainText("텍스트");
  const paywall = page.locator("#trialPaywall");
  await expect(paywall).toContainText(".md");
  await expect(paywall).toContainText("조판된 책이 아니라 기록 그대로");
  await expect(paywall).toContainText("매달 내 기록이 이런 책이 됩니다");
});

/* §H 순서: 요약 한 줄 → 샘플 북 → 결제 CTA → 내보내기·탈퇴 */
test("잠금 화면은 체험 기록 요약을 먼저 보여 주고 AI를 부르지 않는다", async ({ page }) => {
  const aiCalls = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/ai/")) aiCalls.push(new URL(request.url()).pathname);
  });
  await prepare(page, {
    storage: {
      omwChatLog: JSON.stringify({
        version: 1,
        days: { "2026-07-28": [{ role: "user", text: "안녕" }, { role: "ollie", text: "둥실" }] },
      }),
    },
  });
  aiCalls.length = 0;

  const copy = page.locator("#trialPaywallCopy");
  await expect(copy).toContainText("체험 동안");
  await expect(copy).toContainText("올리와 2번 이야기했어요");
  // 요약은 로컬 데이터다. 생성 요청이 나가면 안 된다.
  expect(aiCalls).toEqual([]);

  // 순서: 요약(copy) → 샘플(paywall-sample) → 결제(trialPaywallAction) → 항상 열린 통로
  const order = await page.locator(".trial-paywall-card > *").evaluateAll((nodes) =>
    nodes.map((node) => node.id || node.className));
  expect(order.indexOf("trialPaywallCopy")).toBeLessThan(order.indexOf("paywall-sample"));
  expect(order.indexOf("paywall-sample")).toBeLessThan(order.indexOf("trialPaywallAction"));
  expect(order.indexOf("trialPaywallAction")).toBeLessThan(order.indexOf("trial-paywall-open"));
});

/* 샘플 북 — 고정 콘텐츠라 AI를 부르지 않고, "샘플"임이 명확해야 한다(표시광고법). */
test("샘플 북은 AI 없이 열리고 내 기록이 아니라는 것을 밝힌다", async ({ page }) => {
  const aiCalls = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/ai/")) aiCalls.push(new URL(request.url()).pathname);
  });
  await prepare(page);
  aiCalls.length = 0;

  await expect(page.locator("#sampleBookDialog")).toBeHidden();
  await page.locator("#sampleBookOpen").click();

  const dialog = page.locator("#sampleBookDialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator(".sample-book-badge")).toHaveText("샘플");
  await expect(dialog).toContainText("내 기록으로 만든 책이 아니에요");
  // 실물감: 실제 북과 같은 조판이라 여러 페이지가 나온다.
  await expect(page.locator("#sampleBookPages .book-page")).toHaveCount(5);
  await expect(page.locator("#sampleBookPages .book-cover-title")).toBeVisible();
  await expect(page.locator("#sampleBookPages .book-letter-sign")).toHaveText("— 올리 드림");
  await expect(page.locator("#sampleBookCta")).toBeVisible();
  expect(aiCalls).toEqual([]);

  await page.locator("#sampleBookClose").click();
  await expect(dialog).toBeHidden();
});

test("내 기록 보기를 누르면 잠금이 내려가고 기록 탭이 열린다", async ({ page }) => {
  await prepare(page);

  await page.locator("#paywallBrowseRecords").click();
  await expect(page.locator("#trialPaywall")).toBeHidden();
  await expect(page.locator("#view-memory")).toBeVisible();
  // 돌아갈 길을 잃지 않게 안내 줄이 떠 있어야 한다.
  const returnBar = page.locator("#paywallReturnBar");
  await expect(returnBar).toBeVisible();
  await page.locator("#paywallReturnToLock").click();
  await expect(page.locator("#trialPaywall")).toBeVisible();
  await expect(returnBar).toBeHidden();
});

/* §G 법적 요건 — 크레딧 0인 만료 계정에서 `.md` 내보내기가 실제로 되어야 한다.
   이게 안 되면 차단을 켤 수 없다. 서버 왕복도 없어야 한다(파일을 보관하면 처리방침 개정 조건이 붙는다). */
const EXPORT_STORAGE = {
  omwChatLog: JSON.stringify({
    version: 1,
    days: {
      "2026-07-28": [{ role: "user", text: "오늘 다 했어" }, { role: "ollie", text: "톡. 새잎 났어요." }],
    },
  }),
};

test("크레딧 0인 만료 계정도 .md 원본을 내보낼 수 있고 AI·서버를 부르지 않는다", async ({ page }) => {
  const serverCalls = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith("/api/")) serverCalls.push(pathname);
  });
  // 잔량이 0이라는 것을 못 박는다 — 재화가 없는 계정에서 성공해야 의미가 있다.
  await prepareApp(page, EXPORT_STORAGE);
  await mockAccountExperience(page, {
    user: EXPIRED_USER,
    usage: {
      ...createUsageResponse({ plan: "expired", paywallEnabled: true }),
      balance: 0,
      available: 0,
      daily: { used: 0, reserved: 0, limit: 0, remaining: 0, resetsAt: "2026-07-31T15:00:00.000Z" },
      monthly: { used: 0, reserved: 0, limit: 0, remaining: 0, resetsAt: "2026-07-31T15:00:00.000Z" },
    },
  });
  await page.goto("/app.html");
  await waitForAppReady(page);
  serverCalls.length = 0;

  const download = page.waitForEvent("download");
  await page.locator("#paywallExportRecords").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^on-my-way-기록-\d{4}-\d{2}-\d{2}\.md$/);
  // 클라이언트 직렬화만 한다 — 어떤 API도 부르지 않는다.
  expect(serverCalls).toEqual([]);

  // 내용: 날짜 · 감정 태그 · 일기 원문 · 대화 턴. 빈 파일이 내려오는 것을 잡는다.
  const body = await page.evaluate(() => window.__omwTest.buildRecordsMarkdown());
  expect(body).toContain("2026-07-28");
  expect(body).toContain("감정:");
  expect(body).toContain("나: 오늘 다 했어");
  expect(body).toContain("올리: 톡. 새잎 났어요.");
});

test("체험 계정도 .md 원본을 내보낼 수 있다", async ({ page }) => {
  await prepareApp(page, EXPORT_STORAGE);
  await mockAccountExperience(page, {
    user: { ...EXPIRED_USER, plan: "trial" },
    usage: createUsageResponse({ plan: "trial", paywallEnabled: true }),
  });
  await page.goto("/app.html");
  await waitForAppReady(page);

  // 체험 계정은 잠금 화면이 없으므로 같은 동작을 훅으로 부른다.
  const download = page.waitForEvent("download");
  await page.evaluate(() => window.__omwTest.exportRecordsFile());
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.md$/);
  const body = await page.evaluate(() => window.__omwTest.buildRecordsMarkdown());
  expect(body).toContain("2026-07-28");
});

/* 표시광고법 — 가입 게이트는 "무료 체험"만 말하고 끝내지 않는다. */
test("가입 게이트는 체험 종료 시점·종료 후 조건·결제 수단 미수집을 같은 화면에 밝힌다", async ({ page }) => {
  await prepareApp(page);
  await mockAccountExperience(page, { user: null, usage: null });
  await page.goto("/app.html?auth=login");
  await waitForAppReady(page);

  const notice = page.locator("#authSheetGateNotice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("가입 다음 날 밤 11시 59분");
  await expect(notice).toContainText("Pro를 결제해야 AI 기능을 이어서 쓸 수 있어요");
  await expect(notice).toContainText("결제 수단을 받지 않으니");
  await expect(notice).toContainText("원본 내보내기(.md 텍스트), 탈퇴는 계속 무료");
  // 북·인쇄가 체험에서도 잠긴다는 사실을 같은 화면에서 밝혀야 한다.
  await expect(notice).toContainText("Pro 전용");
});
