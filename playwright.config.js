const { defineConfig, devices } = require("@playwright/test");

const externalBaseUrl = process.env.E2E_BASE_URL;

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
    baseURL: externalBaseUrl || "http://127.0.0.1:8765",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "node serve-local.cjs",
        url: "http://127.0.0.1:8765/index.html",
        reuseExistingServer: !process.env.CI,
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
