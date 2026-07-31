# 실행 화면 900 이관 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.execution-page` 계열의 `font-weight: 900` 66곳을 굵기 역할 토큰으로 이관하고, 잔여 수 래칫 테스트로 새 900 유입을 막는다.

**Architecture:** 분류를 먼저 산출물로 만들고(Task 1), 래칫을 세운 뒤(Task 2), 화면 묶음 단위로 5회에 나눠 이관한다(Task 3–7). 각 묶음은 도달 가능한 화면의 전후 실측 또는 기존 e2e로 검증한다. 마지막에 문서를 갱신한다(Task 8). 설계: `docs/execution-900-migration-design.md`.

**Tech Stack:** 순수 CSS 편집 + node:test(`fonts.test.mjs`) + Playwright(`@playwright/test`, 실측 스크립트와 기존 e2e).

## Global Constraints

- 굵기는 6단계 계약 안의 값 또는 `--weight-*` 토큰만 쓴다. **새 토큰·표 확장 금지** — 표에 맞지 않으면 아래 두 규칙을 따른다.
- **글리프 의사요소**(`content`가 글자 아이콘인 `::before`/`::after`): 역할 토큰을 배정하지 않고 `font-weight: 900` 리터럴 유지 + `/* 글리프 굵기 — 텍스트 위계 아님, 역할 토큰 비대상 */` 주석.
- **본문 성격의 강조**(문장형 텍스트): `var(--weight-title)` + `/* 판단 보류 — 본문 강조 자리가 표에 없다. design-tokens.md 참조 */` 주석. `.ollie-message p`의 기존 정책과 동일.
- 이관의 기계적 형태는 항상 `font-weight: 900;` → `font-weight: var(--weight-emphasis|--weight-title|--weight-display);`다. 셀렉터·프로퍼티 순서·다른 선언은 건드리지 않는다.
- 커밋 메시지는 한국어 관행을 따르고 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`으로 끝낸다.
- **Playwright 결과를 `| tail`로 판정하지 마라.** exit code가 tail 것이 된다. 출력을 파일로 받고 요약 줄(`N passed/failed`)을 읽는다.
- e2e·실측 전에 `netstat -ano | grep -E ':(8765|8768)\s'`로 포트가 비었는지 확인한다. 이 worktree의 실측 서버는 **8768**을 쓴다. 다른 worktree의 서버를 재사용하면 남의 코드를 측정한다.
- 실측 수치는 추정으로 적지 않는다 — 스크립트 출력을 그대로 붙인다.

## 분류 규칙 (Task 1이 적용, Task 3–7이 재검증)

| 성격 | 배정 | 판별 근거 |
| --- | --- | --- |
| 킥커·라벨·legend·칩·배지·작은 버튼 — 짧은 UI 문구 | `--weight-emphasis` (600) | `<span>킥커</span><h2>제목</h2>` 짝의 span 쪽, `<label>`/`<legend>`, 보조 동작 버튼, 소문자·11–13px급 |
| 섹션·카드 제목 | `--weight-title` (700) | `<h2>`/`<h3>`급, 카드의 주 텍스트 |
| 화면 제목(H1급)·큰 숫자·주요 CTA | `--weight-display` (800) | H1, 게이지·통계의 큰 숫자, 화면당 하나뿐인 Primary CTA |

주의 — 1931905의 교훈: **크롬을 제목 굵기로 몰지 않는다.** 애매하면 마크업의 짝 구조(킥커+제목)를 먼저 찾고, 그래도 애매하면 실측 font-size를 근거로 적는다. "화면당 Primary CTA 하나" 계약(design-tokens.md)이 CTA 판정의 기준이다.

## 66곳 인벤토리 (묶음 = Task 배정)

줄 번호는 이관 전 기준이므로 각 Task에서 `grep -n "font-weight: 900" styles.css`로 다시 찾는다.

**Task 3 — 시트 헤더·계획·메이트·컴패니언 (11)**: `#myPageSheet > header span`(6313) · `#personalitySheet > header span`(16710) · `.plan-adjust-sheet > header span`(14717) · `.plan-adjust-scope button`(14739) · `.plan-undo-banner button`(14748) · `.plan-subview-header > div > span`(15943) · `#view-mate .companion-next-inline small`(16163) · `#view-mate .companion-touch-secondary`(17343) · `.companion-relationship-heading > span`(17393) · `.companion-relationship-summary dd`(17427) · `.journey-pro-link`(17478)

**Task 4 — 기억 탭·올리 (12)**: `.memory-kicker`(12634) · `.memory-mood-picker legend`(12680) · `.memory-mood-picker button`(12705) · `.save-memory-button`(12814) · `.memory-ollie-guide::before`(12865, 글리프 후보) · `.memory-list-head span`(12879) · `.memory-mood-badge`(12935) · `.daily-memory-footer small`(12975) · `.apply-memory-insight`(12980) · `.memory-pattern-head > span`(13301) · `.memory-conversation-card span`(16343) · `.memory-conversation-card button`(16371)

**Task 5 — 달력·본드 (12)**: `.calendar-kicker`(12011) · `.calendar-month-nav button`(12067) · `.calendar-weekdays em`(12105) · `.calendar-day strong`(12152) · `.calendar-day > small`(12159) · `.calendar-day-detail-head strong`(12259) · `.calendar-day-detail-list i`(12318) · `.calendar-day-detail-list strong`(12328) · `.calendar-day-detail-list li button`(14749) · `.bond-kicker`(12420) · `.bond-reaction`(12472) · `.bond-next-unlock small`(12521)

**Task 6 — 데이 페이지·다이어리 북 (15)**: `.day-page-heading small`(13023) · `.day-page-step`(13041) · `.day-page-retention button`(13079) · `.day-page-stats small`(13087) · `.day-page-note small`(13092) · `.day-page-chat > summary`(13108) · `.day-page-empty-actions button`(13145) · `.day-page-erase-start`(13166) · `.day-page-erase-buttons button`(13191) · `.diary-next-step span`(12971) · `.diary-book-head small`(13209) · `.diary-book-month > span`(13215) · `.diary-book-create`(13244) · `.diary-book-done-actions button`(13265) · `.diary-book-tidy-buttons button`(13294)

**Task 7 — 포커스·태스크·수정 제안 (16)**: `.focus-task-copy > span`(11504) · `.execution-checklist .execution-check::after`(11573, 글리프 후보) · `.task-content > span:not(.task-row-head)`(11628) · `.focus-mode-kicker`(11683) · `.focus-time-adjust > button`(11721) · `.focus-time-adjust input`(11737) · `.task-edit-sheet label`(14722) · `.task-edit-scope legend`(14729) · `.sheet-secondary-button`(14736) · `.revision-detail-intro strong`(16763) · `.revision-detail-heading span`(16812) · `.revision-field`(16836) · `.revision-days legend`(16901) · `.revision-days span`(16929) · `.revision-request-caption`(16947) · `.proposal-detail-grid small`(16980)

합계 11+12+12+15+16 = 66.

---

### Task 1: 분류표와 실측 스크립트

**Files:**
- Create: `docs/artifacts/execution-900-classification.md`
- Create: `scripts/measure-execution-weights.cjs`

**Interfaces:**
- Produces: 66행 분류표 — Task 3–7이 배정 열을 그대로 적용한다.
- Produces: `node scripts/measure-execution-weights.cjs` — `BASE`(기본 `http://127.0.0.1:8768`)의 오늘·계획·메이트·기억 탭에서 대상 셀렉터의 computed `font-weight`·`font-size`를 마크다운 표로 stdout에 출력. Task 3–7이 전후 비교에 재사용한다.

- [ ] **Step 1: 실측 스크립트를 만든다**

이전 브랜치의 실측 스크립트는 커밋되지 않아 소실됐고 면제 근거를 재검증할 길이 없어졌다. 이번 것은 저장소에 넣는다. `tests/e2e/helpers.js`의 `prepareApp`(로그인 없이 app.html 준비)과 `waitForAppReady`를 재사용한다.

```js
// scripts/measure-execution-weights.cjs
// .execution-page 900 이관의 전후 실측. 오늘·계획·메이트·기억 탭을 돌며
// 대상 셀렉터의 computed font-weight/font-size를 마크다운 표로 찍는다.
// 사용: PORT=8768 node serve-local.cjs &  →  node scripts/measure-execution-weights.cjs
const { chromium } = require("@playwright/test");
const { prepareApp, waitForAppReady } = require("../tests/e2e/helpers.js");

const BASE = process.env.BASE || "http://127.0.0.1:8768";
// 탭으로 도달 가능한 대상만 잰다. 딥 스테이트(다이어리 북 생성·수정 제안 등)는
// 분류표의 마크업 근거로만 판정한다 — 설계 문서의 결정.
const TARGETS = [
  ".focus-mode-kicker", ".focus-task-copy > span", ".task-content > span:not(.task-row-head)",
  ".calendar-kicker", ".calendar-month-nav button", ".calendar-weekdays em",
  ".calendar-day strong", ".calendar-day > small",
  ".memory-kicker", ".memory-mood-picker legend", ".memory-mood-picker button",
  ".save-memory-button", ".memory-list-head span", ".memory-mood-badge",
  ".bond-kicker", ".bond-reaction", ".bond-next-unlock small",
  ".companion-next-inline small", ".companion-touch-secondary",
  ".companion-relationship-heading > span", ".companion-relationship-summary dd",
  ".journey-pro-link", ".plan-subview-header > div > span",
  "#myPageSheet > header span",
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, baseURL: BASE });
  await prepareApp(page);
  await page.goto("/app.html");
  await waitForAppReady(page);

  const rows = new Map();
  for (const view of ["today", "plan", "mate", "memory"]) {
    await page.locator(`#tab-${view}`).click();
    await page.locator(`#view-${view}`).waitFor({ state: "visible" });
    const found = await page.evaluate((targets) => {
      return targets.flatMap((sel) => {
        const el = document.querySelector(sel);
        if (!el || !el.offsetParent) return []; // 이 뷰에 없거나 숨김
        const cs = getComputedStyle(el);
        return [{ sel, weight: cs.fontWeight, size: cs.fontSize }];
      });
    }, TARGETS);
    for (const f of found) if (!rows.has(f.sel)) rows.set(f.sel, { ...f, view });
  }

  console.log("| selector | view | font-weight | font-size |");
  console.log("| --- | --- | --- | --- |");
  for (const r of [...rows.values()].sort((a, b) => a.sel.localeCompare(b.sel)))
    console.log(`| \`${r.sel}\` | ${r.view} | ${r.weight} | ${r.size} |`);
  console.log(`\n측정 ${rows.size}/${TARGETS.length} (미측정은 해당 뷰 기본 상태에 없음)`);
  await browser.close();
})();
```

- [ ] **Step 2: 8768이 비었는지 확인하고 서버를 띄워 베이스라인을 잰다**

```bash
netstat -ano | grep ':8768' ; PORT=8768 node serve-local.cjs &
node scripts/measure-execution-weights.cjs > /tmp/baseline.md ; cat /tmp/baseline.md
```

Expected: 표에 측정된 행 대부분 `font-weight` 900. (900이 아닌 행이 있으면 캐스케이드에서 다른 규칙이 이기고 있다는 뜻 — 분류표의 해당 행에 "사문(死文) 선언, 실제 적용 규칙: <셀렉터>"로 적는다. 63ddda4가 찾은 `.focus-start-button` 같은 사례.)

- [ ] **Step 3: 66행 분류표를 쓴다**

`docs/artifacts/execution-900-classification.md`. 인벤토리의 66곳 각각에 대해 `app.html`(필요하면 `index.html`)에서 해당 클래스의 실제 마크업을 찾아(`grep -n "memory-kicker" app.html`) 분류 규칙을 적용한다. 형식:

```markdown
# execution-page 900 분류표

기준: docs/execution-900-migration-plan.md의 분류 규칙. 실측: Step 2 베이스라인(아래 첨부).

| # | 셀렉터 | 마크업 근거 | 배정 | 메모 |
| --- | --- | --- | --- | --- |
| 1 | `.memory-kicker` | `<span class="memory-kicker">오늘의 기억</span>` + 옆 `<h2>` — 킥커 짝 | emphasis | |
| 2 | `.execution-checklist .execution-check::after` | `content:"✓"` — 글리프 | 유지(리터럴) | 텍스트 위계 아님 |
| … | | | | |
```

- 글리프 후보 2곳(`.execution-check::after`, `.memory-ollie-guide::before`)은 `content` 값을 확인해 진짜 글리프인지 판정하고, `.calendar-day-detail-list i`도 아이콘성인지 본다.
- **유지(리터럴) 판정 수를 표 끝에 합계로 적는다** — Task 2·8의 래칫 수가 이 합계에 의존한다: 최종 잔여 = 137 + 유지 수.
- 베이스라인 표를 문서 끝에 그대로 붙인다.

- [ ] **Step 4: 셀프 체크**

66행이 전부 있는지(`grep -c '^| [0-9]' …`), emphasis로 배정된 행 중 `<h2>`/`<h3>`가 근거인 행이 없는지, display 배정이 "화면당 Primary CTA 하나" 계약과 충돌하지 않는지 훑는다.

- [ ] **Step 5: 커밋**

```bash
git add docs/artifacts/execution-900-classification.md scripts/measure-execution-weights.cjs
git commit  # "실행 화면 900 66곳을 분류하고 실측 스크립트를 저장소에 넣는다" + 근거 요약
```

---

### Task 2: 잔여 수 래칫 테스트

**Files:**
- Modify: `fonts.test.mjs` (끝에 추가)

**Interfaces:**
- Produces: "font-weight:900 잔여 수 래칫" 테스트. Task 3–7은 각 이관 커밋에서 이 수를 내린다.

- [ ] **Step 1: 테스트를 쓴다**

`fonts.test.mjs`는 저장소 루트 상대경로로 `fs.readFileSync("styles.css", …)`를 쓰는 파일이다. 같은 방식으로:

```js
test("font-weight:900 잔여 수 래칫 — 새 900 유입을 막는다", () => {
  // 900은 6단계 계약 안의 값이라 위의 계약 테스트로는 유입을 못 잡는다.
  // 이관(docs/execution-900-migration-plan.md)이 진행될 때마다 이 수를 내린다.
  // 올라갔다면 새 900이 들어온 것이다 — 역할 토큰으로 쓰거나 분류표에 근거를 남겨라.
  const css = fs.readFileSync("styles.css", "utf8");
  const count = (css.match(/font-weight:\s*900\b/g) || []).length;
  assert.equal(count, 203);
});
```

- [ ] **Step 2: 통과 확인**

Run: `npm test` — Expected: 458 pass / 0 fail (457 + 1).

- [ ] **Step 3: 래칫이 실제로 무는지 확인한다**

`styles.css` 아무 규칙에 `font-weight: 900;`을 하나 임시로 넣고 `npm test` → 해당 테스트 1 fail 확인 → 되돌리고 다시 통과 확인.

- [ ] **Step 4: 커밋**

```bash
git add fonts.test.mjs
git commit  # "900 잔여 수 래칫 테스트를 세운다 — 계약 테스트가 못 잡는 유입을 막는다"
```

---

### Task 3: 이관 1 — 시트 헤더·계획·메이트·컴패니언 (11곳)

**Files:**
- Modify: `styles.css` (인벤토리 Task 3 묶음 11곳)
- Modify: `fonts.test.mjs` (래칫 수 203 → 192)

**Interfaces:**
- Consumes: Task 1 분류표의 배정 열, Task 2 래칫.

- [ ] **Step 1: 분류를 마크업과 재검증한다**

11곳 각각 분류표의 근거 마크업을 `grep`으로 실제 확인한다. 표와 다르면 **멈추고 표를 먼저 고친 뒤**(수정 사유를 표의 메모 열에) 진행한다. 표를 무시한 채 코드만 고치지 않는다.

- [ ] **Step 2: 11곳을 편집한다**

각 셀렉터를 `grep -n "font-weight: 900" styles.css`로 찾아 분류표의 배정대로 `var(--weight-*)`로 바꾼다. 예상 형태(배정은 분류표가 확정):

```css
.execution-page #myPageSheet > header span { /* … */ font-weight: var(--weight-emphasis); }
```

- [ ] **Step 3: 래칫을 내린다**

`fonts.test.mjs`의 `assert.equal(count, 203)` → `192`. (글리프 유지 판정이 이 묶음에 있으면 그만큼 덜 내린다 — 분류표 합계를 따른다.)

- [ ] **Step 4: 유닛 확인**

Run: `npm test` — Expected: 458 pass / 0 fail.

- [ ] **Step 5: 실측 diff**

```bash
netstat -ano | grep ':8768' ; PORT=8768 node serve-local.cjs &
node scripts/measure-execution-weights.cjs > /tmp/after-t3.md
diff /tmp/baseline.md /tmp/after-t3.md
```

Expected: **측정된 행 중 이 묶음 소속만**(`.companion-*`, `.journey-pro-link` 등) weight가 900 → 배정값으로 변한다. **다른 묶음의 행이 변했다면 멈추고 원인을 찾는다.** 시트 내부(`#myPageSheet > header span` 등)는 기본 상태에서 숨김이라 미측정으로 나온다 — 그쪽 판정은 분류표 + Step 6 e2e가 맡는다.

- [ ] **Step 6: e2e 스폿**

```bash
npx playwright test tests/e2e/plan.spec.js tests/e2e/mate.spec.js --workers=1 > /tmp/e2e-t3.log 2>&1
grep -E "[0-9]+ (passed|failed)" /tmp/e2e-t3.log
```

Expected: 0 failed. 실패가 여러 프로젝트에 흩어진 네트워크 중단이면 `--last-failed --workers=1`로 가른다(부하 플레이키 전례).

- [ ] **Step 7: 커밋**

```bash
git add styles.css fonts.test.mjs
git commit  # "시트 헤더와 계획·메이트 탭의 900 11곳을 역할 토큰으로 옮긴다" + 실측 요약
```

---

### Task 4: 이관 2 — 기억 탭·올리 (12곳)

**Files:**
- Modify: `styles.css` (인벤토리 Task 4 묶음), `fonts.test.mjs` (래칫 192 → 180, 글리프 유지 판정이면 181)

Task 3과 같은 7단계를 이 묶음으로 반복한다. 다른 점만:

- [ ] **Step 1–4:** 재검증 → 편집 → 래칫(12곳 전부 이관이면 180, 글리프 후보 `.memory-ollie-guide::before`가 유지 판정이면 181) → `npm test`
- [ ] **Step 5: 실측 diff** — 변해야 하는 행: `.memory-*`, `.save-memory-button` 계열
- [ ] **Step 6: e2e** — `tests/e2e/ollie-memory-ux.spec.js tests/e2e/records.spec.js`
- [ ] **Step 7: 커밋** — "기억 탭의 900 12곳을 …"

---

### Task 5: 이관 3 — 달력·본드 (12곳)

**Files:**
- Modify: `styles.css` (인벤토리 Task 5 묶음), `fonts.test.mjs` (래칫 −12±글리프)

Task 3과 같은 7단계. 다른 점:

- [ ] **Step 1 주의:** `.calendar-day strong`(날짜 숫자)·`.calendar-weekdays em`(요일 글자)은 "큰 숫자"가 아니다 — 실측 font-size를 근거로 판정하고 표의 메모 열에 남긴다. `.calendar-day-detail-list i`는 글리프/아이콘 여부를 마크업으로 확인.
- [ ] **Step 5: 실측 diff** — 변해야 하는 행: `.calendar-*`, `.bond-*` (달력은 계획 탭에서 렌더 — 측정 스크립트가 이미 순회)
- [ ] **Step 6: e2e** — `tests/e2e/plan.spec.js tests/e2e/day-page.spec.js`
- [ ] **Step 7: 커밋** — "달력·본드의 900 12곳을 …"

---

### Task 6: 이관 4 — 데이 페이지·다이어리 북 (15곳)

**Files:**
- Modify: `styles.css` (인벤토리 Task 6 묶음), `fonts.test.mjs` (래칫 −15)

Task 3과 같은 7단계. 다른 점:

- [ ] **Step 1 주의:** `.diary-book-create`·`.day-page-empty-actions button`은 CTA 판정 — "화면당 Primary CTA 하나"로 가른다. `.day-page-erase-*`는 파괴 동작의 보조 버튼이다.
- [ ] **Step 5: 실측** — 이 묶음 대부분은 딥 스테이트라 측정 스크립트 범위 밖이다. diff에서 **아무 행도 변하지 않아야 정상**이고, 판정은 분류표+Step 6 e2e에 맡긴다.
- [ ] **Step 6: e2e** — `tests/e2e/day-page.spec.js tests/e2e/diary-book.spec.js`
- [ ] **Step 7: 커밋** — "데이 페이지·다이어리 북의 900 15곳을 …"

---

### Task 7: 이관 5 — 포커스·태스크·수정 제안 (16곳)

**Files:**
- Modify: `styles.css` (인벤토리 Task 7 묶음), `fonts.test.mjs` (래칫 → 최종값 = 137 + 유지 합계)

Task 3과 같은 7단계. 다른 점:

- [ ] **Step 1 주의:** `.execution-check::after`는 글리프 후보(분류표 판정 적용). `.focus-time-adjust input`은 입력값 숫자 — "큰 숫자"인지 실측 크기로 판정.
- [ ] **Step 5: 실측 diff** — 변해야 하는 행: `.focus-*`, `.task-content` 계열
- [ ] **Step 6: e2e** — `tests/e2e/today.spec.js tests/e2e/tap-targets.spec.js` (글꼴 변화가 히트 영역을 바꾼 전례 두 번 — 굵기도 폭을 바꾼다)
- [ ] **Step 7: 최종 래칫 검산 후 커밋**

```bash
grep -c "font-weight: 900" styles.css   # = 137 + 분류표의 유지 합계
npm test                                 # 458 pass
```

---

### Task 8: 문서 갱신

**Files:**
- Modify: `docs/design-tokens.md` (잔여 수 203 → 실제 최종값, `.execution-page` 완료 서술)
- Modify: `docs/artifacts/typography-foundation-measurements.md` (전후 실측 표 잇대기)
- Modify: `docs/execution-900-migration-design.md` ("이관 후 137" 문구를 실제값으로 정정 — 글리프 유지분 반영)
- Modify: `docs/PROJECT_STATUS.md` (작업 종료 기록 — AGENTS.md 요구)

- [ ] **Step 1:** design-tokens.md의 "203개 남아 있습니다" 문단을 갱신 — 실제 최종 수, 이관된 묶음, 남은 137곳(랜딩 27·결제 9·샘플북 4·관리자 7·롱테일)이 후속임을 명시.
- [ ] **Step 2:** measurements 아티팩트에 Task 3–7의 전후 실측 표를 붙인다(스크립트 출력 원문).
- [ ] **Step 3:** 설계 문서의 래칫 수치 문구 정정.
- [ ] **Step 4:** PROJECT_STATUS.md 갱신. **주의: 이 파일은 여러 브랜치가 동시에 건드린다** — 병합 충돌 시 양쪽 항목을 모두 남긴다.
- [ ] **Step 5:** `npm test` 458 pass 확인 후 커밋 — "실행 화면 900 이관을 문서에 반영한다".

---

## 완료 조건

- `npm test` — 458 pass / 0 fail (457 + 래칫 1)
- `grep -c "font-weight: 900" styles.css` = 137 + 분류표 유지 합계 (유지 각각에 사유 주석)
- 관련 e2e(plan · mate · ollie-memory-ux · records · day-page · diary-book · today · tap-targets) 0 failed
- `docs/artifacts/execution-900-classification.md` 66행 + 베이스라인 실측 첨부
- `scripts/measure-execution-weights.cjs` 커밋됨 (이전 브랜치의 소실 전례 방지)
- 문서 4종 갱신
