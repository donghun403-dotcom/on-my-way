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
// Four documented exemptions:
//   - links inline inside a sentence (WCAG 2.5.8 explicitly exempts these)
//   - .plan-week-day, where 7 columns cannot each be 44px wide at 320px
//   - .legal-nav-links a (the 개인정보/이용약관/고객지원/계정 탈퇴 header nav on the
//     four legal pages) — pre-existing gap, not created by Task 7's font swap.
//     Height is 22.09px on every legal page at every measured width because the
//     links carry no vertical padding at all (line-height:1.7 * 13px font ≈
//     22px is the whole box). That is font-size/line-height driven, not
//     glyph-width driven, so switching the font family cannot fix or worsen
//     it. Measured before/after with
//     .superpowers/sdd/typography-foundation-plan/measure-legal-tap-targets.cjs:
//     height was byte-for-byte identical (22.09 -> 22.09) and width moved
//     (52 -> 44.95 / 55.56 -> 48.22) but never crossed back over 44 in either
//     direction. Adding the missing padding is a legal.css layout fix, out of
//     scope for a font-family task.
//   - #deleteAgreement, the account-deletion confirmation checkbox on
//     /delete-account (13x20, hardcoded by `.check-row input { width:20px;
//     height:20px }` in legal.css). Pre-existing and font-independent —
//     confirmed unchanged (13x20 -> 13x20) by the same before/after script.
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
          .filter((el) => !el.closest(".legal-nav-links"))
          .filter((el) => el.id !== "deleteAgreement")
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

    // Legal pages: static documents that link legal.css (not styles.css), so
    // they were never covered by the sweeps above. Task 7 gave them a
    // font-family for the first time; this is the only tap-target coverage
    // they have. /delete-account renders two different DOMs depending on
    // session state (login prompt vs. the delete confirmation form), so it is
    // swept twice — waitForLoadState("networkidle") + document.fonts.ready
    // matches the wait used to take the Task 7 before/after measurements, so
    // the assertion sees the same settled, webfont-swapped layout.
    for (const pathname of ["/privacy", "/terms", "/support", "/delete-account"]) {
      if (pathname === "/delete-account") {
        await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"user":null}' }));
      }
      await page.goto(pathname);
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      expect(await collect(), `${width}px ${pathname}`).toEqual([]);
      if (pathname === "/delete-account") await page.unroute("**/api/auth/me");
    }

    await page.route("**/api/auth/me", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { id: "usr_e2e", name: "탭 타깃 테스트", email: "tap-target@example.com" } }),
    }));
    await page.goto("/delete-account");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("#deleteAccountForm")).toBeVisible();
    expect(await collect(), `${width}px 계정 탈퇴(로그인)`).toEqual([]);
    await page.unroute("**/api/auth/me");
  });
}
