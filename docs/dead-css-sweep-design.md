# 사문 CSS 전수 청소 설계 — 런타임 조립을 열거해서 판정한다

`styles.css` 17,779줄 중 **1609줄(9.1%)이 아무것도 렌더하지 않는다.** 이 설계는
그것을 지운다. 지난 라운드(PR #61)가 `font-weight: 900` 선언에 딸린 41개 클래스만
봤다면, 이번은 스타일시트 전체를 본다.

## 범위

| 처리 | 수 |
| --- | --- |
| **규칙째 삭제** | 사문 클래스 144개가 거느린 **규칙 325개 · 1609줄** (`@media` 안 50개) |
| **손대지 않음** | 혼합 규칙 95개 — 살아있는 셀렉터가 섞여 규칙 자체가 살아 있다 |
| **예외적으로 조각 제거** | `.ghost-link` 혼합 규칙 **4곳** + `today.spec.js`의 공허한 단언 1줄 |

전체 규칙 3037개 중 325개, 셀렉터에 등장하는 클래스 849개 중 144개다.

**범위 밖**: 900이 아닌 굵기 리터럴, `core-loop-v2.css`, 나머지 혼합 규칙 **91개**의
미용 정리, CSS 변수·키프레임의 사문 여부.

## 이번 위험은 지난 라운드와 다르다 — 런타임 조립

지난 라운드의 41개 클래스는 전부 정적 문자열이었다. 이번엔 다르다.
**순진한 문자열 검색이 사문이라 판정한 150개 중 6개가 실제로 살아 있었다.**

```js
script.js:8402   row.className  = `task-row task-${period.theme}`;
script.js:8932   item.className = `journey-stop journey-${stop.theme}`;
```

`period.theme`는 `"morning"`·`"afternoon"`·`"evening"`·`"night"`,
`stop.theme`는 `"room"`·`"path"`·`"forest"`·`"hill"`·`"garden"`이다. 이 클래스
이름은 소스 어디에도 **문자열로 존재하지 않는다.** 그대로 지웠으면 오늘 화면의
시간대별 테마와 여정 지도의 단계별 스타일이 죽었을 것이다.

우연도 있었다. `journey-forest`·`hill`·`garden`은 사문으로 잡혔는데
`journey-room`·`path`는 살아남았다 — `room`·`path`가 저장소 다른 곳에 부분
문자열로 있었기 때문이다. **검색은 양방향으로 못 믿는다.**

### 대책 — 조립 지점을 기계적으로 찾고 값을 사람이 열거한다

`className`/`classList`에 템플릿이나 문자열 결합이 쓰인 곳을 정규식으로 전수 조사한다.

```
(className|classList\.(add|toggle|remove))[^;]*(\$\{|\+ )
```

이 저장소에는 **5곳**이 있다. 각각의 값을 확정했다.

| 지점 | 만들어지는 클래스 | 판정 |
| --- | --- | --- |
| `script.js:8402` | `task-{morning,afternoon,evening,night}` | 살아있음 — 열거 닫힘 |
| `script.js:8932` | `journey-{room,path,forest,hill,garden}` | 살아있음 — 열거 닫힘 |
| `script.js:10165` | `mood-${normalizeMemoryMood(m)}` | **접두사째 살림** — 저장값이 그대로 통과해 열거가 안 닫힌다 |
| `script.js:7595` | `is-ollie` · `is-user` | 리터럴이라 검색으로 잡힌다 |
| `script.js:9743` | `book-page ${className}` — 호출부 5곳 전부 리터럴 | 검색으로 잡힌다 |

**열거가 닫히지 않는 접두사는 접두사 전체를 살려둔다.** `normalizeMemoryMood`는
`{light:"happy", steady:"calm"}[mood] || mood || "calm"`이라 저장된 임의의 값이
그대로 클래스가 된다. 닫을 수 없는 것을 닫았다고 가정하지 않는다.

이 표를 산출물(`docs/artifacts/dead-css-live-set.md`)로 남긴다 — 다음 라운드가 같은
조사를 반복하지 않도록.

### 지난 라운드 삭제는 안전했다

머지된 PR #61이 지운 43개 클래스에 조립 접두사가 걸리는지 확인했다. `journey-lane`
하나가 접두사에 걸렸지만 `lane`은 theme 값 다섯 개에 없다 — 조립으로 만들어지지
않으므로 사문 판정이 맞았다. **이미 머지된 삭제를 되돌릴 이유는 없다.**

## 사문 판정 규칙

- **조각이 사문** := 그 조각의 클래스 중 **하나라도** 살아있는 집합에 없다.
  후손 셀렉터 `.home-page .pillar-grid`는 두 클래스가 모두 있어야 매치하므로,
  `pillar-grid`가 없으면 `home-page`가 살아 있어도 이 조각은 매치하지 않는다.
- **규칙이 삭제 가능** := 모든 콤마 조각이 사문. 하나라도 살아 있으면 손대지 않는다.
- **살아있는 집합** := 저장소 전체(`.html`/`.js`/`.cjs`/`.mjs`, 백업·테스트·문서 제외)에
  등장하는 클래스 + 위 표의 조립 산출물.

`:not()`·`:has()`·`:is()`·`:where()` 안의 클래스는 **오판 위험이 있다** — `:not(.foo)`는
`.foo`가 없어도 모든 것에 매치한다. 확인 결과 삭제 후보 325개 중 이 의사클래스를 쓰는
규칙은 3개뿐이고, **사문 클래스가 `:not()` 안에만 있는 규칙은 0개**다. 이번 범위에서는
문제가 되지 않지만, 삭제기가 이 경우를 만나면 멈추도록 검사를 넣는다.

## `ghost-link` — CSS와 공허한 단언을 함께 지운다

`tests/e2e/today.spec.js:404`가 이렇게 단언한다.

```js
await expect(page.locator(".execution-header .ghost-link")).toBeHidden();
```

**`.ghost-link`는 어느 HTML에도 없다.** Playwright에서 존재하지 않는 요소는 hidden으로
취급되므로 이 단언은 **항상 통과한다 — 아무것도 검증하지 않는다.**

`.execution-header-actions`에는 이제 `.ollie-energy-meter`가 들어 있다. 같은 역할을
하는 대체 요소가 없고, 같은 테스트의 다른 단언들(`#focusTaskTitle`·`#startFocusButton`·
탭 개수)이 이미 헤더를 검증한다. **다시 겨누지 않고 지운다.**

CSS는 6곳인데 **성격이 둘로 갈린다.**

| 줄 | 셀렉터 | 처리 |
| --- | --- | --- |
| 9882 | `.home-page .energy-system-heading, .execution-header-actions .ghost-link` | 두 조각 모두 사문 → **Task 2가 규칙째 삭제** |
| 13208 | `.execution-page .execution-header-actions .ghost-link` | 단독 사문 → **Task 2가 규칙째 삭제** |
| 2483 · 4662 | `.ghost-link, .text-button` | `.text-button`이 살아 있음 → **조각만 제거** |
| 9983 | `.execution-page .ghost-link, .execution-page .text-button` | 같음 → 조각만 제거 |
| 16513 | `.execution-page .ghost-link, .execution-page .text-button, …` | 같음 → 조각만 제거 |

즉 2곳은 이미 위의 325개에 포함되어 있고, Task 3이 손대는 것은 **혼합 규칙 4곳의
조각 제거**다. **이번 라운드의 유일한 미용 편집**이고, 나머지 혼합 규칙 91개는
그대로 둔다.

## 검증

지난 라운드에서 검증된 도구를 그대로 쓴다.

- `scripts/snapshot-computed-styles.cjs` — `index`·`app`·`admin` 세 페이지를 390·1280
  두 폭에서 열고 21종 속성(레이아웃 포함)을 노드마다 비교. **차이 0**이어야 커밋한다
- 규칙 셀렉터 다중집합 대조 — 사라진 규칙이 전부 사문 클래스를 담고 있는지.
  **오삭제 0**이어야 한다. 줄바꿈(CRLF/LF)을 정규화하지 않으면 가짜 차이가 쏟아진다
- `npm test` 전체 녹색
- e2e: `onboarding` · `pricing` · `auth` · `responsive` · `legal` · `tap-targets` ·
  **`today`** · `plan`

**`today.spec.js`가 필수인 이유**: `ghost-link` 단언을 지운 파일이다. 그 스펙이 여전히
온전한지 봐야 한다.

**계산값 diff의 한계를 명시한다.** 세 페이지의 **초기 상태만** 잰다. 다이어리 북 생성,
여정 지도 후반 단계, 관리자 딥 스테이트에는 닿지 않는다. 그 공백을 메우는 것이 조립
접두사 열거다 — 두 장치가 서로 다른 종류의 누락을 막는다.

## 작업 순서

| Task | 무엇 | 커밋 단위 |
| --- | --- | --- |
| 1 | 조립 지점 전수 조사 + 살아있는 집합 산출물 | 산출물 |
| 2 | 사문 325규칙 삭제 → 계산값 diff 0 → 오삭제 0 검산 → e2e | 삭제 |
| 3 | `.ghost-link` 조각 4곳 + 공허한 단언 제거 | ghost-link |
| 4 | 문서 갱신 | 문서 |

Task 2는 삭제와 검증을 한 커밋에 묶는다. 검증되지 않은 1609줄 삭제를 커밋으로
남기지 않기 위해서다.

## 되돌리기

삭제는 Task 2 커밋 하나이므로 `git revert` 한 번으로 복구된다. `ghost-link`는 별도
커밋이라 따로 되돌릴 수 있다. 계산값 스냅샷은 도구가 커밋되어 있어 언제든 재생성한다.

## 작업 수칙

- **A/B 비교에 `git stash`를 쓰지 않는다.** 스택이 저장소 전체에 하나뿐이라 병렬
  세션과 충돌한다. 파일 복사로 한다 (`cp` → `git checkout HEAD --` → 측정 → 복원).
- **측정 도구가 틀렸을 가능성을 먼저 의심한다.** 지난 라운드에서 도구가 조용히 잘못된
  답을 준 것이 세 번이다 — 인증 게이트로 엉뚱한 페이지 측정, 레이아웃 속성 누락,
  CRLF/LF 차이로 인한 가짜 오삭제 248건.
