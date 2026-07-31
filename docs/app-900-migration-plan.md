# 앱 표면 900 이관 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 화면에 렌더되는 `font-weight: 900` 약 50곳을 굵기 역할 토큰으로 이관하고, 굵기 역할 표의 "본문 성격의 강조" 공백을 `--weight-emphasis`로 닫는다.

**Architecture:** 역할 표 개정을 먼저 확정하고(Task 1), 분류표를 산출물로 만든 뒤(Task 2), 화면 묶음 단위로 4회에 나눠 이관한다(Task 3–6). 올리 대화 묶음만 스크린샷 전후를 남긴다. 마지막에 문서를 갱신한다(Task 7). 설계: `docs/app-900-migration-design.md`.

**Tech Stack:** 순수 CSS 편집 + node:test(`fonts.test.mjs`) + Playwright(`scripts/measure-execution-weights.cjs`와 기존 e2e).

## Global Constraints

- 굵기는 6단계 계약 안의 값 또는 `--weight-*` 토큰만 쓴다. **새 토큰 생성 금지** — 이 계획은 기존 `--weight-emphasis`의 *정의*를 넓힐 뿐 값이나 토큰 수를 바꾸지 않는다.
- **글리프 의사요소**(`content`가 글자 아이콘): 역할 토큰을 배정하지 않고 `font-weight: 900` 리터럴 유지 + `/* 글리프 굵기 — 텍스트 위계 아님, 역할 토큰 비대상. app-900-classification.md #N */` 주석.
- 이관의 기계적 형태는 항상 `font-weight: 900;` → `font-weight: var(--weight-emphasis|--weight-title|--weight-display);`다. 셀렉터·프로퍼티 순서·다른 선언은 건드리지 않는다.
- **사문(死文) 선언도 배정대로 이관한다.** 삭제는 이 계획의 범위가 아니다.
- 커밋 메시지는 한국어 관행을 따르고 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`으로 끝낸다.
- **Playwright 결과를 `| tail`로 판정하지 마라.** exit code가 tail 것이 된다. 출력을 파일로 받고 요약 줄(`N passed/failed`)을 읽는다.
- 이 worktree의 실측·스크린샷 서버는 **8769** 전용이다. 쓰기 전에 `netstat -ano | grep ':8769\s'`로 비었는지 확인하고, 끝나면 띄운 서버를 죽인다. **8765는 다른 worktree가 쓰고 있으니 절대 건드리지 마라.**
- 실측 수치는 추정으로 적지 않는다 — 스크립트 출력을 그대로 붙인다.
- e2e 실패가 여러 프로젝트에 하나씩 흩어지고 사유가 네트워크 중단·타임아웃이면 부하 플레이키다. `--last-failed --workers=1`로 먼저 가른 뒤 판단한다.

## 분류 규칙 (Task 2가 적용, Task 3–6이 재검증)

| 성격 | 배정 | 판별 근거 |
| --- | --- | --- |
| 킥커·라벨·legend·칩·배지·작은 버튼 — 짧은 UI 문구 | `--weight-emphasis` (600) | `<span>킥커</span><h2>제목</h2>` 짝의 span 쪽, `<label>`/`<legend>`, 보조 동작 버튼 |
| **본문 성격의 강조 — 문장형 텍스트** | `--weight-emphasis` (600) | **Task 1의 개정으로 새로 생긴 자리.** 올리 말풍선 본문, 토스트, 챗 말풍선 본문 |
| 섹션·카드 제목 | `--weight-title` (700) | `<h2>`/`<h3>`급, 카드의 주 텍스트, 다이얼로그 제목 |
| 화면 제목(H1급)·큰 숫자·주요 CTA | `--weight-display` (800) | H1, 게이지·타이머의 큰 숫자, 화면/카드당 하나뿐인 Primary CTA |

기준점: 기존 `.focus-start-button`·`.save-memory-button`·`.diary-book-create`가 이미 `--weight-display`다 — 화면/카드의 단일 주요 CTA는 display를 따른다. 주의 — #55의 교훈: **크롬을 제목 굵기로 몰지 않는다.** 애매하면 마크업의 짝 구조를 먼저 찾고, 그래도 애매하면 실측 font-size를 근거로 적는다.

## 인벤토리 (묶음 = Task 배정)

줄 번호는 `origin/main`(2f0bd0d) 기준이므로 각 Task에서 `grep -n "font-weight: 900" styles.css`로 다시 찾는다.

**Task 3 — 올리 대화·토스트 (11 + 판단 보류 2)**: `.chat-input-label span`(4165) · `.chat-mood-options button`(4303) · `.chat-energy`(4369) · `.chat-consent-agree`(4423) · `.chat-bubble > span`(4525) · `.chat-actions button`(4592) · `.chat-recharge-link`(4650) · `.chat-bubble-headline`(script.js 생성) · `.ollie-energy-warning button`(11071) · `.ollie-celebration-stamp`(11845) · `.companion-stats span`(4050) — **그리고 판단 보류 2건**: `.ollie-message p, .ollie-chat-preview p`(2432–2433, 현재 `var(--weight-title)`) · `.app-toast`(4906 블록, 현재 `var(--weight-title)`)

**Task 4 — 앱 크롬·마이페이지·계획 (12)**: `.plan-badge`(910) · `.card-title span`(1110) · `.text-button`(2868) · `.calendar-weekdays span`(3111) · `.calendar-day span`(3150) · `.execution-tabbar a`(3246) · `.plan-preview-list article > span`(3831) · `.revision-quick-actions button`(3863) · `.focus-mode-actions button`(4095) · `#focusTimer`(4879) · `.journey-map span`(4972) · `.execution-theme-button`(script.js 생성)

**Task 5 — 체험·페이월·결제·인증 (16)**: `.admin-password-form > div:first-child span`(6280) · `.mypage-usage-heading span`(6331) · `.mypage-usage-row span`(6335) · `.trial-status-banner > span`(10321) · `.trial-status-banner a`(10334) · `.trial-paywall-card > span`(10375) · `.trial-paywall-card > a`(10445) · `.paywall-sample > strong`(10472) · `.paywall-sample > p b`(10486) · `.paywall-sample-open`(10498) · `.trial-paywall-open > strong`(10516) · `.paywall-return-bar > button`(10574) · `.auth-sheet-gate-notice b`(10591) · `.app-personality-fields label`(16674) · `.plan-choice-option .plan-choice-label`(4821, both) · `.auth-provider .naver-mark`(6267, both)

**Task 6 — 다이어리 북 샘플·결제 확인·글리프 (13)**: `.diary-book-locked-actions a`(19011) · `.sample-book-head h2`(19076) · `.sample-book-badge`(19094) · `.sample-book-head button`(19108) · `.sample-book-pages .book-page h2`(19133) · `.sample-book-pages .book-day header strong`(19185) · `.sample-book-foot a`(19226) · `.billing-confirm-card > span`(10621, both) · `.billing-confirm-actions button`(10650, both) · `.energy-pack em`(11151, both) — **글리프 후보 3곳**: `.mypage-benefit-list li::before`(6346) · `.trial-paywall-card li::before`(10432) · `.auth-trust-list span::before`(6277, both)

**검산.** 900 선언 수: 11 + 12 + 16 + 13 = **52**. 버킷과 대조하면 app 42(43 중
`.execution-page .calendar-day-detail-list i` 제외 — #55가 이미 유지 처리) + both 5 +
script.js 생성 앱 렌더분 2 + 앱 글리프 3 = 52로 일치한다. 분류표 행 수는 여기에 판단 보류
2건을 더한 **54**다(그 둘은 이미 토큰이라 900이 아니다). 이관 대상은 52에서 글리프 유지
3을 뺀 **49**이고, **최종 래칫은 139 − 49 = 90**이다 — 다만 글리프 판정이 분류에서 바뀔 수
있으니 Task 6이 검산으로 확정한다.

`.execution-check::after`(11575)도 #55가 유지 처리했으므로 건드리지 않는다.

---

### Task 1: 역할 표를 개정한다

**Files:**
- Modify: `docs/design-tokens.md` (역할 표 행 + 공백 문단)

**Interfaces:**
- Produces: `--weight-emphasis`의 개정된 정의 — Task 2의 분류 규칙과 Task 3의 판단 보류 해소가 이 문구를 근거로 삼는다.

코드보다 문서를 먼저 고치는 이유: 이 개정이 Task 2 분류의 전제다. 분류를 먼저 하면 근거 없는 배정이 된다.

- [ ] **Step 1: 역할 표의 emphasis 행을 고친다**

`docs/design-tokens.md`의 `--weight-*` 축 표에서:

```
| `--weight-emphasis` | 600 | 라벨·메타·칩·탭처럼 짧은 UI 문구 |
```

를 아래로 바꾼다.

```
| `--weight-emphasis` | 600 | 제목은 아니나 강조하는 문구 — 라벨·메타·칩·탭 같은 짧은 UI 문구와 본문 성격의 강조 |
```

- [ ] **Step 2: 공백 문단을 결정으로 교체한다**

같은 파일의 아래 문단을 찾아

```
이 표는 UI 요소(제목·라벨·칩·탭)만 상정합니다. **본문 성격의 강조는 다루지 않습니다.**
```

로 시작하는 문단 전체(`.ollie-message p` / `.app-toast`가 판단 보류라는 서술과 "A·B 단계의 결정입니다"로 끝나는 부분까지)를 아래로 교체한다.

```markdown
**본문 성격의 강조는 `--weight-emphasis`(600)에 들어갑니다.** 이 자리는 원래 표에
없었고 `.ollie-message p` / `.ollie-chat-preview p`(올리 말풍선 본문)와 `.app-toast`가
`--weight-title`(700)에 판단 보류로 남아 있었습니다. 앱 표면 이관에서 올리 대화
표면을 다루며 결정했습니다(`docs/app-900-migration-design.md`).

새 역할을 만들지 않은 이유는 둘입니다. 400과 600 사이에 자리를 만들면 앞으로 애매한
케이스가 전부 거기로 흘러들어 표의 변별력이 떨어집니다. 그리고 `--weight-emphasis`가
하던 역할이 원래 "제목은 아니지만 강조"였습니다 — 정의 문구가 좁게 쓰였을 뿐입니다.

올리를 700에 두면 올리 목소리가 섹션 제목과 같은 굵기가 됩니다. 이 프로젝트가 고치려던
것이 "전부 같은 굵기로 보이는" 문제였습니다.
```

- [ ] **Step 3: 다른 곳에 남은 판단 보류 서술을 찾는다**

```bash
grep -rn "판단 보류" docs/ styles.css
```

역할 표 공백을 근거로 쓴 서술이 더 있으면 같은 결정으로 갱신한다. (`.ollie-message p` 규칙 자체는 Task 3이 고친다.)

- [ ] **Step 4: 커밋**

```bash
git add docs/design-tokens.md
git commit  # "굵기 역할 표의 본문 강조 공백을 emphasis로 닫는다" + 근거
```

---

### Task 2: 분류표와 실측 대상 확장

**Files:**
- Create: `docs/artifacts/app-900-classification.md`
- Modify: `scripts/measure-execution-weights.cjs` (`TARGETS` 확장)

**Interfaces:**
- Consumes: Task 1의 개정된 emphasis 정의.
- Produces: 54행 분류표(900 선언 52 + 판단 보류 2) — Task 3–6이 배정 열을 그대로 적용한다.
- Produces: 확장된 `TARGETS` — Task 3–6이 전후 비교에 재사용한다.

- [ ] **Step 1: 측정 대상을 확장한다**

`scripts/measure-execution-weights.cjs`의 `TARGETS` 배열에 이번 인벤토리 중 **탭 순회로 도달 가능한** 셀렉터를 덧붙인다. 스크립트의 순회 로직(today·plan·mate·memory 탭)은 그대로 둔다.

```js
  // 앱 표면 2차 이관(app-900) 대상 — 탭 순회로 도달 가능한 것만
  ".plan-badge", ".card-title span", ".text-button", ".execution-tabbar a",
  ".calendar-weekdays span", ".calendar-day span", ".journey-map span",
  ".companion-stats span", ".plan-preview-list article > span",
  ".trial-status-banner > span", ".trial-status-banner a",
  ".mypage-usage-heading span", ".mypage-usage-row span",
```

- [ ] **Step 2: 8769가 비었는지 확인하고 베이스라인을 잰다**

```bash
netstat -ano | grep ':8769\s' ; PORT=8769 node serve-local.cjs &
BASE=http://127.0.0.1:8769 node scripts/measure-execution-weights.cjs > /tmp/app900-baseline.md
cat /tmp/app900-baseline.md
```

Expected: 측정된 행 대부분 `font-weight` 900. 900이 아닌 행은 캐스케이드에서 다른 규칙이 이긴다는 뜻 — 분류표에 "사문 선언, 실제 적용 규칙: <셀렉터>"로 적는다.

- [ ] **Step 3: 54행 분류표를 쓴다**

`docs/artifacts/app-900-classification.md`. 인벤토리 52곳과 판단 보류 2건, 합 54행 각각에 대해 `app.html`(`both` 항목은 `index.html`도)과 `script.js`에서 실제 마크업을 찾아(`grep -n "chat-energy" app.html script.js`) 분류 규칙을 적용한다. 형식은 `docs/artifacts/execution-900-classification.md`와 동일하게:

```markdown
| # | 셀렉터 | 마크업 근거 | 배정 | 메모 |
| --- | --- | --- | --- | --- |
| 1 | `.chat-bubble > span` | `<span>` + `<p>` 본문 짝 (app.html:NNN) — 킥커 | emphasis | |
```

판정 시 주의할 곳:

- `.chat-bubble-headline` — 이름은 헤드라인이다. 마크업에서 실제로 제목 위치면 **title**, 말풍선 본문의 첫 줄이면 emphasis. `script.js`에서 생성 코드를 읽고 판정한다.
- `#focusTimer` — `15:00` 타이머 숫자. 크기를 실측해 "큰 숫자"면 **display**.
- `.execution-tabbar a` · `.calendar-weekdays span` · `.calendar-day span` — #55에서 `.execution-page` 접두사 버전을 이미 이관했다. **같은 요소의 다른 규칙일 수 있으니** 두 규칙이 캐스케이드에서 어떻게 겹치는지 확인하고, 겹치면 배정을 #55와 일치시킨다(달력 날짜 숫자는 title, 요일 라벨은 emphasis).
- `.sample-book-head h2` · `.sample-book-pages .book-page h2` — `<h2>`다. **title**이 기본값이나, 다이어리 북 샘플이 책 지면을 흉내내는 화면이라 화면 제목급이면 display도 가능하다. 실측 크기로 가른다.
- 글리프 후보 3곳 — `content` 값을 읽어 글자 아이콘이면 **유지(리터럴)**.
- `both` 5곳 — 랜딩에도 나오므로 메모에 "both — 랜딩 검증 필요" 표시.

- [ ] **Step 4: 유지(리터럴) 합계를 표 끝에 적는다**

Task 3–6의 래칫 수가 이 합계에 의존한다: 최종 잔여 = 139 − (이관 수). 유지 판정은 이관 수에서 빠진다.

- [ ] **Step 5: 베이스라인 표를 문서 끝에 붙이고 셀프 체크**

54행이 전부 있는지, emphasis 배정 중 `<h2>`/`<h3>`가 근거인 행이 없는지, display 배정이 "화면당 Primary CTA 하나" 계약과 충돌하지 않는지 훑는다.

- [ ] **Step 6: 커밋**

```bash
git add docs/artifacts/app-900-classification.md scripts/measure-execution-weights.cjs
git commit  # "앱 표면 900 52곳과 판단 보류 2건을 분류하고 실측 대상을 넓힌다" + 근거 요약
```

---

### Task 3: 이관 1 — 올리 대화·토스트 (11 + 판단 보류 2)

**Files:**
- Modify: `styles.css` (인벤토리 Task 3 묶음 + 판단 보류 2건)
- Modify: `fonts.test.mjs` (래칫 139 → 128 — 이 묶음의 900 선언 11곳만큼. 판단 보류 2건은 이미 토큰이라 래칫에 영향 없다)
- Create: `docs/artifacts/app-900-ollie-shots/` (스크린샷 전후)

**Interfaces:**
- Consumes: Task 1의 개정된 정의, Task 2 분류표.

**이 묶음이 이 계획에서 시각 변화가 가장 크다.** 올리 말풍선이 900 → 600으로 두 단계 내려간다. 그래서 유일하게 스크린샷 전후를 남긴다.

- [ ] **Step 1: 이관 전 스크린샷을 찍는다**

```bash
netstat -ano | grep ':8769\s' ; PORT=8769 node serve-local.cjs &
```

`tests/e2e/helpers.js`의 `prepareApp`·`waitForAppReady`를 재사용하는 일회성 스크립트로 390×844에서 올리 대화 시트와 토스트가 보이는 상태를 찍는다. 저장: `docs/artifacts/app-900-ollie-shots/before-{chat,toast}.png`.

챗 시트 도달 경로: `app.html` → 메이트 탭 → `#openCompanionChat`(또는 `data-chat-entry="talk"`) 클릭. 토스트는 앱이 상태 변화 시 띄우므로, 도달이 어려우면 **`.app-toast`에 `show` 클래스를 직접 붙여** 렌더 상태를 만든다(스크린샷은 시각 확인용이므로 허용).

- [ ] **Step 2: 분류를 마크업과 재검증한다**

11곳 각각 분류표의 근거를 `grep`으로 확인한다. 표와 다르면 **멈추고 표를 먼저 고친 뒤** 진행한다.

- [ ] **Step 3: 11곳을 편집한다**

분류표의 배정대로 `var(--weight-*)`로 바꾼다.

- [ ] **Step 4: 판단 보류 2건을 닫는다**

```css
.ollie-message p,
.ollie-chat-preview p {
  /* … */
  font-weight: var(--weight-emphasis);
}
```

`.app-toast`의 `font-weight: var(--weight-title)`도 `var(--weight-emphasis)`로 바꾼다. **판단 보류를 설명하던 주석이 근처에 있으면 함께 지운다** — 결정이 났는데 보류 주석이 남으면 다음 사람이 헷갈린다.

- [ ] **Step 5: 래칫을 내리고 유닛을 돌린다**

`fonts.test.mjs`의 수를 이 묶음 이관 수만큼 내린다(판단 보류 2건은 900이 아니므로 래칫에 영향 없다). Run: `npm test` — Expected: 458 pass / 0 fail.

- [ ] **Step 6: 이관 후 스크린샷과 실측**

```bash
BASE=http://127.0.0.1:8769 node scripts/measure-execution-weights.cjs > /tmp/app900-t3.md
diff /tmp/app900-baseline.md /tmp/app900-t3.md
```

Step 1과 같은 스크립트로 `after-{chat,toast}.png`를 찍는다. **before/after를 나란히 보고, 올리 목소리가 읽히는지 육안 확인한다.** 어색하면 멈추고 보고한다 — 되돌리기는 배정을 `--weight-title`로 되돌리는 한 줄이다.

- [ ] **Step 7: e2e**

```bash
npx playwright test tests/e2e/cheer.spec.js tests/e2e/mate.spec.js tests/e2e/modal.spec.js --workers=1 > /tmp/e2e-t3.log 2>&1
grep -E "[0-9]+ (passed|failed|skipped)" /tmp/e2e-t3.log
```

Expected: 0 failed.

- [ ] **Step 8: 커밋** (스크린샷 포함, 전후 판단을 메시지에 적는다)

---

### Task 4: 이관 2 — 앱 크롬·마이페이지·계획 (12곳)

**Files:**
- Modify: `styles.css` (인벤토리 Task 4 묶음), `fonts.test.mjs` (래칫 −12)

Task 3과 같은 흐름에서 스크린샷 단계만 뺀다.

- [ ] **Step 1: 재검증** — 특히 `.execution-tabbar a` · `.calendar-weekdays span` · `.calendar-day span`이 #55가 이관한 `.execution-page` 접두사 규칙과 캐스케이드에서 어떻게 겹치는지 확인한다. 겹치면 배정을 일치시킨다.
- [ ] **Step 2: 12곳 편집** — 분류표 배정대로.
- [ ] **Step 3: 래칫 −12, `npm test`** — Expected: 458 pass / 0 fail.
- [ ] **Step 4: 실측 diff** — 변해야 하는 행: `.plan-badge` · `.card-title span` · `.text-button` · `.execution-tabbar a` · `.calendar-*` · `.journey-map span` · `.plan-preview-list article > span`. **그 외 행이 변했다면 멈추고 원인을 찾는다.**
- [ ] **Step 5: e2e** — `tests/e2e/today.spec.js tests/e2e/plan.spec.js --workers=1`
- [ ] **Step 6: 커밋** — "앱 크롬과 마이페이지·계획의 900 12곳을 …"

---

### Task 5: 이관 3 — 체험·페이월·결제·인증 (16곳)

**Files:**
- Modify: `styles.css` (인벤토리 Task 5 묶음), `fonts.test.mjs` (래칫 −16)

Task 4와 같은 흐름. 다른 점:

- [ ] **Step 1 주의:** `.trial-paywall-open > strong` · `.paywall-sample-open` · `.paywall-return-bar > button`은 CTA 판정 대상이다 — 페이월 카드당 주요 CTA가 하나인지 마크업으로 확인한다. `both` 2곳(`.plan-choice-option .plan-choice-label` · `.auth-provider .naver-mark`)은 랜딩에도 나온다.
- [ ] **Step 2: 16곳 편집**
- [ ] **Step 3: 래칫 −16, `npm test`**
- [ ] **Step 4: 실측 diff** — 변해야 하는 행: `.trial-status-banner *` · `.mypage-usage-*`
- [ ] **Step 5: e2e** — `tests/e2e/paywall-ui.spec.js tests/e2e/pricing.spec.js tests/e2e/auth.spec.js --workers=1` (`both` 2곳이 랜딩에도 걸리므로 pricing이 랜딩 쪽 검증을 겸한다)
- [ ] **Step 6: 커밋** — "체험·페이월·결제·인증의 900 16곳을 …"

---

### Task 6: 이관 4 — 다이어리 북 샘플·결제 확인·글리프 (13곳)

**Files:**
- Modify: `styles.css` (인벤토리 Task 6 묶음), `fonts.test.mjs` (래칫 → 최종값 90, 글리프 판정이 바뀌면 그만큼 조정)

Task 4와 같은 흐름. 다른 점:

- [ ] **Step 1 주의:** 글리프 후보 3곳은 `content` 값을 확인해 판정한다(유지면 리터럴 + 주석). `.sample-book-head h2`·`.sample-book-pages .book-page h2`는 title/display를 실측 크기로 가른다.
- [ ] **Step 2: 편집** — 유지 판정분은 주석만 단다.
- [ ] **Step 3: 래칫을 최종값으로 내리고 검산**

```bash
grep -c "font-weight: 900" styles.css   # = 90 (139 − 이관 49). 글리프 판정이 바뀌었으면 그만큼 다르다
npm test                                 # 458 pass
```

- [ ] **Step 4: 실측 diff** — 이 묶음은 대부분 딥 스테이트라 **무변이 정상**이다.
- [ ] **Step 5: e2e** — `tests/e2e/diary-book.spec.js tests/e2e/paywall-ui.spec.js tests/e2e/tap-targets.spec.js --workers=1` (굵기 축소가 글자 폭을 바꾼다 — #54에서 히트 영역이 44px 밑으로 떨어진 전례 두 번)
- [ ] **Step 6: 커밋** — "다이어리 북 샘플·결제 확인의 900 11곳을 …"

---

### Task 7: 문서 갱신

**Files:**
- Modify: `docs/design-tokens.md` (잔여 수), `docs/artifacts/typography-foundation-measurements.md`, `docs/app-900-migration-design.md` (범위 수 확정), `docs/PROJECT_STATUS.md`

- [ ] **Step 1:** design-tokens.md의 잔여 수를 139에서 실제 최종값으로 내리고, 남은 것(랜딩·관리자·사문 후보)의 분포를 후속 몫으로 명시한다.
- [ ] **Step 2:** measurements 아티팩트에 Task 3–6의 전후 실측 표를 붙인다(스크립트 출력 원문). 올리 스크린샷 경로도 적는다.
- [ ] **Step 3:** 설계 문서의 "약 50곳"을 실제 수로 확정한다.
- [ ] **Step 4:** PROJECT_STATUS.md 갱신. **주의: 이 파일은 여러 브랜치가 동시에 건드린다** — 병합 충돌 시 양쪽 항목을 모두 남긴다.
- [ ] **Step 5:** `npm test` 458 pass 확인 후 커밋 — "앱 표면 900 이관을 문서에 반영한다".

---

## 완료 조건

- `npm test` — 458 pass / 0 fail
- `grep -c "font-weight: 900" styles.css` = 139 − 이관 합계 (유지 각각에 사유 주석)
- 관련 e2e(cheer · mate · modal · today · plan · paywall-ui · pricing · auth · diary-book · tap-targets) 0 failed
- `docs/artifacts/app-900-classification.md` 54행 + 베이스라인 실측 첨부
- 올리 대화 전후 스크린샷이 `docs/artifacts/app-900-ollie-shots/`에 있고, 육안 판단을 커밋 메시지에 적었다
- `docs/design-tokens.md`의 역할 표가 개정되고 판단 보류 서술이 결정으로 바뀌었다
- 문서 4종 갱신
