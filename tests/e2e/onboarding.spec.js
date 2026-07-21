const { test, expect } = require("@playwright/test");
const { createUsageResponse, mockAccountExperience, monitorPage, waitForAppReady, waitForBootstrap } = require("./helpers");

test.setTimeout(90_000);

function guestPreviewPlan() {
  return {
    personalitySummary: "고객 대화부터 작게 시작하면 실행 리듬을 만들 수 있어요.",
    planningStyle: "고객 검증 실행형 계획",
    firstAction: "잠재 고객 한 명에게 문제 인터뷰를 요청하기",
    weekTitle: "첫 주에는 고객 문제를 직접 확인해요.",
    weekPlan: ["고객 후보 5명 적기", "인터뷰 1명 요청하기", "질문 5개 정리하기"],
    coachMessage: "완벽한 제품보다 실제 고객의 말을 먼저 모아 봐요.",
    todaySchedule: [{
      time: "저녁",
      durationMinutes: 15,
      task: "잠재 고객 한 명에게 문제 인터뷰를 요청하기",
      completionRule: "메시지 한 건을 보내면 완료",
    }],
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
  const calls = { preview: 0, full: 0 };
  await page.route("**/api/ai/goal-preview", (route) => {
    calls.preview += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, cached: false, preview: guestPreviewPlan() }) });
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
  await page.locator("#diagnosisNextButton").click();
  await page.locator("#diagnosisNextButton").click();
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === "/api/ai/goal-preview" && response.status() === 200),
    page.locator("#aiPreviewButton").click(),
  ]);
  await expect(page.locator("#firstStep")).toHaveAttribute("data-preview-mode", "guest");
  await Promise.all([
    page.waitForURL(/\/app\.html/),
    page.locator("#trialStartInlineLink").click(),
  ]);
  await waitForBootstrap(page);
  await expect(page.locator("#authSheet")).toBeVisible();
  return { account, calls };
}

test("목표 카테고리는 예시만 제안하고 사용자의 명시적 확인 전에는 진행하지 않는다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountExperience(page);
  const aiRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/ai/goal-")) aiRequests.push(request.url());
  });

  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);
  const goal = page.locator("#designGoal");
  const next = page.locator("#diagnosisNextButton");

  await expect(goal).toHaveValue("");
  await expect(next).toBeDisabled();
  await page.getByRole("button", { name: "시험", exact: true }).click();
  await expect(page.getByRole("button", { name: "시험", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(goal).toHaveValue("");
  await expect(goal).toHaveAttribute("placeholder", "예: 6개월 안에 공인중개사 1차 합격하기");
  await expect(page.locator("#goalExampleSuggestions button")).toHaveCount(3);
  await expect(page.locator("#diagnosisStepCount")).toHaveText("1 / 3");
  await expect(next).toBeDisabled();

  await page.getByRole("button", { name: "올해 한국사능력검정시험 1급 취득하기", exact: true }).click();
  await expect(goal).toHaveValue("올해 한국사능력검정시험 1급 취득하기");
  await expect(page.locator("#diagnosisStepCount")).toHaveText("1 / 3");
  await expect(next).toBeEnabled();
  await goal.fill("올해 한국사능력검정시험 1급을 여름까지 취득하기");

  for (const category of ["운동", "취업", "습관"]) {
    await page.getByRole("button", { name: category, exact: true }).click();
    await expect(goal).toHaveValue("올해 한국사능력검정시험 1급을 여름까지 취득하기");
    await expect(page.locator("#diagnosisStepCount")).toHaveText("1 / 3");
  }

  await goal.fill("   ");
  await expect(next).toBeDisabled();
  await expect(page.locator("#goalValidationMessage")).toHaveText("달성하고 싶은 목표를 직접 입력해 주세요.");
  await goal.press("Enter");
  await expect(page.locator("#diagnosisStepCount")).toHaveText("1 / 3");

  await goal.fill("30일 동안 매일 저녁 한 줄 일기 쓰기");
  await next.click();
  await expect(page.locator("#diagnosisStepCount")).toHaveText("2 / 3");
  expect(aiRequests).toHaveLength(0);
  diagnostics.expectClean();
});

test("AI 미리보기 로그인 callback 취소는 provider 선택 화면과 초안을 복원한다", async ({ page }) => {
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
  expect(calls).toEqual({ preview: 1, full: 0 });
  await expect(page.locator("body")).toHaveAttribute("data-auth-state", "anonymous");
  diagnostics.expectClean();
});

test("provider 화면에서 browser back으로 돌아오면 자동 재시작 없이 chooser를 복원한다", async ({ page }) => {
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
  expect(calls).toEqual({ preview: 1, full: 0 });
  diagnostics.expectClean();
});

test("취소 뒤 다른 provider를 직접 선택하면 성공 복원 후 명시적 CTA에서만 전체 계획을 만든다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const { account, calls } = await openGuestFullPlanAuthChooser(page);
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
  await waitForBootstrap(page);
  await expect(page.locator("#firstStep")).toBeVisible();
  await expect(page.locator("#designGoal")).toHaveValue("90일 안에 첫 유료 고객 10명 만들기");
  await expect(page.locator("#previewAction")).toHaveText("잠재 고객 한 명에게 문제 인터뷰를 요청하기");
  await expect(page.locator("#previewConversionAction")).toHaveText("무료 체험으로 전체 계획 만들기");
  expect(providerStarts).toEqual(["kakao", "naver"]);
  expect(calls).toEqual({ preview: 1, full: 0 });
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:pending-auth-intent"))).toBeNull();

  await page.locator("#trialStartInlineLink").click();
  await expect.poll(() => calls.full).toBe(1);
  await expect(page.locator("#firstStep")).toHaveAttribute("data-preview-mode", "full");
  expect(calls.preview).toBe(1);
  diagnostics.expectClean();
});

test("provider chooser를 명시적으로 닫으면 pending intent를 정리하고 기존 미리보기로 돌아간다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const { calls } = await openGuestFullPlanAuthChooser(page);
  await page.getByRole("button", { name: "로그인 닫기" }).click();
  await page.waitForURL(/resumeGoal=1/);
  await waitForBootstrap(page);
  await expect(page.locator("#firstStep")).toBeVisible();
  await expect(page.locator("#firstStep")).toHaveAttribute("data-preview-mode", "guest");
  await expect(page.locator("#firstStep")).toBeFocused();
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:pending-auth-intent"))).toBeNull();
  expect(calls).toEqual({ preview: 1, full: 0 });
  diagnostics.expectClean();
});

test("만료된 auth intent는 provider를 시작하지 않고 기존 미리보기로 안전하게 돌아간다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const { calls } = await openGuestFullPlanAuthChooser(page);
  await page.evaluate(() => {
    const key = "onmyway:pending-auth-intent";
    const intent = JSON.parse(sessionStorage.getItem(key));
    intent.createdAt = Date.now() - 11 * 60 * 1000;
    sessionStorage.setItem(key, JSON.stringify(intent));
  });
  await page.reload();
  await page.waitForURL(/resumeGoal=1/);
  await waitForBootstrap(page);
  await expect(page.locator("#firstStep")).toBeVisible();
  await expect(page.locator("#firstStep")).toHaveAttribute("data-preview-mode", "guest");
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:pending-auth-intent"))).toBeNull();
  expect(calls).toEqual({ preview: 1, full: 0 });
  diagnostics.expectClean();
});

test("첫 진입부터 목표 생성과 새로고침까지 이어진다", async ({ page }) => {
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
  await expect(page.locator("#diagnosisNextButton")).toBeDisabled();
  await expect(page.locator("#diagnosisStepCount")).toHaveText("1 / 3");

  const longGoal = "아주 긴 목표 ".repeat(20);
  await page.locator("#designGoal").fill(longGoal);
  await expect(page.locator("#designGoal")).toHaveValue(longGoal);
  await page.getByRole("button", { name: "창업", exact: true }).click();
  await expect(page.locator("#designGoal")).toHaveValue(longGoal);
  await expect(page.locator("#diagnosisStepCount")).toHaveText("1 / 3");
  await page.getByRole("button", { name: "90일 안에 첫 유료 고객 10명 만들기", exact: true }).click();
  await expect(page.locator("#designGoal")).toHaveValue("90일 안에 첫 유료 고객 10명 만들기");
  await expect(page.locator("#diagnosisStepCount")).toHaveText("1 / 3");
  await page.locator("#diagnosisNextButton").click();
  await expect(page.locator("#diagnosisStepCount")).toHaveText("2 / 3");
  await page.locator("#routineTime").selectOption({ label: "저녁" });
  await page.locator("#diagnosisNextButton").click();
  await expect(page.locator("#diagnosisStepCount")).toHaveText("3 / 3");
  const aiPreviewButton = page.locator("#aiPreviewButton");
  await expect(aiPreviewButton).toBeVisible();
  const goalPlanLoaded = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/ai/goal-plan" && response.status() === 200,
  );
  await Promise.all([
    goalPlanLoaded.then((response) => response.finished()),
    aiPreviewButton.press("Enter"),
  ]);

  await expect(page.locator("#firstStep")).toHaveClass(/is-ready/, { timeout: 10_000 });
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
      preferredTime: "저녁",
      existingRoutine: "저녁 식사 후 노트북 열기",
    },
  });
  await expect(page.locator("#planningStyle")).toHaveText("유연 조정형");
  expect(await page.locator("#firstStep").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
  const planDetails = page.locator(".result-details-disclosure");
  await planDetails.locator("summary").click();
  await expect(planDetails).toHaveAttribute("open", "");
  await expect(planDetails.locator(".result-details-content")).toBeVisible();
  await expect(planDetails.locator("summary > b")).toHaveText("접기");
  const trialStarted = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/ai/trial/start" && response.status() === 200,
  );
  await Promise.all([
    page.waitForURL(/app\.html/, { waitUntil: "commit" }),
    trialStarted.then((response) => response.finished()),
    page.locator("#trialStartInlineLink").press("Enter"),
  ]);
  await waitForAppReady(page);
  await expect(page.locator("#view-today")).toBeVisible();
  await expect(page.locator("#ollieEnergyBalance")).toHaveText("11 / 15");
  await page.reload();
  await expect(page.locator("#trialPaywall")).toBeHidden();
  await expect(page.locator("body")).not.toHaveClass(/trial-locked/);
  diagnostics.expectClean();
});

test("익명 사용자는 실제 AI 계획 일부를 본 뒤 로그인·회원가입으로 전체 계획을 이어간다", async ({ page }) => {
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
        preview: {
          personalitySummary: "고객 대화부터 작게 시작하면 실행 리듬을 만들 수 있어요.",
          planningStyle: "고객 검증 실행형 계획",
          firstAction: "잠재 고객 한 명에게 문제 인터뷰를 요청하기",
          weekTitle: "첫 주에는 고객 문제를 직접 확인해요.",
          weekPlan: ["고객 후보 5명 적기", "인터뷰 1명 요청하기", "질문 5개 정리하기"],
          coachMessage: "완벽한 제품보다 실제 고객의 말을 먼저 모아 봐요.",
          todaySchedule: [{
            time: "저녁",
            durationMinutes: 15,
            task: "잠재 고객 한 명에게 문제 인터뷰를 요청하기",
            completionRule: "메시지 한 건을 보내면 완료",
          }],
        },
      }),
    });
  });
  await page.route("**/api/ai/goal-plan", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      plan: {
        personalitySummary: "고객 대화부터 작게 시작하면 실행 리듬을 만들 수 있어요.",
        planningStyle: "고객 검증 실행형 계획",
        firstAction: "잠재 고객 한 명에게 문제 인터뷰를 요청하기",
        weekTitle: "첫 주에는 고객 문제를 직접 확인해요.",
        weekPlan: ["고객 후보 5명 적기", "인터뷰 1명 요청하기", "질문 5개 정리하기", "응답 기록하기", "가설 한 줄 수정하기"],
        coachMessage: "완벽한 제품보다 실제 고객의 말을 먼저 모아 봐요.",
        dashboard: { goal: "첫 유료 고객 만들기", progress: 0, pace: "첫 주 고객 검증" },
        fullSchedule: [
          { phase: "탐색", days: "1~7일", focus: "고객 문제 확인", successMetric: "인터뷰 3명" },
          { phase: "제안", days: "8~30일", focus: "작은 해결안 제안", successMetric: "제안 5회" },
          { phase: "판매", days: "31~90일", focus: "유료 전환", successMetric: "고객 10명" },
        ],
        todaySchedule: [
          { time: "저녁", durationMinutes: 15, task: "잠재 고객 한 명에게 문제 인터뷰를 요청하기", completionRule: "메시지 한 건을 보내면 완료" },
          { time: "요청 직후", durationMinutes: 5, task: "보낸 문구와 반응 기록하기", completionRule: "기록 한 줄을 남기면 완료" },
        ],
        checkInRules: ["요청 수를 기록해요.", "답이 없으면 대상만 바꿔요.", "주말에 질문을 조정해요."],
        fallbackPlan: "어려운 날에는 고객 후보 이름 한 명만 적어요.",
      },
      requestId: "create_plan:guest-conversion",
      chargedCredits: 4,
      usage: createUsageResponse({ plan: "trial", dailyUsed: 4, monthlyUsed: 4, trialEligible: false, trialActive: true }),
    }),
  }));
  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);
  await page.getByRole("button", { name: "창업", exact: true }).click();
  await expect(page.locator("#designGoal")).toHaveValue("");
  await expect(page.locator("#diagnosisStepCount")).toHaveText("1 / 3");
  await page.getByRole("button", { name: "90일 안에 첫 유료 고객 10명 만들기", exact: true }).click();
  await page.locator("#diagnosisNextButton").click();
  await expect(page.locator("#diagnosisStepCount")).toHaveText("2 / 3");
  await page.locator("#routineTime").selectOption({ label: "저녁" });
  await page.locator("#diagnosisNextButton").click();
  await expect(page.locator("#diagnosisStepCount")).toHaveText("3 / 3");

  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === "/api/ai/goal-preview" && response.status() === 200),
    page.locator("#aiPreviewButton").click(),
  ]);
  await expect(page).toHaveURL(/#firstStep$/);
  await expect(page.locator("#aiPreviewStatus")).toHaveText("올리가 AI로 만든 계획 미리보기");
  await expect(page.locator("#previewAction")).toHaveText("잠재 고객 한 명에게 문제 인터뷰를 요청하기");
  await expect(page.locator(".result-details-disclosure")).toBeHidden();
  await expect(page.locator("#previewConversionAction")).toHaveText("로그인·회원가입하고 전체 계획 보기");
  expect(previewRequestBody).toMatchObject({
    goal: "90일 안에 첫 유료 고객 10명 만들기",
    currentState: "아이디어만 있고 평일 1시간, 주말 3시간 가능",
    routine: { preferredTime: "저녁", existingRoutine: "저녁 식사 후 노트북 열기" },
  });
  expect(await page.evaluate(() => localStorage.getItem("omwExecutionPlan"))).toBeNull();

  await Promise.all([
    page.waitForURL(/app\.html\?auth=login&return=/),
    page.locator("#trialStartInlineLink").click(),
  ]);
  await expect(page.locator("#authSheet")).toBeVisible();
  expect(decodeURIComponent(new URL(page.url()).searchParams.get("return"))).toBe("/?resumeGoal=1");

  account.user = { id: "usr_guest_preview", provider: "google", name: "미리보기 사용자", email: "preview@example.com", plan: "free", role: "member" };
  account.usage = createUsageResponse({ plan: "free", trialEligible: true });
  await page.goto("/?resumeGoal=1&auth=success");
  await waitForBootstrap(page);
  await expect(page.locator("#firstStep")).toBeVisible();
  await expect(page.locator("#designGoal")).toHaveValue("90일 안에 첫 유료 고객 10명 만들기");
  await expect(page.locator("#previewAction")).toHaveText("잠재 고객 한 명에게 문제 인터뷰를 요청하기");
  await expect(page.locator("#previewConversionAction")).toHaveText("무료 체험으로 전체 계획 만들기");

  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === "/api/ai/goal-plan" && response.status() === 200),
    page.locator("#trialStartInlineLink").click(),
  ]);
  await expect(page.locator("#firstStep")).toHaveAttribute("data-preview-mode", "full");
  await expect(page.locator(".result-details-disclosure")).toBeVisible();
  await expect(page.locator("#previewConversionAction")).toHaveText("오늘 계획 바로 시작");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("omwExecutionPlan") || "null")?.planSource)).toBe("ai");
});
