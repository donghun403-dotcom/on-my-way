const { test, expect } = require("@playwright/test");
const { monitorPage, prepareApp, readStored, waitForAppReady } = require("./helpers");

const todayKey = new Date().toLocaleDateString("en-CA");

async function openApp(page) {
  await page.goto("/app.html");
  await waitForAppReady(page);
}

test("320px 올리 첫 화면에서 대화를 시작하고 sheet 초점을 복원한다", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await prepareApp(page, {
    omwCompanionState: { name: "올리", level: 2, xp: 12, relationship: 4, energy: "normal", mood: "ready", touched: 1 },
  });
  const diagnostics = monitorPage(page);
  await openApp(page);
  await page.locator("#tab-mate").click();

  const chatCta = page.locator("#openCompanionChatPrimary");
  await expect(chatCta).toBeVisible();
  const box = await chatCta.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(568);
  await expect(page.locator("#companionDays")).toBeVisible();
  await expect(page.locator("#companionNextGrowth")).toHaveText(/친구|단짝|메이트/);
  await expect(page.locator("#bondXpText")).toContainText("XP");

  await chatCta.click();
  await expect(page.locator("#companionChatSheet")).toBeVisible();
  await expect(page.locator("#companionChatSheet")).toHaveAttribute("aria-modal", "true");
  await expect(page.locator("#companionChatInput")).not.toBeFocused();
  await expect(page.locator("#closeCompanionChat")).toBeFocused();
  await page.locator("#closeCompanionChat").click();
  await expect(chatCta).toBeFocused();
  diagnostics.expectClean();
});

test("쓰다듬기 보상과 성장 details의 기존 관계 데이터를 유지한다", async ({ page }) => {
  await prepareApp(page);
  const diagnostics = monitorPage(page);
  await openApp(page);
  await page.locator("#tab-mate").click();

  await page.locator("#touchCompanion").click();
  const rewarded = await readStored(page, "omwCompanionState");
  expect(rewarded.xp).toBe(5);
  expect(rewarded.lastTouchedDate).toBe(todayKey);
  await page.locator("#touchCompanion").click();
  expect((await readStored(page, "omwCompanionState")).xp).toBe(5);

  await page.locator("#matePanel > summary").click();
  await expect(page.locator("#matePanel")).toHaveAttribute("open", "");
  await expect(page.locator("#journeyMapCard")).toBeVisible();
  await expect(page.locator("#journeyMap .journey-stop")).toHaveCount(5);
  diagnostics.expectClean();
});

test("기록 감정과 선택 입력을 복원하고 aria-pressed를 동기화한다", async ({ page }) => {
  await prepareApp(page, {
    omwExecutionState: {
      selectedDay: 1,
      lastSeenDate: todayKey,
      dailyMemories: [{
        id: todayKey,
        diaryDate: todayKey,
        day: 1,
        title: "합성 기록",
        mood: "proud",
        completion: 50,
        obstacle: "time",
        note: "합성 데이터로 남긴 오늘의 한 장면",
        nextStep: "10분 시작하기",
        conversation: "",
        hasDialogue: false,
        suggestion: "내일 첫 행동을 10분으로 유지해줘.",
        createdAt: `${todayKey}T01:00:00.000Z`,
        updatedAt: `${todayKey}T01:00:00.000Z`,
      }],
    },
  });
  const diagnostics = monitorPage(page);
  await openApp(page);
  await page.locator("#tab-memory").click();

  await expect(page.locator("[data-memory-mood='proud']")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-memory-mood='calm']")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#memoryNote")).toHaveValue("합성 데이터로 남긴 오늘의 한 장면");
  await expect(page.locator("#memoryOptionalDetails")).toHaveAttribute("open", "");
  await expect(page.locator("#memoryNextStep")).toHaveValue("10분 시작하기");

  await page.locator("[data-memory-mood='tired']").click();
  await expect(page.locator("[data-memory-mood='tired']")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-memory-mood='proud']")).toHaveAttribute("aria-pressed", "false");
  diagnostics.expectClean();
});

test("기록 저장은 status에 초점을 두고 대화 없는 빈 요약을 만들지 않는다", async ({ page }) => {
  await prepareApp(page);
  const diagnostics = monitorPage(page);
  await openApp(page);
  await page.locator("#tab-memory").click();

  await expect(page.locator("#memoryConversationSummary")).toBeHidden();
  await page.locator("[data-memory-mood='happy']").click();
  await page.locator("#memoryNote").fill("합성 데이터로 기록한 작은 성공");
  await page.locator("#memoryOptionalDetails > summary").click();
  await page.locator("#memoryNextStep").fill("내일 5분 시작하기");
  await page.locator("#memorySaveButton").click();

  await expect(page.locator("#memorySaveHint")).toContainText("저장 완료");
  await expect(page.locator("#memorySaveHint")).toBeFocused();
  const state = await readStored(page, "omwExecutionState");
  expect(state.dailyMemories).toHaveLength(1);
  expect(state.dailyMemories[0].note).toBe("합성 데이터로 기록한 작은 성공");
  expect(state.dailyMemories[0].hasDialogue).toBe(false);
  await expect(page.locator("#memoryConversationSummary")).toBeHidden();

  await page.locator(".memory-history-disclosure > summary").click();
  await expect(page.locator("#memoryList .daily-memory-item")).toHaveCount(1);
  diagnostics.expectClean();
});

test("오늘 실제 대화 이벤트가 있을 때만 기록 아래에 요약을 연결한다", async ({ page }) => {
  await prepareApp(page, {
    omwCompanionEvents: [{
      type: "companion_dialogue",
      dayKey: todayKey,
      detail: { user: "합성 질문", reply: "합성 대화 요약입니다." },
      createdAt: `${todayKey}T02:00:00.000Z`,
    }],
  });
  const diagnostics = monitorPage(page);
  await openApp(page);
  await page.locator("#tab-memory").click();

  await expect(page.locator("#memoryConversationSummary")).toBeVisible();
  await expect(page.locator("#memoryConversation")).toHaveText("합성 대화 요약입니다.");
  await expect(page.locator("#openCompanionChat")).toContainText("대화 이어가기");
  diagnostics.expectClean();
});

test("대화 이벤트가 정리된 뒤 기록을 수정해도 기존 저장 대화는 보존한다", async ({ page }) => {
  await prepareApp(page, {
    omwExecutionState: {
      selectedDay: 1,
      lastSeenDate: todayKey,
      dailyMemories: [{
        id: todayKey,
        diaryDate: todayKey,
        day: 1,
        title: "합성 기록",
        mood: "calm",
        completion: 25,
        obstacle: "none",
        note: "기존 한 장면",
        nextStep: "",
        conversation: "보존되어야 하는 기존 대화",
        hasDialogue: true,
        suggestion: "작게 이어가요.",
        createdAt: `${todayKey}T01:00:00.000Z`,
        updatedAt: `${todayKey}T01:00:00.000Z`,
      }],
    },
    omwCompanionEvents: [],
  });
  const diagnostics = monitorPage(page);
  await openApp(page);
  await page.locator("#tab-memory").click();

  await expect(page.locator("#memoryConversationSummary")).toBeHidden();
  await page.locator("#memoryNote").fill("수정한 한 장면");
  await page.locator("#memorySaveButton").click();

  const state = await readStored(page, "omwExecutionState");
  expect(state.dailyMemories[0].conversation).toBe("보존되어야 하는 기존 대화");
  expect(state.dailyMemories[0].hasDialogue).toBe(true);
  await expect(page.locator("#memoryConversationSummary")).toBeHidden();
  diagnostics.expectClean();
});
