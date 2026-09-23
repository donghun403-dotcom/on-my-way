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
 * 헤드라인을 얹는다(2026-09-22부터). 스토어 스크린샷은 검색에 색인되지 않고 전환만
 * 맡으며, 3장 넘게 보는 사람이 10%가 안 된다 — 각 장이 한 줄로 무엇인지 말해야 한다.
 * 로고·워드마크는 여전히 얹지 않는다. 캐릭터 바이블 v1.0 §13의 "로고 결합 규칙 미정"은
 * 그대로이고, logo-horizontal.png는 현 브랜드 이전의 구 민트 워드마크다.
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

/* 8장의 순서가 곧 논지다. 1~3이 약속(오늘 할 일 하나로) → 통제감(계획은 내가) →
   차별점(밀려도 다시). 4~7은 하루의 흐름, 8은 부담 없음으로 닫는다. 헤드라인은 목록
   썸네일(166×296px)에서도 읽히도록 12자 안, 부제는 눌러서 볼 때만 읽힌다고 본다.
   문구는 brand/product/product-facts.md(2026-09-22 검증)와 검수 스킬 기준을 지켰다. */
const SHOTS = [
  { file: "screenshot-1-today.png", headline: "큰 목표가 오늘 할 일로", sub: "3개월짜리 목표도 오늘은 한 걸음" },
  { file: "screenshot-2-plan.png", headline: "계획은 내가 만듭니다", sub: "요일·시간·하루 여유를 넣으면 초안이 채워져요" },
  { file: "screenshot-3-recovery.png", headline: "밀려도 다시 짭니다", sub: "놓친 날엔 오늘 할 일부터 다시" },
  { file: "screenshot-4-ollie-chat.png", headline: "오늘 어땠는지, 올리와", sub: "오늘의 실행을 이야기해요" },
  { file: "screenshot-5-focus.png", headline: "오늘 할 일만 보입니다", sub: "집중 타이머로 딱 그만큼만" },
  { file: "screenshot-6-day-page.png", headline: "하루가 한 장으로 남아요", sub: "그날의 마음과 한 줄 기록" },
  { file: "screenshot-7-diary-book.png", headline: "한 달이 책이 됩니다", sub: "다이어리 북 · Pro" },
  { file: "screenshot-8-trial.png", headline: "카드 없이 시작해요", sub: "체험이 끝나도 자동 결제 없음 · 기록은 계속 내 것", ollie: "assets/ollie-celebrate.png" },
];

/* 다이어리 북에 담길 한 달치 기록. 놓친 날(4일차)을 그대로 둔다 — '다시 움직이면 성장한다'.
   mood는 앱이 아는 값(proud·tired)만 쓴다. */
const SHOT_MEMORIES = [
  { offset: -11, day: 2, mood: "proud", completion: 100, title: "첫날은 신발 신는 데까지", note: "달리기보다 나가는 게 일이었다.", nextStep: "내일도 같은 시간" },
  { offset: -9, day: 4, mood: "tired", completion: 0, title: "알람을 끄고 다시 잤다", note: "오늘은 없던 날로. 내일 다시.", nextStep: "알람을 침대 밖에" },
  { offset: -8, day: 5, mood: "proud", completion: 100, title: "어제 몫까지는 안 하기로", note: "30분만. 더 하려다 말았다.", nextStep: "딱 30분만" },
  { offset: -5, day: 8, mood: "proud", completion: 100, title: "비 오는데 실내 스트레칭", note: "10분이었지만 안 빠졌다.", nextStep: "비 오면 실내로" },
  { offset: -3, day: 10, mood: "proud", completion: 100, title: "처음으로 안 힘들었던 날", note: "숨이 덜 찼다. 이게 되네.", nextStep: "같은 코스 한 번 더" },
  { offset: -1, day: 12, mood: "proud", completion: 100, title: "비 와서 미룰 뻔했지만 나간 날", note: "빗소리 듣고 다시 눕고 싶었는데, 신발부터 신으니 나가졌다.", nextStep: "내일은 5분 일찍 나가기" },
];

const BOOK_REPLY = {
  ok: true,
  title: "신발부터 신은 달",
  foreword: "둥실, 이 달은 나가는 게 일이었던 달이었어요.",
  letter: "비 오던 날 신발부터 신던 걸 저는 아직 기억해요. 곁에 있을게요.",
  chargedCredits: 10,
};

/* 헤드라인 띠 + 기기 프레임. 360×640 CSS를 3배율로 찍어 1080×1920이 된다.
   색은 앱 토큰 원색값(blue-100 → lilac-100 배경, blue-900·blue-700 글자)이다.
   폰트는 앱과 같은 Pretendard를 같은 출처(로컬 서버)에서 읽는다 — about:blank에서
   읽으면 woff2가 CORS에 걸리므로 가짜 경로를 route로 채워 같은 출처에서 연다. */
function frameHtml({ headline, sub, appSrc, ollieSrc, fontCss }) {
  const lines = sub.split(" · ").map((line) => `<p>${line}</p>`).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${fontCss}">
<style>
  /* viewport 메타가 없으면 모바일 에뮬레이션이 980px 레이아웃으로 그린 뒤 축소한다 —
     모든 것이 1/2.7 크기가 되고 배경이 반복된다. 그래서 위 메타는 필수다. */
  html { background: #e4eef8; }
  html, body { margin: 0; width: 360px; height: 640px; overflow: hidden; }
  body { font-family: "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
    background: linear-gradient(180deg, #e4eef8 0%, #eee9f9 100%); color: #1e3a5f; -webkit-font-smoothing: antialiased; }
  .band { padding: 46px 28px 0; text-align: center; }
  h1 { margin: 0; font-size: 27px; line-height: 1.25; font-weight: 700; letter-spacing: -0.01em; word-break: keep-all; }
  .band p { margin: 10px 0 0; font-size: 13.5px; line-height: 1.45; color: #3f6394; word-break: keep-all; }
  .device { position: absolute; left: 50%; top: 150px; width: 300px; transform: translateX(-50%);
    border-radius: 32px; border: 6px solid #fff; box-shadow: 0 24px 48px rgba(30, 58, 95, .18); overflow: hidden; background: #fff; }
  .device img { display: block; width: 100%; }
  .ollie { position: absolute; left: 50%; top: 132px; width: 272px; transform: translateX(-50%); }
  .lines { position: absolute; left: 28px; right: 28px; top: 520px; text-align: center; }
  .lines p { margin: 0 0 10px; font-size: 17px; line-height: 1.4; font-weight: 600; color: #1e3a5f; word-break: keep-all; }
</style></head><body>
<div class="band"><h1>${headline}</h1>${appSrc ? `<p>${sub}</p>` : ""}</div>
${appSrc ? `<div class="device"><img src="${appSrc}" alt=""></div>` : ""}
${ollieSrc ? `<img class="ollie" src="${ollieSrc}" alt=""><div class="lines">${lines}</div>` : ""}
</body></html>`;
}

async function renderFramed(context, baseUrl, shot, appPng) {
  const page = await context.newPage();
  const html = frameHtml({
    ...shot,
    appSrc: appPng ? `data:image/png;base64,${appPng.toString("base64")}` : null,
    ollieSrc: shot.ollie ? await toDataUri(shot.ollie) : null,
    fontCss: `${baseUrl}/assets/fonts/pretendard/pretendard-variable.css`,
  });
  await page.route("**/__store-frame.html", (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
  await page.goto(`${baseUrl}/__store-frame.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUT_DIR, shot.file) });
  await page.close();
  console.log(`  ${shot.file}  ${shot.headline}`);
}

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
    let recoverySeed = false; // ③의 별도 부팅에서 true — 어제(12일차)를 덜 한 날로 만든다
    const desiredByDay = (day) => {
      if (day === 4) return [false, false, false];   // 놓친 날 — 정직한 진행
      if (day === 9) return [true, false, false];
      if (day === 12 && recoverySeed) return [true, false, false];
      if (day === 13) return [true, false, false];   // 오늘: 스트레칭만 완료
      return day <= 12 ? [true, true, true] : [false, false, false];
    };
    /* 체크의 영속 소스는 완료 원장이다(saveExecutionState가 체크 필드를 지우고 원장만
       남긴다). 체크만 시드하면 저장 코덱이 "원장 없는 체크"를 조작으로 보고 던지므로,
       원장 행을 함께 만든다. 행 스키마는 encodeExecutionCompletionLedger가 체크에서
       합성하는 행과 같다. 함수로 둔 이유: ③의 회복 시드가 같은 공식으로 다시 만든다. */
    const buildProgress = () => {
      const checkedByDay = Object.fromEntries(
        Array.from({ length: 21 }, (_, index) => [String(index + 1), desiredByDay(index + 1)]),
      );
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
      return { checkedByDay, planIdentity, completedLog, completedOccurrences };
    };
    let { checkedByDay, planIdentity, completedLog, completedOccurrences } = buildProgress();

    /* 시드를 함수로 둔 이유: ③의 회복 부팅이 같은 시드에 변형만 얹어 다시 넣는다. */
    const seedStorage = () => ({
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
        lastSeenDate: dateKey(recoverySeed ? -1 : 0),
        planStartDate,
        checkedByDay,
        completedLog,
        completedOccurrencesPlanIdentity: planIdentity,
        completedOccurrences,
        dailyMemories: SHOT_MEMORIES.map((memory) => {
          const key = dateKey(memory.offset);
          return {
            id: key,
            diaryDate: key,
            day: memory.day,
            title: memory.title,
            mood: memory.mood,
            customMood: "",
            completion: memory.completion,
            obstacle: "time",
            note: memory.note,
            nextStep: memory.nextStep,
            conversation: "",
            hasDialogue: memory.offset === -1,
            suggestion: "오늘도 같은 시간에 이어가요.",
            createdAt: `${key}T09:00:00.000Z`,
            updatedAt: `${key}T09:00:00.000Z`,
          };
        }),
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
    await helpers.prepareApp(page, seedStorage());
    await helpers.mockAccountExperience(page, {
      user: { id: "usr_store_shots", provider: "kakao", name: "달리는 사람", email: "runner@example.com", plan: "pro", role: "member" },
      usage: helpers.createUsageResponse({ plan: "pro", dailyUsed: 3, monthlyUsed: 37 }),
    });
    await page.route("**/api/ai/companion-chat", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, reply: OLLIE_REPLY, chargedCredits: 1 }),
    }));
    /* 다이어리 북: 서버는 머리말·편지 두 글만 만든다. 조판은 클라이언트가 하므로 화면은 진짜다. */
    await page.route("**/api/ai/diary-book", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...BOOK_REPLY, usage: helpers.createUsageResponse({ plan: "pro", dailyUsed: 13, monthlyUsed: 47 }) }),
    }));

    await page.goto("/app.html");
    await helpers.waitForAppReady(page);
    await page.evaluate(() => document.fonts.ready);

    /* 앱 화면은 버퍼로만 찍고, 저장은 헤드라인 띠를 얹은 프레임 페이지가 한다. */
    const capture = async (target = page) => {
      await target.waitForTimeout(600);
      return target.screenshot({ type: "png" });
    };
    const shotByFile = Object.fromEntries(SHOTS.map((shot) => [shot.file, shot]));
    const framed = async (file, target = page) => renderFramed(context, baseUrl, shotByFile[file], await capture(target));

    /* getPlanBundle은 상태의 scheduleKey 해시가 현재 계획과 일치할 때만 체크를 이어받는다
       (계획이 바뀌면 체크를 이월하지 않는 보호 장치). 시드된 상태에 앱과 같은 공식으로
       키를 채워 넣고 저장 경로를 한 번 태운 뒤 다시 연다. */
    const fixScheduleKey = async (target) => {
      await target.evaluate(() => {
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
      await target.reload();
      await helpers.waitForAppReady(target);
      await target.evaluate(() => document.fonts.ready);
    };
    await fixScheduleKey(page);

    /* 찍는 순서는 화면 상태의 의존 때문이고, 파일 번호가 스토어 순서다. */

    // ① 오늘 — 다음 실행과 체크리스트
    await page.locator("#focusTaskTitle").waitFor();
    await framed("screenshot-1-today.png");

    // ② 계획 — 요일·시간이 보이는 전체 일정. 상세가 안 열리면 달력 홈으로 찍는다.
    await page.locator("#tab-plan").click();
    try {
      await page.locator("#planOpenDetailButton").click({ timeout: 3000 });
      await page.getByRole("button", { name: "전체 일정", exact: true }).click({ timeout: 3000 });
      await page.locator("#planScheduleList").waitFor({ timeout: 3000 });
    } catch {
      console.log("  (전체 일정을 못 열어 달력 홈으로 찍는다)");
    }
    await framed("screenshot-2-plan.png");

    // ④ 올리와 대화 — 모킹된 응답으로 실제 대화 흐름
    await page.locator("#tab-mate").click();
    await page.getByRole("button", { name: "올리와 이야기하기" }).click();
    await page.locator("#companionChatSheet").waitFor();
    await page.locator("#companionChatInput").fill("오늘은 좀 피곤한데, 가볍게 해도 될까?");
    await page.locator("#sendCompanionMessage").click();
    await page.locator('#chatThread [data-chat-role="ollie"] .chat-bubble-text', { hasText: "가볍게 가요" }).waitFor();
    await framed("screenshot-4-ollie-chat.png");

    // ⑥ 기록 — 어제의 하루 페이지(다이어리 + 대화)
    await page.locator("#closeCompanionChat").click();
    await page.locator("#tab-memory").click();
    await page.locator("#dayPage").waitFor();
    await page.locator("#dayPagePrev").click();
    await framed("screenshot-6-day-page.png");

    // ⑦ 다이어리 북 — 만든 책을 뷰어로 연다. 뷰어가 안 열리면 완성된 카드로 찍는다.
    await page.locator("#diaryBookCard").scrollIntoViewIfNeeded();
    await page.locator("#diaryBookCreate").click();
    await page.locator("#diaryBookStatus", { hasText: "완성" }).waitFor();
    /* "다시 보기" 버튼은 #diaryBookDone이 열려야 보이는데, 그 판정(lastDiaryBook.monthKey ===
       선택된 달)이 생성 직후 화면에서 어긋나 버튼이 숨어 있었다. 뷰어는 앱의 진입 함수로
       직접 연다 — script.js는 일반 스크립트라 최상위 선언이 evaluate에서 그대로 보인다. */
    try {
      await page.evaluate(() => openMyDiaryBook(lastDiaryBook));
      await page.locator("#sampleBookDialog").waitFor({ timeout: 8000 });
      await page.waitForTimeout(500);
    } catch (error) {
      console.log(`  (책 뷰어를 못 열어 완성 카드로 찍는다: ${String(error.message).split("\n")[0]})`);
    }
    await framed("screenshot-7-diary-book.png");
    await page.locator("#sampleBookClose").click({ timeout: 2000 }).catch(() => {});

    /* ③ 놓친 날 회복 카드 — 별도 부팅. 어제(12일차)를 덜 한 날로, 마지막 접속을 어제로
       둔 시드를 넣으면 앱이 부팅 경로에서 스스로 rolloverNotice를 계산한다. 부팅 뒤에
       notice를 꽂아 넣는 방식은 이 시드에서 카드가 뜨지 않았다 — 앱이 계산하게 두는
       쪽이 확실하다. ⑥의 하루 페이지가 어제를 100%로 보여주므로 같은 부팅에서 찍지 않는다. */
    recoverySeed = true;
    ({ checkedByDay, planIdentity, completedLog, completedOccurrences } = buildProgress());
    const recoveryPage = await context.newPage();
    await helpers.prepareApp(recoveryPage, seedStorage());
    await helpers.mockAccountExperience(recoveryPage, {
      user: { id: "usr_store_shots", provider: "kakao", name: "달리는 사람", email: "runner@example.com", plan: "pro", role: "member" },
      usage: helpers.createUsageResponse({ plan: "pro", dailyUsed: 3, monthlyUsed: 37 }),
    });
    await recoveryPage.goto("/app.html");
    await helpers.waitForAppReady(recoveryPage);
    await recoveryPage.evaluate(() => document.fonts.ready);
    await fixScheduleKey(recoveryPage);
    await recoveryPage.locator("#recoveryCard").waitFor();
    /* 카드를 화면 가운데로 스크롤하면 위 카드가 헤더에 잘린 채 반쯤 보인다. 헤더 바로 아래에 붙인다. */
    await recoveryPage.evaluate(() => {
      const card = document.querySelector("#recoveryCard");
      const header = document.querySelector(".execution-header");
      const top = card.getBoundingClientRect().top + window.scrollY - ((header?.offsetHeight || 64) + 12);
      window.scrollTo(0, Math.max(0, top));
    });
    await framed("screenshot-3-recovery.png", recoveryPage);

    // ⑤ 집중 타이머 — 같은 오늘 화면에서 시작해 도는 중
    await recoveryPage.locator("#startFocusButton").click();
    await recoveryPage.locator("#focusTimerStartButton").waitFor();
    await recoveryPage.locator("#focusTimerStartButton").click();
    await recoveryPage.waitForTimeout(1500);
    await framed("screenshot-5-focus.png", recoveryPage);

    // ⑧ 체험 조건 — 앱 화면 없이 올리와 두 줄. 검수 축 3: "카드 없이"와 조건을 같은 장에.
    await renderFramed(context, baseUrl, shotByFile["screenshot-8-trial.png"], null);

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
