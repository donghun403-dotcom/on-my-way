const { test, expect } = require("@playwright/test");
const { mockAccountExperience, mockExternalAssets, monitorPage, prepareApp, readStored, waitForAppReady } = require("./helpers");

const corruptions = [
  ["invalid JSON and empty values", { omwExecutionState: "{bad-json", omwCompanionState: "" }],
  ["wrong container types and null", { omwExecutionState: [], omwCompanionEvents: {}, omwCompanionState: null }],
  ["missing and mismatched fields", { omwExecutionState: { selectedDay: "oops", checkedByDay: [], completedLog: {}, dailyMemories: null, lastSeenDate: "not-a-date", extra: true } }],
  ["duplicate ids and records", { omwExecutionState: { customTasksByDay: { 1: [{ id: "same", text: "A" }, { id: "same", text: "B" }] }, completedLog: [{ taskKey: "same" }, { taskKey: "same" }], dailyMemories: [{ id: "same" }, { id: "same" }] } }],
  ["invalid numbers and dates", { omwExecutionState: { selectedDay: -20, lastSeenDate: "2026-99-99" }, omwCompanionState: { xp: "NaN", level: -3, touched: -4 } }],
];

for (const [name, storage] of corruptions) {
  test(`손상 복구: ${name}`, async ({ page }) => {
    await prepareApp(page, storage);
    const diagnostics = monitorPage(page);
    await page.goto("/app.html");
    await expect(page.locator("#view-today")).toBeVisible();
    const rawBeforeMutation = await page.evaluate(() => localStorage.getItem("omwExecutionState"));
    const originalExecutionState = storage.omwExecutionState;
    expect(rawBeforeMutation).toBe(typeof originalExecutionState === "string" ? originalExecutionState : JSON.stringify(originalExecutionState));

    const firstAction = page.locator("#executionChecklist .execution-check").first();
    if (await firstAction.count()) await firstAction.check();
    // v5는 완료 기록을 completionLedger로 압축 저장하므로 디코드된 상태로 검증한다.
    const state = await page.evaluate(() => getExecutionState());
    expect(state.selectedDay).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(state.completedLog)).toBeTruthy();
    expect(Array.isArray(state.dailyMemories)).toBeTruthy();
    expect(new Set(state.completedLog.map((item) => item.taskKey)).size).toBe(state.completedLog.length);
    const taskIds = Object.values(state.customTasksByDay).flat().map((task) => task.id);
    expect(new Set(taskIds).size).toBe(taskIds.length);
    const companion = await readStored(page, "omwCompanionState");
    if (companion) {
      expect(Number(companion.xp) || 0).toBeGreaterThanOrEqual(0);
      expect(Number(companion.level) || 1).toBeGreaterThanOrEqual(1);
    }
    diagnostics.expectClean();
  });
}

test("정상 v3 상태는 첫 읽기에 원문을 유지하고 명시적 변경 뒤 완료·일기·진행률과 확장 필드를 v5로 보존한다", async ({ page }) => {
  await prepareApp(page);
  await page.goto("/app.html");
  await waitForAppReady(page);
  const seeded = await page.evaluate(() => {
    const bundle = getPlanBundle();
    const firstTask = bundle.schedule[0].tasks[0];
    const legacyState = {
      ...bundle.state,
      version: 3,
      selectedDay: 1,
      checkedByDay: { ...bundle.state.checkedByDay, "1": [true, ...bundle.schedule[0].tasks.slice(1).map(() => false)] },
      checkedTaskKeysByDay: { ...bundle.state.checkedTaskKeysByDay, "1": { [firstTask._taskKey]: true } },
      completedLog: [{ taskKey: firstTask._taskKey, day: 1, taskIndex: 0, text: firstTask.text, completedAt: "2026-07-20T00:00:00.000Z" }],
      dailyMemories: [{ id: "2026-07-20-memory", diaryDate: "2026-07-20", text: "기존 일기", createdAt: "2026-07-20T01:00:00.000Z" }],
      [["ol", "lyGrowthState"].join("")]: { completedActionCount: 1, firstLeafAt: "2026-07-20T00:00:00.000Z" },
      legacyExtension: { keep: true },
    };
    const raw = JSON.stringify(legacyState);
    localStorage.setItem("omwExecutionState", raw);
    return { raw, firstTaskKey: firstTask._taskKey };
  });

  await page.reload();
  await waitForAppReady(page);
  expect(await page.evaluate(() => localStorage.getItem("omwExecutionState"))).toBe(seeded.raw);
  await expect(page.locator("#executionChecklist .execution-check").first()).toBeChecked();
  await expect(page.locator("#todayGoalProgress")).toContainText("1 /");

  const firstCheckbox = page.locator("#executionChecklist .execution-check").first();
  await firstCheckbox.uncheck();
  await firstCheckbox.check();
  // v5는 raw 저장의 버전을 5로 올리고 완료·일기를 completionLedger로 압축하되, 확장 필드와 기록은 그대로 보존한다.
  const rawStored = await readStored(page, "omwExecutionState");
  expect(rawStored.version).toBe(5);
  expect(rawStored.legacyExtension).toEqual({ keep: true });
  expect(rawStored.ollieGrowthState).toMatchObject({
    completedActionCount: 1,
    firstLeafAt: "2026-07-20T00:00:00.000Z",
  });
  const migrated = await page.evaluate(() => getExecutionState());
  expect(migrated.dailyMemories).toEqual([expect.objectContaining({ id: "2026-07-20-memory", text: "기존 일기" })]);
  expect(migrated.completedLog).toHaveLength(1);
  expect(migrated.completedLog[0].taskKey).toBe(`1:${seeded.firstTaskKey}`);

  await page.reload();
  await waitForAppReady(page);
  await expect(page.locator("#executionChecklist .execution-check").first()).toBeChecked();
  expect((await page.evaluate(() => getExecutionState())).dailyMemories).toHaveLength(1);
});

test("account changes isolate local plans and restore only the matching account", async ({ page }) => {
  await mockExternalAssets(page);
  await page.goto("/app.html");
  const result = await page.evaluate(() => {
    switchAccountStorageScope("user:account-a");
    localStorage.setItem("omwExecutionPlan", JSON.stringify({ goal: "A-only goal" }));

    switchAccountStorageScope("user:account-b");
    const bInitiallySaw = JSON.parse(localStorage.getItem("omwExecutionPlan") || "{}").goal || null;
    localStorage.setItem("omwExecutionPlan", JSON.stringify({ goal: "B-only goal" }));

    switchAccountStorageScope("user:account-a");
    const aRestored = JSON.parse(localStorage.getItem("omwExecutionPlan") || "{}").goal || null;

    switchAccountStorageScope("user:account-b");
    const bRestored = JSON.parse(localStorage.getItem("omwExecutionPlan") || "{}").goal || null;
    return { bInitiallySaw, aRestored, bRestored };
  });

  expect(result).toEqual({ bInitiallySaw: null, aRestored: "A-only goal", bRestored: "B-only goal" });
});

test("logout scope hides account data and the same account login restores it", async ({ page }) => {
  await mockExternalAssets(page);
  await page.goto("/app.html");
  const result = await page.evaluate(() => {
    switchAccountStorageScope("user:account-a");
    localStorage.setItem("omwExecutionPlan", JSON.stringify({ goal: "A-only goal" }));

    switchAccountStorageScope("anonymous:logout-device");
    const anonymousSaw = localStorage.getItem("omwExecutionPlan");
    localStorage.setItem("omwExecutionPlan", JSON.stringify({ goal: "anonymous goal" }));

    switchAccountStorageScope("user:account-a");
    const restored = JSON.parse(localStorage.getItem("omwExecutionPlan") || "{}").goal || null;
    return { anonymousSaw, restored };
  });

  expect(result).toEqual({ anonymousSaw: null, restored: "A-only goal" });
});

test("a corrupt account snapshot recovers without a reload loop", async ({ page }) => {
  await mockExternalAssets(page);
  await page.goto("/app.html");
  const result = await page.evaluate(() => {
    localStorage.setItem("onmyway:active-scope", "user:account-a");
    localStorage.setItem("omwExecutionPlan", JSON.stringify({ goal: "A-only goal" }));
    localStorage.setItem("onmyway:user:account-b:state", "{bad-json");
    const changed = switchAccountStorageScope("user:account-b");
    return {
      changed,
      scope: localStorage.getItem("onmyway:active-scope"),
      plan: localStorage.getItem("omwExecutionPlan"),
      corruptSnapshot: localStorage.getItem("onmyway:user:account-b:state"),
    };
  });

  expect(result).toEqual({ changed: true, scope: "user:account-b", plan: null, corruptSnapshot: null });
});

test("새 목표는 이전 목표의 빈 실행 상태나 시험용 기본 일정을 재사용하지 않는다", async ({ page }) => {
  const startupPlan = {
    goal: "90일 안에 첫 유료 고객 10명 만들기",
    period: 90,
    routineTime: "저녁",
    routineReadiness: "바로 실행하는 편이에요",
    currentState: "아이디어만 있고 평일 1시간, 주말 3시간 가능",
    currentRoutine: "저녁 식사 후 노트북 열기",
    firstAction: "잠재 고객 인터뷰 질문 5개 작성",
    aiPreview: {
      firstAction: "잠재 고객 인터뷰 질문 5개 작성",
      weekPlan: ["잠재 고객 10명 목록 만들기", "고객 문제 인터뷰 3회 진행", "첫 제안 문구 작성"],
    },
    planSource: "ai",
    createdAt: "2026-07-21T00:00:00.000Z",
  };
  await prepareApp(page, {
    omwExecutionPlan: startupPlan,
    omwExecutionState: { scheduleKey: "previous-goal-key", planText: "", checkedByDay: { 1: [true, true, true] } },
  });
  await page.goto("/app.html");
  await page.locator("#tab-plan").click();
  const planText = await page.locator("#weeklyPlanList").innerText();
  expect(planText).toContain("잠재 고객");
  expect(planText).not.toMatch(/오답|LC|RC|단어 40개/);
});

test("처음 화면의 로컬 미리보기는 이미 저장된 회원 계획을 덮어쓰지 않는다", async ({ page }) => {
  const savedPlan = {
    goal: "첫 유료 고객 10명 만들기",
    period: 90,
    firstAction: "잠재 고객 인터뷰 질문 작성",
    planSource: "ai",
    createdAt: "2026-07-21T00:00:00.000Z",
  };
  await prepareApp(page, { omwExecutionPlan: savedPlan });
  await page.goto("/index.html");
  await expect.poll(() => readStored(page, "omwExecutionPlan")).toMatchObject(savedPlan);
});

const ACCOUNT_PLAN = { goal: "이전 계정 계획", period: 90, planId: "plan-account", createdAt: "2026-07-01T00:00:00.000Z" };
const GUEST_PLAN = { goal: "방금 만든 게스트 계획", period: 30, planId: "plan-guest", createdAt: "2026-07-28T00:00:00.000Z" };

/* 재현: 계정A로 계획을 만들고 → 로그아웃 → 비로그인으로 새 계획 작성 → 계정A로 다시 로그인.
   예전에는 계정 스냅샷이 비어 있지 않다는 이유로 아무것도 묻지 않고 복원해서, 방금 만든
   계획이 화면에서 사라졌다. 이제는 어느 쪽도 버리지 않고 선택 표식만 남긴다. */
test("재로그인 때 게스트 계획과 계정 계획이 둘 다 있으면 어느 쪽도 버리지 않는다", async ({ page }) => {
  await mockExternalAssets(page);
  await page.goto("/app.html");
  const result = await page.evaluate(({ accountPlan, guestPlan }) => {
    switchAccountStorageScope("user:account-a");
    localStorage.setItem("omwExecutionPlan", JSON.stringify(accountPlan));

    switchAccountStorageScope("anonymous:relogin-device");
    localStorage.setItem("omwExecutionPlan", JSON.stringify(guestPlan));

    switchAccountStorageScope("user:account-a", { allowAnonymousMerge: true });
    return {
      live: JSON.parse(localStorage.getItem("omwExecutionPlan") || "null"),
      guestSnapshot: JSON.parse(
        JSON.parse(localStorage.getItem("onmyway:anonymous:relogin-device:state") || "{}").omwExecutionPlan || "null",
      ),
      pending: JSON.parse(localStorage.getItem("onmyway:pending-plan-choice") || "null"),
    };
  }, { accountPlan: ACCOUNT_PLAN, guestPlan: GUEST_PLAN });

  // 선택 전에는 계정 계획이 화면에 남고(기존 동작), 게스트 계획도 그대로 보존된다.
  expect(result.live.planId).toBe("plan-account");
  expect(result.guestSnapshot.planId).toBe("plan-guest");
  expect(result.pending).toMatchObject({ targetScope: "user:account-a", guestScope: "anonymous:relogin-device" });
});

test("게스트 데이터가 없으면 선택을 묻지 않는다", async ({ page }) => {
  await mockExternalAssets(page);
  await page.goto("/app.html");
  const pending = await page.evaluate(({ accountPlan }) => {
    switchAccountStorageScope("user:account-a");
    localStorage.setItem("omwExecutionPlan", JSON.stringify(accountPlan));
    switchAccountStorageScope("anonymous:empty-device");
    switchAccountStorageScope("user:account-a", { allowAnonymousMerge: true });
    return localStorage.getItem("onmyway:pending-plan-choice");
  }, { accountPlan: ACCOUNT_PLAN });

  expect(pending).toBeNull();
});

/* 실제 화면에서 고르는 데까지가 수정 범위다. 네이티브 confirm은 쓰지 않는다. */
test("로그인 뒤 인앱 시트에서 방금 만든 계획을 고르면 그 계획으로 이어간다", async ({ page }) => {
  const account = await mockAccountExperience(page, {
    user: { id: "account-a", provider: "kakao", name: "재로그인 사용자", email: "a@example.com", plan: "free", role: "member" },
  });
  account.accountState = { omwExecutionPlan: JSON.stringify(ACCOUNT_PLAN) };
  account.revision = 3;

  let nativeDialogs = 0;
  page.on("dialog", (dialog) => { nativeDialogs += 1; return dialog.dismiss(); });

  await page.addInitScript(({ accountPlan, guestPlan }) => {
    if (sessionStorage.getItem("__omw_choice_seeded") === "true") return;
    localStorage.clear();
    // 로그아웃 상태에서 게스트가 새 계획을 만든 시점을 재현한다.
    localStorage.setItem("onmyway:active-scope", "anonymous:relogin-device");
    localStorage.setItem("onmyway:anonymous-device", "relogin-device");
    localStorage.setItem("omwExecutionPlan", JSON.stringify(guestPlan));
    localStorage.setItem("onmyway:user:account-a:state", JSON.stringify({ omwExecutionPlan: JSON.stringify(accountPlan) }));
    sessionStorage.setItem("__omw_choice_seeded", "true");
  }, { accountPlan: ACCOUNT_PLAN, guestPlan: GUEST_PLAN });

  await page.goto("/app.html");
  await waitForAppReady(page);

  const sheet = page.locator("#planChoiceSheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("방금 만든 게스트 계획");
  await expect(sheet).toContainText("이전 계정 계획");
  expect(nativeDialogs).toBe(0);

  await page.locator("[data-plan-choice='guest']").click();
  await waitForAppReady(page);

  await expect.poll(async () => (await readStored(page, "omwExecutionPlan"))?.planId).toBe("plan-guest");
  await expect(page.locator("#planChoiceSheet")).toBeHidden();
  // 고르지 않은 계획도 이 기기에 사본으로 남는다.
  const backups = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.startsWith("onmyway:plan-choice-backup:")));
  expect(backups.length).toBeGreaterThan(0);
});

test("로그인 뒤 인앱 시트에서 이전 계획을 고르면 계정 계획이 유지된다", async ({ page }) => {
  const account = await mockAccountExperience(page, {
    user: { id: "account-a", provider: "kakao", name: "재로그인 사용자", email: "a@example.com", plan: "free", role: "member" },
  });
  account.accountState = { omwExecutionPlan: JSON.stringify(ACCOUNT_PLAN) };
  account.revision = 3;

  await page.addInitScript(({ accountPlan, guestPlan }) => {
    if (sessionStorage.getItem("__omw_choice_seeded") === "true") return;
    localStorage.clear();
    localStorage.setItem("onmyway:active-scope", "anonymous:relogin-device");
    localStorage.setItem("onmyway:anonymous-device", "relogin-device");
    localStorage.setItem("omwExecutionPlan", JSON.stringify(guestPlan));
    localStorage.setItem("onmyway:user:account-a:state", JSON.stringify({ omwExecutionPlan: JSON.stringify(accountPlan) }));
    sessionStorage.setItem("__omw_choice_seeded", "true");
  }, { accountPlan: ACCOUNT_PLAN, guestPlan: GUEST_PLAN });

  await page.goto("/app.html");
  await waitForAppReady(page);
  await expect(page.locator("#planChoiceSheet")).toBeVisible();
  await page.locator("[data-plan-choice='account']").click();

  await expect(page.locator("#planChoiceSheet")).toBeHidden();
  expect((await readStored(page, "omwExecutionPlan")).planId).toBe("plan-account");
  // 다시 묻지 않는다.
  expect(await page.evaluate(() => localStorage.getItem("onmyway:pending-plan-choice"))).toBeNull();
  // 게스트 계획은 이 기기에 남아 있다.
  const guestSnapshot = await page.evaluate(() =>
    JSON.parse(JSON.parse(localStorage.getItem("onmyway:anonymous:relogin-device:state") || "{}").omwExecutionPlan || "null"));
  expect(guestSnapshot.planId).toBe("plan-guest");
});
