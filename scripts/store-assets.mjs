#!/usr/bin/env node
/* 구글 플레이 스토어 등록용 그래픽 자산을 브랜드 원본에서 생성한다.
 *
 *   node scripts/store-assets.mjs           # 아이콘 + 피처 그래픽
 *   node scripts/store-assets.mjs shots     # 앱 스크린샷 (로컬 서버를 스스로 띄운다)
 *
 * 원본과 산출물:
 *   brand/character/assets/logo-ollie-symbol.png (512×512, 모서리 투명)
 *     → brand/store/icon-512.png            풀블리드 512×512 (Play 요구: 정사각, ≤1MB)
 *   brand/identity/assets/og-ollie-share-v1.png (1731×909)
 *     → brand/store/feature-1024x500.png    중앙 크롭 후 축소
 *   로컬 서버 + e2e 헬퍼와 같은 방식의 시드
 *     → brand/store/screenshot-N-*.png      1080×1920 (360×640 CSS × 3배율)
 *
 * 텍스트·로고를 얹지 않는 이유: 캐릭터 바이블 v1.0 §13이 "로고 결합 규칙 미정"이고,
 * logo-horizontal.png는 현 브랜드(구름·라일락) 이전의 구 민트 워드마크다. 스토어
 * 목록에서 앱 이름은 그래픽 옆에 항상 따로 표시되므로 그래픽에 글자가 없어도 된다.
 *
 * 렌더링은 Playwright Chromium 캔버스를 쓴다 — 저장소에 이미지 라이브러리를 추가하지
 * 않기 위해서다(@playwright/test는 이미 e2e 의존성이다). */

import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "brand", "store");

async function toDataUri(relPath) {
  const buffer = await readFile(join(ROOT, relPath));
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function saveDataUrl(dataUrl, outName) {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  const path = join(OUT_DIR, outName);
  await writeFile(path, Buffer.from(base64, "base64"));
  const size = (await readFile(path)).length;
  console.log(`  ${outName}  ${(size / 1024).toFixed(0)}KB`);
  if (size > 1024 * 1024) throw new Error(`${outName}이 1MB를 넘는다 — Play가 거부한다`);
}

/* 아이콘: 타일의 둥근 모서리·투명 여백을 타일 자신의 그라데이션으로 연장해
   풀블리드 정사각을 만든다. 투명 픽셀은 같은 행(범위 밖이면 가장 가까운 행)의
   가장자리 불투명 픽셀 색을 이어받고, 반투명 경계 픽셀은 그 색 위에 합성한다. */
async function renderIcon(page) {
  const src = await toDataUri("brand/character/assets/logo-ollie-symbol.png");
  await page.setContent(`<canvas id="c" width="512" height="512"></canvas>`);
  const dataUrl = await page.evaluate(async (imageSrc) => {
    const img = new Image();
    img.src = imageSrc;
    await img.decode();
    const canvas = document.getElementById("c");
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, 512, 512);
    const image = ctx.getImageData(0, 0, 512, 512);
    const d = image.data;
    const W = 512, H = 512;
    const alphaAt = (x, y) => d[(y * W + x) * 4 + 3];

    // 행마다 완전 불투명 구간을 찾는다. 없으면 null.
    const ranges = new Array(H).fill(null);
    for (let y = 0; y < H; y++) {
      let min = -1, max = -1;
      for (let x = 0; x < W; x++) {
        if (alphaAt(x, y) >= 250) { if (min === -1) min = x; max = x; }
      }
      if (min !== -1) ranges[y] = [min, max];
    }
    const nearestRowWithRange = (y) => {
      for (let offset = 0; offset < H; offset++) {
        if (ranges[y - offset]) return y - offset;
        if (ranges[y + offset]) return y + offset;
      }
      throw new Error("불투명 픽셀이 없다");
    };

    for (let y = 0; y < H; y++) {
      const sy = ranges[y] ? y : nearestRowWithRange(y);
      const [minX, maxX] = ranges[sy];
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const a = d[i + 3];
        if (a >= 250) continue;
        const sx = Math.min(Math.max(x, minX), maxX);
        const s = (sy * W + sx) * 4;
        const t = a / 255; // 반투명 경계는 배경색 위에 합성한다
        d[i] = Math.round(d[i] * t + d[s] * (1 - t));
        d[i + 1] = Math.round(d[i + 1] * t + d[s + 1] * (1 - t));
        d[i + 2] = Math.round(d[i + 2] * t + d[s + 2] * (1 - t));
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  }, src);
  await saveDataUrl(dataUrl, "icon-512.png");
}

/* 피처 그래픽: og 이미지(1731×909)를 1024:500 비율로 중앙 크롭 후 축소.
   1731×845 크롭이라 위아래 32px씩만 버려진다 — 구도는 그대로다. */
async function renderFeature(page) {
  const src = await toDataUri("brand/identity/assets/og-ollie-share-v1.png");
  await page.setContent(`<canvas id="c" width="1024" height="500"></canvas>`);
  const dataUrl = await page.evaluate(async (imageSrc) => {
    const img = new Image();
    img.src = imageSrc;
    await img.decode();
    const canvas = document.getElementById("c");
    const ctx = canvas.getContext("2d");
    const cropHeight = Math.round(img.naturalWidth * (500 / 1024));
    const cropY = Math.round((img.naturalHeight - cropHeight) / 2);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, cropY, img.naturalWidth, cropHeight, 0, 0, 1024, 500);
    return canvas.toDataURL("image/png");
  }, src);
  await saveDataUrl(dataUrl, "feature-1024x500.png");
}

/* ─────────────────────────────────────────────────────────────────────────────
   앱 스크린샷 — 로컬 서버에 e2e와 같은 방식으로 시드를 넣고 실제 UI를 찍는다.
   1080×1920(= 360×640 CSS × 3배율)은 Play 스크린샷 관례 규격이다(비율 제한 2:1 이내).
   실기기 캡처를 쓰지 않는 이유: S10 5G는 19:9라 비율 제한에 걸려 어차피 잘라야 한다. */

const SHOTS_PORT = 8917;

async function startLocalServer() {
  const { spawn } = await import("node:child_process");
  const child = spawn(process.execPath, ["serve-local.cjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(SHOTS_PORT) },
    stdio: "ignore",
  });
  const baseUrl = `http://127.0.0.1:${SHOTS_PORT}`;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/index.html`);
      if (response.ok) return { child, baseUrl };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill();
  throw new Error("로컬 서버가 뜨지 않았다");
}

/* 시드 데이터. 브랜드 약속('다시 움직이면 성장한다')대로 완벽한 잔디가 아니라
   빠진 날이 섞인 정직한 진행을 보여준다. 올리 말투는 바이블 §7(존댓말·제안형)을 따른다. */
const SHOT_GOAL = "매일 아침 30분, 달리기 습관 만들기";
const SHOT_TASKS = [
  { time: "06:50", title: "가볍게 스트레칭", minutes: 10, rule: "몸이 풀리면 완료" },
  { time: "07:00", title: "동네 한 바퀴 달리기", minutes: 30, rule: "30분 달리면 완료" },
  { time: "21:30", title: "내일 달릴 준비 챙겨 두기", minutes: 5, rule: "운동화·옷 준비 완료" },
];
const OLLIE_REPLY =
  "그럼요, 이런 날은 가볍게 가요. 오늘은 스트레칭 10분만 하고, 달리기는 내일 아침으로 옮겨 둘까요? 원하시면 일정도 제가 바꿔 드릴게요.";

async function captureShots() {
  const { createRequire } = await import("node:module");
  const helpers = createRequire(import.meta.url)(join(ROOT, "tests", "e2e", "helpers.js"));
  const { child, baseUrl } = await startLocalServer();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 360, height: 640 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
      colorScheme: "light",
      reducedMotion: "reduce",
      baseURL: baseUrl,
    });
    const page = await context.newPage();

    const dateKey = (daysFromToday) => {
      const now = new Date();
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysFromToday);
      const pad = (value) => String(value).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    };
    const yesterday = dateKey(-1);

    /* 오늘을 13일차로 두는 21일 계획. 지난 12일 중 10일 완료, 2일은 놓침(정직한 진행).
       스키마는 tests/e2e/today.spec.js의 픽스처와 같다.

       상태는 **부팅 전에 레거시 형태**(checkedByDay 배열만, 안정 키·completionLedger 없음)로
       넣는다. 부팅 후에 체크를 꽂아 넣으면 저장 코덱이 "체크는 있는데 완료 원장이 빈"
       조작 상태를 잡아내고 던진다 — 레거시 시드는 구버전 유저와 같은 마이그레이션 경로로
       원장까지 일관되게 재구성된다. */
    const planId = "store-shots-plan";
    const planStartDate = dateKey(-12);
    const scheduleOccurrences = Array.from({ length: 21 }, (_, index) => {
      const key = dateKey(index - 12);
      const weekday = new Date(`${key}T12:00:00+09:00`).getDay();
      return {
        dayNumber: index + 1,
        date: key,
        dayLabel: ["일", "월", "화", "수", "목", "금", "토"][weekday],
        isRestDay: false,
        items: SHOT_TASKS.map((task, taskIndex) => ({
          id: `store-shots-${index + 1}-${taskIndex + 1}`,
          planId,
          type: "ACTION",
          title: task.title,
          sourceReference: "",
          quantityOrRange: "",
          durationMinutes: task.minutes,
          completionRule: task.rule,
          time: task.time,
          scheduledAt: `${key}T${task.time}:00+09:00`,
          status: "pending",
          recurrenceGroupId: `store-shots-group-${taskIndex + 1}`,
        })),
      };
    });
    const desiredByDay = (day) => {
      if (day === 4) return [false, false, false];   // 놓친 날 — 정직한 진행
      if (day === 9) return [true, false, false];
      if (day === 13) return [true, false, false];   // 오늘: 스트레칭만 완료
      return day <= 12 ? [true, true, true] : [false, false, false];
    };
    const checkedByDay = Object.fromEntries(
      Array.from({ length: 21 }, (_, index) => [String(index + 1), desiredByDay(index + 1)]),
    );
    /* 체크의 영속 소스는 완료 원장이다(saveExecutionState가 체크 필드를 지우고 원장만
       남긴다). 체크만 시드하면 저장 코덱이 "원장 없는 체크"를 조작으로 보고 던지므로,
       원장 행을 함께 만든다. 행 스키마는 encodeExecutionCompletionLedger가 체크에서
       합성하는 행과 같다. */
    const planIdentity = `id:${planId}`;
    const completedLog = [];
    const completedOccurrences = [];
    for (let day = 1; day <= 21; day++) {
      const desired = desiredByDay(day);
      const key = dateKey(day - 13);
      SHOT_TASKS.forEach((task, taskIndex) => {
        if (!desired[taskIndex]) return;
        const rawTaskKey = `store-shots-${day}-${taskIndex + 1}`;
        const completedAt = new Date(
          new Date(`${key}T${task.time}:00+09:00`).getTime() + (task.minutes + 5) * 60_000,
        ).toISOString();
        completedLog.push({
          planIdentity,
          taskKey: `${day}:${rawTaskKey}`,
          day,
          taskIndex,
          time: task.time,
          text: task.title,
          completedAt,
          completionActive: true,
        });
        completedOccurrences.push({
          day,
          taskKey: rawTaskKey,
          sourceIndex: taskIndex,
          time: task.time,
          text: task.title,
        });
      });
    }

    await helpers.prepareApp(page, {
      omwExecutionPlan: {
        ...helpers.testPlan,
        planId,
        goal: SHOT_GOAL,
        period: 21,
        planStartDate,
        firstAction: SHOT_TASKS[1].title,
        coachMessage: "작게 시작해요.",
        scheduleStartPreference: "as-is",
        aiPreview: {
          firstWeekSchedule: scheduleOccurrences.slice(0, 7),
          scheduleOccurrences,
        },
      },
      ...helpers.CHAT_CONSENT_STORAGE,
      omwExecutionState: {
        selectedDay: 13,
        lastSeenDate: dateKey(0),
        planStartDate,
        checkedByDay,
        completedLog,
        completedOccurrencesPlanIdentity: planIdentity,
        completedOccurrences,
        dailyMemories: [{
          id: yesterday,
          diaryDate: yesterday,
          day: 12,
          title: "비 와서 미룰 뻔했지만 나간 날",
          mood: "proud",
          customMood: "",
          completion: 100,
          obstacle: "time",
          note: "빗소리 듣고 다시 눕고 싶었는데, 신발부터 신으니 나가졌다.",
          nextStep: "내일은 5분 일찍 나가기",
          conversation: "",
          hasDialogue: true,
          suggestion: "오늘도 같은 시간에 이어가요.",
          createdAt: `${yesterday}T09:00:00.000Z`,
          updatedAt: `${yesterday}T09:00:00.000Z`,
        }],
      },
      omwChatLog: {
        version: 1,
        days: {
          [yesterday]: [
            { role: "user", text: "오늘 비 오는데 쉬어도 될까?", at: 1 },
            { role: "ollie", headline: "그럴 수 있어요.", emotion: "슬픔공감", text: "비 오는 날은 실내 스트레칭으로 바꿔도 좋아요. 10분만 해볼까요?", at: 2 },
            { role: "user", text: "10분이면 할 수 있을 것 같아", at: 3 },
            { role: "ollie", headline: "좋아요!", emotion: "기쁨", text: "시작이 반이에요. 끝나면 저한테 자랑해 주세요.", at: 4 },
          ],
        },
      },
    });
    await helpers.mockAccountExperience(page, {
      user: { id: "usr_store_shots", provider: "kakao", name: "달리는 사람", email: "runner@example.com", plan: "pro", role: "member" },
      usage: helpers.createUsageResponse({ plan: "pro", dailyUsed: 3, monthlyUsed: 37 }),
    });
    await page.route("**/api/ai/companion-chat", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, reply: OLLIE_REPLY, chargedCredits: 1 }),
    }));

    await page.goto("/app.html");
    await helpers.waitForAppReady(page);
    await page.evaluate(() => document.fonts.ready);

    const settle = () => page.waitForTimeout(600);
    const shoot = async (name) => {
      await settle();
      await page.screenshot({ path: join(OUT_DIR, name) });
      console.log(`  ${name}`);
    };

    /* getPlanBundle은 상태의 scheduleKey 해시가 현재 계획과 일치할 때만 체크를 이어받는다
       (계획이 바뀌면 체크를 이월하지 않는 보호 장치). 시드된 상태에 앱과 같은 공식으로
       키를 채워 넣고 저장 경로를 한 번 태운 뒤 다시 연다. */
    await page.evaluate(() => {
      const plan = readExecutionPlan();
      const state = getExecutionState();
      const planIdentity = getExecutionPlanIdentity(plan);
      const planText = String(state.planText || "").trim();
      state.planIdentity = planIdentity;
      state.scheduleKey = hashText(
        `${planIdentity}|${plan.goal || ""}|${plan.period || ""}|${planText}|${state.revisionRequest || ""}|${JSON.stringify(state.revisionDetails || {})}|${JSON.stringify(state.weeklySchedule || [])}`,
      );
      saveExecutionState(state);
    });
    await page.reload();
    await helpers.waitForAppReady(page);
    await page.evaluate(() => document.fonts.ready);

    // ① 오늘 화면 — 다음 실행과 체크리스트
    await page.locator("#focusTaskTitle").waitFor();
    await shoot("screenshot-1-today.png");

    // ② 계획 홈 — 달력이 첫 카드
    await page.locator("#tab-plan").click();
    await shoot("screenshot-2-plan-calendar.png");

    // ③ 올리와 대화 — 모킹된 응답으로 실제 대화 흐름
    await page.locator("#tab-mate").click();
    await page.getByRole("button", { name: "올리와 이야기하기" }).click();
    await page.locator("#companionChatSheet").waitFor();
    await page.locator("#companionChatInput").fill("오늘은 좀 피곤한데, 가볍게 해도 될까?");
    await page.locator("#sendCompanionMessage").click();
    await page.locator('#chatThread [data-chat-role="ollie"] .chat-bubble-text', { hasText: "가볍게 가요" }).waitFor();
    await shoot("screenshot-3-ollie-chat.png");

    // ④ 기록 — 어제의 하루 페이지(다이어리 + 대화)
    await page.locator("#closeCompanionChat").click();
    await page.locator("#tab-memory").click();
    await page.locator("#dayPage").waitFor();
    await page.locator("#dayPagePrev").click();
    await shoot("screenshot-4-day-page.png");

    await browser.close();
  } finally {
    child.kill();
    if (browser.isConnected()) await browser.close().catch(() => {});
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  if (process.argv[2] === "shots") {
    console.log("스토어 스크린샷 생성:");
    await captureShots();
    return;
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  console.log("스토어 그래픽 생성:");
  await renderIcon(page);
  await renderFeature(page);
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
