const { test, expect } = require("@playwright/test");
const { prepareApp, waitForAppReady, waitForBootstrap } = require("./helpers");

const prototypeUrl = "/core-loop-v2.html?experience=core-loop-v2";

async function resetPrototype(page, screen = "") {
  const suffix = screen ? `&state=${screen}` : "&reset=1";
  await page.goto(`${prototypeUrl}${suffix}`);
  await expect(page.locator("body")).toHaveAttribute("data-font-state", "loaded");
}

async function prototypeState(page) {
  return page.evaluate(() => window.__coreLoopPrototype.getState());
}

test("actual Goal and Today paths load the local brand font without applying it to user text or numbers", async ({ page }) => {
  await prepareApp(page);
  const fontResponse = page.waitForResponse((response) =>
    response.url().endsWith("/assets/fonts/yeogieottae-jalnan2.woff2"),
  );
  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);
  await expect(page.locator("body")).toHaveAttribute("data-brand-font-state", "loaded");
  const response = await fontResponse;
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("font/woff2");
  const goalStyles = await page.evaluate(() => ({
    ready: document.fonts.check('32px "여기어때 잘난체"', "올리가 함께 걸어요"),
    heading: getComputedStyle(document.querySelector("#diagnosisStepTitle")).fontFamily,
    cta: getComputedStyle(document.querySelector("#aiPreviewButton")).fontFamily,
    input: getComputedStyle(document.querySelector("#designGoal")).fontFamily,
    synthesis: getComputedStyle(document.querySelector("#aiPreviewButton")).fontSynthesis,
  }));
  expect(goalStyles.ready).toBe(true);
  expect(goalStyles.heading).toContain("여기어때 잘난체");
  expect(goalStyles.cta).toContain("여기어때 잘난체");
  expect(goalStyles.input).not.toContain("여기어때 잘난체");
  expect(goalStyles.synthesis).toBe("none");

  await page.goto("/app.html");
  await waitForAppReady(page);
  await expect(page.locator("body")).toHaveAttribute("data-brand-font-state", "loaded");
  const appStyles = await page.evaluate(() => ({
    heading: getComputedStyle(document.querySelector(".today-welcome h1")).fontFamily,
    action: getComputedStyle(document.querySelector(".today-next-action h2")).fontFamily,
    tab: getComputedStyle(document.querySelector(".execution-tabbar .tab-label")).fontFamily,
    date: getComputedStyle(document.querySelector("#todayDateLabel")).fontFamily,
  }));
  expect(appStyles.heading).toContain("여기어때 잘난체");
  expect(appStyles.action).toContain("여기어때 잘난체");
  expect(appStyles.tab).toContain("여기어때 잘난체");
  expect(appStyles.date).not.toContain("여기어때 잘난체");
});

test("local brand font loads for display and short UI roles while body and numeric roles stay neutral", async ({ page }) => {
  const fontResponse = page.waitForResponse((response) =>
    response.url().endsWith("/assets/fonts/yeogieottae-jalnan2.woff2"),
  );
  await resetPrototype(page);
  const response = await fontResponse;
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("font/woff2");

  const styles = await page.evaluate(() => ({
    fontReady: document.fonts.check('32px "여기어때 잘난체"', "올리가 함께 걸어요"),
    title: getComputedStyle(document.querySelector("#goalTitle")).fontFamily,
    roadmap: getComputedStyle(document.querySelector("#roadmapTitle")).fontFamily,
    milestone: getComputedStyle(document.querySelector(".journey-path h2")).fontFamily,
    primary: getComputedStyle(document.querySelector(".primary-action")).fontFamily,
    secondary: getComputedStyle(document.querySelector(".secondary-action")).fontFamily,
    bottomNav: getComputedStyle(document.querySelector(".prototype-tabs button")).fontFamily,
    quickChip: getComputedStyle(document.querySelector(".quick-actions button")).fontFamily,
    ollieSpeech: getComputedStyle(document.querySelector(".ollie-speech")).fontFamily,
    diaryBody: getComputedStyle(document.querySelector(".diary-list p")).fontFamily,
    diaryDate: getComputedStyle(document.querySelector(".diary-list time")).fontFamily,
    duration: getComputedStyle(document.querySelector(".focus-orbit strong")).fontFamily,
    synthesis: getComputedStyle(document.querySelector(".secondary-action")).fontSynthesis,
    body: getComputedStyle(document.body).fontFamily,
    brandViolations: [...document.querySelectorAll("body *")]
      .filter((element) => element.textContent.trim())
      .map((element) => ({ element, style: getComputedStyle(element) }))
      .filter(({ style }) => style.fontFamily.includes("여기어때 잘난체"))
      .filter(({ style }) => {
        const letterSpacing = style.letterSpacing === "normal" ? 0 : Number.parseFloat(style.letterSpacing);
        return (
          Number.parseFloat(style.fontSize) < 12 ||
          Number.parseInt(style.fontWeight, 10) > 400 ||
          letterSpacing < -1
        );
      })
      .map(({ element, style }) => ({
        tag: element.tagName,
        text: element.textContent.trim().slice(0, 40),
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
      })),
  }));
  expect(styles.fontReady).toBe(true);
  expect(styles.title).toContain("여기어때 잘난체");
  expect(styles.roadmap).toContain("여기어때 잘난체");
  expect(styles.milestone).toContain("여기어때 잘난체");
  expect(styles.primary).toContain("여기어때 잘난체");
  expect(styles.secondary).toContain("여기어때 잘난체");
  expect(styles.bottomNav).toContain("여기어때 잘난체");
  expect(styles.quickChip).toContain("여기어때 잘난체");
  expect(styles.ollieSpeech).toContain("여기어때 잘난체");
  expect(styles.synthesis).toBe("none");
  expect(styles.diaryBody).not.toContain("여기어때 잘난체");
  expect(styles.diaryDate).not.toContain("여기어때 잘난체");
  expect(styles.duration).not.toContain("여기어때 잘난체");
  expect(styles.body).not.toContain("여기어때 잘난체");
  expect(styles.body).toContain("Pretendard");
  expect(styles.brandViolations).toEqual([]);
});

for (const width of [320, 390, 430]) {
  test(`${width}px key mobile titles and actions fit without clipping`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });

    for (const screen of ["goal", "roadmap", "today"]) {
      await resetPrototype(page, screen);
      const result = await page.evaluate(() => {
        const title = document.querySelector(".prototype-screen.is-active h1");
        const titleStyle = getComputedStyle(title);
        const titleLines = Math.round(title.getBoundingClientRect().height / Number.parseFloat(titleStyle.lineHeight));
        const clippedButtons = [...document.querySelectorAll(".prototype-screen.is-active button")]
          .filter((button) => getComputedStyle(button).display !== "none")
          .filter(
            (button) =>
              button.scrollWidth > button.clientWidth + 1 ||
              button.scrollHeight > button.clientHeight + 1,
          )
          .map((button) => button.textContent.trim());
        const primary = document.querySelector(".prototype-screen.is-active .primary-action");
        const currentMarker = document.querySelector(".prototype-screen.is-active .milestone-marker");
        return {
          titleLines,
          clippedButtons,
          primaryBottom: primary?.getBoundingClientRect().bottom ?? 0,
          currentMarkerTop: currentMarker?.getBoundingClientRect().top ?? 0,
        };
      });
      expect(result.titleLines, `${width}px ${screen} title`).toBeLessThanOrEqual(2);
      expect(result.clippedButtons, `${width}px ${screen} buttons`).toEqual([]);
      if (width >= 390) {
        expect(result.primaryBottom, `${width}px ${screen} primary CTA`).toBeLessThanOrEqual(844);
      }
      if (screen === "roadmap") {
        expect(result.currentMarkerTop, `${width}px current Roadmap marker`).toBeLessThan(844);
      }
    }
  });
}

test("goal entry exposes only two required decisions without native planning controls", async ({ page }) => {
  await resetPrototype(page);
  await expect(page.locator("#goalForm [required]")).toHaveCount(2);
  await expect(page.locator('#goalForm input[type="radio"]:checked')).toHaveValue("3개월");
  await expect(page.locator('#goalForm input[type="checkbox"], #goalForm input[type="date"], #goalForm select')).toHaveCount(0);

  const nativeControlStyles = await page.evaluate(() => {
    const radio = document.querySelector('#goalForm input[type="radio"]');
    const fieldset = document.querySelector("#goalForm fieldset");
    return {
      radioOpacity: getComputedStyle(radio).opacity,
      radioWidth: getComputedStyle(radio).width,
      fieldsetBorder: getComputedStyle(fieldset).borderTopWidth,
    };
  });
  expect(nativeControlStyles).toEqual({
    radioOpacity: "0",
    radioWidth: "1px",
    fieldsetBorder: "0px",
  });
});

test("one generation produces a roadmap, while pending edits call no AI until apply", async ({ page }) => {
  const providerRequests = [];
  page.on("request", (request) => {
    if (/\/api\/(?:ai|guest-plan)/.test(request.url())) providerRequests.push(request.url());
  });

  await resetPrototype(page);
  await page.locator("#prototypeContext").fill("");
  await page.locator("#goalForm .primary-action").click();
  await expect(page.locator('[data-screen="roadmap"]')).toBeVisible();
  await expect(page.locator(".journey-path > li")).toHaveCount(4);
  await expect(page.locator(".week-peek")).toContainText("큰 길을 고정한 뒤 일정이 확정돼요");
  expect(await prototypeState(page)).toMatchObject({
    roadmapLocked: false,
    aiCalls: { generation: 1, revision: 0 },
  });

  await page.locator('[data-next="adjust"]').click();
  await page.locator('[data-change="수요일은 할 수 없어요"]').click();
  await page.locator("#changeInput").fill("평일에는 20분만 가능해요");
  await page.locator("#addChange").click();
  expect((await prototypeState(page)).aiCalls).toEqual({ generation: 1, revision: 0 });
  expect(providerRequests).toHaveLength(0);

  await page.locator("#applyChanges").click();
  await expect(page.locator('[data-screen="changes"]')).toBeVisible();
  expect((await prototypeState(page)).aiCalls).toEqual({ generation: 1, revision: 1 });
  expect(providerRequests).toHaveLength(0);
});

test("failed revision preserves the current roadmap and reports the failed call", async ({ page }) => {
  await resetPrototype(page, "adjust");
  await page.evaluate(() => window.__coreLoopPrototype.failNextRevision());
  await page.locator('[data-change="첫 달 분량을 줄여 주세요"]').click();
  await page.locator("#applyChanges").click();

  await expect(page.locator('[data-screen="adjust"]')).toBeVisible();
  await expect(page.locator("#revisionError")).toBeVisible();
  expect(await prototypeState(page)).toMatchObject({
    roadmapRevision: 1,
    appliedChanges: [],
    aiCalls: { generation: 0, revision: 1 },
  });
});

test("locking and direct schedule edits preserve stable typed items without AI calls", async ({ page }) => {
  await resetPrototype(page, "changes");
  const before = (await prototypeState(page)).aiCalls;
  await page.locator("#lockRoadmap").click();
  await expect(page.locator('[data-screen="locked"]')).toBeVisible();
  await expect(page.locator("#firstWeek .week-row")).toHaveCount(6);
  await expect(page.locator('#firstWeek [data-item-type="SYSTEM_RULE"]')).toHaveCount(0);
  await expect(page.locator('#firstWeek [data-item-type="ACTION"]')).toHaveCount(3);
  await page.locator("#changeDays").click();
  await page.locator("#reduceTime").click();
  const after = await prototypeState(page);
  expect(after.aiCalls).toEqual(before);
  expect(after.task.id).toBe("prototype-action-001");
  expect(after.task.durationMinutes).toBe(10);
});

test("TaskEditSheet updates Today and Plan with focus return and no duplicate state", async ({ page }) => {
  await resetPrototype(page, "today");
  await expect(page.locator('[data-item-type="REVIEW"] button, [data-item-type="TIP"] button')).toHaveCount(0);
  const opener = page.locator("#editTask");
  await opener.click();
  await expect(page.locator("#taskEditSheet")).toBeVisible();
  await page.locator("#editTaskTitle").fill("첫 사용자에게 문제 문장 보여주기");
  await page.locator("#editTaskMinutes").fill("20");
  await page.locator("#saveTaskEdit").click();

  await expect(page.locator("#taskEditSheet")).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expect(page.locator("#todayActionTitle")).toHaveText("첫 사용자에게 문제 문장 보여주기");
  expect((await prototypeState(page)).task).toMatchObject({
    id: "prototype-action-001",
    durationMinutes: 20,
  });

  await opener.click();
  await page.locator("#editTaskTitle").fill("저장하면 안 되는 임시 문구");
  await page.locator('#taskEditSheet header button[value="cancel"]').click();
  await expect(opener).toBeFocused();
  await expect(page.locator("#todayActionTitle")).toHaveText("첫 사용자에게 문제 문장 보여주기");

  await page.evaluate(() => window.__coreLoopPrototype.showScreen("plan"));
  await expect(page.locator('#planWeekList [data-task-id="prototype-action-001"]')).toContainText(
    "첫 사용자에게 문제 문장 보여주기",
  );
});

test("ACTION completion writes Diary before optional reflection and survives reload", async ({ page }) => {
  await resetPrototype(page, "focus");
  await page.locator("#shortenFocus").click();
  await expect(page.locator("#focusMinutes")).toHaveText("5");
  await page.locator("#completeAction").click();
  await expect(page.locator('[data-screen="reflection"]')).toBeVisible();
  await expect(page.locator("#prototypeTabs")).toBeHidden();
  let state = await prototypeState(page);
  expect(state.diary).toHaveLength(1);
  expect(state.diary[0]).toMatchObject({
    taskId: "prototype-action-001",
    mood: "",
    note: "",
  });
  expect(state.growthCount).toBe(1);

  await page.evaluate(() => history.replaceState({}, "", "/core-loop-v2.html?experience=core-loop-v2"));
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-font-state", "loaded");
  state = await prototypeState(page);
  expect(state.diary).toHaveLength(1);
  expect(state.growthCount).toBe(1);
  await page.evaluate(() => window.__coreLoopPrototype.showScreen("record"));
  await expect(page.locator("#diaryList article")).toHaveCount(1);
  await expect(page.locator("#diaryList")).toContainText("사용자 한 명의 불편");
});

for (const screens of [
  ["goal", "roadmap", "adjust"],
  ["changes", "locked", "today"],
  ["focus", "reflection", "growth"],
  ["recovery"],
]) {
  test(`${screens.join(", ")} keep one discoverable primary action per screen`, async ({ page }) => {
    for (const screen of screens) {
      await resetPrototype(page, screen);
      await expect(page.locator(".prototype-screen.is-active .primary-action:visible")).toHaveCount(1);
    }
  });
}

test("recovery remains non-punitive", async ({ page }) => {
  await resetPrototype(page, "recovery");
  const recoveryText = await page.locator('[data-screen="recovery"]').innerText();
  expect(recoveryText).not.toMatch(/실패|벌점|초기화|연속 기록이 끊/);
  await page.locator('[data-recovery="rest"]').click();
  await expect(page.locator("#recoveryStatus")).toContainText("쉬는 날도 길의 일부");
});

for (const width of [320, 390, 430, 1440]) {
  for (const screen of ["goal", "roadmap", "today", "plan", "record"]) {
    test(`${width}px ${screen} screen has no horizontal overflow or console errors`, async ({ page }) => {
      const browserErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
          browserErrors.push(`${screen}: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => browserErrors.push(`${screen}: ${error.message}`));
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await resetPrototype(page, screen);
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      expect(dimensions.document, `${width}px ${screen}`).toBeLessThanOrEqual(dimensions.viewport);
      expect(dimensions.body, `${width}px ${screen}`).toBeLessThanOrEqual(dimensions.viewport);
      expect(browserErrors).toEqual([]);
    });
  }
}
