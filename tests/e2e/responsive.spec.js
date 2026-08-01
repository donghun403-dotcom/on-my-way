const { test, expect } = require("@playwright/test");
const { captureAcceptance, completeManualPlan, expectNoHorizontalOverflow, mockAccountExperience, monitorPage, prepareApp, waitForAppReady, waitForBootstrap } = require("./helpers");

const viewports = [
  [320, 568],
  [360, 800],
  [375, 812],
  [390, 844],
  [393, 852],
  [430, 932],
  [768, 1024],
  [1440, 900],
];

test.describe.configure({ mode: "serial", timeout: 90_000 });

for (const [width, height] of [[320, 568], [390, 844], [430, 932], [768, 1024]]) {
  test(`${width}x${height} 목표 추천과 로그인 선택 화면`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const diagnostics = monitorPage(page);
    await mockAccountExperience(page);

    await page.goto("/index.html#designFlow");
    await waitForBootstrap(page);
    await page.getByRole("button", { name: "시험", exact: true }).click();
    await expect(page.locator("#goalExampleSuggestions button")).toHaveCount(3);
    await expect(page.locator("#designGoal")).toBeVisible();
    await expect(page.locator("#diagnosisNextButton")).toBeDisabled();
    await expectNoHorizontalOverflow(page);

    await page.goto("/app.html?auth=login");
    await waitForBootstrap(page);
    await expect(page.locator("#authSheet")).toBeVisible();
    await expect(page.getByRole("button", { name: "카카오로 계속하기" })).toBeVisible();
    await expect(page.getByRole("button", { name: "네이버로 계속하기" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Google로 계속하기" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    diagnostics.expectClean();
  });
}

/* origin/main은 미리보기가 그려진 뒤 #firstStep의 가로 넘침을 봤다(scrollWidth <=
   clientWidth). 이 브랜치가 결과 화면 마크업과 스타일을 다시 쓰면서 그 단언이
   사라졌고, 위 루프는 빌더 1단계에서 멈춰 결과 화면을 좁은 화면에서 한 번도 보지
   않는다. 가장 좁은 320px에서 결과 카드가 넘치면 유저는 자기 계획을 확인하지 못한
   채 시작 버튼을 눌러야 한다. */
test("320x568 수동 빌더 결과 화면이 가로로 넘치지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const diagnostics = monitorPage(page);
  await mockAccountExperience(page);

  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);
  await completeManualPlan(page, {
    goal: "3개월 안에 토익 900점 달성하기",
    tasks: [
      { time: "07:00", text: "기출문제 1세트를 풀고 채점과 오답 표시까지 하기", minutes: 20, rule: "테스트에서 35개 이상 맞히면 완료" },
      { time: "21:00", text: "기출 1세트 풀기", minutes: 40, rule: "채점과 오답 표시까지 하면 완료" },
    ],
  });

  await expectNoHorizontalOverflow(page);
  const firstStepOverflow = await page.locator("#firstStep")
    .evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(firstStepOverflow, "#firstStep horizontal overflow").toBeLessThanOrEqual(1);

  const visibleWeekCopies = page.locator("#aiVisibleWeekPlan > li:visible > p");
  await expect(visibleWeekCopies).toHaveCount(3);
  const collapsedCopyMetrics = await visibleWeekCopies.evaluateAll((elements) => elements.map((element) => ({
    whiteSpace: getComputedStyle(element).whiteSpace,
    overflow: element.scrollWidth - element.clientWidth,
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
  })));
  expect(collapsedCopyMetrics.every(({ whiteSpace }) => whiteSpace === "normal")).toBe(true);
  expect(collapsedCopyMetrics.every(({ overflow }) => overflow <= 1)).toBe(true);
  expect(collapsedCopyMetrics.some(({ height, lineHeight }) => height > lineHeight + 1)).toBe(true);

  await page.locator("#weekPreviewToggle").click();
  await expect(visibleWeekCopies).toHaveCount(7);
  const expandedCopyOverflow = await visibleWeekCopies.evaluateAll((elements) =>
    elements.map((element) => element.scrollWidth - element.clientWidth));
  expect(expandedCopyOverflow.every((overflow) => overflow <= 1)).toBe(true);

  // 접어 둔 상세(주간 일정 표)를 펼쳐도 화면을 밀지 않는다.
  await page.locator(".result-details-disclosure summary").click();
  await expect(page.locator(".result-details-disclosure")).toHaveAttribute("open", "");
  await expectNoHorizontalOverflow(page);
  diagnostics.expectClean();
});

for (const [width, height] of viewports) {
  test(`${width}x${height} 기준 화면 6종`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await prepareApp(page);
    const diagnostics = monitorPage(page);
    const capture = async (name) => {
      if (process.env.ACCEPTANCE_CAPTURE_DIR) {
        await captureAcceptance(page, testInfo, `${height}-${name}`);
        return;
      }
      await page.screenshot({ path: testInfo.outputPath(`${width}x${height}-${name}.png`), fullPage: true });
    };

    diagnostics.mark("before-index-navigation");
    await page.goto("/index.html");
    diagnostics.mark("after-index-navigation");
    await expectNoHorizontalOverflow(page);
    await capture("landing");

    diagnostics.mark("before-app-navigation");
    await page.goto("/app.html");
    diagnostics.mark("after-app-navigation");
    for (const view of ["today", "plan", "mate", "memory"]) {
      await page.locator(`#tab-${view}`).click();
      await expect(page.locator(`#view-${view}`)).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await capture(view);
    }
    await page.locator("#tab-today").click();
    await page.locator("#addTodayScheduleButton").click();
    await expect(page.locator("#closeAddSchedule")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const sheetBox = await page.locator("#addScheduleSheet").boundingBox();
    expect(sheetBox.y).toBeGreaterThanOrEqual(0);
    expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(height + 1);
    await capture("schedule-sheet");
    diagnostics.mark("before-clean-assertion");
    diagnostics.expectClean();
    if (new URL(page.url()).origin === "https://onmyway.olivenrich.com") {
      const analyticsSummary = diagnostics.getAnalyticsSummary();
      expect(analyticsSummary.completedStatuses.length).toBeGreaterThan(0);
      expect(analyticsSummary.completedStatuses.every((status) => status === 204)).toBe(true);
      expect(analyticsSummary.cspFailureCount).toBe(0);
      console.log(`[production-analytics] ${JSON.stringify({ viewport: `${width}x${height}`, ...analyticsSummary })}`);
    }
  });
}

for (const [width, height] of [[320, 568], [390, 844], [430, 932], [768, 1024], [1440, 900]]) {
  test(`${width}x${height} 실제 앱 콘텐츠는 하단 탐색 위에서 끝난다`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await prepareApp(page);
    await page.goto("/app.html");
    await waitForAppReady(page);

    for (const viewName of ["today", "plan", "mate", "memory"]) {
      await page.locator(`#tab-${viewName}`).click();
      const bounds = await page.evaluate(async (name) => {
        const view = document.querySelector(`#view-${name}`);
        const marker = document.createElement("span");
        marker.dataset.testBottomMarker = name;
        marker.style.cssText = "display:block;width:1px;height:1px;pointer-events:none";
        view.append(marker);
        const previousScrollBehavior = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = "auto";
        document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const markerBox = marker.getBoundingClientRect();
        const tabbarBox = document.querySelector(".execution-tabbar").getBoundingClientRect();
        marker.remove();
        document.documentElement.style.scrollBehavior = previousScrollBehavior;
        return {
          markerBottom: markerBox.bottom,
          tabbarTop: tabbarBox.top,
          horizontalOverflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth,
        };
      }, viewName);
      expect(bounds.markerBottom, `${width}px ${viewName} bottom marker`).toBeLessThanOrEqual(bounds.tabbarTop - 23);
      expect(bounds.horizontalOverflow, `${width}px ${viewName} horizontal overflow`).toBeLessThanOrEqual(1);
    }
  });
}
