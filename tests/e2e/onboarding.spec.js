const { test, expect } = require("@playwright/test");
const {
  completeManualPlan,
  createUsageResponse,
  mockAccountExperience,
  monitorPage,
  readStored,
  waitForAppReady,
  waitForBootstrap,
} = require("./helpers");

test.setTimeout(90_000);

const AI_GOAL_ROUTE = /\/api\/ai\/goal-/;

// 온보딩 도중 AI 목표 라우트로 나가는 요청을 전부 기록한다. 수동 빌더의 계약은
// "온보딩에서 AI 호출 0회"이므로 이 배열이 비어 있어야 한다.
function trackGoalAiRequests(page) {
  const requests = [];
  page.on("request", (request) => {
    if (AI_GOAL_ROUTE.test(request.url())) requests.push(request.url());
  });
  return requests;
}

// 로그인 시 main의 switchAccountStorageScope가 익명 데이터 승계를 confirm으로 묻는다.
// Playwright는 대화상자를 기본 거절하므로 명시적으로 수락해 게스트 계획을 넘긴다.
function acceptStorageMergePrompt(page) {
  page.on("dialog", (dialog) => dialog.accept());
}

/* 라우트를 지워도 카피가 남으면 유저에게는 기능이 살아 있는 것처럼 보인다.
   "AI가 계획을 만들어 준다"는 약속이 첫 화면 어디에도 없어야 한다. */
test("첫 화면은 사라진 AI 계획 생성을 광고하지 않는다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountExperience(page);
  await page.goto("/");
  await waitForBootstrap(page);

  // 섹션 대부분이 data-page-view로 숨겨져 있어 innerText로는 안 잡힌다. 마크업 전체를 본다.
  const landingMarkup = await page.content();
  expect(landingMarkup).not.toMatch(/AI가 목표를 쪼개|올리가 계획을 만들어|AI 스케줄|새 목표 계획 생성|오늘의 한 걸음 생성/);
  // 실제로 남아 있는 AI 기능(대화·계획 다듬기)까지 지워버리지는 않았는지 함께 본다.
  expect(landingMarkup).toMatch(/올리와 지금 대화/);
  expect(landingMarkup).toMatch(/매일 축하·위로/);
  diagnostics.expectClean();
});

test("수동 4단계로 계획을 만들면 AI 호출 없이 실행 계획이 저장된다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const goalAiRequests = trackGoalAiRequests(page);
  await mockAccountExperience(page);

  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);

  await expect(page.locator(".diagnosis-step.active")).toHaveAttribute("data-step-title", "무엇을 시작해볼까요?");
  // AI 계획 생성 CTA는 마크업에서 사라졌다. 진행은 "다음 단계" 하나로만 한다.
  await expect(page.locator("#goalAnalyzeButton")).toHaveCount(0);

  await completeManualPlan(page, {
    goal: "3개월 안에 토익 900점 달성하기",
    tasks: [
      { time: "07:00", text: "단어 40개 외우기", minutes: 20, rule: "테스트에서 35개 이상 맞히면 완료" },
      { time: "21:00", text: "기출 1세트 풀기", minutes: 40, rule: "채점과 오답 표시까지 하면 완료" },
    ],
  });

  expect(goalAiRequests).toEqual([]);
  expect(await readStored(page, "omwExecutionPlan")).toBeTruthy();

  // 저장은 압축 코덱을 거치므로 원본이 아니라 디코드 결과를 검증한다.
  const decoded = await page.evaluate(() => window.__omwTest.readExecutionPlan());
  expect(decoded.planSource).toBe("manual");
  expect(decoded.goal).toBe("3개월 안에 토익 900점 달성하기");
  expect(decoded.scheduleOccurrences.length).toBe(90);
  expect(decoded.firstWeekSchedule.length).toBe(7);

  const firstActionDay = decoded.scheduleOccurrences.find((day) => !day.isRestDay);
  expect(firstActionDay.items.map((item) => item.title)).toEqual(["단어 40개 외우기", "기출 1세트 풀기"]);
  expect(firstActionDay.items[0]).toMatchObject({
    type: "ACTION",
    time: "07:00",
    durationMinutes: 20,
    completionRule: "테스트에서 35개 이상 맞히면 완료",
  });
  // 기본 요일 선택은 월~금이므로 토·일은 계획된 휴식으로 남는다.
  expect(decoded.scheduleOccurrences.some((day) => day.isRestDay)).toBe(true);

  diagnostics.expectClean();
});

test("저장한 수동 계획은 스케줄 코덱 왕복 검증을 통과한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountExperience(page);
  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);

  await completeManualPlan(page, {
    goal: "12주 동안 주 4회 30분 운동 습관 만들기",
    tasks: [{ time: "07:00", text: "운동 30분", minutes: 30, rule: "정한 세트를 끝내면 완료" }],
  });

  // writeExecutionPlan은 왕복이 어긋나면 던지므로 저장이 남아 있는 것 자체가 통과
  // 증거다. 디코드 결과를 다시 인코드해 한 번 더 대조한다.
  const roundTrip = await page.evaluate(() => window.__omwTest.planCodecRoundTrip());
  expect(roundTrip).toEqual({ ok: true, scheduleOccurrences: true, firstWeekSchedule: true });

  diagnostics.expectClean();
});

test("게스트가 계획을 완성하면 로그인 게이트가 열리고, 로그인 후 체험이 시작돼 오늘 화면으로 간다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const goalAiRequests = trackGoalAiRequests(page);
  acceptStorageMergePrompt(page);
  const account = await mockAccountExperience(page);

  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);
  await completeManualPlan(page, {
    goal: "90일 안에 첫 유료 고객 10명 만들기",
    tasks: [{ time: "09:00", text: "잠재 고객 한 명에게 인터뷰 요청", minutes: 15, rule: "메시지를 보내면 완료" }],
  });

  // 게스트 상태에서는 CTA가 로그인 유도 카피로 바뀐다.
  await expect(page.locator("#previewConversionAction")).toHaveText("간편 로그인하고 무료 체험 시작");
  await expect(page.locator("body")).toHaveAttribute("data-auth-state", "anonymous");

  await page.locator("#trialStartInlineLink").click();
  await expect(page.locator("#authSheet")).toBeVisible();
  const intent = await page.evaluate(() => JSON.parse(sessionStorage.getItem("onmyway:pending-auth-intent") || "null"));
  expect(intent).toMatchObject({ resumeTarget: "manual-plan-continuation", purpose: "unlock-full-plan" });

  await page.route("**/api/auth/kakao/start**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><title>Kakao OAuth</title><p>Provider handoff</p>",
  }));

  account.user = { id: "usr_manual_gate", provider: "kakao", name: "수동 계획 사용자", email: "manual@example.com", plan: "free", role: "member" };
  account.usage = createUsageResponse({ plan: "free", trialEligible: true });

  await Promise.all([
    page.waitForURL(/\/api\/auth\/kakao\/start/),
    page.getByRole("button", { name: "카카오로 계속하기" }).click(),
  ]);

  await page.goto("/?resumeGoal=1&auth=success&provider=kakao");
  await page.waitForURL(/\/app\.html/);
  await waitForAppReady(page);

  // 체험 시작은 서버 권위(/api/ai/trial/start)를 거쳐 활성화된다.
  expect(account.usage.plan).toBe("trial");
  expect(account.user.trialStartedAt).toBeTruthy();
  expect(goalAiRequests).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:pending-auth-intent"))).toBeNull();

  // 승계된 계획의 할 일이 Today 화면에 그대로 보인다.
  await expect(page.getByText("잠재 고객 한 명에게 인터뷰 요청").first()).toBeVisible();

  diagnostics.expectClean();
});

test("이미 로그인한 사용자는 게이트 없이 바로 체험을 시작한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const goalAiRequests = trackGoalAiRequests(page);
  const account = await mockAccountExperience(page, {
    user: { id: "usr_signed_in", provider: "kakao", name: "기존 사용자", email: "signed@example.com", plan: "free", role: "member" },
    usage: createUsageResponse({ plan: "free", trialEligible: true }),
  });

  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);
  await completeManualPlan(page, {
    goal: "8주 동안 주 3회 근력 운동하기",
    tasks: [{ time: "07:00", text: "근력 운동 30분", minutes: 30, rule: "정한 세트를 끝내면 완료" }],
  });

  await expect(page.locator("#previewConversionAction")).toHaveText("이 계획으로 시작하기");
  await expect(page.locator("#authSheet")).toBeHidden();

  await page.locator("#trialStartInlineLink").click();
  await page.waitForURL(/\/app\.html/);
  await waitForAppReady(page);

  expect(account.usage.plan).toBe("trial");
  expect(goalAiRequests).toEqual([]);
  await expect(page.getByText("근력 운동 30분").first()).toBeVisible();

  diagnostics.expectClean();
});

test("할 일을 모두 비우면 다음 단계로 넘어가지 못한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountExperience(page);
  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);

  await page.locator("#designGoal").fill("6개월 안에 공인중개사 1차 합격하기");
  await page.locator("#diagnosisNextButton").click();
  await page.locator("#diagnosisNextButton").click();
  await expect(page.locator(".diagnosis-step.active")).toHaveAttribute("data-step-title", "어떤 일을 하면 될까요?");

  const rows = page.locator("#taskBuilderList .task-builder-item");
  await rows.first().waitFor();
  while (await rows.count() > 0) {
    await rows.last().locator("[data-task-remove]").click();
  }
  await expect(page.locator("#taskBuilderEmpty")).toBeVisible();

  await page.locator("#diagnosisNextButton").click();
  // 같은 단계에 머무르고 계획도 저장되지 않는다.
  await expect(page.locator(".diagnosis-step.active")).toHaveAttribute("data-step-title", "어떤 일을 하면 될까요?");
  expect(await readStored(page, "omwExecutionPlan")).toBeNull();

  diagnostics.expectClean();
});

/* AI 온보딩 시절부터 지켜온 계약이라 수동 빌더 기준으로 옮겨 왔다. 카테고리 칩은
   예시를 제안할 뿐이고, 목표 문장을 대신 써 주거나 사용자 확인 없이 단계를
   넘기지 않는다. (원본: onboarding-ai-legacy.spec.js) */
test("목표 카테고리는 예시만 제안하고 사용자의 명시적 확인 전에는 진행하지 않는다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const goalAiRequests = trackGoalAiRequests(page);
  await mockAccountExperience(page);

  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);

  const goal = page.locator("#designGoal");
  const next = page.locator("#diagnosisNextButton");
  const stepTitle = page.locator(".diagnosis-step.active");

  await expect(goal).toHaveValue("");
  await expect(next).toBeDisabled();

  await page.getByRole("button", { name: "시험", exact: true }).click();
  await expect(page.getByRole("button", { name: "시험", exact: true })).toHaveAttribute("aria-pressed", "true");
  // 칩만 눌렀을 때는 목표 문장을 대신 채우지 않는다.
  await expect(goal).toHaveValue("");
  await expect(goal).toHaveAttribute("placeholder", "예: 6개월 안에 공인중개사 1차 합격하기");
  await expect(page.locator("#goalExampleSuggestions button")).toHaveCount(3);
  await expect(stepTitle).toHaveAttribute("data-step-title", "무엇을 시작해볼까요?");
  await expect(next).toBeDisabled();

  await page.getByRole("button", { name: "올해 한국사능력검정시험 1급 취득하기", exact: true }).click();
  await expect(goal).toHaveValue("올해 한국사능력검정시험 1급 취득하기");
  await expect(stepTitle).toHaveAttribute("data-step-title", "무엇을 시작해볼까요?");
  await expect(next).toBeEnabled();

  // 카테고리를 바꿔도 사용자가 직접 고친 문장을 덮어쓰지 않는다.
  await goal.fill("올해 한국사능력검정시험 1급을 여름까지 취득하기");
  for (const category of ["운동", "취업", "습관"]) {
    await page.getByRole("button", { name: category, exact: true }).click();
    await expect(goal).toHaveValue("올해 한국사능력검정시험 1급을 여름까지 취득하기");
    await expect(stepTitle).toHaveAttribute("data-step-title", "무엇을 시작해볼까요?");
  }

  await goal.fill("   ");
  await expect(next).toBeDisabled();
  await expect(page.locator("#goalValidationMessage")).toHaveText("달성하고 싶은 결과를 입력해 주세요.");
  await goal.press("Enter");
  await expect(stepTitle).toHaveAttribute("data-step-title", "무엇을 시작해볼까요?");

  await goal.fill("30일 동안 매일 저녁 한 줄 일기 쓰기");
  await expect(next).toBeEnabled();
  expect(goalAiRequests).toEqual([]);

  diagnostics.expectClean();
});

test("실행 요일을 모두 해제하면 리듬 단계를 벗어나지 못한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountExperience(page);
  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);

  await page.locator("#designGoal").fill("올해 한국사능력검정시험 1급 취득하기");
  await page.locator("#diagnosisNextButton").click();
  await expect(page.locator(".diagnosis-step.active")).toHaveAttribute("data-step-title", "언제, 얼마나 해볼까요?");

  // 체크박스를 label이 감싸고 있어 포인터 클릭이 가로채인다. 입력 요소를 직접 클릭해
  // change 이벤트까지 정상적으로 발생시킨다.
  await page.locator("[data-design-day]").evaluateAll((inputs) => {
    inputs.forEach((input) => { if (input.checked) input.click(); });
  });
  await expect(page.locator("[data-design-day]:checked")).toHaveCount(0);

  await page.locator("#diagnosisNextButton").click();
  await expect(page.locator(".diagnosis-step.active")).toHaveAttribute("data-step-title", "언제, 얼마나 해볼까요?");

  diagnostics.expectClean();
});
