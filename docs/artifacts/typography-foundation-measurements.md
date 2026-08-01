# 타이포그래피 기반 공사 — 4개 화면 실측

Pretendard 전환(Task 1~4) 직후, **무엇을 더 고칠지를 추측이 아니라 측정으로 정하기 위해**
지적된 4개 화면을 실제로 렌더링해 굵기와 글꼴 다운로드를 잰 기록이다.

- 측정일: 2026-07-31
- 방법: Playwright(chromium, headless) + 기존 e2e 자산(`tests/e2e/helpers.js`의
  `prepareApp` / `completeManualPlan`) 재사용. 로컬 정적 서버(`node serve-local.cjs`).
- 측정 폭: 조합 수집 390px·1440px / 스크린샷 320·390·430·1440px

| # | 화면 | 도달 경로 |
| --- | --- | --- |
| ① | 온보딩 조건 입력 | `/index.html#designFlow` |
| ② | 온보딩 1차 계획 보기 | ①에서 `completeManualPlan()` 완주 |
| ③ | 앱 오늘 탭 | `prepareApp()` → `/app.html` → `#tab-today` |
| ④ | 앱 계획 탭 | 이어서 `#tab-plan` |

---

## 0. 측정하며 걸린 함정 — 전이(transition)가 캐스케이드 위에 있다

CSSOM으로 규칙 값을 바꿔 놓고 **같은 tick에** `getComputedStyle()`을 읽으면 바뀌기 전 값이
돌아온다. `styles.css`가 `transition: all`을 광범위하게 걸어 두었고(`prefers-reduced-motion:
reduce`에서도 `1e-05s`로 남는다), CSS 전이는 캐스케이드에서 **인라인 `!important`보다도 위**라
방금 시작된 전이의 시작 값이 이긴다.

이걸 모르면 "이 규칙은 캐스케이드에서 지고 있다"고 **정반대로** 읽게 된다. 실제로 첫 측정에서
900 규칙 34개가 4개로 잘못 집계됐다. 규칙 단위 측정을 다시 할 때는 먼저 전이를 끈다:

```js
document.head.append(Object.assign(document.createElement("style"), {
  textContent: "*,*::before,*::after{transition:none !important;animation:none !important}",
}));
```

---

## 1. 900이 실제로 렌더링되는 곳

`styles.css` 전체에서 `font-weight: 900`은 문자열로 238번 매칭되지만, 그중 하나는 캐스케이드를
설명하는 주석 안의 예시 문구(`.execution-page .focus-start-button` 관련 설명, 실제 선언이 아님)라
**실제 선언은 237개**다. 그중 **4개 화면에서 실제로 렌더링되고 캐스케이드까지 이기는 규칙은
34개**였다. 나머지는 이 화면에 나타나지 않거나, 더 구체적인 다른 규칙에 가려져 화면에 영향을
주지 않는다.

가려진 예 두 가지 — 둘 다 옮기지 않았다(옮겨도 화면이 바뀌지 않는다):

- `.personality-form button` — `.builder-actions button`이 이긴다
- `.companion-primary-actions button, .focus-start-button, …` — `.execution-page .focus-start-button`이 이긴다

### 옮긴 34곳

역할 기준은 `docs/typography-foundation-design.md`의 역할표를 따랐다.
**화면 제목(H1급)·큰 숫자·주요 CTA → `--weight-display`(800), 그 밖의 라벨·메타·칩·
섹션 제목·보조 버튼 → `--weight-title`(700).**

전환 전 폴백 글꼴에는 900 페이스가 없어 700·800·900이 전부 같은 굵기로 그려졌다. 즉
**700으로 내리는 것은 Pretendard 이전의 겉모습으로 되돌리는 것**이고, 600까지 내리면 이 앱이
한 번도 가진 적 없는 굵기가 된다. 그래서 라벨류도 600이 아니라 700으로 옮겼다.

| 셀렉터 | 화면 | 크기 | 옮긴 값 |
| --- | --- | --- | --- |
| `.builder-actions button` | ① | 11/13px | `--weight-display` (주요 CTA "다음 단계") |
| `.execution-page .focus-start-button` | ③ | 11px | `--weight-display` (주요 CTA "지금 시작하기") |
| `.ollie-message span, .ollie-chat-preview span, .today-plan-card span, .tomorrow-card span` | ①② | 12px | `--weight-title` |
| `.ollie-message p, .ollie-chat-preview p` | ① | 12/15px | `--weight-title` |
| `.home-page .hero-poster span, .home-page .eyebrow` | ① | 11px | `--weight-title` |
| `.builder-field` | ① | 12px | `--weight-title` |
| `.analysis-header span, .analysis-grid span` | ② | 13px | `--weight-title` |
| `.result-section-head > span` | ② | 11px | `--weight-title` |
| `.result-schedule-list time` | ② | 11px | `--weight-title` |
| `.result-details-disclosure > summary strong` | ② | 12px | `--weight-title` |
| `.app-toast` | ② | 13px | `--weight-title` |
| `.card-title.compact strong, .soft-badge` | ③ | 11/12px | `--weight-title` |
| `.eyebrow` | ③ | 13px | `--weight-title` |
| `.coach-card-chat` | ③ | 13px | `--weight-title` |
| `.execution-page .task-period` | ③ | 11px | `--weight-title` |
| `.execution-page .task-edit-button` | ③ | 11px | `--weight-title` |
| `.execution-page .schedule-mode-switch button` | ③ | 11px | `--weight-title` |
| `.execution-page .schedule-list-toggle, .execution-page .today-tools > summary` | ③ | 12px | `--weight-title` |
| `.execution-page .today-progress-details > summary` | ③ | 11px | `--weight-title` |
| `.execution-page .today-plan-adjust-button` | ③ | 11px | `--weight-title` |
| `.execution-page .today-next-action > div:first-child > span` | ③ | 11px | `--weight-title` |
| `.execution-page .plan-criteria-card dt` | ④ | 11px | `--weight-title` |
| `.execution-page .plan-range-switch button` | ④ | 16px | `--weight-title` |
| `.execution-page .view-head > div > span` | ④ | 11px | `--weight-title` |
| `.execution-page .plan-overview-head > div > span` | ④ | 11px | `--weight-title` |
| `.execution-page .plan-overview-status` | ④ | 11px | `--weight-title` |
| `.execution-page .plan-roadmap-summary > div > span` | ④ | 11px | `--weight-title` |
| `.execution-page .plan-schedule-list > details > summary` | ④ | 11px | `--weight-title` |
| `.weekly-plan li span` | ④ | 11px | `--weight-title` |
| `.footer-brand-block span` | ①②③④ | 12px | `--weight-title` |
| `.energy-charge-button` | ③④ | 12px | `--weight-title` |
| `.energy-charge-button em` | ③④ | 11px | `--weight-title` |
| `.menu-toggle` | ③④ | 16px | `--weight-title` |
| `.execution-page .execution-tabbar .tab.active` (`@media (max-width:759px)`) | ③④ | 16px | `--weight-title` |

옮긴 뒤 재측정: **4개 화면에서 900을 선언하고 이기는 규칙 0개.**

> **정정 (Task 5b 라운드 1, `01b6aae` 이후).** 위 표의 "옮긴 값" 열은 Task 5 커밋(`3b10904`)
> 시점 기준이다. 이후 재리뷰에서, 3단계 역할표 중 "라벨·메타·칩·탭처럼 짧은 UI 문구"
> (`--weight-emphasis`, 600) 단계가 이 절 서두의 브리프 인용에서 빠져 있었다는 지적이 나왔다.
> 그 결과 위 표의 `--weight-title` 32곳 중 30곳이 실제로는 세 번째 단계에 해당해, `styles.css`에서
> `--weight-emphasis`로 다시 옮겼다. `.builder-actions button`·`.execution-page
> .focus-start-button`의 `--weight-display`와 `.ollie-message p, .ollie-chat-preview p`·
> `.app-toast`의 `--weight-title`(판단 보류)만 유지했다. 위 표는 Task 5 당시 측정 기록 그대로
> 남기고, 선택자별 재판단 근거와 HTML 검증은 `task-5b-report.md`의 "Task 5 수정 라운드 1"
> 절에 표로 남겼다.

### 남긴 것 — 판단 보류

| 대상 | 이유 |
| --- | --- |
| `.today-summary-line > strong#todaySummaryGoal` (③, 11–12px, 900) | `styles.css`의 900이 아니라 **UA 스타일시트의 `<strong> { font-weight: bolder }`** 가 700인 부모에 대해 900으로 해석된 결과다. 없애려면 새 규칙을 추가해야 하고, 그건 "이미 있는 900을 옮긴다"의 범위를 넘는다. 주변 700 사이에서 목표 이름을 강조하는 효과라 그대로 둔다. |
| `.coach-card-chat > b` (③, 13px, 900) | 위와 같다. `<b>`의 `bolder`가 700 부모에서 900이 된다. 옮기기 전에도 900이었고(부모가 900), 지금도 900이라 화면 변화는 없다. |
| `styles.css`에 남은 900 선언 203곳 | 4개 화면에 나타나지 않거나(대부분), 나타나도 더 구체적인 규칙에 가려 화면에 영향이 없다. 이 계획의 A·B 단계로 넘긴다. 렌더링을 보지 않은 채 일괄 변환하지 않는다. |

---

## 2. 화면별 (font-size, font-weight) 조합 — 옮긴 뒤

수집 기준: 자기 자신이 텍스트 노드를 가지고 있고 `getClientRects()`가 있는 요소.

### ① 온보딩 조건 입력

| 390px | | 1440px | |
| --- | --- | --- | --- |
| 12px / 700 ×9 | "올리" | 12px / 700 ×8 | "올리" |
| 11px / 800 ×7 | "✓ 카드 등록 없음" | 13px / 600 ×7 | "📘시험" |
| 13px / 600 ×7 | "📘시험" | 15px / 600 ×7 | "📘" |
| 15px / 600 ×7 | "📘" | 11px / 800 ×6 | "✓ 카드 등록 없음" |
| 11px / 700 ×6 | "✓ 지금 정하는 건 초안이에요…" | 11px / 700 ×6 | "✓ 지금 정하는 건 초안이에요…" |
| 13px / 700 ×2 | "내 계획 직접 만들기" | 13px / 700 ×2 | "내 계획 직접 만들기" |
| 31.2px / 700 ×2 | "무엇을 이루고 싶나요?" | 21px / 700 ×1 | "무엇을 시작해볼까요?" |
| 12px / 800 ×1 | "1/5" | 19px / 700 ×1 | "무엇을 이루고 싶나요?" |
| 12px / 400 ×1 | "계획은 내가 직접 만들고…" | 15px / 700 ×1 | "이루고 싶은 일을 편하게…" |
| 10px / 700 ×1 | "선택" | 13px / 800 ×1 | "다음 단계" |
| 24px / 600 ×1 | "Olive&Rich" | 12px / 800 ×1 | "1/5" |
| 11px / 600 ×1 | "© 2026 Olive&Rich…" | 13px / 400 ×1 | "계획은 내가 직접 만들고…" |
| | | 10px / 700 ×1 | "선택" |
| | | 32px / 600 ×1 | "Olive&Rich" |
| | | 11px / 600 ×1 | "© 2026 Olive&Rich…" |

### ② 온보딩 1차 계획 보기

두 폭이 거의 같다(제목 크기만 17px↔21px, CTA 16px↔20px).

| 조합 | 예시 |
| --- | --- |
| 11px / 700 ×24 | "(총 64–90일)" |
| 11px / 400 ×10 | "정한 시간과 요일에 그대로…" |
| 11px / 800 ×9 | "루틴 점검형" |
| 16px / 400 ×8 | "←" |
| 13px / 800 ×7 | "Day 1" |
| 13px / 700 ×7 | "전체 7일 보기 →" |
| 12px / 800 ×6 | "3/3" |
| 16px / 700 ×5 | "전체 로드맵" |
| 12px / 700 ×5 | "내 계획 자세히 보기" |
| 13px / 400 ×3 | "월요일 · 단어 40개 외우기…" |
| 17px(21px) / 700 ×1 | "1차 계획 보기" |
| 16px(20px) / 800 ×1 | "간편 로그인하고 무료 체험 시작" |
| 15px / 800 ×1 | "3개월 안에 토익 900점 달성하기" |
| 20px / 700 ×1 | "단어 40개 외우기" |
| 14px / 700 ×1 | "계획 완성! 간편 로그인하면…" |
| 12px / 600 ×1 | "내가 직접 만든 나의 계획이에요" |
| 17px / 400 ×1 | "🚀" |
| 24px(32px) / 600 ×1 | "Olive&Rich" |
| 11px / 600 ×1 | "© 2026 Olive&Rich…" |

### ③ 앱 오늘 탭

| 390px | | 1440px | |
| --- | --- | --- | --- |
| 11px / 700 ×31 | "로그인 필요" | 11px / 700 ×39 | "로그인 필요" |
| 12px / 700 ×4 | "＋" | 12px / 700 ×5 | "＋" |
| 11px / 600 ×4 | "07:00" | 11px / 600 ×4 | "07:00" |
| 13px / 400 ×3 | "첫 행동 10분 실행하기" | 17px / 400 ×4 | "⌂" |
| 13px / 700 ×3 | "이번 주 계획 보기" | 11px / 800 ×3 | "AI 크레딧" |
| 17px / 400 ×3 | "🗓" | 13px / 400 ×3 | "첫 행동 10분 실행하기" |
| 18px / 700 ×2 | "오늘의 일정" | 13px / 700 ×3 | "이번 주 계획 보기" |
| 11px / 800 ×2 | "남은 일정 3개" | 34px / 700 ×2 | "E2E 목표 완주하기" |
| 13px / 500 ×2 | "0% 완료 · 3개 남음" | 24px / 700 ×2 | "오늘의 일정" |
| 16px / 400 ×2 | "가장 작은 첫 산출물을…" | 13px / 500 ×2 | "0% 완료 · 3개 남음" |
| 26px / 800 ×1 | "오늘" | 16px / 400 ×2 | "가장 작은 첫 산출물을…" |
| 34px / 700 ×1 | "0%" | 38px / 800 ×1 | "오늘" |
| 20px / 700 ×1 | "첫 행동 10분 실행하기" | 50px / 700 ×1 | "첫 행동 10분 실행하기" |
| 19px / 700 ×1 | "오늘은 유지하는 것만으로도…" | 19px / 700 ×1 | "오늘은 유지하는 것만으로도…" |
| 17px / 700 ×1 | "⌂" | 12px / 800 ×1 | "남은 일정 3개" |
| 15px / 700 ×1 | "☰" | 15px / 700 ×1 | "☰" |
| 16px / 500 ×1 | "＋" | 16px / 500 ×1 | "＋" |
| 14px / 600 ×1 | "오늘 계획, 올리와 조정하기" | 14px / 600 ×1 | "오늘 계획, 올리와 조정하기" |
| 11px / 400 ×1 | "◆" | 11px / 400 ×1 | "◆" · 11px / 500 ×1 "0/3 완료" |
| 24px / 600 ×1 | "Olive&Rich" | 32px / 600 ×1 | "Olive&Rich" · 25px / 400 ×1 "♢" |
| **11px / 900 ×1** | "E2E 목표 완주하기" (UA `bolder`) | **12px / 900 ×1** | "E2E 목표 완주하기" (UA `bolder`) |
| **13px / 900 ×1** | "→" (UA `bolder`) | **13px / 900 ×1** | "→" (UA `bolder`) |

### ④ 앱 계획 탭

| 390px | | 1440px | |
| --- | --- | --- | --- |
| 11px / 700 ×80 | "로그인 필요" | 11px / 700 ×84 | "로그인 필요" |
| 11px / 400 ×30 | "◆" | 11px / 400 ×30 | "◆" |
| 15px / 700 ×8 | "☰" | 15px / 700 ×8 | "☰" |
| 16px / 400 ×7 | "•" | 11px / 800 ×7 | "AI 크레딧" |
| 11px / 800 ×5 | "전체 기간" | 16px / 400 ×7 | "•" |
| 12px / 700 ×3 | "＋" | 12px / 700 ×6 | "＋" |
| 17px / 400 ×3 | "⌂" | 17px / 400 ×4 | "⌂" |
| 20px / 700 ×2 | "E2E 목표 완주하기" | 28px / 700 ×1 | "E2E 목표 완주하기" |
| 22px / 500 ×2 | "›" | 22px / 500 ×2 | "›" |
| 13px / 700 ×2 | "다가오는 일정" | 13px / 700 ×2 | "다가오는 일정" |
| 16px / 700 ×2 | "주간" | 16px / 700 ×2 | "주간" |
| 27px / 700 ×1 | "내 계획" | 44px / 700 ×1 | "내 계획" |
| 17px / 700 ×1 | "🗓" | 20px / 700 ×1 | "목표까지 가는 마일스톤" |
| 24px / 600 ×1 | "Olive&Rich" | 13px / 400 ×1 | "핵심만 확인하고…" |
| 11px / 600 ×1 | "© 2026 Olive&Rich…" | 32px / 600 ×1 | "Olive&Rich" |

**900은 ③의 두 곳(UA `bolder`)을 빼면 4개 화면 어디에도 남아 있지 않다.**

---

## 3. 첫 화면이 실제로 내려받는 Pretendard subset

벤더된 dynamic subset은 92개지만 첫 화면이 실제로 받는 것은 그중 일부다.
(390×844, 캐시 없는 새 컨텍스트, `document.fonts.ready` 이후 `PerformanceResourceTiming` 기준)

| 화면 | 내려받은 subset | 합계(encoded) |
| --- | --- | --- |
| `/index.html` | **10개** | **259,052 B** (약 253 KB) |
| `/app.html` | **12개** | **309,504 B** (약 302 KB) |

요청 순서(먼저 요청된 순):

- `index.html` — **91**, **90**, 89, 88, 87, 86, 79, 85, 84, 82
- `app.html` — 77, 88, **90**, **91**, 0, 87, 89, 86, 84, 79, 85, 68

`index.html`은 **subset 91**(37,996 B)·**subset 90**(20,852 B)이 요청 순서 1·2번으로 자연히
먼저 온다. 반면 `app.html`은 77·88이 먼저 오고 91·90은 3·4번째다 — **자연 순서가 아니라
preload를 걸어야** 91·90이 앞으로 온다. 그래도 이 둘을 고른 이유는 둘 다 상대 화면에서도
반드시 쓰이는 공통 subset이기 때문이다. 그래서 이 둘만 preload 대상으로 골랐다.

```html
<link rel="preload" href="assets/fonts/pretendard/PretendardVariable.subset.91.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="assets/fonts/pretendard/PretendardVariable.subset.90.woff2" as="font" type="font/woff2" crossorigin />
```

`index.html`·`app.html` 양쪽에 넣었다. **추측으로 늘리지 않는다** — preload한 subset이 쓰이지
않으면 그만큼 순수한 낭비다. 넣은 뒤 재측정에서 두 화면의 다운로드 개수와 총 바이트는
그대로였고(10개/259,052 B, 12개/309,504 B) 91·90이 요청 순서 1·2번으로 올라왔다.

---

## 4. 눈으로 확인한 것

320 / 390 / 430 / 1440 네 폭 × 4개 화면 = 16장을 옮기기 전후로 찍어 픽셀 단위로 비교했다.

- **리플로우 없음.** 16쌍 모두 before/after의 전체 문서 크기가 완전히 동일했다.
  Pretendard는 폴백과 자폭이 다르지만, 이번 변경은 굵기만 바꿔서 줄바꿈이 달라진 곳이 없다.
  넘치거나 잘린 곳도 없다.
- **제목이 얇아진 곳 없음.** 화면 제목("오늘" 26/38px, "내 계획" 27/44px, "무엇을
  이루고 싶나요?" 19/31.2px)은 Task 3·4에서 이미 `--weight-display`/`--weight-title`을
  받고 있어 이번 변경의 대상이 아니었고, 픽셀 비교에서도 변화가 없었다.
- **가장 크게 좋아진 곳**: 온보딩 ①의 올리 말풍선. `.ollie-message p`가 **문장 전체를 900으로**
  찍고 있었다("이루고 싶은 일을 편하게 적어 주세요. 계획은 올리가 아니라 내가 직접
  만들어요."). 700으로 내려 본문답게 읽힌다. 같은 규칙 아래 목표 입력창의 플레이스홀더·
  입력값도 900 → 700이 됐다.
- **라벨류**: "전체 계획 조정", "오늘의 한 걸음", "☀ 아침", "수정", "일정 도구",
  "자세히 보기", "MY PLAN", "현재 진행 중", "주간/전체 일정", "ON MY WAY"가 Black에서
  Bold로 내려왔다. 11px에서도 굵기는 충분히 남아 가독성 손실이 없다.
- **과하게 무거운 채로 남은 곳 없음** — ③의 UA `bolder` 두 곳(위 "판단 보류")뿐이고,
  둘 다 주변 700 사이의 강조라 과해 보이지 않는다.

---

## 5. 실측하다 발견한 것 — 자폭이 좁아져 탭 타깃이 44px 밑으로 내려갔다

굵기와 무관하지만 같은 글꼴 전환이 만든 것이라 함께 남긴다. 푸터 법적 링크
(`.footer-legal-links a`, 11px / 700)의 히트 영역은 `::after`가 `width: 100%`라 **글자 폭을
그대로 따라간다.** Pretendard의 한글 자폭이 이전 폴백보다 좁아서 44px 밑으로 내려갔다.

같은 페이지에서 스타일시트만 갈아 끼워 재측정한 결과(320px 랜딩):

| 적용한 CSS | 이용약관 | 고객지원 | 계정 탈퇴 |
| --- | --- | --- | --- |
| 굵기 이관 후(현재) | 38.03 | 38.03 | 40.58 |
| 굵기 이관 전 | 38.03 | 38.03 | 40.58 |
| 굵기 이관 전 + 이전 폴백 글꼴 | 44 | 44 | 47.88 |

**폭이 굵기와 무관하게 동일하다 — 원인은 가족 전환이다.** `tests/e2e/tap-targets.spec.js`가
320x568·390x844에서 이 세 개를 잡아낸다. 이 문서를 쓴 작업(굵기 이관)의 범위가 아니라
고치지 않았다.

---

측정·촬영 스크립트와 스크린샷은 저장소에 넣지 않았다(계획 디렉터리에만 둔다):
`.superpowers/sdd/typography-foundation-plan/measure-out/`
(`shots/{before,after}-{320,390,430,1440}-{1..4}-*.png`, `diffs/cmp-*.png`)

---

## 실행 화면 900 이관 실측 (2026-07-31, feat/execution-900-migration)

`.execution-page` 계열 66곳 이관(분류: `execution-900-classification.md`)의 전후 실측.
측정 스크립트는 이번엔 저장소에 있다: `scripts/measure-execution-weights.cjs`
(390×844, 오늘·계획·메이트·기억 탭 순회). 이전 계획의 스크립트가 커밋되지 않아
소실된 전례의 재발 방지다.

기본 상태에서 측정 가능한 10곳 전부가 분류표의 배정대로 착지했고, 이관하지 않은
묶음이 움직인 라운드는 없었다:

| selector | view | 이관 전 | 이관 후 | 배정 |
| --- | --- | --- | --- | --- |
| `.bond-reaction` | mate | 900 | 600 | emphasis |
| `.companion-next-inline small` | mate | 900 | 600 | emphasis |
| `.companion-relationship-heading > span` | mate | 900 | 600 | emphasis |
| `.companion-relationship-summary dd` | mate | 900 | 600 | emphasis |
| `.companion-touch-secondary` | mate | 900 | 600 | emphasis |
| `.journey-pro-link` | mate | 900 | 600 | emphasis |
| `.memory-kicker` | memory | 900 | 600 | emphasis |
| `.memory-mood-picker button` | memory | 900 | 600 | emphasis |
| `.memory-mood-picker legend` | memory | 900 | 600 | emphasis |
| `.save-memory-button` | memory | 900 | **800** | display |

미측정 14곳(포커스 모드·달력 서브뷰·시트 내부·딥 스테이트)은 분류표의 마크업 근거와
e2e(plan·mate·ollie-memory-ux·records·day-page·diary-book·today·tap-targets, 전부
0 failed)가 판정을 맡았다. 잔여 검산: `font-weight: 900` 총 139 = 다음 단계 몫 137 +
글리프 유지 2, `.execution-page` 스코프 잔여는 글리프 2곳뿐.

---

## 앱 표면 900 이관 실측 (2026-08-01, feat/app-900-migration)

`.execution-page` 접두사 밖의 앱 렌더 요소 52곳 이관(분류:
`app-900-classification.md`)과 굵기 역할 표 개정의 전후 실측. 측정 스크립트는
`scripts/measure-execution-weights.cjs`(PR #55에서 커밋, 이번에 `TARGETS` 확장).

### 올리 표면 — 역할 표 공백을 닫은 결과

굵기 역할 표에 "본문 성격의 강조" 자리가 없어 `--weight-title`(700)에 판단 보류로
남아 있던 둘을 `--weight-emphasis`(600)로 옮겼다. 스크린샷 전후:
`docs/artifacts/app-900-ollie-shots/{before,after}-{app-chat,landing-ollie}.png`

| 요소 | 이관 전 | 이관 후 |
| --- | --- | --- |
| `.chat-bubble > span` (말풍선 이름표) | 900 | 600 |
| `.chat-bubble-headline` (말풍선 첫 줄) | 900 | 600 |
| `.chat-energy` (에너지 배지) | 900 | 600 |
| `.app-toast` | 700 | 600 |
| `.ollie-message p` (올리 말풍선 본문, 랜딩) | 700 | 600 |

**육안 판단**: 헤드라인이 본문보다 여전히 뚜렷하게 굵고, 시트 제목 "올리와 대화해요"가
말풍선 내용보다 확실히 위에 선다 — 의도한 위계 회복이다. 되돌리려면 배정을
`--weight-title`로 되돌리는 한 줄이면 된다.

`.ollie-message`는 `app.html`이 아니라 `index.html`에 있다 — 이 결정은 랜딩에도 걸린다.

### 탭 순회로 측정 가능한 대상

| selector | view | 이관 전 | 이관 후 | 메모 |
| --- | --- | --- | --- | --- |
| `.journey-map span` | mate | 900 | 600 | |
| `.card-title span` | today | 500 | 500 | 캐스케이드 패 — 아래 표 |
| `.companion-stats span` | mate | 500 | 500 | 캐스케이드 패 |
| `.text-button` | today | 700 | 700 | 캐스케이드 패 |

### 측정이 판정을 바꾼 곳 — 캐스케이드에서 지는 선언 3곳

셀렉터만 보면 "900이 적용 중"으로 읽히지만 실제 렌더 값은 다르다. 셋 다 배정대로
이관했고 화면 변화는 없다.

| 셀렉터 | 실측 | 이기는 규칙 |
| --- | --- | --- |
| `.card-title span` | 500 | `.card-title.compact span`(styles.css:5436 그룹). 앱은 전부 compact지만 **관리자의 비-compact `card-title` 10곳에서는 이 900이 살아 있다** — 사문이 아니다 |
| `.companion-stats span` | 500 | 같은 5436 그룹 — 동일 특정성, 뒤에 있어 이긴다 |
| `.text-button` | 700 | `.text-button`(styles.css:5287) — 동일 셀렉터, 뒤에 있어 이긴다 |

### 검증

- `npm test` 458 pass / 0 fail
- e2e: cheer·mate·modal 56 passed · today·plan·paywall-ui·pricing·auth 274 passed ·
  diary-book·paywall-ui·**tap-targets** 99 passed
- 잔여 검산: `font-weight: 900` 총 90 = 다음 단계 몫 87 + 글리프 유지 3

**이 브랜치와 무관한 e2e 실패 둘을 만났다.** `today.spec.js:6`(4개 프로젝트)은 손대지
않은 `origin/main`(2f0bd0d)에서 재현해 선행 결함으로 확인했다 — 픽스처가 어제부터 7일
계획을 만드는데 실행일이 8월 1일이라 1일차가 지난달이고, 달력이 이번 달만 그려
`.calendar-day.selected`를 못 찾는다(`today.spec.js:98`). **월 경계에서만 터진다.**
`paywall-ui.spec.js:178`은 PR #54에서 이미 부하 플레이키로 판정된 테스트이고, 직렬
재실행에서 10.2초 만에 통과했다.

## 마지막 900 정리 (final-900) — 2026-08-01

브랜치 `feat/final-900-migration`. **굵기 이관이 끝났다.** 90 → **12**
(사문 48곳 삭제 + 살아있는 30곳 이관 + 글리프 12곳 유지).

### 삭제 안전 증명

사문 클래스가 거느린 규칙 244개 · 1496줄을 지웠다(`styles.css`의 7.8%).
증거는 `scripts/snapshot-computed-styles.cjs`의 계산값 전수 diff다 —
`index`·`app`·`admin` 세 페이지를 390·1280 두 폭에서 열고 21종 속성을 노드마다
비교해 **6150 노드에서 차이 0**. 자세한 것은 `final-900-deletion-report.md`.

### 이관 전후 렌더값

측정은 390px, 랜딩은 서버로, 관리자는 마크업을 `setContent`로 심고 `<base href>`로
스타일시트를 물려서 했다(`/admin.html`은 인증 게이트라 서버로 열면 앱으로 302된다).

| 셀렉터 | 화면 | 전 | 후 |
| --- | --- | --- | --- |
| `.personality-form button` | 랜딩 | **400** (캐스케이드 패자) | 400 (변화 없음) |
| `.builder-header > span` | 랜딩 | **800** (캐스케이드 패자) | 800 (변화 없음) |
| `.summary-head span` | 랜딩 | 900 | 600 |
| `.live-summary dd` | 랜딩 | 900 | 600 |
| `.feature-number` | 랜딩 | 900 | 600 |
| `.mini-schedule-row span` | 랜딩 | 900 | 600 |
| `.feature-app-link` | 랜딩 | 900 | 600 |
| `.pricing-recommended-badge` | 랜딩 | 900 | 600 |
| `.pricing-plan-cta` | 랜딩 | 900 | 600 |
| `.pricing-comparison-row dd` | 랜딩 | 900 | 600 |
| `.pricing-faq details > summary` | 랜딩 | 900 | **700** (아코디언 제목) |
| `.builder-choice-section > legend` | 랜딩 | 900 | **700** (섹션 제목) |
| `.hero-trial-button` | 랜딩 | 900 | **800** (화면의 단일 주요 CTA) |
| `.admin-stat-grid em` | 관리자 | 900 | 600 |
| `.admin-table th` | 관리자 | 900 | 600 |
| `.status-pill` | 관리자 | 900 | 600 |
| `.admin-health-strip small` | 관리자 | 900 | 600 |
| `.admin-funnel-visual span` | 관리자 | 900 | 600 |
| `.retention-summary small` | 관리자 | 900 | 600 |
| `.plan-pill` | 관리자 | 900 | 600 |
| `.admin-password-change-form button` | 관리자 | 900 | 600 |
| `.health-icon` | 관리자 | 900 | **900 유지** (글리프 `!`·`↗`·`✓`) |

속성 단위로 확인한 결과 **바뀐 것은 `font-weight`뿐이다.** 랜딩 이관은 130 노드
(900→600 112 · 900→700 16 · 900→800 2), 관리자 이관은 130 노드(전부 900→600),
양쪽 다 **레이아웃 변경 0**. 히어로 버튼 폭이 266.36 → 266.86px로 0.5px 움직인 것이
전부이고 44px 근처가 아니다.

### 이번 라운드에 배운 것

- **분류가 생존 검사를 대신할 수 없다.** `::before`가 붙었다는 이유로 "글리프"로
  먼저 분류된 두 규칙이 "이 클래스가 존재하는가"를 묻지 않고 지나갔다. 둘 다 사문이었다.
- **글리프 판정 기준은 셀렉터 모양이 아니라 담는 것이다.** `::before`여도 `counter()`로
  숫자를 그리면 글리프가 아니고, 평범한 `<button>`이어도 내용이 `×` 하나뿐이면 글리프다.
- **측정 도구가 틀렸을 가능성을 먼저 의심한다.** 이 라운드에서 도구가 조용히 잘못된
  답을 준 것이 세 번이다 — 인증 게이트로 엉뚱한 페이지 측정, 레이아웃 속성 누락,
  CRLF/LF 차이로 인한 가짜 오삭제 248건.
- **`git stash`를 A/B에 쓰지 않는다.** 스택이 저장소 전체에 하나뿐이라 다른 세션과
  충돌한다. 파일 복사로 한다.
