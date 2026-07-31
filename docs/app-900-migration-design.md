# 앱 표면 900 이관 설계 — 역할 표 공백을 닫으며

`styles.css`에 `font-weight: 900`이 139개 남아 있다(PR #55 이후). 이 설계는 그중
**앱 화면에 렌더되는 나머지**를 처리하고, 함께 미뤄져 온 **굵기 역할 표의 공백**을 닫는다.

## 먼저 정정 — 앱은 끝나지 않았다

PR #55는 "`.execution-page` 계열 66곳 전수 처리"였고 그건 사실이다. 하지만 그 범위는
**CSS 셀렉터 접두사**로 잡은 것이지 "앱에 렌더되는가"로 잡은 것이 아니었다. 남은 139곳을
실제 렌더 화면으로 다시 가르면:

| 버킷 | 수 | 판정 방법 |
| --- | --- | --- |
| app.html에 렌더 | 43 | 클래스가 app.html에만 등장 |
| 양쪽(app+index) | 5 | 두 파일 모두에 등장 |
| index.html(랜딩) | 40 | index.html에만 등장 |
| 관리자 | 9 | admin.html에만 등장 |
| script.js 생성 | 6 | HTML에 없고 script.js가 만든다 |
| 사문 후보 | 26 | 어느 파일에도 클래스 문자열이 없다 |
| 글리프 의사요소 | 10 | `::before`/`::after` (2곳은 #55에서 이미 유지 처리) |

**앱 표면이 아직 절반쯤 남아 있다.** `#focusTimer`, `.execution-tabbar a`,
`.mypage-usage-row span`, 체험·페이월 배너, 다이어리 북 샘플, 그리고 **올리 대화 표면
전체**(`.chat-bubble > span` · `.chat-actions button` · `.chat-energy` ·
`.chat-mood-options button` · `.chat-input-label span` · `.chat-consent-agree` ·
`.chat-recharge-link` · `.chat-bubble-headline`)가 여기 있다.

## 범위 — 앱 표면 52곳 (실행으로 확정)

`app`(43 중 #55가 이미 유지 처리한 글리프 1 제외 = 42) + `both`(5) + script.js 생성분 중
앱 렌더분(`.execution-theme-button` · `.chat-bubble-headline` 2곳) + 앱 쪽 글리프 3 =
**52**. 분류표 행 수는 여기에 판단 보류 2건을 더한 54다.

**결과(2026-08-01)**: 이관 49 + 글리프 유지 3. 잔여 139 → **90**. 남은 90 중 app.html에
렌더되는 것은 글리프 1곳뿐이다 — 앱 화면은 닫혔다.

`both` 5곳(`.plan-choice-option .plan-choice-label` · `.auth-provider .naver-mark` ·
`.billing-confirm-card > span` · `.billing-confirm-actions button` · `.energy-pack em`)은
랜딩에도 나오므로 **양쪽 화면에서 검증한다.**

**범위 밖**: 랜딩 40, 관리자 9, 사문 후보 26의 삭제 여부, `core-loop-v2.css` 2곳.

## 역할 표 공백을 닫는다 — emphasis로 넓힌다

`docs/design-tokens.md`는 이 표가 "UI 요소(제목·라벨·칩·탭)만 상정하며 **본문 성격의
강조는 다루지 않는다**"고 적고, `.ollie-message p` / `.ollie-chat-preview p` / `.app-toast`를
`--weight-title`(700)에 판단 보류로 남겨뒀다. 올리 대화 표면을 이관하려면 이 결정을
피할 수 없다 — 챗 말풍선 본문이 정확히 그 사례다.

**결정: 새 역할을 만들지 않고 `--weight-emphasis`(600)의 정의를 넓힌다.**

| 토큰 | 값 | 개정 후 역할 |
| --- | --- | --- |
| `--weight-emphasis` | 600 | **제목은 아니나 강조하는 문구** — 라벨·메타·칩·탭 같은 짧은 UI 문구와 **본문 성격의 강조** |

근거:

- **다섯 번째 역할은 사례 2~3곳을 위한 과잉이다.** 400과 600 사이에 자리를 만들면 앞으로
  애매한 케이스가 전부 거기로 흘러들고, 표의 변별력이 떨어진다.
- `--weight-emphasis`가 하던 역할은 원래 "제목은 아니지만 강조"다. 정의 문구가 좁게
  쓰였을 뿐 값의 의미는 바뀌지 않는다.
- **올리를 700에 두면 올리 목소리가 섹션 제목과 같은 굵기다.** 이 프로젝트가 고치려던
  것이 "전부 같은 굵기로 보이는" 문제였다.

**판단 보류 2건도 함께 닫는다** — `.ollie-message p`류와 `.app-toast`를 700 → 600으로
옮긴다. 표만 고치고 사례를 남겨두면 공백을 메운 것이 아니다.

**챗 표면이라고 전부 600은 아니다.** `.chat-bubble-headline`은 이름대로 헤드라인이면
title이다. 역할 표 결정은 "문장형 강조가 어디로 가는가"만 정하고, 요소별 판정은 아래
분류표가 한다.

## 방법 — #55와 동일, 올리 묶음만 스크린샷 추가

1. **분류표를 먼저 산출물로 만든다** (`docs/artifacts/app-900-classification.md`).
   행마다 실제 마크업(`app.html`·`script.js`)을 근거로 3갈래 배정. 셀렉터 이름만 보고
   판정하지 않는다 — #55에서 크롬 30곳이 제목 굵기로 몰렸던 사고를 표가 막는다.
2. 화면 묶음별로 나눠 **이관 → 유닛 → 실측 diff → 관련 e2e**를 돌고 커밋한다.
3. **올리 대화 묶음만 스크린샷 전후를 남긴다.** 시각 변화가 큰 유일한 묶음이고
   (900 → 600, 두 단계), 마음에 안 들면 토큰 한 줄로 되돌릴 수 있어야 한다.
4. 글리프 의사요소는 900 리터럴 + 사유 주석으로 남긴다(#55와 같은 원칙).
5. 사문으로 판정된 선언도 배정대로 이관한다 — 화면 영향 0이고, 남겨두면 래칫이
   헛수를 지킨다. 삭제는 별도 판단.

실측은 `scripts/measure-execution-weights.cjs`(#55에서 커밋됨)의 `TARGETS`를 이번 대상으로
확장해 재사용한다. 새 스크립트를 만들지 않는다.

## 재발 방지

`fonts.test.mjs`의 잔여 수 래칫이 이미 139를 고정하고 있다. 이관분만큼 내린다.
최종값은 분류표의 글리프 유지 합계에 달려 있어 **구현이 확정한다** — 설계가 숫자를
못 박으면 #55처럼 정정 절을 다시 쓰게 된다.

## 검증

- `npm test` 전체 녹색 (베이스라인 458)
- 관련 e2e: today · plan · mate · **auth** · **paywall-ui** · **pricing** · **cheer** ·
  ollie-memory-ux · **modal** · tap-targets — 체험·페이월·결제 배너와 인증 시트가 범위에
  들어와 #55보다 넓다
- 올리 대화 묶음 전후 스크린샷
- 실측 전후 표를 `docs/artifacts/typography-foundation-measurements.md`에 잇댄다
- `docs/design-tokens.md`: 역할 표 개정 + 공백 문단을 결정으로 교체 + 잔여 수 갱신
- `docs/PROJECT_STATUS.md` 작업 기록

## 되돌리기

올리 목소리가 얇아진 것이 마음에 들지 않으면 `.ollie-message p`류와 챗 본문 배정을
`--weight-title`로 되돌리는 한 줄 변경으로 복구된다. 스크린샷이 판단 근거를 남긴다.
