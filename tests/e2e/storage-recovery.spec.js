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
