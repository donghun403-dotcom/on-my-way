# 앱 표면 900 분류표

기준: `docs/execution-900-migration-plan.md`가 아니라 `docs/app-900-migration-plan.md`의
분류 규칙. **`--weight-emphasis`의 정의가 개정돼 본문 성격의 강조가 여기 들어온다**
(`docs/design-tokens.md`, 커밋 2a3a926).

근거 열은 `app.html`·`script.js`(일부 `index.html`)에서 grep으로 확인한 실제 마크업이다.
셀렉터 이름만 보고 판정한 행은 없다. CTA 판정 기준점: 기존 `.focus-start-button` ·
`.save-memory-button` · `.diary-book-create`가 이미 `--weight-display`다.

54행 = 900 선언 52 + 판단 보류 2(이미 토큰이라 래칫에 영향 없음).

## Task 3 — 올리 대화·토스트 (11 + 판단 보류 2)

| # | 셀렉터 | 마크업 근거 | 배정 | 메모 |
| --- | --- | --- | --- | --- |
| 1 | `.chat-bubble > span` | `name.textContent = "올리"` — 말풍선의 발화자 이름표, 12px (script.js:7612) | emphasis | |
| 2 | `.chat-bubble-headline` | `<p>turn.headline</p>`, 14px — 바로 아래 `.chat-bubble-text`도 14px (script.js:7617) | **emphasis** | 크기가 본문과 같다. 섹션 제목이 아니라 **말풍선 첫 줄** — 개정된 "본문 성격의 강조" |
| 3 | `.chat-input-label span` | `<span class="chat-input-cost">메시지 1개 = 에너지 …</span>` (app.html:1000) | emphasis | 입력창 비용 라벨 |
| 4 | `.chat-mood-options button` | 좋음/보통/힘듦 기분 칩 (app.html:977) | emphasis | |
| 5 | `.chat-energy` | 헤더의 남은 에너지 배지 버튼 (app.html:950) | emphasis | |
| 6 | `.chat-consent-agree` | `"동의하고 대화 시작하기"` — 동의 화면의 주 버튼, 옆에 `.chat-consent-decline` (app.html:968) | **display** | 그 화면의 단일 주요 CTA |
| 7 | `.chat-actions button` | 올리가 제안한 다음 행동 칩 (app.html:995, script 생성) | emphasis | |
| 8 | `.chat-recharge-link` | `"Pro는 월 … 매달 에너지 …"` 충전 안내 링크 (app.html:1008) | emphasis | |
| 9 | `.ollie-energy-warning button` | 크레딧 경고 배너의 `"이용 안내"` 버튼 (app.html:244) | emphasis | 배너 안 보조 동작 |
| 10 | `.ollie-celebration-stamp` | `<b>참 잘했어요</b>` 축하 도장 (app.html:1153) | **display** | 축하 카드의 주 문구 — 도장 성격의 큰 표시 |
| 11 | `.companion-stats span` | `<span>기분 <strong>기대</strong></span>` 메이트 상태 칩 (app.html:699) | emphasis | **캐스케이드 패: 실제 렌더 500.** 같은 셀렉터의 뒤 규칙(styles.css:5436 그룹, `font-weight:500`)이 동일 특정성으로 이긴다. 이관해도 화면 변화 없음 |
| 12 | `.ollie-message p` / `.ollie-chat-preview p` | 올리 말풍선 본문, 20px (styles.css:2432) | emphasis | **판단 보류 해소** — 현재 `var(--weight-title)`. 900 아님 |
| 13 | `.app-toast` | 토스트 문구 (styles.css:4906 블록) | emphasis | **판단 보류 해소** — 현재 `var(--weight-title)`. 900 아님 |

## Task 4 — 앱 크롬·마이페이지·계획 (12)

| # | 셀렉터 | 마크업 근거 | 배정 | 메모 |
| --- | --- | --- | --- | --- |
| 14 | `.plan-badge` | `<span class="drawer-plan-badge">체험 중</span>` 계열 배지, 12px (app.html:74) | emphasis | |
| 15 | `.card-title span` | `<h2>오늘의 일정</h2><span>순서대로…</span>` 부제, 13px (app.html:304) | emphasis | **앱에서는 캐스케이드 패**(전부 `.card-title.compact` → styles.css:5436이 500). **관리자의 비-compact `card-title` 10곳에서는 살아 있다** — 사문 아님 |
| 16 | `.text-button` | `"모두 완료"` 텍스트 버튼, 12px (app.html:327) | emphasis | **캐스케이드 패: 실제 렌더 700.** 뒤 동일 셀렉터(styles.css:5287)가 `font-weight:700`으로 이긴다 |
| 17 | `.calendar-weekdays span` | `<span><img/><em>월</em></span>` 요일 셀, 11px (app.html:467) | emphasis | #55가 `.execution-page .calendar-weekdays em`을 emphasis로 이관했다 — 일치 |
| 18 | `.calendar-day span` | 날짜 셀 안 보조 표기, text-2xs (app.html, script 생성) | emphasis | #55의 `.execution-page .calendar-day > small`(emphasis)과 일치. 날짜 숫자(`strong`)는 #55에서 title |
| 19 | `.execution-tabbar a` | 하단 탭바 항목, 15px (app.html:905) | emphasis | 탭은 규칙 표가 명시한 emphasis 대상 |
| 20 | `.plan-preview-list article > span` | 계획 요약 카드의 라벨, 12px (app.html:509, script 생성) | emphasis | |
| 21 | `.revision-quick-actions button` | `"시간 바꾸기"` 등 빠른 수정 칩, 12px (app.html:602) | emphasis | |
| 22 | `.focus-mode-actions button` | 집중 시작/일시정지/완료, 14px (app.html:1141) | emphasis | 셋이 나란한 동등 컨트롤 — 단일 CTA 아님. `.primary` 하위가 따로 있으면 그쪽이 강조를 맡는다 |
| 23 | `#focusTimer` | `<span id="focusTimer">15:00</span>`, **44px** (app.html:1129) | **display** | 규칙 표의 "큰 숫자" |
| 24 | `.journey-map span` | 여정 지도 안 라벨, 11px (app.html:709) | emphasis | 실측 900 — 살아 있다 |
| 25 | `.execution-theme-button` | 테마 전환 버튼 (script.js:277이 참조) | emphasis | 보조 컨트롤 |

## Task 5 — 체험·페이월·결제·인증 (16)

| # | 셀렉터 | 마크업 근거 | 배정 | 메모 |
| --- | --- | --- | --- | --- |
| 26 | `.trial-status-banner > span` | `<span>무료 체험 중</span>` + `<strong>종료 시각</strong>` (app.html:250) | emphasis | 킥커 짝 |
| 27 | `.trial-status-banner a` | `"플랜 비교"` 링크 (app.html:250) | emphasis | |
| 28 | `.trial-paywall-card > span` | `<span id="trialPaywallKicker">체험이 끝났어요</span>` + `<h2>` (app.html:1169) | emphasis | 킥커 짝 |
| 29 | `.trial-paywall-card > a` | 페이월 카드 안 링크 | emphasis | |
| 30 | `.paywall-sample > strong` | `<strong>매달 내 기록이 이런 책이 됩니다</strong>` (app.html:1178) | **title** | 샘플 블록의 제목 |
| 31 | `.paywall-sample > p b` | `<b>가상의 기록으로 만든 샘플</b>` — 문장 안 강조 (app.html:1178) | emphasis | 표시광고법 고지의 핵심어. **문장 안 강조 = 개정된 emphasis 자리** |
| 32 | `.paywall-sample-open` | `"샘플 북 미리보기"` 버튼 (app.html:1181) | emphasis | 페이월의 주 CTA는 결제 쪽이다 — 이건 보조 |
| 33 | `.trial-paywall-open > strong` | `<strong>결제하지 않아도 이건 그대로예요</strong>` (app.html:1190) | **title** | 블록 제목 |
| 34 | `.paywall-return-bar > button` | `"안내 다시 보기"` 복귀 바 버튼 (app.html:1223) | emphasis | |
| 35 | `.auth-sheet-gate-notice b` | 체험 조건 고지 문장 안 `<b>` 강조 (app.html:162) | emphasis | 표시광고법 고지. **문장 안 강조** |
| 36 | `.app-personality-fields label` | 생년월일·출생 시간 등 폼 라벨 (app.html:227) | emphasis | |
| 37 | `.mypage-usage-heading span` | `<span>AI CREDITS</span><strong>AI 크레딧 사용량</strong>` (app.html:192) | emphasis | 킥커 짝 |
| 38 | `.mypage-usage-row span` | `<span>오늘</span><strong>—</strong>` 사용량 행 라벨 (app.html:196) | emphasis | |
| 39 | `.admin-password-form > div:first-child span` | `<span>ADMIN ACCESS</span><strong>관리자 전용 로그인</strong>` (app.html:153) | emphasis | 킥커 짝. letter-spacing .12em |
| 40 | `.plan-choice-option .plan-choice-label` | `<span class="plan-choice-label">방금 만든 계획으로 시작</span>` (app.html:105) | emphasis | **both** — 랜딩에도 렌더. 선택 버튼의 라벨 |
| 41 | `.auth-provider .naver-mark` | 네이버 로그인 버튼의 마크 (app.html:134) | emphasis | **both**. 글자 마크("N")이지만 `content` 글리프가 아니라 요소라 토큰 대상 |

## Task 6 — 다이어리 북 샘플·결제 확인·글리프 (13)

| # | 셀렉터 | 마크업 근거 | 배정 | 메모 |
| --- | --- | --- | --- | --- |
| 42 | `.diary-book-locked-actions a` | `"Pro 시작하기"` 링크 — 옆에 `.is-quiet` 보조 버튼 (app.html:858) | emphasis | 잠금 안내 블록의 링크 |
| 43 | `.sample-book-head h2` | `<h2 id="sampleBookTitle">올리 다이어리 북 샘플</h2>` (app.html:1206) | **title** | 다이얼로그 제목(aria-labelledby 대상) |
| 44 | `.sample-book-badge` | `<span class="sample-book-badge">샘플</span>` (app.html:1208) | emphasis | 배지 |
| 45 | `.sample-book-head button` | `"닫기"` (app.html:1214) | emphasis | |
| 46 | `.sample-book-pages .book-page h2` | 책 지면의 `<h2>` (script 생성) | **title** | 지면 제목 |
| 47 | `.sample-book-pages .book-day header strong` | 날짜 헤더 (script 생성) | emphasis | 지면 안 메타 |
| 48 | `.sample-book-foot a` | `"Pro 시작하기"` (app.html:1215) | emphasis | 푸터 링크 |
| 49 | `.billing-confirm-card > span` | `<span>Pro 정기결제</span>` + `<h2>` (app.html:1229) | emphasis | **both**. 킥커 짝 |
| 50 | `.billing-confirm-actions button` | `"… 결제하고 Pro 시작"`(`.primary`) + `"계속 둘러보기"` (app.html:1233) | emphasis | **both**. 포괄 규칙이라 두 버튼 모두에 걸린다 — 주 CTA 강조는 `.primary` 하위 규칙이 맡는다 |
| 51 | `.energy-pack em` | 크레딧 목록 항목 (app.html:1029) | emphasis | **both** |
| 52 | `.mypage-benefit-list li::before` | `content: "✓"` (styles.css:6346) | **유지(리터럴)** | 글리프 |
| 53 | `.trial-paywall-card li::before` | `content: "✓"` (styles.css:10428) | **유지(리터럴)** | 글리프 |
| 54 | `.auth-trust-list span::before` | `content: "✓"` (styles.css:6277) | **유지(리터럴)** | 글리프. **both** |

## 합계

| 배정 | 수 |
| --- | --- |
| emphasis (600) | 41 |
| title (700) | 4 |
| display (800) | 4 |
| **유지(리터럴)** | **3** |
| 판단 보류 해소(이미 토큰, 900 아님) | 2 |

900 선언 52 = 41 + 4 + 4 + 3. 이관 대상 **49**(52 − 글리프 3).
→ 이관 후 잔여 = 139 − 49 = **90**.

## 캐스케이드에서 지는 선언 3곳

측정에서 드러났다. 배정대로 이관하되 **화면 변화는 없다.** 남겨두면 래칫이 헛수를 지킨다.

| 셀렉터 | 실측 | 이기는 규칙 |
| --- | --- | --- |
| `.card-title span` | 500 (today 탭) | `.card-title.compact span`(styles.css:5436 그룹) — 앱은 전부 compact. **관리자의 비-compact 10곳에서는 이 900이 살아 있다** |
| `.companion-stats span` | 500 | 같은 5436 그룹 — 동일 특정성, 뒤에 있어 이긴다 |
| `.text-button` | 700 | `.text-button`(styles.css:5287) — 동일 셀렉터, 뒤에 있어 이긴다 |

## 베이스라인 실측 (이관 전, 390×844)

`BASE=http://127.0.0.1:8769 node scripts/measure-execution-weights.cjs` 출력 원문.
측정 14/37 — 900이 아닌 행은 위 캐스케이드 표 또는 #55에서 이미 이관된 것이다.

| selector | view | font-weight | font-size |
| --- | --- | --- | --- |
| `.bond-reaction` | mate | 600 | 11px |
| `.card-title span` | today | 500 | 13px |
| `.companion-next-inline small` | mate | 600 | 11px |
| `.companion-relationship-heading > span` | mate | 600 | 11px |
| `.companion-relationship-summary dd` | mate | 600 | 11px |
| `.companion-stats span` | mate | 500 | 11px |
| `.companion-touch-secondary` | mate | 600 | 12px |
| `.journey-map span` | mate | 900 | 11px |
| `.journey-pro-link` | mate | 600 | 11px |
| `.memory-kicker` | memory | 600 | 11px |
| `.memory-mood-picker button` | memory | 600 | 11px |
| `.memory-mood-picker legend` | memory | 600 | 11px |
| `.save-memory-button` | memory | 800 | 12px |
| `.text-button` | today | 700 | 11px |
