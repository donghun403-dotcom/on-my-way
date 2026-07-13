const { test, expect } = require("@playwright/test");
const { monitorPage, prepareApp, readStored } = require("./helpers");

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
