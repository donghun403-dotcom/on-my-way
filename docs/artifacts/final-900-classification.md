# 마지막 900 분류표 — 남은 42곳

사문 48곳을 지운 뒤 남은 42곳을 판정했다. **이관 30 · 글리프 유지 12.**
배정은 셀렉터 이름이 아니라 마크업과 실측 렌더값이 근거다.

배정 합계: **emphasis 27 · title 2 · display 1 · 글리프 유지 12.**

역할 기준(`docs/design-tokens.md`):

- `--weight-emphasis`(600) — 제목은 아니나 강조하는 문구. 라벨·메타·칩·탭 같은 짧은
  UI 문구와 본문 성격의 강조
- `--weight-title`(700) — 섹션·카드 제목
- `--weight-display`(800) — 화면 제목(H1급)·큰 숫자·주요 CTA.
  선례: "화면의 단일 주요 CTA는 display를 따른다"
- **글리프 유지** — 엘리먼트가 담는 것이 문자 아이콘 하나뿐일 때. `content`가 있는
  의사요소든, `textContent`가 `×`·`✓`·`!`·`♡` 하나인 실제 엘리먼트든 같다

## 랜딩 21곳

| # | 줄 | 셀렉터 | 마크업 근거 | 렌더 | 배정 |
| --- | --- | --- | --- | --- | --- |
| 1 | 528 | `.personality-form button` | `index.html:96` 목표 입력 폼 버튼 | **400** | emphasis |
| 2 | 2294 | `.today-plan-card a` | `index.html:299` 오늘 계획 미리보기 링크 | (초기 미렌더) | emphasis |
| 3 | 6314 | `.builder-header > span` | `index.html:97` 마법사 단계 표시 "1/5" | **800** | emphasis |
| 4 | 6684 | `.summary-head span` | `index.html:226` 라벨 "Live Preview" | 900 | emphasis |
| 5 | 6745 | `.live-summary dd` | `index.html:225` 요약 값 "목표를 입력해 주세요" | 900 | emphasis |
| 6 | 7830 | `.feature-showcase-head > span` | `index.html:345` 진행 표시 "1 / 4" | 900 | emphasis |
| 7 | 7893 | `.feature-number` | `index.html:356` 라벨 "01 · TODAY" | 900 | emphasis |
| 8 | 8004 | `.mini-schedule-row span` | `index.html:367` 시각 "07:00" | 900 | emphasis |
| 9 | 8247 | `.feature-memory-board article span` | `index.html:416` 요일 "MON" | 900 | emphasis |
| 10 | 8305 | `.feature-app-link` | `index.html:441` 섹션 CTA 링크 | 900 | emphasis |
| 11 | 8961 | `.home-page .trial-conversion-path span` | `index.html:435` 단계 번호 "01" | 900 | emphasis |
| 12 | 12406 | `.home-page .pricing-recommended-badge` | `index.html:486` 배지 "추천" | 900 | emphasis |
| 13 | 12425 | `.pricing-plan-kicker` · `.pricing-section-head > div > span` | `index.html:459·521` 키커 "가볍게 시작" · "MY USAGE" | 900 | emphasis |
| 14 | 12448 | `.home-page .pricing-current-marker` | `index.html:462` 상태 칩 "무료 체험 중" | 900 | emphasis |
| 15 | 12605 | `.pricing-plan-cta` · `.pricing-final-actions a`/`button` | `index.html:481` 요금제 카드 CTA | 900 | emphasis |
| 16 | 12782 | `.home-page .pricing-comparison-row dd` | `index.html:549` 비교표 값 "15개" | 900 | emphasis |
| 17 | 12870 | `.pricing-credit-details > summary` · `.pricing-faq details > summary` | `index.html:571·593` 아코디언 제목 | 900 | **title** |
| 18 | 14263 | `.hero-trial-button` | `index.html:71` 히어로 주요 CTA, 18px | 900 | **display** |
| 19 | 16007 | `.pricing-app-return` | `index.html:447` 되돌아가기 링크 | 900 | emphasis |
| 20 | 17190 | `.builder-choice-section > legend` | `index.html:154` fieldset 제목 "실행할 요일" | 900 | **title** |
| 21 | 17369 | `.builder-ghost` | `index.html:196` 보조 버튼 "할 일 추가" | 900 | emphasis |

**캐스케이드에서 지는 선언 2곳** — #1은 400, #3은 800으로 렌더된다. 뒤에 오는 규칙이
이긴다. 배정대로 이관해도 화면은 바뀌지 않는다. 셀렉터만 보고 판정했으면
"900이니까 굵다"로 오판했을 곳이다.

**CTA를 둘로 가른 근거**: 역할 표의 display는 "화면의 **단일** 주요 CTA"다.
랜딩의 그것은 히어로 버튼(#18, 18px)이고, 요금제 카드 CTA(#15)·섹션 링크(#10)·
되돌아가기(#19)·보조 버튼(#21)은 화면의 단일 주요 행동이 아니므로 emphasis다.

## 관리자 8곳

`admin.html`은 인증 게이트라 서버로 열면 앱으로 리다이렉트된다. 실측은 관리자
마크업을 `setContent`로 심고 서버의 `styles.css`를 물려서 했다.

| # | 줄 | 셀렉터 | 마크업 근거 | 렌더 | 배정 |
| --- | --- | --- | --- | --- | --- |
| 22 | 1040 | `.admin-stat-grid em` | `admin.html:48` KPI 델타 "↑ 4.1%" — 큰 숫자는 옆의 `<strong>3,240</strong>`이고 이건 메타 | 900 | emphasis |
| 23 | 1181 | `.admin-table th` | `admin.html:128` 표 머리글 "회원" | 900 | emphasis |
| 24 | 1203 | `.status-pill` | `admin.html:163` 상태 칩 "3일 미접속" | 900 | emphasis |
| 25 | 1327 | `.admin-health-strip small` | `admin.html:57` 라벨 "샘플 · 이탈 방어" | 900 | emphasis |
| 26 | 1359 | `.admin-funnel-visual span` | `admin.html:65` 퍼널 단계 라벨 "랜딩 방문" | 900 | emphasis |
| 27 | 1368 | `.retention-summary small` | `admin.html:77` 라벨 "D1" | 900 | emphasis |
| 28 | 1421 | `.plan-pill` | `admin.html:163` 플랜 칩 "Pro" | 900 | emphasis |
| 29 | 1431 | `.admin-password-change-form button` | `admin.html:183` 폼 버튼 | 900 | emphasis |

## script.js가 만드는 1곳

| # | 줄 | 셀렉터 | 마크업 근거 | 렌더 | 배정 |
| --- | --- | --- | --- | --- | --- |
| 30 | 17255 | `.task-builder-item label` | `script.js:3151`이 `row.className = "task-builder-item"`으로 만든다. 라벨 "시간" | 900 | emphasis |

## 글리프 유지 12곳

텍스트 위계가 아니라 문자 아이콘이다. 900 리터럴 + 사유 주석으로 남긴다.

| # | 줄 | 셀렉터 | 글리프 | 주석 |
| --- | --- | --- | --- | --- |
| 31 | 5580 | `.auth-trust-list span::before` | `content: "✓"` | 있음 |
| 32 | 5650 | `.mypage-benefit-list li::before` | `content: "✓"` | 있음 |
| 33 | 9200 | `.trial-paywall-card li::before` | `content: "✓"` | 있음 |
| 34 | 10211 | `.execution-page .execution-checklist .execution-check::after` | `content: "✓"` | 있음 |
| 35 | 10958 | `.execution-page .calendar-day-detail-list i` | `<i>`가 담는 "✓" | 있음 |
| 36 | 7290 | `.journey-stop:not(:last-child)::after` | `content: "›"` | **필요** |
| 37 | 7321 | `.journey-stop.done:not(.current) .journey-scene::after` | `content: "✓"` | **필요** |
| 38 | 8953 | `.home-page .trial-conversion-path li:not(:last-child)::after` | `content: "›"` | **필요** |
| 39 | 12566 | `.home-page .pricing-plan-benefits .pricing-benefit-copy::before` | `content: "✓"` | **필요** |
| 40 | 12821 | `.home-page .pricing-credit-grid article > span` | `♡ ✦ ↻ ↗ ≋ ▤` — 34×34 `place-items:center` 박스 (`index.html:566`) | **필요** |
| 41 | 1330 | `.health-icon` | `! ↗ ✓` — 38×38 `place-items:center` 박스 (`admin.html:57-59`) | **필요** |
| 42 | 17303 | `.task-remove-button` | `×` — `script.js:3204`가 `textContent`로 넣는다. 28px 원형 버튼 | **필요** |

### 의사요소가 아닌 글리프 캐리어 3곳

#40·#41·#42는 `::before`가 아니라 실제 엘리먼트다. 판정 기준은 셀렉터 모양이 아니라
**담는 것이 문자 아이콘 하나뿐인가**다. 셋 다 고정 크기 박스에 한 글자를 가운데
놓는다 — `.calendar-day-detail-list i`(#35, 지난 라운드)와 같은 형태다.

### 카운터는 글리프가 아니었다

`.result-week-list li::before`는 `content: counter(result-week)`로 **숫자**를 그렸다.
문자 아이콘이 아니라 카운터라 글리프로 부르면 계약 테스트의 의미가 흐려진다.
다만 판정할 필요가 없어졌다 — `result-week-list` 클래스가 저장소 어디에도 없어
사문으로 삭제됐다(`final-900-deletion-report.md`).
