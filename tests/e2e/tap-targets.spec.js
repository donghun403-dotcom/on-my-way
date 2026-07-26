const { test, expect } = require("@playwright/test");
const { prepareApp, waitForAppReady, waitForBootstrap } = require("./helpers");

// Lives in its own file rather than responsive.spec.js so it runs under every
// device project. responsive.spec.js is testIgnore-d by desktop/mobile/iphone/
// tablet and testMatch-ed only by responsive-chromium, so a tap-target check
// placed there would never execute on WebKit.

// Tap targets: every standalone control must reach 44x44.
//
// The measurement takes the larger of the element's own box and any
// absolutely-positioned ::after/::before overlay, because several controls
// keep a small visual box and expand only the hit area.
//
// Two documented exemptions:
//   - links inline inside a sentence (WCAG 2.5.8 explicitly exempts these)
//   - .plan-week-day, where 7 columns cannot each be 44px wide at 320px
for (const [width, height] of [[320, 568], [390, 844]]) {
  test(`${width}x${height} 모든 독립 컨트롤이 44px 탭 타깃을 만족한다`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await prepareApp(page);

    const collect = () =>
      page.evaluate(() => {
        const isInlineInSentence = (el) => {
          const parent = el.parentElement;
          if (!parent) return false;
          const display = getComputedStyle(el).display;
          if (display !== "inline" && display !== "inline-block") return false;
          return [...parent.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
        };
        const effectiveSize = (el) => {
          const rect = el.getBoundingClientRect();
          let width = rect.width;
          let height = rect.height;
          for (const pseudo of ["::after", "::before"]) {
            const style = getComputedStyle(el, pseudo);
            if (style.content === "none" || style.position !== "absolute") continue;
            const pw = Number.parseFloat(style.width);
            const ph = Number.parseFloat(style.height);
            if (!Number.isNaN(pw)) width = Math.max(width, pw);
            if (!Number.isNaN(ph)) height = Math.max(height, ph);
          }
          return { width, height };
        };
        return [...document.querySelectorAll("button,a[href],[role=button],input:not([type=hidden]),select,textarea,summary")]
          .filter((el) => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0" && rect.width >= 1 && rect.height >= 1;
          })
          .filter((el) => !isInlineInSentence(el))
          .filter((el) => !el.className.toString().includes("plan-week-day"))
          .map((el) => ({ ...effectiveSize(el), label: (el.getAttribute("aria-label") || el.textContent.trim() || el.id).slice(0, 30) }))
          // Sub-pixel tolerance: fractional layout makes a nominally 44px
          // control measure 43.99997, which is a rounding artefact rather
          // than a real shortfall. Anything genuinely undersized is >= 1px off.
          .filter((entry) => entry.width < 43.5 || entry.height < 43.5);
      });

    await page.goto("/index.html");
    expect(await collect(), `${width}px 랜딩`).toEqual([]);

    await page.goto("/app.html");
    await waitForAppReady(page);
    for (const view of ["today", "plan", "mate", "memory"]) {
      await page.locator(`#tab-${view}`).click();
      await expect(page.locator(`#view-${view}`)).toBeVisible();
      expect(await collect(), `${width}px ${view}`).toEqual([]);
    }

    // The auth sheet is only in the DOM while open, so its close button is
    // invisible to the sweeps above — it has to be opened explicitly.
    await page.goto("/app.html?auth=login");
    await waitForBootstrap(page);
    await expect(page.locator("#authSheet")).toBeVisible();
    expect(await collect(), `${width}px 로그인 시트`).toEqual([]);
  });
}
