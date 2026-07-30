const { test, expect } = require("@playwright/test");
const { AI_CREDIT_COSTS, CHAT_CONSENT_STORAGE, createUsageResponse, mockAccountExperience, monitorPage, prepareApp, readStored, waitForAppReady, waitForBootstrap } = require("./helpers");

async function prepareMate(page, usage = createUsageResponse({ plan: "expired", dailyUsed: 0, monthlyUsed: 1, trialEligible: false }), storage = CHAT_CONSENT_STORAGE) {
  await prepareApp(page, storage);
  await mockAccountExperience(page, {
    user: { id: "usr_mate", provider: "google", name: "메이트 테스트", email: "mate@example.com", plan: "expired", role: "member" },
    usage,
  });
}

// 대화 영역에 쌓인 올리의 마지막 말풍선. 시트가 멀티턴이 되면서 답이 한 자리에 고정되지 않는다.
function lastOllieBubble(page) {
  return page.locator('#chatThread [data-chat-role="ollie"] .chat-bubble-text').last();
}

function lastUserBubble(page) {
  return page.locator('#chatThread [data-chat-role="user"] .chat-bubble-text').last();
}

async function openMateApp(page) {
  await page.goto("/app.html");
  await waitForAppReady(page);
}

test("올리 대화 실패를 안전하게 안내하고 계획을 자동 적용하지 않는다", async ({ page }) => {
  await prepareMate(page);
  const diagnostics = monitorPage(page, {
    allowedConsoleMessages: ["status of 503"],
    allowedResponseUrls: ["/api/ai/companion-chat"],
  });
  let chatCalls = 0;
  await page.route("**/api/ai/companion-chat", (route) => {
    chatCalls += 1;
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: "E2E mock failure",
        code: "UPSTREAM_UNAVAILABLE",
        usage: createUsageResponse({ plan: "expired", dailyUsed: 0, monthlyUsed: 1, trialEligible: false }),
      }),
    });
  });
  await openMateApp(page);
  await page.locator("#tab-mate").click();
  await expect(page.locator("#companionHome")).toBeVisible();

  await page.locator("#tab-today").click();
  await page.locator("[data-open-companion-chat]").first().click();
  await expect(page.locator("#companionChatSheet")).toBeVisible();
  await page.locator("[data-energy='tired']").click();
  await expect(page.locator("#companionChatSheet")).toBeVisible();
  const beforePlan = await readStored(page, "omwExecutionPlan");
  await expect(page.locator("#ollieEnergyBalance")).toHaveText("4 / 5");
  const beforeCredits = await page.locator("#ollieEnergyBalance").innerText();

  // 보낼 것이 없으면 보내기가 잠겨 있다 — 빈 말이 대화에 끼어들지 않는다.
  await expect(page.locator("#sendCompanionMessage")).toBeDisabled();
  const longMessage = `긴 메시지 첫 줄\n${"계획을 작게 줄여 주세요. ".repeat(20)}`;
  await page.locator("#companionChatInput").fill(longMessage);
  await expect(page.locator("#sendCompanionMessage")).toBeEnabled();
  await page.locator("#sendCompanionMessage").dblclick();
  await expect(lastOllieBubble(page)).toContainText("E2E mock failure");
  await expect(lastOllieBubble(page)).toContainText("확정 차감되지 않아요");
  /* 더블탭이 두 번 보내면 에너지가 두 번 나간다. 전송이 끝나면 입력창이 비므로 보내기는
     다시 잠기고, 뒤늦게 도착한 두 번째 클릭이 빈 입력으로 또 무언가를 띄우지 못한다. */
  expect(chatCalls).toBe(1);
  expect(await page.locator('#chatThread [data-chat-role="user"]').count()).toBe(1);
  await expect(page.locator("#sendCompanionMessage")).toBeDisabled();
  const afterPlan = await readStored(page, "omwExecutionPlan");
  expect(afterPlan).toEqual(beforePlan);
  await expect(page.locator("#ollieEnergyBalance")).toHaveText(beforeCredits);
  expect(await readStored(page, "omwOllieEnergy")).toBeNull();
  expect(await lastOllieBubble(page).innerText()).not.toContain("AI로 만든");
  // 실패 안내는 기록으로 남기지 않는다 — 저장되는 것은 유저가 실제로 한 말뿐이다.
  const log = await readStored(page, "omwChatLog");
  const todayTurns = Object.values(log?.days || {}).flat();
  expect(todayTurns.every((turn) => !String(turn.text).includes("E2E mock failure"))).toBe(true);
  diagnostics.expectClean();
});

test("AI 크레딧 안내는 서버 제공량과 기능별 비용만 표시하고 구매 상태를 만들지 않는다", async ({ page }) => {
  await prepareMate(page);
  const diagnostics = monitorPage(page);
  await openMateApp(page);
  await expect(page.locator("#ollieEnergyBalance")).toHaveText("4 / 5");
  const beforeCredits = await page.locator("#ollieEnergyBalance").innerText();
  await page.getByRole("button", { name: "AI 크레딧 이용 안내" }).click();
  const creditDialog = page.getByRole("dialog", { name: "AI 크레딧 이용 안내" });
  await expect(creditDialog).toBeVisible();
  // 무료 치어링 1행 + 크레딧을 쓰는 행동 4행. 라우트 없는 기능은 여기 없어야 한다.
  await expect(creditDialog.locator(".credit-cost-summary > span")).toHaveCount(5);
  await expect(creditDialog.locator(".credit-cost-summary > span").first()).toContainText("매일 축하·위로 0크레딧");
  const costValues = creditDialog.locator("[data-ai-credit-cost]");
  // 안내가 고른 행동의 값만 정책과 비교한다. 정책에는 화면에 없는 행동(다이어리 북·체험 편지)도 있다.
  const advertised = await costValues.evaluateAll((nodes) => nodes.map((node) => node.dataset.aiCreditCost));
  await expect(costValues).toHaveText(advertised.map((action) => String(AI_CREDIT_COSTS[action])));
  await expect(creditDialog).not.toContainText("새 목표 계획 생성");
  await expect(creditDialog.locator(".energy-pack")).toHaveCount(0);
  await expect(creditDialog).toContainText("추가 크레딧 판매는 현재 제공하지 않습니다");
  await expect(page.locator("#ollieEnergyBalance")).toHaveText(beforeCredits);
  expect(await readStored(page, "omwOllieEnergy")).toBeNull();
  diagnostics.expectClean();
});

test("전체 성장 여정의 플랜 안내에서 올리 탭으로 돌아올 수 있다", async ({ page }) => {
  await prepareMate(page);
  await page.goto("/index.html?from=ollie#pricing");
  await waitForBootstrap(page);
  await expect(page.locator("#pricing")).toBeVisible();
  const returnLink = page.getByRole("link", { name: "올리로 돌아가기" });
  await expect(returnLink).toBeVisible();
  await returnLink.click();
  await waitForAppReady(page);
  await expect(page.locator("#tab-mate")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#view-mate")).toBeVisible();
});

/* 스펙 2장 ⑤: 에너지가 없으면 입력창이 충전 안내로 전환된다. 보낼 수 없는 상태에서
   입력창을 열어 두고 전송 순간에 막으면, 쓴 글이 버려지고 재촉처럼 읽힌다. */
test("만료 계정이 일일 한도를 모두 쓰면 입력창이 충전 안내로 바뀌고 API를 부르지 않는다", async ({ page }) => {
  await prepareMate(page, createUsageResponse({ plan: "expired", dailyUsed: 2, monthlyUsed: 2, trialEligible: false }));
  const diagnostics = monitorPage(page);
  let apiCalls = 0;
  await page.route("**/api/ai/companion-chat", (route) => {
    apiCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, reply: "호출되면 안 되는 응답", chargedCredits: 1 }),
    });
  });
  await openMateApp(page);
  await page.locator("[data-open-companion-chat]").first().click();

  await expect(page.locator("#chatComposer")).toBeHidden();
  const recharge = page.locator("#chatRecharge");
  await expect(recharge).toBeVisible();
  await expect(recharge).toContainText("오늘 쓸 수 있는 에너지를 모두 썼어요");
  // 죄책감을 유발하는 문구를 쓰지 않는다.
  await expect(recharge).not.toContainText(/아직도|의지|부족한 건/);
  // 가격과 구성이 함께 밝혀진다.
  await expect(recharge).toContainText("매달 에너지");
  expect(apiCalls).toBe(0);
  diagnostics.expectClean();
});

test("만료 계정이 월간 크레딧을 모두 쓰면 다음 제공 시점을 안내하고 API를 부르지 않는다", async ({ page }) => {
  await prepareMate(page, createUsageResponse({ plan: "expired", dailyUsed: 0, monthlyUsed: 5, trialEligible: false }));
  const diagnostics = monitorPage(page);
  let apiCalls = 0;
  await page.route("**/api/ai/companion-chat", (route) => {
    apiCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, reply: "호출되면 안 되는 응답", chargedCredits: 1 }),
    });
  });
  await openMateApp(page);
  await page.locator("[data-open-companion-chat]").first().click();

  await expect(page.locator("#chatComposer")).toBeHidden();
  await expect(page.locator("#chatRecharge")).toContainText("이번 기간 에너지를 모두 썼어요");
  await expect(page.locator("#chatEnergyBalance")).toHaveText("0");
  expect(apiCalls).toBe(0);
  diagnostics.expectClean();
});

/* 스펙 2장: 어느 진입점으로 들어와도 같은 시트가 열리고, 헤더는 고정이다.
   답은 시트를 떠나지 않고 대화 영역에 쌓인다. */
test("대화 시트는 진입점과 무관하게 같은 헤더를 쓰고 답을 시트 안에 쌓는다", async ({ page }) => {
  const diagnostics = monitorPage(page, { allowedResponseUrls: ["/api/ai/companion-chat"] });
  await prepareMate(page);
  let releaseReply = () => {};
  const replyGate = new Promise((resolve) => { releaseReply = resolve; });
  await page.route("**/api/ai/companion-chat", async (route) => {
    await replyGate;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        reply: "오늘 저녁 일정을 30분 안으로 줄여볼게요.",
        headline: "짧게 가요.",
        emotion: "결심",
        usage: createUsageResponse({ plan: "expired", dailyUsed: 1, monthlyUsed: 2, trialEligible: false }),
      }),
    });
  });
  await openMateApp(page);

  const sheet = page.locator("#companionChatSheet");
  const thinking = page.locator("#companionChatThinking");

  // (a) 오늘 탭의 계획 조정 진입 — 헤더는 진입점과 무관하게 고정이다.
  await page.locator("[data-open-companion-chat]").first().click();
  await expect(sheet).toBeVisible();
  await expect(page.locator("#companionChatTitle")).toHaveText("올리와 대화해요");
  await expect(page.locator("#companionChatSubtitle")).toHaveText("오늘 어땠는지 이야기해요");
  // 올리는 질문 답변 도우미가 아니다 — 부제를 그 방향으로 쓰지 않는다(스펙 2장 ①).
  await expect(page.locator("#companionChatSubtitle")).not.toContainText("물어보세요");
  // 진입 맥락은 제목이 아니라 입력 예시로 드러난다.
  await expect(page.locator("#companionChatInput")).toHaveAttribute("placeholder", /줄여줘/);
  // (b) 에너지 잔량이 헤더에 상시 표시된다.
  await expect(page.locator("#chatEnergyBalance")).toHaveText("4");
  // (c) 올리가 시트 안에 있다.
  await expect(page.locator('#chatThread [data-chat-role="ollie"] .chat-turn-face').first()).toBeVisible();

  await page.locator("#companionChatInput").fill("저녁 일정이 너무 길어. 줄여줘.");
  await page.locator("#sendCompanionMessage").click();

  // 유저 말이 우측에 먼저 쌓이고, 대기 표시도 시트 안에 있으며 시트는 닫히지 않는다.
  await expect(lastUserBubble(page)).toHaveText("저녁 일정이 너무 길어. 줄여줘.");
  await expect(thinking).toBeVisible();
  await expect(sheet).toBeVisible();
  await expect(page.locator("#companionChatOllieImage")).toHaveAttribute("src", /ollie-thinking\.png/);

  releaseReply();
  await expect(lastOllieBubble(page)).toContainText("30분 안으로 줄여볼게요");
  await expect(thinking).toBeHidden();
  await expect(sheet).toBeVisible();
  // emotion 태그가 모션 선택에 쓰이는 자리에 실린다.
  await expect(page.locator('#chatThread [data-chat-role="ollie"]').last()).toHaveAttribute("data-emotion", "결심");

  // 기록 탭 진입도 같은 시트를 열고, 오늘 나눈 대화가 그대로 남아 있다.
  await page.locator("#closeCompanionChat").click();
  await expect(sheet).toBeHidden();
  await page.locator("#tab-memory").click();
  await page.locator("#openCompanionChat").click();
  await expect(sheet).toBeVisible();
  await expect(page.locator("#companionChatTitle")).toHaveText("올리와 대화해요");
  await expect(lastUserBubble(page)).toHaveText("저녁 일정이 너무 길어. 줄여줘.");
  await expect(lastOllieBubble(page)).toContainText("30분 안으로 줄여볼게요");

  // 오간 말이 omwChatLog에 날짜별로 남는다.
  const log = await readStored(page, "omwChatLog");
  const [dateKey] = Object.keys(log.days);
  expect(dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(log.days[dateKey].map((turn) => turn.role)).toEqual(["user", "ollie"]);
  expect(log.days[dateKey][1].emotion).toBe("결심");

  diagnostics.expectClean();
});

/* 스펙 7장 1항: 대화 내용·감정 기록은 약관 포괄 동의에 묻지 않고 이 기능을 처음 쓸 때
   따로 받는다. 동의 전에는 입력창 자체가 없어야 별도 동의의 의미가 있다. */
test("대화 기능을 처음 쓰면 별도 동의를 먼저 받는다", async ({ page }) => {
  await prepareMate(page, undefined, {});
  const diagnostics = monitorPage(page);
  let apiCalls = 0;
  await page.route("**/api/ai/companion-chat", (route) => {
    apiCalls += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, reply: "호출되면 안 되는 응답" }) });
  });
  await openMateApp(page);
  await page.locator("[data-open-companion-chat]").first().click();

  const consent = page.locator("#chatConsent");
  await expect(consent).toBeVisible();
  await expect(consent).toContainText("외부 AI 처리자");
  await expect(consent).toContainText("90일");
  await expect(consent).toContainText("열람하지 않아요");
  // 동의 전에는 입력창도 대화 영역도 열리지 않는다.
  await expect(page.locator("#chatComposer")).toBeHidden();
  await expect(page.locator("#chatBody")).toBeHidden();
  expect(apiCalls).toBe(0);

  await page.locator("#chatConsentAgree").click();
  await expect(consent).toBeHidden();
  await expect(page.locator("#chatComposer")).toBeVisible();
  expect((await readStored(page, "omwChatConsent")).agreed).toBe(true);

  diagnostics.expectClean();
});

/* 스펙 4장: 무료 원본 로그는 90일 보관. 기록을 남기는 기능이라 상한이 없으면
   저장소가 조용히 가득 찬다. 500턴 상한이 두 번째 방어선이다. */
test("대화 로그는 90일과 500턴 상한을 넘지 않는다", async ({ page }) => {
  await prepareMate(page);
  const diagnostics = monitorPage(page);
  await openMateApp(page);

  const result = await page.evaluate(() => {
    const dayKey = (offset) => {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      return date.toLocaleDateString("en-CA");
    };
    const turns = (count, tag) => Array.from({ length: count }, (_, index) => ({ role: index % 2 ? "ollie" : "user", text: `${tag}-${index}`, at: 0 }));

    // ① 90일이 지난 날짜는 통째로 사라지고 경계일은 남는다.
    const byAge = window.__omwTest.pruneChatLog({
      days: {
        [dayKey(120)]: turns(2, "아주오래"),
        [dayKey(91)]: turns(2, "지남"),
        [dayKey(89)]: turns(2, "경계안"),
        [dayKey(0)]: turns(2, "오늘"),
      },
    });

    // ② 500턴을 넘으면 오래된 날부터 잘린다.
    const byCount = window.__omwTest.pruneChatLog({
      days: {
        [dayKey(3)]: turns(300, "옛날"),
        [dayKey(1)]: turns(300, "어제"),
      },
    });
    const byCountDays = Object.keys(byCount.days).sort();
    return {
      ageKeys: Object.keys(byAge.days).sort(),
      keptRecent: Object.keys(byAge.days).includes(dayKey(0)),
      droppedOld: !Object.keys(byAge.days).includes(dayKey(91)),
      totalAfterCount: Object.values(byCount.days).reduce((sum, list) => sum + list.length, 0),
      oldestDayKept: byCountDays[0] === dayKey(3),
      oldestDayTurns: byCount.days[byCountDays[0]].length,
      newestDayTurns: byCount.days[byCountDays[1]].length,
      firstSurvivingTurn: byCount.days[byCountDays[0]][0].text,
    };
  });

  expect(result.ageKeys).toHaveLength(2);
  expect(result.keptRecent).toBe(true);
  expect(result.droppedOld).toBe(true);
  expect(result.totalAfterCount).toBe(500);
  // 최근 대화는 온전히 남고, 넘치는 몫만 가장 오래된 날에서 앞쪽부터 잘린다.
  expect(result.newestDayTurns).toBe(300);
  expect(result.oldestDayTurns).toBe(200);
  expect(result.firstSurvivingTurn).toBe("옛날-100");
  diagnostics.expectClean();
});

/* 스펙 6장: 상황 요약 + 최근 6턴을 함께 보낸다. 클라이언트가 먼저 자르고 서버가
   한 번 더 자르는 이중 방어의 앞쪽을 여기서 확인한다. */
test("최근 6턴만 컨텍스트로 실려 나간다", async ({ page }) => {
  await prepareMate(page);
  const diagnostics = monitorPage(page, { allowedResponseUrls: ["/api/ai/companion-chat"] });
  let sentBody = null;
  await page.route("**/api/ai/companion-chat", (route) => {
    sentBody = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, reply: "이어서 들을게요.", headline: "네.", emotion: "평온" }),
    });
  });
  await openMateApp(page);

  // 오늘 이미 10턴을 나눈 상태를 만든다.
  await page.evaluate(() => {
    const today = new Date().toLocaleDateString("en-CA");
    const days = { [today]: Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 ? "ollie" : "user",
      text: `지난턴${index}`,
      at: Date.now(),
    })) };
    localStorage.setItem("omwChatLog", JSON.stringify({ version: 1, days }));
  });

  await page.locator("[data-open-companion-chat]").first().click();
  await page.locator("#companionChatInput").fill("그래서 오늘은 어떻게 할까");
  await page.locator("#sendCompanionMessage").click();
  await expect(lastOllieBubble(page)).toContainText("이어서 들을게요");

  // "이전 대화"는 이번 말을 쌓기 전의 최근 6턴이다 — 방금 한 말은 여기 들어가지 않는다.
  expect(sentBody.history).toHaveLength(6);
  expect(sentBody.history.map((turn) => turn.text)).toEqual([
    "지난턴4", "지난턴5", "지난턴6", "지난턴7", "지난턴8", "지난턴9",
  ]);
  expect(sentBody.history[0].role).toBe("user");
  expect(sentBody.message).toBe("그래서 오늘은 어떻게 할까");
  // 상황 요약도 함께 나간다.
  expect(sentBody.context.goal).toBe("E2E 목표 완주하기");
  diagnostics.expectClean();
});

/* 스펙 6장: 위기 신호에는 고정 응답을 주고 에너지를 차감하지 않는다.
   서버가 그렇게 내려보내면 화면도 차감된 것처럼 굴면 안 된다. */
test("위기 신호 응답은 에너지를 쓰지 않고 다음 행동을 권하지 않는다", async ({ page }) => {
  await prepareMate(page);
  const diagnostics = monitorPage(page);
  await page.route("**/api/ai/companion-chat", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      headline: "지금 많이 힘들군요.",
      reply: "혼자 견디지 않아도 돼요. 자살예방상담전화 109로 지금 바로 이야기할 수 있어요.",
      emotion: "슬픔공감",
      safety: "crisis",
      chargedCredits: 0,
      usage: createUsageResponse({ plan: "expired", dailyUsed: 0, monthlyUsed: 1, trialEligible: false }),
    }),
  }));
  await openMateApp(page);
  await expect(page.locator("#ollieEnergyBalance")).toHaveText("4 / 5");

  await page.locator("[data-open-companion-chat]").first().click();
  await page.locator("#companionChatInput").fill("요즘 그냥 죽고 싶어");
  await page.locator("#sendCompanionMessage").click();

  await expect(lastOllieBubble(page)).toContainText("109");
  // 잔량이 그대로다 — 서버가 차감하지 않았고 화면도 그대로 표시한다.
  await expect(page.locator("#ollieEnergyBalance")).toHaveText("4 / 5");
  await expect(page.locator("#chatEnergyBalance")).toHaveText("4");
  // 위기 응답 뒤에는 실행을 권하는 액션 칩을 띄우지 않는다.
  await expect(page.locator("#chatActionChips")).toBeHidden();
  diagnostics.expectClean();
});
