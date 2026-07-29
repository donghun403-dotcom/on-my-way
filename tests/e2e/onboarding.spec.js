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

  account.user = { id: "usr_manual_gate", provider: "kakao", name: "수동 계획 사용자", email: "manual@example.com", plan: "expired", role: "member" };
  account.usage = createUsageResponse({ plan: "expired", trialEligible: true });

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

/* 게스트가 계획을 완성하고 로그인 게이트를 연 상태를 만든다. 여기까지 오면
   sessionStorage에 이어가기 의도와 계획 사본이 둘 다 들어 있다. 로그인은 아직이다. */
async function buildPlanAndOpenSignupGate(page, task) {
  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);
  await completeManualPlan(page, { goal: "90일 안에 첫 유료 고객 10명 만들기", tasks: [task] });

  await page.locator("#trialStartInlineLink").click();
  await expect(page.locator("#authSheet")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:manual-plan-handoff"))).toBeTruthy();
}

// 소셜 로그인을 마치고 돌아온 상태를 모킹 계정에 반영한다.
function signInAfterGate(account) {
  account.user = { id: "usr_manual_gate", provider: "kakao", name: "수동 계획 사용자", email: "manual@example.com", plan: "expired", role: "member" };
  account.usage = createUsageResponse({ plan: "expired", trialEligible: true });
}

// 의도를 발급 시각 기준으로 늙힌다 (TTL은 10분).
function ageAuthIntent(page, minutes) {
  return page.evaluate((elapsedMinutes) => {
    const key = "onmyway:pending-auth-intent";
    const intent = JSON.parse(sessionStorage.getItem(key));
    intent.createdAt -= elapsedMinutes * 60 * 1000;
    sessionStorage.setItem(key, JSON.stringify(intent));
  }, minutes);
}

/* 핸드오프 복구 테스트는 sessionStorage 수명과 내비게이션 계약을 본다 — 레이아웃이
   아니다. 그런데 하나하나가 빌더 4단계를 끝까지 걷고 페이지를 두세 번 넘기는 무거운
   테스트라, 같은 Chromium을 뷰포트만 바꿔 세 번 돌리면 얻는 것 없이 전체 스위트의
   경합만 키운다(실제로 이 넷을 4개 프로젝트에 다 걸었더니 손대지 않은 스펙들이
   타임아웃으로 무너졌다). 엔진당 하나씩만 돌린다. */
const HANDOFF_ENGINE_PROJECTS = ["desktop-chromium", "iphone-webkit"];

function skipRedundantHandoffProject(testInfo) {
  test.skip(
    !HANDOFF_ENGINE_PROJECTS.includes(testInfo.project.name),
    "저장소·내비게이션 계약이라 엔진당 1회면 충분하다 (Chromium · WebKit)",
  );
}

/* 소셜 로그인 창에서 그냥 돌아오는 일은 흔하다. 그때 계획이 사라지면 안 되고,
   어떤 제공자에서 취소했는지 이름을 붙여 다시 고르게 해야 한다. origin/main이
   덮던 경로인데 스펙이 사라져 있었다. */
test("소셜 로그인을 취소하고 돌아오면 안내와 함께 제공자를 다시 고를 수 있다", async ({ page }, testInfo) => {
  skipRedundantHandoffProject(testInfo);
  const diagnostics = monitorPage(page);
  await mockAccountExperience(page);
  await buildPlanAndOpenSignupGate(page, {
    time: "09:00", text: "잠재 고객 한 명에게 인터뷰 요청", minutes: 15, rule: "메시지를 보내면 완료",
  });

  await page.route("**/api/auth/kakao/start**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><title>Kakao OAuth</title><p>Provider handoff</p>",
  }));
  await Promise.all([
    page.waitForURL(/\/api\/auth\/kakao\/start/),
    page.getByRole("button", { name: "카카오로 계속하기" }).click(),
  ]);

  // 로그인하지 않고 취소로 돌아온다.
  await page.goto("/?resumeGoal=1&auth=cancelled&provider=kakao");
  await waitForBootstrap(page);

  await expect(page.locator("#authSheet")).toBeVisible();
  await expect(page.locator("#authProviderStatus")).toContainText("카카오");
  await expect(page.getByRole("button", { name: "네이버로 계속하기" })).toBeVisible();
  // 계획과 이어가기 의도는 그대로 남는다 — 취소는 포기가 아니다.
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:manual-plan-handoff"))).toBeTruthy();
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:pending-auth-intent"))).toBeTruthy();

  diagnostics.expectClean();
});

/* 체험 시작은 서버 왕복이라 실패할 수 있다. 그때 이어가기 토큰까지 함께 날아가면
   유저는 다 만든 계획을 잃는다 — 온보딩은 저장된 계획으로 결과 화면을 다시 그리지
   않으므로 다시 누를 버튼이 없고, resumeGoal 파라미터도 이미 URL에서 지워진 뒤다. */
test("체험 시작이 실패해도 계획은 남고 새로고침으로 다시 시작된다", async ({ page }, testInfo) => {
  skipRedundantHandoffProject(testInfo);
  const diagnostics = monitorPage(page, {
    allowedResponseUrls: ["/api/ai/trial/start"],
    allowedConsoleMessages: ["status of 503"],
  });
  const account = await mockAccountExperience(page);
  await buildPlanAndOpenSignupGate(page, {
    time: "09:00", text: "잠재 고객 한 명에게 인터뷰 요청", minutes: 15, rule: "메시지를 보내면 완료",
  });
  signInAfterGate(account);

  /* 시도 횟수가 아니라 플래그로 끊는다. 로그인 직후 switchAccountStorageScope가
     익명 데이터를 승계하며 location.reload()를 부를 수 있어서, "첫 번째만 실패"로
     짜면 그 새로고침이 두 번째 시도를 성공시켜 버린다. */
  let trialStartAttempts = 0;
  let trialStartUnavailable = true;
  await page.route("**/api/ai/trial/start", async (route) => {
    trialStartAttempts += 1;
    if (!trialStartUnavailable) return route.fallback();
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"ok":false,"error":"무료 체험을 시작하지 못했어요."}',
    });
  });

  await page.goto("/?resumeGoal=1&auth=success&provider=kakao");
  // 실패 토스트는 2.2초 뒤 사라지므로 서버 시도 자체를 기다린다.
  await expect.poll(() => trialStartAttempts, { timeout: 15_000 }).toBeGreaterThan(0);

  // 앱으로 넘어가지 않았고, 다시 시도할 근거(의도 + 계획 사본)가 그대로 남아 있다.
  expect(page.url()).not.toContain("/app.html");
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:pending-auth-intent"))).toBeTruthy();
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:manual-plan-handoff"))).toBeTruthy();

  // handleAuthQueryParams가 resumeGoal을 지운 뒤라 새로고침 URL에는 파라미터가 없다.
  trialStartUnavailable = false;
  await page.goto("/");
  await page.waitForURL(/\/app\.html/, { timeout: 20_000 });
  expect(account.usage.plan).toBe("trial");
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:pending-auth-intent"))).toBeNull();

  diagnostics.expectClean();
});

/* 소셜 계정을 새로 만들면 문자 인증까지 10분을 넘기기 쉽다. 그 시계가 계획의
   수명을 결정하면 안 된다 — 수동 빌더는 폼 상태를 복원하지 않아서 만료되는 순간
   유저에게 남는 건 빈 4단계뿐이다. */
test("의도 TTL이 지난 뒤 로그인해도 만든 계획은 그대로 이어진다", async ({ page }, testInfo) => {
  skipRedundantHandoffProject(testInfo);
  const diagnostics = monitorPage(page);
  const account = await mockAccountExperience(page);
  await buildPlanAndOpenSignupGate(page, {
    time: "07:00", text: "지원 공고 한 곳 정리", minutes: 20, rule: "요구사항을 적어두면 완료",
  });
  signInAfterGate(account);

  // 소셜 가입에 20분이 걸린 상태를 만든다.
  await ageAuthIntent(page, 20);

  await page.goto("/?resumeGoal=1&auth=success&provider=kakao");
  await page.waitForURL(/\/app\.html/);
  await waitForAppReady(page);

  expect(account.usage.plan).toBe("trial");
  await expect(page.getByText("지원 공고 한 곳 정리").first()).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:pending-auth-intent"))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:manual-plan-handoff"))).toBeNull();

  diagnostics.expectClean();
});

/* 로그인 시트를 명시적으로 닫는 것은 "지금은 이어가지 않겠다"는 뜻이다. 만료된
   의도까지 확실히 거둬들여야, 같은 탭에서 나중에 로그인했을 때 유저가 요청하지
   않은 앱 이동이 일어나지 않는다. */
test("로그인 시트를 닫으면 만료된 이어가기 의도까지 거둬들인다", async ({ page }, testInfo) => {
  skipRedundantHandoffProject(testInfo);
  const diagnostics = monitorPage(page);
  await mockAccountExperience(page);
  await buildPlanAndOpenSignupGate(page, {
    time: "08:00", text: "회고 한 줄 쓰기", minutes: 10, rule: "한 문장을 남기면 완료",
  });

  await ageAuthIntent(page, 20);

  await page.locator("#closeAuthSheet").click();
  await expect(page.locator("#authSheet")).toBeHidden();
  expect(await page.evaluate(() => sessionStorage.getItem("onmyway:pending-auth-intent"))).toBeNull();

  diagnostics.expectClean();
});

test("이미 로그인한 사용자는 게이트 없이 바로 체험을 시작한다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  const goalAiRequests = trackGoalAiRequests(page);
  const account = await mockAccountExperience(page, {
    user: { id: "usr_signed_in", provider: "kakao", name: "기존 사용자", email: "signed@example.com", plan: "expired", role: "member" },
    usage: createUsageResponse({ plan: "expired", trialEligible: true }),
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

/* 2단계에서 정한 가능 시간이 3단계 경고의 기준이어야 한다. 예전에는 힌트가 모듈 로드
   시점에 기본값 30분으로 한 번 계산되고 다시 계산되지 않아, 평일 50분을 넣어도
   "가능 시간(30분)을 넘어요"가 떴다. 주말만 실행하는 사람에게 평일 값을 들이대던
   것도 같은 함수의 문제다. */
test("3단계 가능 시간 경고는 2단계에서 입력한 값과 선택한 요일을 따른다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await mockAccountExperience(page);
  await page.goto("/index.html#designFlow");
  await waitForBootstrap(page);

  const next = page.locator("#diagnosisNextButton");
  const back = page.locator("#diagnosisBackButton");
  const hint = page.locator("#taskBudgetHint");

  await page.locator("#designGoal").fill("3개월 안에 토익 900점 달성하기");
  await next.click();
  await expect(page.locator(".diagnosis-step.active")).toHaveAttribute("data-step-title", "언제, 얼마나 해볼까요?");
  await page.locator("#designWeekdayMinutes").fill("50");
  await next.click();
  await expect(page.locator(".diagnosis-step.active")).toHaveAttribute("data-step-title", "어떤 일을 하면 될까요?");
  await page.locator("#taskBuilderList .task-builder-item").first().waitFor();

  /* 재현의 핵심. 시험 초안은 합계 45분이라 기본값 30분 기준이면 경고가 뜬다.
     3단계에 들어선 순간, 할 일을 아직 건드리지 않았어도 50분이 기준이어야 한다. */
  await expect(hint).toContainText("하루 합계 약 45분");
  await expect(hint).not.toContainText("넘어요");

  // 할 일을 하나만 남기고 45분으로 맞춘다 — 기본 30분 기준이면 초과, 입력한 50분이면 여유다.
  const rows = page.locator("#taskBuilderList .task-builder-item");
  while (await rows.count() > 1) await rows.last().locator("[data-task-remove]").click();
  await rows.first().locator("[data-task-field='minutes']").fill("45");
  await expect(hint).toContainText("45분");
  await expect(hint).not.toContainText("넘어요");

  // 상한을 넘기면 2단계에서 넣은 값이 경고에 그대로 나와야 한다.
  await rows.first().locator("[data-task-field='minutes']").fill("60");
  await expect(hint).toContainText("평일 가능 시간(50분)을 넘어요");

  // 2단계로 돌아가 값을 바꾸면 3단계 경고도 따라 바뀐다.
  await back.click();
  await expect(page.locator(".diagnosis-step.active")).toHaveAttribute("data-step-title", "언제, 얼마나 해볼까요?");
  await page.locator("#designWeekdayMinutes").fill("90");
  await next.click();
  await expect(page.locator(".diagnosis-step.active")).toHaveAttribute("data-step-title", "어떤 일을 하면 될까요?");
  await expect(hint).not.toContainText("넘어요");

  // 주말에만 실행하는 사람에게는 주말 값이 기준이다.
  await back.click();
  await expect(page.locator(".diagnosis-step.active")).toHaveAttribute("data-step-title", "언제, 얼마나 해볼까요?");
  await page.locator("#designWeekendMinutes").fill("20");
  await page.locator("[data-design-day]").evaluateAll((inputs) => {
    inputs.forEach((input) => {
      const isWeekend = input.value === "토" || input.value === "일";
      if (input.checked !== isWeekend) input.click();
    });
  });
  await next.click();
  await expect(page.locator(".diagnosis-step.active")).toHaveAttribute("data-step-title", "어떤 일을 하면 될까요?");
  await expect(hint).toContainText("주말 가능 시간(20분)을 넘어요");

  diagnostics.expectClean();
});
