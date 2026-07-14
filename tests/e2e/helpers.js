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
      localStorage.setItem(
        "omwTrialAccess",
        JSON.stringify({ plan: "trial", startedAt: Date.now(), expiresAt: Date.now() + 86_400_000 }),
      );
      for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) continue;
        localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      }
      sessionStorage.setItem("__omw_e2e_seeded", "true");
    },
    { plan: testPlan, overrides: storage },
  );
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
    let isCanceledStaticImage = false;
    try {
      const requestUrl = new URL(request.url());
      const pageUrl = new URL(page.url());
      isCanceledStaticImage =
        errorText.includes("net::ERR_ABORTED") &&
        request.resourceType() === "image" &&
        requestUrl.origin === pageUrl.origin &&
        requestUrl.pathname.startsWith("/assets/");
    } catch {}
    if (isCanceledStaticImage) return;
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

module.exports = { expectNoDuplicateIds, expectNoHorizontalOverflow, mockExternalAssets, monitorPage, prepareApp, readStored, testPlan };
