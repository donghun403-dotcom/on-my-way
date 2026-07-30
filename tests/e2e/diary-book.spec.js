/* 다이어리 북 (스펙 4장) — 한 달치 기록을 한 권으로.
   서버는 머리말·편지 두 글만 만들고 조판과 PDF 변환은 클라이언트가 한다. */
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
const shiftKey = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const BOOK_MONTH = "2026-06";
const OTHER_MONTH = "2026-05";

function memoryFor(dateKey, overrides = {}) {
  return {
    id: dateKey,
    diaryDate: dateKey,
    day: 1,
    title: "오늘의 한 장",
    mood: "proud",
    customMood: "",
    completion: 80,
    obstacle: "time",
    note: "피곤했지만 단어 앱은 열었다.",
    nextStep: "단어 앱 5분 열기",
    conversation: "",
    hasDialogue: true,
    suggestion: "내일도 같은 시간에 이어가요.",
    createdAt: `${dateKey}T09:00:00.000Z`,
    updatedAt: `${dateKey}T09:00:00.000Z`,
    ...overrides,
  };
}

const TURNS = [
  { role: "user", text: "오늘 하나도 못 했어", at: 1 },
  { role: "ollie", text: "괜찮아요. 오늘 5분만 해볼까요?", headline: "그럴 수 있어요.", emotion: "슬픔공감", at: 2 },
];

const SEEDED = {
  ...CHAT_CONSENT_STORAGE,
  omwExecutionState: {
    dailyMemories: [
      memoryFor(`${BOOK_MONTH}-03`, { title: "망설였지만 결국 시작한 날" }),
      memoryFor(`${BOOK_MONTH}-04`, { mood: "tired", completion: 20, note: "오늘은 쉬었다." }),
      memoryFor(`${OTHER_MONTH}-20`, { note: "지난달의 기록." }),
    ],
  },
  omwChatLog: {
    version: 1,
    days: {
      [`${BOOK_MONTH}-03`]: TURNS,
      [`${BOOK_MONTH}-09`]: TURNS,
      [`${OTHER_MONTH}-20`]: TURNS,
    },
  },
};

const BOOK_REPLY = {
  ok: true,
  title: "작게 시작한 달",
  foreword: "둥실, 이 달은 조용히 이어진 달이었어요.",
  letter: "그 날의 단어 앱을 저는 아직 기억해요. 곁에 있을게요.",
  chargedCredits: 10,
};

/* window.print는 헤드리스에서 아무 일도 하지 않으므로 호출됐는지만 세어 둔다.
   실제 조판 결과는 #diaryBookPrint의 DOM으로 검사한다. */
async function stubPrint(page) {
  await page.addInitScript(() => {
    window.__printCalls = 0;
    window.print = () => { window.__printCalls += 1; };
  });
}

async function prepareBook(page, {
  usage = createUsageResponse({ plan: "pro", dailyUsed: 0, monthlyUsed: 0, trialEligible: false }),
  storage = SEEDED,
  reply = BOOK_REPLY,
  status = 200,
} = {}) {
  await stubPrint(page);
  await prepareApp(page, storage);
  await mockAccountExperience(page, {
    user: { id: "usr_book", provider: "google", name: "북 테스트", email: "book@example.com", plan: "pro", role: "member" },
    usage,
  });
  const calls = [];
  await page.route("**/api/ai/diary-book", (route) => {
    calls.push(JSON.parse(route.request().postData() || "{}"));
    return route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(status === 200 ? { ...reply, usage } : { ok: false, error: "E2E mock failure", code: "UPSTREAM_UNAVAILABLE", usage }),
    });
  });
  return calls;
}

async function openBookCard(page) {
  await page.goto("/app.html");
  await waitForAppReady(page);
  await page.locator("#tab-memory").click();
  await expect(page.locator("#diaryBookCard")).toBeVisible();
}

test("책 카드가 달 목록과 담기는 내용, 비용을 함께 보여준다", async ({ page }) => {
  const diagnostics = monitorPage(page);
  await prepareBook(page);
  await openBookCard(page);

  await expect(page.locator("#diaryBookMonth option")).toHaveCount(2);
  // 최근 달이 먼저 온다.
  await expect(page.locator("#diaryBookMonth")).toHaveValue(BOOK_MONTH);
  await expect(page.locator("#diaryBookContents")).toContainText("2일의 기록");
  await expect(page.locator("#diaryBookContents")).toContainText("4마디");
  await expect(page.locator("#diaryBookCost")).toHaveText("에너지 10");
  await expect(page.locator("#diaryBookDone")).toBeHidden();
  diagnostics.expectClean();
});

/* 스펙 4장·7장: 무엇이 담기고 파일이 어디에 남는지 만들기 전에 밝힌다. */
test("생성 전에 담기는 내용과 저장 위치를 밝힌다", async ({ page }) => {
  await prepareBook(page);
  await openBookCard(page);
  const notice = page.locator("#diaryBookCard .diary-book-notice");
  await expect(notice).toContainText("감정 기록과 올리와 나눈 대화");
  await expect(notice).toContainText("이 기기에 저장");
  await expect(notice).toContainText("서버에는 올라가지 않아요");
});

/* 무료 권은 폐지됐다. 몇 권째든 값은 항상 10이라 "이번 달 무료"가 뜰 자리가 없다. */
test("두 번째 권도 값이 에너지 10으로 그대로다", async ({ page }) => {
  await prepareBook(page);
  await openBookCard(page);
  await expect(page.locator("#diaryBookCost")).toHaveText("에너지 10");

  await page.locator("#diaryBookCreate").click();
  await expect(page.locator("#diaryBookStatus")).toContainText("한 권이 완성됐어요");
  await expect(page.locator("#diaryBookStatus")).toContainText("에너지를 10 썼어요");
  await expect(page.locator("#diaryBookCost")).toHaveText("에너지 10");
});

/* §E — 체험 계정의 북 진입점은 실제 생성을 시도하지 않고 샘플만 연다. */
test("체험 계정에는 생성 폼 대신 잠금 안내와 샘플이 뜬다", async ({ page }) => {
  const calls = await prepareBook(page, {
    usage: createUsageResponse({ plan: "trial", trialEligible: false }),
  });
  await openBookCard(page);

  await expect(page.locator("#diaryBookForm")).toBeHidden();
  const locked = page.locator("#diaryBookLocked");
  await expect(locked).toBeVisible();
  await expect(locked).toContainText("PRO로 전환하면 내 기록으로 만들 수 있어요");
  await expect(page.locator("#diaryBookLockedCta")).toBeVisible();

  await page.locator("#diaryBookSampleOpen").click();
  await expect(page.locator("#sampleBookDialog")).toBeVisible();
  await expect(page.locator(".sample-book-badge")).toHaveText("샘플");
  // 실제 생성은 한 번도 시도하지 않는다.
  expect(calls).toEqual([]);
  expect(await page.evaluate(() => window.__printCalls)).toBe(0);
});

/* 인쇄·PDF도 PRO 전용이다. 무료 경로가 생기면 "무료는 데이터, 유료는 작품" 경계가 무너진다. */
test("PRO가 아니면 인쇄 창이 열리지 않는다", async ({ page }) => {
  await prepareBook(page, { usage: createUsageResponse({ plan: "trial", trialEligible: false }) });
  await openBookCard(page);

  const printed = await page.evaluate(() => {
    document.body.classList.remove("is-printing-book");
    window.__omwTest.printDiaryBook("2026-06");
    return { calls: window.__printCalls, printing: document.body.classList.contains("is-printing-book") };
  });
  expect(printed.calls).toBe(0);
  expect(printed.printing).toBe(false);
});

test("한 권을 만들면 표지·머리말·통계·본문·편지가 조판되고 인쇄가 열린다", async ({ page }) => {
  const calls = await prepareBook(page);
  await openBookCard(page);
  await page.locator("#diaryBookCreate").click();
  await expect(page.locator("#diaryBookStatus")).toContainText("한 권이 완성됐어요");

  // 서버로 나간 것은 요약이지 한 달치 원문이 아니다.
  expect(calls).toHaveLength(1);
  expect(calls[0].monthKey).toBe(BOOK_MONTH);
  expect(calls[0].summary.entryCount).toBe(2);
  expect(calls[0].summary.chatTurnCount).toBe(4);
  expect(calls[0].goal).toBeTruthy();

  const book = page.locator("#diaryBookPrint");
  await expect(book.locator(".book-cover .book-cover-title")).toHaveText("작게 시작한 달");
  await expect(book.locator(".book-cover .book-cover-month")).toHaveText("2026년 6월");
  await expect(book.locator(".book-foreword .book-body-text")).toContainText("둥실");
  await expect(book.locator(".book-stats dd").first()).toHaveText("2일");
  await expect(book.locator(".book-day")).toHaveCount(3);
  await expect(book.locator(".book-day").first()).toContainText("망설였지만 결국 시작한 날");
  await expect(book.locator(".book-day .book-turn.is-ollie").first()).toContainText("괜찮아요");
  await expect(book.locator(".book-letter .book-body-text")).toContainText("곁에 있을게요");
  await expect(book.locator(".book-letter-sign")).toHaveText("— 올리 드림");

  // 표지·머리말·편지에 올리 일러스트가 들어간다 (기존 에셋).
  const covers = await book.locator("img").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src")));
  expect(covers).toEqual(["assets/ollie-celebrate.png", "assets/ollie-action.png", "assets/ollie-comfort.png"]);

  expect(await page.evaluate(() => window.__printCalls)).toBe(1);
});

test("조판은 화면에서 숨어 있다가 인쇄 미디어에서만 드러난다", async ({ page }) => {
  await prepareBook(page);
  await openBookCard(page);
  await page.locator("#diaryBookCreate").click();
  await expect(page.locator("#diaryBookStatus")).toContainText("한 권이 완성됐어요");

  // 화면에서는 앱만 보인다.
  await expect(page.locator("#diaryBookPrint")).toBeHidden();
  await expect(page.locator("#view-memory")).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => document.body.classList.add("is-printing-book"));
  await expect(page.locator("#diaryBookPrint")).toBeVisible();
  await expect(page.locator("#view-memory")).toBeHidden();
  await expect(page.locator(".execution-tabbar")).toBeHidden();
  await page.emulateMedia({ media: null });
});

test("만들기에 실패하면 에너지가 확정 차감되지 않는다고 알린다", async ({ page }) => {
  await prepareBook(page, { status: 503 });
  const diagnostics = monitorPage(page, {
    allowedConsoleMessages: ["status of 503"],
    allowedResponseUrls: ["/api/ai/diary-book"],
  });
  await openBookCard(page);
  await page.locator("#diaryBookCreate").click();

  await expect(page.locator("#diaryBookStatus")).toContainText("E2E mock failure");
  await expect(page.locator("#diaryBookStatus")).toContainText("확정 차감되지 않아요");
  await expect(page.locator("#diaryBookDone")).toBeHidden();
  expect(await page.evaluate(() => window.__printCalls)).toBe(0);
  // 다시 시도할 수 있어야 한다.
  await expect(page.locator("#diaryBookCreate")).toBeEnabled();
  diagnostics.expectClean();
});

/* C3가 만든 보관 안내의 뒷부분(스펙 4장 만료 흐름). 만료 임박 → 그 달 책 만들기로 바로 잇는다. */
test("만료 임박 안내에서 그 달의 책 만들기로 바로 이어진다", async ({ page }) => {
  const expiringKey = shiftKey(-80);
  const expiringMonth = expiringKey.slice(0, 7);
  await prepareBook(page, {
    storage: {
      ...CHAT_CONSENT_STORAGE,
      omwExecutionState: { dailyMemories: [memoryFor(`${BOOK_MONTH}-03`)] },
      omwChatLog: { version: 1, days: { [expiringKey]: TURNS, [`${BOOK_MONTH}-03`]: TURNS } },
    },
  });
  await openBookCard(page);

  const retention = page.locator("#dayPageRetention");
  await expect(retention).toContainText("사라지기 전에 다이어리 북 한 권으로 간직할 수 있어요");
  await retention.locator("[data-day-page-book]").click();
  await expect(page.locator("#diaryBookMonth")).toHaveValue(expiringMonth);
});

/* 정리는 개인정보 최소보유에 부합하지만 강요하지 않는다 — 확인을 거치고, 책을 만든 달만 건드린다. */
test("책을 만든 뒤 원본 정리는 확인을 거치고 그 달만 지운다", async ({ page }) => {
  await prepareBook(page);
  await openBookCard(page);
  await page.locator("#diaryBookCreate").click();
  await expect(page.locator("#diaryBookDone")).toBeVisible();
  await expect(page.locator("#diaryBookDoneText")).toContainText("PDF로 저장");

  await expect(page.locator("#diaryBookTidy")).toBeHidden();
  await page.locator("#diaryBookTidyStart").click();
  await expect(page.locator("#diaryBookTidy")).toBeVisible();
  await expect(page.locator("#diaryBookTidyDetail")).toContainText("되돌릴 수 없어요");

  // 취소하면 아무것도 사라지지 않는다.
  await page.locator("#diaryBookTidyCancel").click();
  await expect(page.locator("#diaryBookTidy")).toBeHidden();
  expect(Object.keys((await readStored(page, "omwChatLog")).days)).toHaveLength(3);

  await page.locator("#diaryBookTidyStart").click();
  await page.locator("#diaryBookTidyCommit").click();

  const days = Object.keys((await readStored(page, "omwChatLog")).days);
  expect(days).toEqual([`${OTHER_MONTH}-20`]);
  // 다이어리 기록은 앱 안에서 계속 쓰이므로 남는다 — 날짜별 완전 삭제는 하루 페이지가 맡는다.
  const state = JSON.stringify(await readStored(page, "omwExecutionState"));
  expect(state).toContain("망설였지만 결국 시작한 날");
});

test("묶을 기록이 없으면 첫 권을 기다린다고 말한다", async ({ page }) => {
  await prepareBook(page, { storage: CHAT_CONSENT_STORAGE });
  await openBookCard(page);
  await expect(page.locator("#diaryBookEmpty")).toBeVisible();
  await expect(page.locator("#diaryBookEmpty")).toContainText("아직 책으로 묶을 기록이 없어요");
  await expect(page.locator("#diaryBookForm")).toBeHidden();
});

test("대화만 남은 달도 한 권이 된다", async ({ page }) => {
  // 90일 만료를 앞둔 대화가 갈 곳이 있어야 한다.
  await prepareBook(page, {
    storage: {
      ...CHAT_CONSENT_STORAGE,
      omwChatLog: { version: 1, days: { [`${BOOK_MONTH}-03`]: TURNS } },
    },
  });
  await openBookCard(page);
  await expect(page.locator("#diaryBookMonth")).toHaveValue(BOOK_MONTH);
  await expect(page.locator("#diaryBookContents")).toContainText("2마디");
  await page.locator("#diaryBookCreate").click();
  await expect(page.locator("#diaryBookStatus")).toContainText("한 권이 완성됐어요");
  await expect(page.locator("#diaryBookPrint .book-day")).toHaveCount(1);
});
