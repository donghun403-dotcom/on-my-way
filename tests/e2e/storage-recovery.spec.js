const { test, expect } = require("@playwright/test");
const { mockExternalAssets, monitorPage, prepareApp, readStored } = require("./helpers");

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
    const state = await readStored(page, "omwExecutionState");
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
