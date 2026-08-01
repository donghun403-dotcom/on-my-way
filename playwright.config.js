const { defineConfig, devices } = require("@playwright/test");

const externalBaseUrl = process.env.E2E_BASE_URL;
/* worktree를 동시에 여러 개 굴리므로 포트를 갈라야 한다.
   serve-local.cjs는 PORT 하나만 읽는다(기본값 8765로 동일). E2E_PORT는 여기서만 받아
   아래 webServer.env.PORT로 번역해 넘기므로, 서버는 어느 쪽을 줘도 같은 포트에 바인딩한다. */
const port = Number(process.env.PORT || process.env.E2E_PORT || 8765);
const localBaseUrl = `http://127.0.0.1:${port}`;

module.exports = defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 3,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  outputDir: "test-results",
  reporter: [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: externalBaseUrl || localBaseUrl,
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "node serve-local.cjs",
        url: `${localBaseUrl}/index.html`,
        // 서버가 위에서 고른 포트에 그대로 바인딩하도록 넘긴다.
        env: { PORT: String(port) },
        /* 다른 worktree가 이미 그 포트를 쓰고 있으면 조용히 남의 서버에 붙어 남의 HTML을
           테스트하게 된다. 이미 떠 있는 서버에 붙이려면 E2E_BASE_URL로 명시한다. */
        reuseExistingServer: false,
        timeout: 30_000,
      },
  projects: [
    {
      name: "desktop-chromium",
      testIgnore: /responsive\.spec\.js/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-chromium",
      testIgnore: /responsive\.spec\.js/,
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "iphone-webkit",
      testIgnore: /responsive\.spec\.js/,
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "tablet-chromium",
      testIgnore: /responsive\.spec\.js/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true },
    },
    {
      name: "responsive-chromium",
      testMatch: /responsive\.spec\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
