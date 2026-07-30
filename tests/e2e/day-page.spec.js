/* 하루 페이지 · 회고 뷰 (스펙 2장 다이어리 통합 · 4장 보관 상한 · 7장 4항 부분 삭제).
   기록이 쌓일수록 가치가 커지는 화면이라 빈 상태와 삭제 흐름이 본편만큼 중요하다. */
const { test, expect } = require("@playwright/test");
const {
  CHAT_CONSENT_STORAGE,
  createUsageResponse,
  mockAccountExperience,
  monitorPage,
  prepareApp,
  readStored,
  waitForAppReady,
} = require("./helpers");

const pad = (value) => String(value).padStart(2, "0");
const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const shiftKey = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateKey(date);
};

function memoryFor(key, overrides = {}) {
  return {
    id: key,
    diaryDate: key,
    day: 1,
    title: "오늘의 한 장",
    mood: "proud",
    customMood: "",
    completion: 72,
    obstacle: "time",
    note: "피곤했지만 단어 앱은 열었다.",
    nextStep: "단어 앱 5분 열기",
    conversation: "",
    hasDialogue: true,
    suggestion: "내일도 같은 시간에 이어가요.",
    createdAt: `${key}T09:00:00.000Z`,
    updatedAt: `${key}T09:00:00.000Z`,
    ...overrides,
  };
}

const YESTERDAY = shiftKey(-1);
const THREE_DAYS_AGO = shiftKey(-3);

/* 어제: 다이어리 + 대화 4마디. 3일 전: 다이어리만. 오늘: 아무것도 없음. */
const SEEDED = {
  ...CHAT_CONSENT_STORAGE,
  omwExecutionState: {
    dailyMemories: [
      memoryFor(YESTERDAY, { title: "망설였지만 결국 시작한 날" }),
      memoryFor(THREE_DAYS_AGO, { mood: "tired", completion: 20, note: "", nextStep: "", hasDialogue: false }),
    ],
  },
  omwChatLog: {
    version: 1,
    days: {
      [YESTERDAY]: [
        { role: "user", text: "오늘 하나도 못 했어", at: 1 },
        { role: "ollie", text: "괜찮아요. 오늘 5분만 해볼까요?", headline: "그럴 수 있어요.", emotion: "슬픔공감", at: 2 },
        { role: "user", text: "5분이면 할 수 있을 것 같아", at: 3 },
        { role: "ollie", text: "좋아요, 둥실. 지금 바로요?", headline: "시작이 반이에요.", emotion: "기쁨", at: 4 },
      ],
    },
  },
};

async function openMemoryTab(page) {
  await page.goto("/app.html");
  await waitForAppReady(page);
  await page.locator("#tab-memory").click();
  await expect(page.locator("#dayPage")).toBeVisible();
}

test("하루 페이지가 그날의 마음·한 줄 기록·완료 통계·대화를 한 장으로 묶는다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await prepareApp(page, SEEDED);
  await openMemoryTab(page);

  // 오늘은 아직 비어 있으므로 어제로 한 칸 넘긴다.
  await page.locator("#dayPagePrev").click();
  await expect(page.locator("#dayPageDateRelative")).toHaveText("어제");

  const stats = page.locator("#dayPageBody .day-page-stats > div");
  await expect(stats).toHaveCount(2);
  await expect(stats.nth(0)).toContainText("뿌듯함");
  await expect(stats.nth(1)).toContainText("72% 완료");
  await expect(page.locator("#dayPageBody .day-page-entry-title")).toHaveText("망설였지만 결국 시작한 날");
  await expect(page.locator("#dayPageBody .day-page-note p")).toHaveText("피곤했지만 단어 앱은 열었다.");

  // 대화는 접힌 채로 마디 수만 보이고, 펼쳐야 전체가 나온다.
  const chat = page.locator("#dayPageBody .day-page-chat");
  await expect(chat.locator("summary")).toContainText("올리와의 대화 4마디");
  await expect(chat.locator(".chat-turn").first()).toBeHidden();

  await chat.locator("summary").click();
  await expect(chat.locator(".chat-turn")).toHaveCount(4);
  await expect(chat.locator("[data-chat-role=user] .chat-bubble-text").first()).toHaveText("오늘 하나도 못 했어");
  await expect(chat.locator("[data-chat-role=ollie] .chat-bubble-text").last()).toHaveText("좋아요, 둥실. 지금 바로요?");
  diagnostics.expectClean();
});

test("이 기록이 이 기기에만 있다는 것을 회고 뷰가 밝힌다", async ({ page }) => {
  await prepareApp(page, SEEDED);
  await openMemoryTab(page);
  await expect(page.locator("#dayPage .day-page-storage-note")).toContainText("이 기기에 저장돼요");
});

test("지난 날짜를 넘겨보되 오늘 너머와 기록 이전으로는 나가지 않는다", async ({ page }) => {
  await prepareApp(page, SEEDED);
  await openMemoryTab(page);

  // 오늘에서 시작 — 다음 날은 없다.
  await expect(page.locator("#dayPageDateRelative")).toHaveText("오늘");
  await expect(page.locator("#dayPageNext")).toBeDisabled();
  await expect(page.locator("#dayPagePrev")).toBeEnabled();

  await page.locator("#dayPagePrev").click();
  await expect(page.locator("#dayPageDateRelative")).toHaveText("어제");
  await page.locator("#dayPagePrev").click();
  await expect(page.locator("#dayPageDateRelative")).toHaveText("그저께");
  await page.locator("#dayPagePrev").click();
  await expect(page.locator("#dayPageDateRelative")).toHaveText("3일 전");

  // 가장 오래된 기록이 경계다. 아무것도 없는 과거로 끝없이 넘어가지 않는다.
  await expect(page.locator("#dayPagePrev")).toBeDisabled();
  await page.locator("#dayPageNext").click();
  await expect(page.locator("#dayPageDateRelative")).toHaveText("그저께");
});

test("기록이 없는 날은 비어 있음을 인정하고 가장 가까운 기록으로 데려간다", async ({ page }) => {
  await prepareApp(page, SEEDED);
  await openMemoryTab(page);

  await page.locator("#dayPagePrev").click();
  await page.locator("#dayPagePrev").click();
  await expect(page.locator("#dayPageDateRelative")).toHaveText("그저께");

  const empty = page.locator("#dayPageBody .day-page-empty");
  await expect(empty).toContainText("이 날은 조용히 지나갔어요");
  await expect(page.locator("#dayPageErase")).toBeHidden();

  await empty.locator("[data-day-page-jump]").click();
  await expect(page.locator("#dayPageDateRelative")).toHaveText("3일 전");
  await expect(page.locator("#dayPageBody .day-page-stats")).toBeVisible();
});

test("아직 아무 기록도 없는 유저에게는 첫 페이지를 여는 길을 준다", async ({ page }) => {
  await prepareApp(page);
  await openMemoryTab(page);

  const empty = page.locator("#dayPageBody .day-page-empty");
  await expect(empty).toHaveClass(/is-first/);
  await expect(empty).toContainText("아직 펼칠 페이지가 없어요");
  // 갈 수 있는 날이 하루도 없으므로 양쪽 화살표가 모두 잠긴다.
  await expect(page.locator("#dayPagePrev")).toBeDisabled();
  await expect(page.locator("#dayPageNext")).toBeDisabled();
  await expect(page.locator("#dayPageErase")).toBeHidden();
  await expect(empty.locator("[data-day-page-jump]")).toHaveCount(0);

  await empty.locator("[data-day-page-talk]").click();
  await expect(page.locator("#companionChatSheet")).toBeVisible();
});

test("부분 삭제는 확인을 거쳐야 지워지고, 취소하면 그대로 남는다", async ({ page }) => {
  await prepareApp(page, {
    ...SEEDED,
    // 대화 원문이 남을 수 있는 이벤트도 함께 지워지는지 본다.
    omwCompanionEvents: [
      { type: "companion_dialogue", detail: { reply: "어제 남긴 올리의 대답" }, dayKey: YESTERDAY, createdAt: `${YESTERDAY}T09:00:00.000Z` },
      { type: "companion_dialogue", detail: { reply: "3일 전 올리의 대답" }, dayKey: THREE_DAYS_AGO, createdAt: `${THREE_DAYS_AGO}T09:00:00.000Z` },
    ],
  });
  await openMemoryTab(page);
  await page.locator("#dayPagePrev").click();
  await expect(page.locator("#dayPageDateRelative")).toHaveText("어제");

  await expect(page.locator("#dayPageEraseConfirm")).toBeHidden();
  await page.locator("#dayPageEraseStart").click();
  await expect(page.locator("#dayPageEraseConfirm")).toBeVisible();
  await expect(page.locator("#dayPageEraseDetail")).toContainText("되돌릴 수 없어요");
  await expect(page.locator("#dayPageEraseDetail")).toContainText("올리와의 대화 4마디");

  // 취소하면 아무것도 사라지지 않는다.
  await page.locator("#dayPageEraseCancel").click();
  await expect(page.locator("#dayPageEraseConfirm")).toBeHidden();
  await expect(page.locator("#dayPageBody .day-page-chat summary")).toContainText("4마디");
  expect(Object.keys((await readStored(page, "omwChatLog")).days)).toContain(YESTERDAY);

  await page.locator("#dayPageEraseStart").click();
  await page.locator("#dayPageEraseCommit").click();

  await expect(page.locator("#dayPageBody .day-page-empty")).toContainText("이 날은 조용히 지나갔어요");
  await expect(page.locator("#dayPageErase")).toBeHidden();
  expect(Object.keys((await readStored(page, "omwChatLog")).days)).not.toContain(YESTERDAY);

  const events = await readStored(page, "omwCompanionEvents");
  const dialogueDays = events.filter((event) => event.type === "companion_dialogue").map((event) => event.dayKey);
  expect(dialogueDays).not.toContain(YESTERDAY);
  expect(dialogueDays).toContain(THREE_DAYS_AGO);

  // 새로고침해도 지워진 채로 남는다 — 화면에서만 사라지는 삭제는 삭제가 아니다.
  await page.reload();
  await page.locator("#tab-memory").click();
  await page.locator("#dayPagePrev").click();
  await expect(page.locator("#dayPageBody .day-page-empty")).toBeVisible();
  const memories = (await readStored(page, "omwExecutionState")) || {};
  expect(JSON.stringify(memories)).not.toContain("망설였지만 결국 시작한 날");
});

test("삭제해도 다른 날의 기록은 건드리지 않는다", async ({ page }) => {
  await prepareApp(page, SEEDED);
  await openMemoryTab(page);
  await page.locator("#dayPagePrev").click();
  await page.locator("#dayPageEraseStart").click();
  await page.locator("#dayPageEraseCommit").click();

  await expect(page.locator("#dayPageDateRelative")).toHaveText("어제");
  await page.locator("#dayPagePrev").click();
  await page.locator("#dayPagePrev").click();
  await expect(page.locator("#dayPageDateRelative")).toHaveText("3일 전");
  await expect(page.locator("#dayPageBody .day-page-stats")).toContainText("20% 완료");
});

test("보관 상한에 걸릴 기록은 사라지기 전에 알린다", async ({ page }) => {
  const expiringKey = shiftKey(-80);
  await prepareApp(page, {
    ...CHAT_CONSENT_STORAGE,
    omwChatLog: {
      version: 1,
      days: {
        [expiringKey]: [
          { role: "user", text: "80일 전 대화", at: 1 },
          { role: "ollie", text: "그날의 답이에요.", emotion: "평온", at: 2 },
        ],
      },
    },
  });
  await openMemoryTab(page);

  const retention = page.locator("#dayPageRetention");
  await expect(retention).toBeVisible();
  await expect(retention).toContainText("10일 뒤");
  await expect(retention).toContainText("90일");
  // 사라진다는 말만 남기지 않는다 — 간직할 길이 온다는 것도 같이 알린다.
  await expect(retention).toContainText("다이어리 북");

  await retention.locator("[data-day-page-jump]").click();
  await expect(page.locator("#dayPageDateRelative")).toHaveText("80일 전");
  await expect(retention).toContainText("이 날의 대화 2마디");
});

test("보관 상한 계산은 90일 경계와 500턴 경계를 지킨다", async ({ page }) => {
  await prepareApp(page);
  await page.goto("/app.html");
  await waitForAppReady(page);

  const result = await page.evaluate(() => {
    const days = {
      "2026-04-01": [{ role: "user", text: "가장 오래된 날" }],   // 89일 전 → 남은 1일
      "2026-06-15": [{ role: "user", text: "45일 전" }],          // 여유 있음
    };
    const near = { "2026-06-15": Array.from({ length: 460 }, () => ({ role: "user", text: "턴" })) };
    return {
      expiring: window.__omwTest.chatRetentionStatus({ days }, "2026-06-29"),
      turnCap: window.__omwTest.chatRetentionStatus({ days: near }, "2026-06-29"),
    };
  });

  expect(result.expiring.expiring).toHaveLength(1);
  expect(result.expiring.expiring[0]).toMatchObject({ key: "2026-04-01", remainingDays: 1, turns: 1 });
  expect(result.expiring.totalTurns).toBe(2);
  expect(result.expiring.nearTurnCap).toBe(false);

  expect(result.turnCap.nearTurnCap).toBe(true);
  expect(result.turnCap.totalTurns).toBe(460);
  expect(result.turnCap.turnsUntilCap).toBe(40);
  expect(result.turnCap.expiring).toHaveLength(0);
});

/* 오늘 나눈 이야기가 기록 탭에 곧바로 보이지 않으면, 유저는 대화가 어딘가로 사라졌다고
   읽는다 — 이 기능의 리텐션 근거가 "대화가 기록으로 남는다"는 것이므로 중요하다. */
test("대화가 오가면 오늘의 하루 페이지가 곧바로 그 대화를 담는다", async ({ page }) => {
  const usage = createUsageResponse({ plan: "expired", dailyUsed: 0, monthlyUsed: 0, trialEligible: false });
  await prepareApp(page, CHAT_CONSENT_STORAGE);
  await mockAccountExperience(page, {
    user: { id: "usr_day", provider: "google", name: "하루 테스트", email: "day@example.com", plan: "expired", role: "member" },
    usage,
  });
  await page.route("**/api/ai/companion-chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        headline: "좋아요.",
        reply: "오늘은 5분이면 충분해요.",
        emotion: "기쁨",
        chargedCredits: 1,
        usage,
      }),
    }),
  );
  await openMemoryTab(page);
  await expect(page.locator("#dayPageBody .day-page-empty")).toBeVisible();

  await page.locator("#dayPageBody [data-day-page-talk]").click();
  await expect(page.locator("#companionChatSheet")).toBeVisible();
  await page.locator("#companionChatInput").fill("오늘 뭘 하면 좋을까");
  await page.locator("#sendCompanionMessage").click();
  await expect(page.locator('#chatThread [data-chat-role="ollie"] .chat-bubble-text').last()).toHaveText("오늘은 5분이면 충분해요.");

  await page.locator("#closeCompanionChat").click();
  await expect(page.locator("#dayPageBody .day-page-chat summary")).toContainText("올리와의 대화 2마디");
  await expect(page.locator("#dayPageDateRelative")).toHaveText("오늘");
});
