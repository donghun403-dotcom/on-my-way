/* AI 온보딩 전용 회귀 스펙 — 2단계(수동 빌더 이식)에서 일괄 test.skip 처리했다.
   온보딩이 /api/ai/goal-* 를 더 이상 호출하지 않아 이 시나리오들은 도달할 수 없다.
   삭제하지 않고 남겨두는 이유는 3단계(게스트 AI 라우트 제거)에서 어떤 서버 계약이
   함께 사라지는지 대조하기 위해서다. 그때 이 파일째 정리한다. */
const { test, expect } = require("@playwright/test");
const { captureAcceptance, createUsageResponse, mockAccountExperience, monitorPage, submitGoalStory, waitForAppReady, waitForBootstrap } = require("./helpers");

test.setTimeout(90_000);

function guestPreviewPlan() {
  const firstWeekSchedule = ["월", "화", "수", "목", "금", "토", "일"].map((dayLabel, index) => ({
    dayNumber: index + 1,
    dayLabel,
    isRestDay: false,
    items: [{
      id: `e2e-action-${index + 1}`,
      planId: "e2e-draft-plan",
      type: "ACTION",
      title: index ? "잠재 고객 반응 한 줄 정리" : "잠재 고객 한 명에게 문제 인터뷰를 요청하기",
      sourceReference: "고객 인터뷰 노트",
      quantityOrRange: "고객 1명",
      durationMinutes: 15,
      completionRule: "메시지 또는 기록 한 건을 남기면 완료",
      scheduledAt: "",
      status: "pending",
      recurrenceGroupId: "e2e-customer-interview",
    }],
  }));
  return {
    personalitySummary: "고객 대화부터 작게 시작하면 실행 리듬을 만들 수 있어요.",
    planningStyle: "고객 검증 실행형 계획",
    firstAction: "잠재 고객 한 명에게 문제 인터뷰를 요청하기",
    weekTitle: "첫 주에는 고객 문제를 직접 확인해요.",
    weekPlan: ["고객 후보 5명 적기", "인터뷰 1명 요청하기", "질문 5개 정리하기", "응답 기록하기", "가설 한 줄 수정하기"],
    coachMessage: "완벽한 제품보다 실제 고객의 말을 먼저 모아 봐요.",
    todaySchedule: [{
      time: "저녁",
      durationMinutes: 15,
      task: "잠재 고객 한 명에게 문제 인터뷰를 요청하기",
      completionRule: "메시지 한 건을 보내면 완료",
    }],
    firstWeekSchedule,
    assumptions: ["자료가 정해지지 않아 일반 계획으로 구성했어요."],
  };
}

function fullGoalPlan() {
  return {
    ...guestPreviewPlan(),
    weekPlan: ["고객 후보 5명 적기", "인터뷰 1명 요청하기", "질문 5개 정리하기", "응답 기록하기", "가설 한 줄 수정하기"],
    dashboard: { goal: "첫 유료 고객 만들기", progress: 0, pace: "첫 주 고객 검증" },
    fullSchedule: [
      { phase: "탐색", days: "1~7일", focus: "고객 문제 확인", successMetric: "인터뷰 3명" },
      { phase: "제안", days: "8~30일", focus: "작은 해결안 제안", successMetric: "제안 5회" },
      { phase: "판매", days: "31~90일", focus: "유료 전환", successMetric: "고객 10명" },
    ],
    checkInRules: ["요청 수를 기록해요.", "답이 없으면 대상만 바꿔요.", "주말에 질문을 조정해요."],
    fallbackPlan: "어려운 날에는 고객 후보 이름 한 명만 적어요.",
  };
}

async function openGuestFullPlanAuthChooser(page) {
  const account = await mockAccountExperience(page);
  const calls = { preview: 0, claim: 0, full: 0 };
  const claimBodies = [];
  await page.route("**/api/ai/goal-preview", (route) => {
    calls.preview += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true,
      cached: false,
      draftPlanId: "e2e-draft-plan",
      preview: guestPreviewPlan(),
      activeInput: { goal: "90일 안에 첫 유료 고객 10명 만들기" },
      activeInputHash: "a".repeat(64),
      activeRevision: 1,
    }) });
  });
  await page.route("**/api/ai/goal-draft/claim", (route) => {
    calls.claim += 1;
    claimBodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true,
      draftPlanId: "e2e-draft-plan",
      plan: fullGoalPlan(),
      activatedPlan: { ...fullGoalPlan(), planId: "e2e-draft-plan", planSource: "ai-reviewed-draft" },
      chargedCredits: 0,
    }) });
  });
  await page.route("**/api/ai/goal-plan", (route) => {
    calls.full += 1;
    account.usage = createUsageResponse({ plan: "trial", dailyUsed: 4, monthlyUsed: 4, trialEligible: false, trialActive: true });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, plan: fullGoalPlan(), requestId: "create_plan:auth-recovery", chargedCredits: 4, usage: account.usage }),
    });
  });

  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);
  await page.getByRole("button", { name: "창업", exact: true }).click();
  await page.getByRole("button", { name: "90일 안에 첫 유료 고객 10명 만들기", exact: true }).click();
  await page.locator("#goalAnalyzeButton").click();
  await page.locator("#aiPreviewButton").waitFor({ state: "visible" });
  await page.locator("#aiPreviewButton").click();
  await expect.poll(() => calls.preview).toBe(1);
  await expect(page.locator("#firstStep")).toHaveAttribute("data-preview-mode", "guest");
  // 온보딩 페이지에서 바로 로그인 시트를 연다. 초안 화면을 떠나지 않는다.
  await page.locator("#trialStartInlineLink").click();
  await expect(page.locator("#authSheet")).toBeVisible();
  return { account, calls, claimBodies };
}

test.skip("infeasible roadmap requires an explicit adjustment before claim", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile-chromium") {
    await page.setViewportSize({ width: 390, height: 844 });
  }
  const diagnostics = monitorPage(page);
  const account = await mockAccountExperience(page);
  let previewCalls = 0;
  let revisionCalls = 0;
  let claimCalls = 0;
  const goal = "Build a customer interview roadmap";
  const initialRoadmap = {
    ...fullGoalPlan(),
    scheduleContract: {
      exactDatesServerDerived: true,
      requiresAdjustmentBeforeClaim: true,
    },
    feasibility: {
      status: "infeasible_as_requested",
      summary: "현재 횟수로는 기간 안에 완료하기 어려워요.",
      adjustmentOptions: ["extend_duration", "increase_frequency"],
      recommendedOption: "increase_frequency",
    },
  };
  const allowedDayIndexes = new Set([0, 1, 2, 4]);
  const revisedRoadmap = {
    ...fullGoalPlan(),
    goal,
    firstAction: "고객 인터뷰 질문 3개를 25분 안에 정리하기",
    scheduleContract: {
      exactDatesServerDerived: true,
      requiresAdjustmentBeforeClaim: false,
    },
    feasibility: {
      status: "feasible",
      summary: "주 4회, 회당 25분으로 첫 주를 시작할 수 있어요.",
      adjustmentOptions: ["keep_current_plan"],
      recommendedOption: "keep_current_plan",
    },
    firstWeekSchedule: fullGoalPlan().firstWeekSchedule.map((day, index) => ({
      ...day,
      isRestDay: !allowedDayIndexes.has(index),
      items: allowedDayIndexes.has(index)
        ? day.items.map((item) => ({
            ...item,
            durationMinutes: 25,
            scheduledAt: `2026-07-${String(27 + index).padStart(2, "0")}T07:00:00+09:00`,
          }))
        : [],
    })),
  };
  await page.route("**/api/ai/goal-preview", (route) => {
    previewCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        cached: false,
        draftPlanId: "e2e-infeasible-roadmap",
        preview: initialRoadmap,
        activeInput: { goal },
        activeInputHash: "f".repeat(64),
        activeRevision: 1,
      }),
    });
  });
  await page.route("**/api/ai/goal-draft/revise", (route) => {
    revisionCalls += 1;
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({
      draftPlanId: "e2e-infeasible-roadmap",
      expectedRevision: 1,
      expectedInputHash: "f".repeat(64),
      input: {
        goal,
        feasibilityAdjustment: "increase_frequency",
        availability: { weeklyFrequency: 4, sessionMinutes: 25 },
      },
    });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        cached: false,
        draftPlanId: "e2e-infeasible-roadmap",
        preview: revisedRoadmap,
        activeInput: body.input,
        activeInputHash: "e".repeat(64),
        activeRevision: 2,
      }),
    });
  });
  await page.route("**/api/ai/goal-draft/claim", (route) => {
    claimCalls += 1;
    expect(route.request().postDataJSON()).toMatchObject({
      draftPlanId: "e2e-infeasible-roadmap",
      expectedRevision: 2,
      expectedInputHash: "e".repeat(64),
    });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        draftPlanId: "e2e-infeasible-roadmap",
        plan: revisedRoadmap,
        activatedPlan: {
          ...revisedRoadmap,
          planId: "e2e-infeasible-roadmap",
          planSource: "ai-reviewed-draft",
        },
        chargedCredits: 0,
      }),
    });
  });

  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);
  await submitGoalStory(page, goal);
  await page.locator("#goalPeriod").selectOption("30");
  await page.locator("#aiPreviewButton").click();
  await expect.poll(() => previewCalls).toBe(1);
  await expect(page.locator("#aiPreviewStatus")).toHaveText("현재 계획과 조건이 일치해요.");
  await expect(page.locator("#draftFeasibilityTitle")).toContainText("조정안");

  const adjustment = page.locator('[data-feasibility-adjustment="increase_frequency"]');
  await expect(adjustment).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#trialStartInlineLink")).toHaveAttribute("aria-disabled", "true");
  await adjustment.click();

  await expect(adjustment).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#weeklyFrequency")).toHaveValue("4");
  await expect(page.locator("[data-available-day]:checked")).toHaveCount(4);
  await expect(page.locator("#trialStartInlineLink")).toHaveAttribute("aria-disabled", "true");
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("onmyway:pending-goal-preview") || "null"));
  expect(stored.pendingDraftInput.feasibilityAdjustment).toBe("increase_frequency");
  expect(stored.activeRevision).toBe(1);
  expect(previewCalls).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("omwExecutionPlan"))).toBeNull();

  await page.locator("#draftAdjustButton").click();
  await expect(page.locator("#designGoal")).toHaveValue(goal);
  await page.locator("#aiPreviewButton").click();
  await expect.poll(() => revisionCalls).toBe(1);
  await expect(page.locator("#previewAction")).toHaveText(revisedRoadmap.firstAction);
  await expect(page.locator("#draftFeasibilityTitle")).toHaveText("현재 조건으로 시작할 수 있어요");
  const revised = await page.evaluate(() => JSON.parse(sessionStorage.getItem("onmyway:pending-goal-preview") || "null"));
  expect(revised.pendingDraftInput).toBeNull();
  expect(revised.activeRevision).toBe(2);
  expect(revised.activeInputHash).toBe("e".repeat(64));
  expect(await page.evaluate(() => localStorage.getItem("omwExecutionPlan"))).toBeNull();

  await page.locator("#trialStartInlineLink").click();
  await expect(page.locator("#authSheet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Google로 계속하기" })).toBeVisible();
  account.user = { id: "usr_infeasible_e2e", provider: "google", name: "Roadmap Tester", email: "roadmap@example.com", plan: "free", role: "member" };
  account.usage = createUsageResponse({ plan: "free", trialEligible: true });
  // 로그인을 마치고 돌아오면 CTA를 다시 누르지 않아도 초안을 저장하고 앱으로 넘어간다.
  await page.goto("/?resumeGoal=1&auth=success");
  await page.waitForURL(/\/app\.html/);
  await waitForAppReady(page);

  const activated = await page.evaluate(() => (localStorage.getItem("omwExecutionPlan") ? readExecutionPlan() : null));
  expect(activated.goal).toBe(goal);
  expect(activated.planSource).toBe("ai-reviewed-draft");
  const scheduledActions = activated.firstWeekSchedule.flatMap((day) => day.items || []);
  expect(scheduledActions).toHaveLength(4);
  expect(scheduledActions.every((item) => item.type === "ACTION" && item.durationMinutes <= 25)).toBeTruthy();
  expect(claimCalls).toBe(1);
  expect(previewCalls).toBe(1);
  expect(revisionCalls).toBe(1);
  diagnostics.expectClean();
});

test.skip("guest generation keeps its request key after transport loss and rotates it after a terminal result", async ({ page }) => {
  await mockAccountExperience(page);
  const requestBodies = [];
  const requestFailures = [];
  const consoleErrors = [];
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).pathname === "/api/ai/goal-preview") {
      requestFailures.push({
        method: request.method(),
        errorText: request.failure()?.errorText || "",
      });
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.route("**/api/ai/goal-preview", (route) => {
    const body = route.request().postDataJSON();
    requestBodies.push(body);
    if (requestBodies.length === 1) return route.abort("connectionreset");
    if (requestBodies.length === 2) {
      return route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          code: "AI_OUTPUT_DOMAIN_INVALID",
          error: "계획을 완성하지 못했어요. 적어둔 내용은 그대로 보관했어요.",
          retryable: false,
          terminal: true,
          cached: true,
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        cached: false,
        draftPlanId: "e2e-explicit-generation-retry",
        preview: guestPreviewPlan(),
        activeInput: { goal: "Prepare a launch roadmap" },
        activeInputHash: "a".repeat(64),
        activeRevision: 1,
      }),
    });
  });

  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);
  await submitGoalStory(page, "Prepare a launch roadmap");
  await page.locator("#goalPeriod").selectOption("90");
  await page.locator("#currentContext").fill("Keep the first week light");

  await page.locator("#aiPreviewButton").click();
  await expect.poll(() => requestBodies.length).toBe(1);
  await expect(page.locator("#aiPreviewButton")).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem("omwExecutionPlan"))).toBeNull();
  let savedDraft = await page.evaluate(() => JSON.parse(sessionStorage.getItem("onmyway:pending-goal-draft") || "null"));
  expect(savedDraft).toMatchObject({
    goal: "Prepare a launch roadmap",
    period: "90",
    currentContext: "Keep the first week light",
  });

  await page.locator("#aiPreviewButton").click();
  await expect.poll(() => requestBodies.length).toBe(2);
  expect(requestBodies[1].idempotencyKey).toBe(requestBodies[0].idempotencyKey);
  await expect(page.locator("#aiPreviewStatus")).toHaveText("계획을 완성하지 못했어요. 적어둔 내용은 그대로 보관했어요.");
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:pending-goal-preview"))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:guest-goal-initial-attempt"))).toBeNull();

  await page.locator("#aiPreviewButton").click();
  await expect.poll(() => requestBodies.length).toBe(3);
  expect(requestBodies[2].idempotencyKey).not.toBe(requestBodies[1].idempotencyKey);
  await expect(page.locator("#previewAction")).toHaveText(guestPreviewPlan().firstAction);
  savedDraft = await page.evaluate(() => JSON.parse(sessionStorage.getItem("onmyway:pending-goal-draft") || "null"));
  expect(savedDraft).toMatchObject({
    goal: "Prepare a launch roadmap",
    period: "90",
    currentContext: "Keep the first week light",
  });
  expect(requestFailures).toHaveLength(1);
  expect(requestFailures[0].method).toBe("POST");
  expect(requestFailures[0].errorText).toBeTruthy();
  expect(consoleErrors.every((message) => /Failed to load resource|ERR_CONNECTION_RESET/i.test(message))).toBeTruthy();
});

test.skip("guest generation fails closed before the provider request when its attempt key cannot be stored", async ({ page }) => {
  await mockAccountExperience(page);
  let previewRequests = 0;
  await page.route("**/api/ai/goal-preview", (route) => {
    previewRequests += 1;
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false }) });
  });

  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);
  await submitGoalStory(page, "Prepare a launch roadmap");
  await page.locator("#goalPeriod").selectOption("90");
  await page.locator("#currentContext").fill("Keep the first week light");
  await page.evaluate(() => {
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (this === sessionStorage && key === "onmyway:guest-goal-initial-attempt") {
        throw new DOMException("fixture storage failure", "QuotaExceededError");
      }
      return nativeSetItem.call(this, key, value);
    };
  });

  await page.locator("#aiPreviewButton").click();
  await expect(page.locator("#aiPreviewStatus")).toContainText("브라우저 저장 공간을 사용할 수 없어");
  await expect(page.locator("#aiPreviewButton")).toBeEnabled();
  expect(previewRequests).toBe(0);
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:pending-goal-preview"))).toBeNull();

  await page.locator("#aiPreviewButton").click();
  await expect(page.locator("#aiPreviewStatus")).toContainText("브라우저 저장 공간을 사용할 수 없어");
  expect(previewRequests).toBe(0);
});

test.skip("a failed initial attempt-key cleanup blocks another request instead of silently reusing stale state", async ({ page }) => {
  await mockAccountExperience(page);
  let previewRequests = 0;
  await page.route("**/api/ai/goal-preview", (route) => {
    previewRequests += 1;
    return route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        code: "AI_OUTPUT_DOMAIN_INVALID",
        error: "계획을 완성하지 못했어요. 적어둔 내용은 그대로 보관했어요.",
        retryable: false,
        terminal: true,
        cached: true,
      }),
    });
  });

  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);
  await submitGoalStory(page, "Prepare a launch roadmap");
  await page.locator("#goalPeriod").selectOption("90");
  await page.locator("#currentContext").fill("Keep the first week light");
  await page.evaluate(() => {
    const nativeRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function removeItem(key) {
      if (this === sessionStorage && key === "onmyway:guest-goal-initial-attempt") {
        throw new DOMException("fixture storage failure", "SecurityError");
      }
      return nativeRemoveItem.call(this, key);
    };
  });

  await page.locator("#aiPreviewButton").click();
  await expect(page.locator("#aiPreviewStatus")).toContainText("브라우저 저장 공간을 사용할 수 없어");
  expect(previewRequests).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:guest-goal-initial-attempt"))).toBeTruthy();

  await page.locator("#aiPreviewButton").click();
  await expect(page.locator("#aiPreviewStatus")).toContainText("브라우저 저장 공간을 사용할 수 없어");
  expect(previewRequests).toBe(1);
});

test.skip("a failed revision attempt-key cleanup preserves the active roadmap and blocks another request", async ({ page }) => {
  await mockAccountExperience(page);
  let previewRequests = 0;
  let revisionRequests = 0;
  await page.route("**/api/ai/goal-preview", (route) => {
    previewRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        cached: false,
        draftPlanId: "e2e-storage-revision",
        preview: guestPreviewPlan(),
        activeInput: { goal: "Prepare a launch roadmap", currentState: "Keep the first week light" },
        activeInputHash: "a".repeat(64),
        activeRevision: 1,
      }),
    });
  });
  await page.route("**/api/ai/goal-draft/revise", (route) => {
    revisionRequests += 1;
    return route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        code: "AI_OUTPUT_DOMAIN_INVALID",
        error: "계획을 완성하지 못했어요. 기존 계획은 그대로 보관했어요.",
        retryable: false,
        terminal: true,
        cached: true,
      }),
    });
  });

  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);
  await submitGoalStory(page, "Prepare a launch roadmap");
  await page.locator("#goalPeriod").selectOption("90");
  await page.locator("#currentContext").fill("Keep the first week light");
  await page.locator("#aiPreviewButton").click();
  await expect.poll(() => previewRequests).toBe(1);
  await expect(page.locator("#previewAction")).toHaveText(guestPreviewPlan().firstAction);

  await page.locator("#draftAdjustButton").click();
  await page.locator("#currentContext").fill("Use thirty minutes on weekdays");
  await page.locator("#currentContext").blur();
  await page.evaluate(() => {
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (this === sessionStorage && key === "onmyway:pending-goal-preview") {
        const current = JSON.parse(sessionStorage.getItem(key) || "null");
        const next = JSON.parse(String(value || "null"));
        if (current?.pendingRevision?.idempotencyKey && next?.pendingRevision === null) {
          throw new DOMException("fixture storage failure", "QuotaExceededError");
        }
      }
      return nativeSetItem.call(this, key, value);
    };
  });

  await page.locator("#aiPreviewButton").click();
  await expect(page.locator(".app-toast")).toContainText("브라우저 저장 공간을 사용할 수 없어");
  expect(revisionRequests).toBe(1);
  const afterFailure = await page.evaluate(() => JSON.parse(sessionStorage.getItem("onmyway:pending-goal-preview") || "null"));
  expect(afterFailure.activeRevision).toBe(1);
  expect(afterFailure.preview.firstAction).toBe(guestPreviewPlan().firstAction);
  expect(afterFailure.pendingRevision.idempotencyKey).toMatch(/^revision:/);

  await page.locator("#aiPreviewButton").click();
  await expect(page.locator(".app-toast")).toContainText("브라우저 저장 공간을 사용할 수 없어");
  expect(revisionRequests).toBe(1);
});

// 3단계 위저드는 요일·회당 시간·주당 횟수·기간 입력을 화면에 두지 않는다.
// 그 숨은 입력의 기본값(월·수·금 / 25분 / 주 3회 / 90일)이 사용자가 쓴 내용을
// 덮어써서, "매일 20분"이라고 적어도 월·수·금 계획이 만들어지고 있었다.
// AI는 이 모순을 알아채고 "무리한 계획"이라고 답했다 — 계획이 허술한 게 아니라
// 우리가 잘못된 조건을 보낸 것이었다.
test.skip("2단계에서 정리한 조건이 숨은 기본값 대신 AI 요청에 실린다", async ({ page }) => {
  await mockAccountExperience(page);
  let previewBody = null;
  await page.route("**/api/ai/goal-analyze", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, analysis: {
      goal: "30일 동안 매일 자기 전 20분 독서하기",
      currentState: [],
      availableTime: ["매일 자기 전 20분"],
      questions: [{ id: "startDate", question: "언제부터 시작할까요?", type: "date", options: [], defaultValue: "" }],
    } }),
  }));
  await page.route("**/api/ai/goal-preview", (route) => {
    previewBody = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        cached: false,
        draftPlanId: "e2e-derived-conditions",
        preview: guestPreviewPlan(),
        activeInput: { goal: "30일 동안 매일 자기 전 20분 독서하기" },
        activeInputHash: "c".repeat(64),
        activeRevision: 1,
      }),
    });
  });

  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);
  await submitGoalStory(page, "30일 동안 매일 자기 전 20분 독서하기");
  await page.locator("#aiPreviewButton").click();
  await expect.poll(() => previewBody).not.toBeNull();

  expect(previewBody.availability.availableDays).toEqual(["월", "화", "수", "목", "금", "토", "일"]);
  expect(previewBody.availability.weeklyFrequency).toBe(7);
  expect(previewBody.availability.sessionMinutes).toBe(20);
  expect(previewBody.periodDays).toBe(30);
});

// goal-analyze가 구조화한 conditions는 정규식 도출보다 우선한다. 목표 문장에
// 패턴("매일", "N분")이 전혀 없어도 서버가 이해한 조건이 계획 요청에 실려야 한다.
test.skip("goal-analyze의 구조화된 conditions가 정규식 도출보다 우선한다", async ({ page }) => {
  await mockAccountExperience(page);
  let previewBody = null;
  await page.route("**/api/ai/goal-analyze", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, analysis: {
      goal: "두 달 안에 밤에 책 읽는 습관 만들기",
      currentState: [],
      availableTime: ["화요일과 목요일 밤"],
      conditions: { availableDays: ["화", "목"], sessionMinutes: 45, weeklyFrequency: 2, periodDays: 60 },
      questions: [{ id: "startDate", question: "언제부터 시작할까요?", type: "date", options: [], defaultValue: "" }],
    } }),
  }));
  await page.route("**/api/ai/goal-preview", (route) => {
    previewBody = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        cached: false,
        draftPlanId: "e2e-structured-conditions",
        preview: guestPreviewPlan(),
        activeInput: { goal: "두 달 안에 밤에 책 읽는 습관 만들기" },
        activeInputHash: "b".repeat(64),
        activeRevision: 1,
      }),
    });
  });

  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);
  await submitGoalStory(page, "잠들기 전에 꾸준히 책을 읽는 사람이 되고 싶어요");
  await page.locator("#aiPreviewButton").click();
  await expect.poll(() => previewBody).not.toBeNull();

  expect(previewBody.availability.availableDays).toEqual(["화", "목"]);
  expect(previewBody.availability.weeklyFrequency).toBe(2);
  expect(previewBody.availability.sessionMinutes).toBe(45);
  // "두 달"은 60일 그대로 간다 — 기간 select에 없는 값은 옵션을 만들어 쓴다.
  expect(previewBody.periodDays).toBe(60);
});

test.skip("목표 카테고리는 예시만 제안하고 사용자의 명시적 확인 전에는 진행하지 않는다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountExperience(page);
  const aiRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/ai/goal-")) aiRequests.push(request.url());
  });

  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);
  const goal = page.locator("#designGoal");
  const createRoadmap = page.locator("#goalAnalyzeButton");

  await expect(goal).toHaveValue("");
  await expect(createRoadmap).toBeDisabled();
  await page.getByRole("button", { name: "시험", exact: true }).click();
  await expect(page.getByRole("button", { name: "시험", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(goal).toHaveValue("");
  await expect(goal).toHaveAttribute("placeholder", "예: 6개월 안에 공인중개사 1차 합격하기");
  await expect(page.locator("#goalExampleSuggestions button")).toHaveCount(3);
  await expect(page.locator("#diagnosisStepCount")).toHaveText("1/3");
  await expect(createRoadmap).toBeDisabled();

  await page.getByRole("button", { name: "올해 한국사능력검정시험 1급 취득하기", exact: true }).click();
  await expect(goal).toHaveValue("올해 한국사능력검정시험 1급 취득하기");
  await expect(page.locator("#diagnosisStepCount")).toHaveText("1/3");
  await expect(createRoadmap).toBeEnabled();
  await goal.fill("올해 한국사능력검정시험 1급을 여름까지 취득하기");

  for (const category of ["운동", "취업", "습관"]) {
    await page.getByRole("button", { name: category, exact: true }).click();
    await expect(goal).toHaveValue("올해 한국사능력검정시험 1급을 여름까지 취득하기");
    await expect(page.locator("#diagnosisStepCount")).toHaveText("1/3");
  }

  await goal.fill("   ");
  await expect(createRoadmap).toBeDisabled();
  await expect(page.locator("#goalValidationMessage")).toHaveText("달성하고 싶은 결과를 입력해 주세요.");
  await goal.press("Enter");
  await expect(page.locator("#diagnosisStepCount")).toHaveText("1/3");

  await goal.fill("30일 동안 매일 저녁 한 줄 일기 쓰기");
  await expect(createRoadmap).toBeEnabled();
  expect(aiRequests).toHaveLength(0);
  diagnostics.expectClean();
});

test.skip("AI 미리보기 로그인 callback 취소는 provider 선택 화면과 초안을 복원한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const { calls } = await openGuestFullPlanAuthChooser(page);
  await page.route("**/api/auth/kakao/start**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><title>Kakao OAuth</title><p>Provider callback fixture</p>",
  }));

  await Promise.all([
    page.waitForURL(/\/api\/auth\/kakao\/start/),
    page.getByRole("button", { name: "카카오로 계속하기" }).click(),
  ]);
  await page.goto("/app.html?auth=cancelled&provider=kakao");
  await waitForBootstrap(page);
  await expect(page.locator("#authSheet")).toBeVisible();
  await expect(page.locator("#authProviderStatus")).toHaveText("카카오 로그인이 취소되었어요. 다른 방법으로 다시 로그인할 수 있어요.");
  await expect(page.locator("#authProviderStatus")).toBeFocused();
  await expect(page.getByRole("button", { name: "네이버로 계속하기" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("onmyway:pending-goal-draft") || "null")?.goal)).toBe("90일 안에 첫 유료 고객 10명 만들기");
  expect(calls).toEqual({ preview: 1, claim: 0, full: 0 });
  await expect(page.locator("body")).toHaveAttribute("data-auth-state", "anonymous");
  diagnostics.expectClean();
});

test.skip("provider 화면에서 browser back으로 돌아오면 자동 재시작 없이 chooser를 복원한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const { calls } = await openGuestFullPlanAuthChooser(page);
  let providerStarts = 0;
  await page.route("**/api/auth/kakao/start**", (route) => {
    providerStarts += 1;
    return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Provider handoff</title><p>외부 로그인 화면</p>" });
  });

  await Promise.all([
    page.waitForURL(/\/api\/auth\/kakao\/start/),
    page.getByRole("button", { name: "카카오로 계속하기" }).click(),
  ]);
  await page.goBack();
  await waitForBootstrap(page);
  await expect(page.locator("#authSheet")).toBeVisible();
  await expect(page.locator("#authProviderStatus")).toContainText("카카오 로그인이 취소되었어요");
  expect(providerStarts).toBe(1);
  expect(calls).toEqual({ preview: 1, claim: 0, full: 0 });
  diagnostics.expectClean();
});

test.skip("취소 뒤 다른 provider로 로그인하면 돌아오자마자 초안을 저장하고 앱으로 넘어간다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const { account, calls, claimBodies } = await openGuestFullPlanAuthChooser(page);
  const providerStarts = [];
  await page.route("**/api/auth/kakao/start**", (route) => {
    providerStarts.push("kakao");
    return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Kakao OAuth</title>" });
  });
  await page.route("**/api/auth/naver/start**", (route) => {
    providerStarts.push("naver");
    return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Naver OAuth</title>" });
  });

  await Promise.all([
    page.waitForURL(/\/api\/auth\/kakao\/start/),
    page.getByRole("button", { name: "카카오로 계속하기" }).click(),
  ]);
  await page.goto("/app.html?auth=cancelled&provider=kakao");
  await waitForBootstrap(page);
  await expect(page.locator("#authProviderStatus")).toContainText("카카오 로그인이 취소되었어요");
  expect(providerStarts).toEqual(["kakao"]);

  account.user = { id: "usr_auth_recovery", provider: "naver", name: "복귀 사용자", email: "recovery@example.com", plan: "free", role: "member" };
  account.usage = createUsageResponse({ plan: "free", trialEligible: true });
  await Promise.all([
    page.waitForURL(/\/api\/auth\/naver\/start/),
    page.getByRole("button", { name: "네이버로 계속하기" }).click(),
  ]);
  await page.goto("/?resumeGoal=1&auth=success&provider=naver");
  await page.waitForURL(/\/app\.html/);
  await waitForAppReady(page);
  expect(providerStarts).toEqual(["kakao", "naver"]);
  // 초안 저장은 claim 한 번으로 끝나고, 크레딧을 쓰는 전체 계획 생성은 호출하지 않는다.
  await expect.poll(() => calls.claim).toBe(1);
  // 온보딩에서 시작 방식 버튼을 걷어냈으므로 claim에는 항상 기본값이 전달된다.
  expect(claimBodies[0].scheduleStartPreference).toBe("as-is");
  expect(calls.full).toBe(0);
  expect(calls.preview).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:pending-auth-intent"))).toBeNull();
  diagnostics.expectClean();
});

test.skip("provider chooser를 명시적으로 닫으면 pending intent를 정리하고 기존 미리보기로 돌아간다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const { calls } = await openGuestFullPlanAuthChooser(page);
  await page.getByRole("button", { name: "로그인 닫기" }).click();
  await expect(page.locator("#authSheet")).toBeHidden();
  await expect(page).toHaveURL(/#firstStep$/);
  await expect(page.locator("#firstStep")).toBeVisible();
  await expect(page.locator("#firstStep")).toHaveAttribute("data-preview-mode", "guest");
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:pending-auth-intent"))).toBeNull();
  expect(calls).toEqual({ preview: 1, claim: 0, full: 0 });
  diagnostics.expectClean();
});

test.skip("만료된 auth intent는 provider를 시작하지 않고 기존 미리보기로 안전하게 돌아간다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const { calls } = await openGuestFullPlanAuthChooser(page);
  await page.evaluate(() => {
    const key = "onmyway:pending-auth-intent";
    const intent = JSON.parse(sessionStorage.getItem(key));
    intent.createdAt = Date.now() - 11 * 60 * 1000;
    sessionStorage.setItem(key, JSON.stringify(intent));
  });
  await page.reload();
  await waitForBootstrap(page);
  await expect(page.locator("#authSheet")).toBeHidden();
  await expect(page.locator("#firstStep")).toBeVisible();
  await expect(page.locator("#firstStep")).toHaveAttribute("data-preview-mode", "guest");
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:pending-auth-intent"))).toBeNull();
  expect(calls).toEqual({ preview: 1, claim: 0, full: 0 });
  diagnostics.expectClean();
});

test.skip("첫 진입부터 목표 생성과 새로고침까지 이어진다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const account = await mockAccountExperience(page, {
    user: { id: "usr_onboarding", provider: "google", name: "온보딩 테스트", email: "onboarding@example.com", plan: "free", role: "member" },
    usage: createUsageResponse({ plan: "free", trialEligible: true }),
  });
  const goalPlanRequests = [];
  await page.route("**/api/ai/goal-plan", (route) => {
    goalPlanRequests.push({
      body: route.request().postDataJSON(),
      requestId: route.request().headers()["x-request-id"],
    });
    account.usage = createUsageResponse({ plan: "trial", dailyUsed: 4, monthlyUsed: 4, trialEligible: false, trialActive: true });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        plan: {
          personalitySummary: "작은 실행을 반복할 때 강점이 살아나요.",
          planningStyle: "유연 조정형: 하루 컨디션에 따라 3단계로 조절하는 긴 계획 설명",
          firstAction: "오늘 10분 동안 E2E 첫 행동 실행",
          weekTitle: "이번 주에는 시작 가능한 크기로 반복해요",
          weekPlan: ["10분 시작", "완료 체크", "한 줄 기록", "막힌 점 정리", "다음 행동 준비"],
          coachMessage: "완벽하게 끝내기보다 오늘 흐름을 만드는 데 집중해요.",
          dashboard: { goal: "E2E 목표 완주", progress: 20, pace: "첫 주 실행 흐름 만들기" },
          fullSchedule: [
            { phase: "시작", days: "1–2일", focus: "첫 행동 고정", successMetric: "하루 1회 시작" },
            { phase: "반복", days: "3–5일", focus: "작은 실행 반복", successMetric: "3회 이상 완료" },
            { phase: "점검", days: "6–7일", focus: "기록 확인", successMetric: "다음 주 행동 결정" },
          ],
          todaySchedule: [
            { time: "아침", durationMinutes: 10, task: "E2E 첫 행동 실행", completionRule: "10분 타이머 완료" },
            { time: "실행 직후", durationMinutes: 5, task: "한 줄 기록", completionRule: "기록 저장" },
          ],
          checkInRules: ["완료 직후 체크", "놓치면 5분으로 재시작", "주말에 다음 주 조정"],
          fallbackPlan: "어려운 날에는 5분만 시작해요.",
        },
        requestId: "create_plan:e2e",
        chargedCredits: 4,
        usage: account.usage,
      }),
    });
  });
  await page.goto("/index.html");
  await waitForBootstrap(page);

  await expect(page.getByRole("link", { name: "내 목표로 24시간 무료 체험 시작하기" })).toBeVisible();
  await page.getByRole("link", { name: "내 목표로 24시간 무료 체험 시작하기" }).click();
  await expect(page.locator("#designFlow")).toBeVisible();

  await page.locator("#designGoal").fill("   ");
  const aiPreviewButton = page.locator("#aiPreviewButton");
  await expect(page.locator("#goalAnalyzeButton")).toBeDisabled();
  await expect(page.locator("#diagnosisStepCount")).toHaveText("1/3");

  const longGoal = "아주 긴 목표 ".repeat(20);
  await page.locator("#designGoal").fill(longGoal);
  await expect(page.locator("#designGoal")).toHaveValue(longGoal);
  await page.getByRole("button", { name: "창업", exact: true }).click();
  await expect(page.locator("#designGoal")).toHaveValue(longGoal);
  await expect(page.locator("#diagnosisStepCount")).toHaveText("1/3");
  await page.getByRole("button", { name: "90일 안에 첫 유료 고객 10명 만들기", exact: true }).click();
  await expect(page.locator("#designGoal")).toHaveValue("90일 안에 첫 유료 고객 10명 만들기");
  await expect(page.locator("#diagnosisStepCount")).toHaveText("1/3");
  await page.locator("#goalAnalyzeButton").click();
  await expect(page.locator("#diagnosisStepCount")).toHaveText("2/3");
  await page.locator("#currentContext").fill("아이디어만 있고 평일 1시간, 주말 3시간 가능");
  await expect(aiPreviewButton).toBeVisible();
  const goalPlanLoaded = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/ai/goal-plan" && response.status() === 200,
  );
  await Promise.all([
    goalPlanLoaded.then((response) => response.finished()),
    aiPreviewButton.press("Enter"),
  ]);

  await expect(page.locator("#firstStep")).toHaveClass(/is-ready/, { timeout: 10_000 });
  await expect(page.locator("#firstStep")).toHaveAttribute("data-preview-mode", "draft");
  await expect(page.locator("#aiPreviewStatus")).toHaveText("올리가 AI로 만든 맞춤 계획");
  expect(goalPlanRequests).toHaveLength(1);
  expect(goalPlanRequests[0].requestId).toMatch(/^create_plan:/);
  expect(goalPlanRequests[0].body).not.toHaveProperty("plan");
  expect(goalPlanRequests[0].body).not.toHaveProperty("creditCost");
  expect(goalPlanRequests[0].body).toMatchObject({
    goal: "90일 안에 첫 유료 고객 10명 만들기",
    currentState: "아이디어만 있고 평일 1시간, 주말 3시간 가능",
    routine: {
      readiness: "계획이 있으면 실행해요",
      preferredTime: "아침",
      existingRoutine: "",
    },
  });
  await expect(page.locator("#planningStyle")).toHaveText("유연 조정형");
  expect(await page.locator("#firstStep").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
  const planDetails = page.locator(".result-details-disclosure");
  await planDetails.locator("summary").focus();
  await planDetails.locator("summary").press("Enter");
  await expect(planDetails).toHaveAttribute("open", "");
  await expect(planDetails.locator(".result-details-content")).toBeVisible();
  await expect(planDetails.locator("summary > b")).toHaveText("접기");
  const accountStateSaved = page.waitForResponse((response) =>
    response.request().method() === "PUT" &&
    new URL(response.url()).pathname === "/api/account/state" &&
    response.status() === 200,
  );
  await Promise.all([
    page.waitForURL(/app\.html/, { waitUntil: "commit" }),
    page.locator("#trialStartInlineLink").press("Enter"),
  ]);
  await waitForAppReady(page);
  await accountStateSaved;
  await expect(page.locator("#view-today")).toBeVisible();
  await expect(page.locator("#ollieEnergyBalance")).toHaveText("11 / 15");
  await page.reload();
  await expect(page.locator("#trialPaywall")).toBeHidden();
  await expect(page.locator("body")).not.toHaveClass(/trial-locked/);
  diagnostics.expectClean();
});

test.skip("익명 사용자는 실제 AI 계획 일부를 본 뒤 로그인·회원가입으로 전체 계획을 이어간다", async ({ page }, testInfo) => {
  const account = await mockAccountExperience(page);
  let previewRequestBody = null;
  await page.route("**/api/ai/goal-preview", (route) => {
    previewRequestBody = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        cached: false,
        draftPlanId: "e2e-guest-conversion",
        preview: guestPreviewPlan(),
        activeInput: { goal: "90일 안에 첫 유료 고객 10명 만들기" },
        activeInputHash: "b".repeat(64),
        activeRevision: 1,
      }),
    });
  });
  await page.route("**/api/ai/goal-draft/claim", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      draftPlanId: "e2e-guest-conversion",
      plan: fullGoalPlan(),
      activatedPlan: { ...fullGoalPlan(), planId: "e2e-guest-conversion", planSource: "ai-reviewed-draft" },
      chargedCredits: 0,
    }),
  }));
  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);
  await page.getByRole("button", { name: "창업", exact: true }).click();
  await expect(page.locator("#designGoal")).toHaveValue("");
  await expect(page.locator("#diagnosisStepCount")).toHaveText("1/3");
  await page.getByRole("button", { name: "90일 안에 첫 유료 고객 10명 만들기", exact: true }).click();
  await page.locator("#goalAnalyzeButton").click();
  await page.locator("#aiPreviewButton").waitFor({ state: "visible" });
  await page.locator("#currentContext").fill("아이디어만 있고 평일 1시간, 주말 3시간 가능");
  await captureAcceptance(page, testInfo, "goal-input", { fullPage: false });
  await captureAcceptance(page, testInfo, "optional-context-input", { fullPage: false });
  expect(await page.locator("#personalityForm").evaluate((form) =>
    [...form.elements].filter((field) => typeof field.checkValidity === "function" && !field.checkValidity()).map((field) => field.id || field.name),
  )).toEqual([]);

  await page.locator("#aiPreviewButton").click();
  await expect.poll(() => previewRequestBody).not.toBeNull();
  await expect(page).toHaveURL(/#firstStep$/);
  await expect(page.locator("#aiPreviewStatus")).toHaveText("현재 계획과 조건이 일치해요.");
  await expect(page.locator("#previewAction")).toHaveText("잠재 고객 한 명에게 문제 인터뷰를 요청하기");
  await expect(page.locator(".result-details-disclosure")).toBeHidden();
  await expect(page.locator("#previewConversionAction")).toHaveText("이 계획으로 시작하기");
  await captureAcceptance(page, testInfo, "plan-draft", { fullPage: false });
  expect(previewRequestBody).toMatchObject({
    goal: "90일 안에 첫 유료 고객 10명 만들기",
    currentState: "아이디어만 있고 평일 1시간, 주말 3시간 가능",
    routine: { preferredTime: "아침", existingRoutine: "" },
  });
  expect(await page.evaluate(() => localStorage.getItem("omwExecutionPlan"))).toBeNull();

  await page.locator("#trialStartInlineLink").click();
  await expect(page.locator("#authSheet")).toBeVisible();
  await expect(page).toHaveURL(/#firstStep$/);

  account.user = { id: "usr_guest_preview", provider: "google", name: "미리보기 사용자", email: "preview@example.com", plan: "free", role: "member" };
  account.usage = createUsageResponse({ plan: "free", trialEligible: true });
  // 로그인 직후에는 CTA를 다시 누르지 않아도 초안 저장과 앱 이동이 이어진다.
  await page.goto("/?resumeGoal=1&auth=success");
  await page.waitForURL(/\/app\.html/);
  await waitForAppReady(page);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("omwExecutionPlan") || "null")?.planSource)).toBe("ai-reviewed-draft");
  // 앱의 첫 화면은 항상 '오늘' 탭이다.
  await expect(page.locator("#view-today")).toBeVisible();
  await expect(page.locator("#tab-today")).toHaveAttribute("aria-selected", "true");
});

test.skip("익명 초안 수정은 기존 AI 일정을 보존하고 명시적 재생성 뒤에만 active revision을 교체한다", async ({ page }, testInfo) => {
  await mockAccountExperience(page);
  let previewCalls = 0;
  let revisionCalls = 0;
  const revisionKeys = [];
  await page.route("**/api/ai/goal-preview", (route) => {
    previewCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        cached: false,
        draftPlanId: "e2e-active-pending-draft",
        preview: guestPreviewPlan(),
        activeInput: { goal: "90일 안에 첫 유료 고객 10명 만들기", currentState: "평일 25분 가능" },
        activeInputHash: "c".repeat(64),
        activeRevision: 1,
      }),
    });
  });
  await page.route("**/api/ai/goal-draft/revise", (route) => {
    revisionCalls += 1;
    const body = route.request().postDataJSON();
    revisionKeys.push(body.idempotencyKey);
    expect(body.draftPlanId).toBe("e2e-active-pending-draft");
    expect(body.idempotencyKey).toMatch(/^revision:/);
    if (body.input.currentState === "평일 60분 가능" && revisionCalls === 2) {
      expect(body).toMatchObject({ expectedRevision: 2, expectedInputHash: "d".repeat(64) });
      return route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          code: "AI_OUTPUT_DOMAIN_INVALID",
          error: "fixture revision failure",
          retryable: false,
          terminal: true,
          cached: false,
        }),
      });
    }
    if (body.input.currentState === "평일 60분 가능") {
      expect(body).toMatchObject({ expectedRevision: 2, expectedInputHash: "d".repeat(64) });
      const retried = { ...guestPreviewPlan(), firstAction: "고객 인터뷰 질문 3개를 60분 안에 정리하기" };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          cached: false,
          draftPlanId: "e2e-active-pending-draft",
          preview: retried,
          activeInput: { goal: "90일 안에 첫 유료 고객 10명 만들기", currentState: "평일 60분 가능" },
          activeInputHash: "e".repeat(64),
          activeRevision: 3,
        }),
      });
    }
    expect(body).toMatchObject({ expectedRevision: 1, expectedInputHash: "c".repeat(64) });
    expect(body.input.currentState).toBe("평일 45분 가능");
    const revised = { ...guestPreviewPlan(), firstAction: "고객 인터뷰 질문 3개를 45분 안에 정리하기" };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        cached: false,
        draftPlanId: "e2e-active-pending-draft",
        preview: revised,
        activeInput: { goal: "90일 안에 첫 유료 고객 10명 만들기", currentState: "평일 45분 가능" },
        activeInputHash: "d".repeat(64),
        activeRevision: 2,
      }),
    });
  });

  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);
  await page.getByRole("button", { name: "창업", exact: true }).click();
  await page.getByRole("button", { name: "90일 안에 첫 유료 고객 10명 만들기", exact: true }).click();
  await page.locator("#goalAnalyzeButton").click();
  await page.locator("#aiPreviewButton").waitFor({ state: "visible" });
  await page.locator("#currentContext").fill("평일 25분 가능");
  expect(await page.locator("#personalityForm").evaluate((form) =>
    [...form.elements].filter((field) => typeof field.checkValidity === "function" && !field.checkValidity()).map((field) => field.id || field.name),
  )).toEqual([]);
  await page.locator("#aiPreviewButton").click();
  await expect.poll(() => previewCalls).toBe(1);
  await expect(page.locator("#previewAction")).toHaveText("잠재 고객 한 명에게 문제 인터뷰를 요청하기");

  await page.locator("#draftAdjustButton").click();
  // 계획 조정은 조건을 확인·수정하는 2단계로 돌아간다.
  await expect(page.locator("#diagnosisStepCount")).toHaveText("2/3");
  await page.locator("#currentContext").fill("첫 달은 더 가볍게 시작하고 싶어요.");
  await expect(page.locator("#currentContext")).toHaveValue(/첫 달은 더 가볍게 시작하고 싶어요\./);
  expect(revisionCalls).toBe(0);
  await page.locator("#currentContext").fill("평일 45분 가능");
  await page.locator("#currentContext").blur();
  expect(revisionCalls).toBe(0);
  const pending = await page.evaluate(() => JSON.parse(sessionStorage.getItem("onmyway:pending-goal-preview") || "null"));
  expect(pending.preview.firstAction).toBe("잠재 고객 한 명에게 문제 인터뷰를 요청하기");
  expect(pending.activeRevision).toBe(1);
  expect(pending.pendingDraftInput.currentContext).toBe("평일 45분 가능");
  await page.evaluate(() => { location.hash = "firstStep"; });
  await expect(page.locator("#trialStartInlineLink")).toHaveAttribute("aria-disabled", "true");
  await page.locator("#draftAdjustButton").click();

  await expect(page.locator("#aiPreviewButton")).toContainText("말한 내용으로 큰 길 다시 그리기");
  await page.locator("#aiPreviewButton").click();
  await expect.poll(() => revisionCalls).toBe(1);
  await expect(page.locator("#previewAction")).toHaveText("고객 인터뷰 질문 3개를 45분 안에 정리하기");
  await expect(page.locator("#roadmapRevisionSummary")).toBeVisible();
  await expect(page.locator("#roadmapRevisionBefore")).toContainText("잠재 고객");
  await expect(page.locator("#roadmapRevisionAfter")).toContainText("고객 인터뷰");
  await expect(page.locator("#roadmapRevisionConditions")).toHaveText("평일 45분 가능");
  await captureAcceptance(page, testInfo, "roadmap-revision", { fullPage: false });
  expect(previewCalls).toBe(1);
  expect(revisionCalls).toBe(1);
  const active = await page.evaluate(() => JSON.parse(sessionStorage.getItem("onmyway:pending-goal-preview") || "null"));
  expect(active.activeRevision).toBe(2);
  expect(active.activeInputHash).toBe("d".repeat(64));
  expect(active.pendingDraftInput).toBeNull();
  await expect(page.locator("#trialStartInlineLink")).toHaveAttribute("aria-disabled", "false");

  await page.reload();
  await waitForBootstrap(page);
  await expect(page.locator("#firstStep")).toBeVisible();
  await expect(page.locator("#previewAction")).toHaveText("고객 인터뷰 질문 3개를 45분 안에 정리하기");
  await expect(page.locator("#currentContext")).toHaveValue("평일 45분 가능");
  await expect(page.locator("#roadmapRevisionSummary")).toBeVisible();
  expect((await page.evaluate(() => JSON.parse(sessionStorage.getItem("onmyway:pending-goal-preview") || "null"))).activeRevision).toBe(2);

  await page.locator("#draftAdjustButton").click();
  await page.locator("#currentContext").fill("평일 60분 가능");
  await page.locator("#currentContext").blur();
  expect(revisionCalls).toBe(1);
  await page.locator("#aiPreviewButton").click();
  await expect.poll(() => revisionCalls).toBe(2);
  await expect(page.locator("#aiPreviewStatus")).toHaveText("이번에는 계획을 바꾸지 못했어요. 기존 길은 그대로 두었어요.");
  const afterFailure = await page.evaluate(() => JSON.parse(sessionStorage.getItem("onmyway:pending-goal-preview") || "null"));
  expect(afterFailure.activeRevision).toBe(2);
  expect(afterFailure.preview.firstAction).toBe("고객 인터뷰 질문 3개를 45분 안에 정리하기");
  expect(afterFailure.pendingDraftInput.currentContext).toBe("평일 60분 가능");
  expect(afterFailure.pendingRevision).toBeNull();
  expect(revisionCalls).toBe(2);
  await page.locator("#aiPreviewButton").click();
  await expect.poll(() => revisionCalls).toBe(3);
  expect(revisionKeys[2]).not.toBe(revisionKeys[1]);
  await expect(page.locator("#previewAction")).toHaveText("고객 인터뷰 질문 3개를 60분 안에 정리하기");
  const retried = await page.evaluate(() => JSON.parse(sessionStorage.getItem("onmyway:pending-goal-preview") || "null"));
  expect(retried.activeRevision).toBe(3);
  expect(retried.activeInputHash).toBe("e".repeat(64));
  expect(retried.pendingDraftInput).toBeNull();
  expect(previewCalls).toBe(1);
});
