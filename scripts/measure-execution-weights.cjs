// scripts/measure-execution-weights.cjs
// .execution-page 900 이관의 전후 실측. 오늘·계획·메이트·기억 탭을 돌며
// 대상 셀렉터의 computed font-weight/font-size를 마크다운 표로 찍는다.
// 사용: PORT=8768 node serve-local.cjs &  →  node scripts/measure-execution-weights.cjs
const { chromium } = require("@playwright/test");
const { prepareApp, waitForAppReady } = require("../tests/e2e/helpers.js");

const BASE = process.env.BASE || "http://127.0.0.1:8768";
// 탭으로 도달 가능한 대상만 잰다. 딥 스테이트(다이어리 북 생성·수정 제안 등)는
// 분류표의 마크업 근거로만 판정한다 — 설계 문서의 결정.
const TARGETS = [
  ".focus-mode-kicker", ".focus-task-copy > span", ".task-content > span:not(.task-row-head)",
  ".calendar-kicker", ".calendar-month-nav button", ".calendar-weekdays em",
  ".calendar-day strong", ".calendar-day > small",
  ".memory-kicker", ".memory-mood-picker legend", ".memory-mood-picker button",
  ".save-memory-button", ".memory-list-head span", ".memory-mood-badge",
  ".bond-kicker", ".bond-reaction", ".bond-next-unlock small",
  ".companion-next-inline small", ".companion-touch-secondary",
  ".companion-relationship-heading > span", ".companion-relationship-summary dd",
  ".journey-pro-link", ".plan-subview-header > div > span",
  "#myPageSheet > header span",
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, baseURL: BASE });
  await prepareApp(page);
  await page.goto("/app.html");
  await waitForAppReady(page);

  const rows = new Map();
  for (const view of ["today", "plan", "mate", "memory"]) {
    await page.locator(`#tab-${view}`).click();
    await page.locator(`#view-${view}`).waitFor({ state: "visible" });
    const found = await page.evaluate((targets) => {
      return targets.flatMap((sel) => {
        const el = document.querySelector(sel);
        if (!el || !el.offsetParent) return []; // 이 뷰에 없거나 숨김
        const cs = getComputedStyle(el);
        return [{ sel, weight: cs.fontWeight, size: cs.fontSize }];
      });
    }, TARGETS);
    for (const f of found) if (!rows.has(f.sel)) rows.set(f.sel, { ...f, view });
  }

  console.log("| selector | view | font-weight | font-size |");
  console.log("| --- | --- | --- | --- |");
  for (const r of [...rows.values()].sort((a, b) => a.sel.localeCompare(b.sel)))
    console.log(`| \`${r.sel}\` | ${r.view} | ${r.weight} | ${r.size} |`);
  console.log(`\n측정 ${rows.size}/${TARGETS.length} (미측정은 해당 뷰 기본 상태에 없음)`);
  await browser.close();
})();
