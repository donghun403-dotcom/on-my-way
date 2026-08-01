# 사문 CSS 삭제 보고 — 규칙 244개 · 1496줄

`font-weight: 900` 90곳 중 48곳은 저장소 어디에도 클래스가 없는 사문이었다.
이 문서는 그 48곳이 딸린 규칙을 지운 근거와 증거를 남긴다.

## 무엇을 지웠나

| 항목 | 값 |
| --- | --- |
| 규칙 | 244개 (그중 `@media` 안 44개) |
| 줄 | 1496줄 — `styles.css` 19,259줄의 7.8% |
| `font-weight: 900` | 90 → 42 |
| 사문 클래스 | 43개 |

**삭제 규칙**: 콤마 조각이 **전부** 사문인 규칙만 지웠다. 후손 셀렉터
`.home-page .pillar-grid`는 두 클래스가 모두 있어야 매치하므로, `pillar-grid`가
없으면 `home-page`가 살아 있어도 이 조각은 매치하지 않는다.

살아있는 셀렉터와 섞인 규칙 **55개는 손대지 않았다.** 규칙 자체가 살아 있고,
셀렉터에서 사문 조각만 빼는 것은 렌더 영향이 0인 미용 작업이다.

## 사문 판정의 자기 검증

| 오판 경로 | 확인 | 결과 |
| --- | --- | --- |
| 검색 범위가 좁다 | 저장소 전체 `.html`/`.js`/`.cjs`/`.mjs` 순회 | 43개 클래스 전부 무참조 |
| 백업을 살아있는 코드로 셈 | `.backups/onboarding-v*-20260727/`는 추적되지 않는 로컬 스냅샷 | 제외 |
| 클래스를 동적으로 조립 | 접두사 조립 흔적 검색 | 후보 3건 전부 `plan-${Date.now()}` 류 ID 생성기 |
| 프로토타입이 쓴다 | `.goal-form`은 `core-loop-v2.html`에만 있고 그 페이지는 `core-loop-v2.css`를 로드 | styles.css 규칙은 사문 |
| script.js가 쓴다 | `.goal-form`·`.diagnosis-stepper`는 `querySelector`로 찾기만 한다 — HTML에 없으니 null | 사문 |
| 테스트가 참조한다 | `tests/` 및 `*.test.mjs` 전수 검색 | 참조 0건 |

### 판정 도중 잡은 누락 — 의사요소 2곳

처음 목록은 41개 클래스였고 선언 46곳이었다. 분류 단계에서 **의사요소를 담은 두
규칙이 생존 검사를 건너뛴 것**을 발견했다. 셀렉터에 `::before`가 있으면 "글리프"로
먼저 분류되어 클래스가 살아 있는지 묻지 않았기 때문이다.

| 셀렉터 | 실제 |
| --- | --- |
| `.pricing-benefits li::before` | `pricing-benefits`가 저장소 어디에도 없다 — 사문 |
| `.result-week-list li::before` | `result-week-list`가 저장소 어디에도 없다 — 사문 |

둘을 목록에 넣어 규칙 6개 · 48줄을 더 지웠다. 최종 48곳.
**분류가 생존 검사를 대신할 수 없다** — 어떤 버킷에 들어가든 "이 클래스가 존재하는가"는
따로 물어야 한다.

## 증거 — 계산값 전수 diff

`scripts/snapshot-computed-styles.cjs`로 삭제 전후를 쟀다.

- 페이지: `index.html` · `admin.html` · `app.html` — `styles.css`를 로드하는 전부
  (`privacy`·`delete-account`는 `legal.css`, `core-loop-v2`는 `core-loop-v2.css`)
- 폭: 390 · 1280 — 삭제 대상 244개 중 44개가 `@media` 안에 있다
- 속성 21종: font-weight/size/family, line-height, letter-spacing, color,
  background-color, border-radius, box-shadow, display, position, padding, margin,
  **width, height, min-width, min-height, gap, flex, grid-template-columns**
- **노드 6150개, 차이 0**

**레이아웃 속성이 반드시 들어가야 한다.** 첫 판은 타이포와 색만 11종을 쟀다.
그건 박스 크기를 재지 않고 "안전하다"고 말한 셈이다 — 이 프로젝트는 글꼴 폭
변화로 히트 영역이 44px 밑으로 내려간 전례가 두 번 있다. `width`·`height`·
`min-height`·`line-height`·`gap`을 넣어 다시 쟀고, 그래도 차이는 0이었다.

도구 자체의 결정성도 확인했다 — 같은 코드에서 두 번 재어 서로 비교했고 차이 0이었다.

원본 JSON은 커밋하지 않는다(수 MB). 도구가 커밋되어 있어 언제든 재생성한다.

### 도구가 조용히 틀렸던 것을 고쳤다

첫 판은 `/admin.html`을 서버로 열었다. 그 경로는 **인증 게이트**라 세션이 없으면
`/app.html?auth=login&redirect=admin`으로 302 리다이렉트된다. 즉 관리자 화면 대신
**앱을 두 번 재고 있었고**, 노드 수(1615)가 앱과 같아 보였는데도 눈치채지 못했다.
관리자에는 e2e가 없어 이 스냅샷이 유일한 안전망인데, 그 안전망이 비어 있었다.

고친 뒤: 관리자 마크업을 디스크에서 읽어 `setContent`로 심고 `<base href>`로 서버의
`styles.css`를 물린다. 게이트는 우회하되 스타일은 진짜를 쓴다. 관리자 노드 수가
1615(앱) → **522(진짜 관리자)** 로 바뀐 것이 수정의 증거다.

재발을 막으려고 **표지 셀렉터 검사**를 넣었다. 페이지마다 그 문서에만 있는 셀렉터를
정해 두고(`landing`→`.hero-trial-button`, `admin`→`.admin-health-strip`,
`app`→`.execution-tabbar`) 없으면 예외를 던진다. 이 검사가 무력하지 않은지도 확인했다 —
옛 방식으로 `/admin.html`을 열면 `.admin-health-strip`이 0개라 실제로 걸린다.

### 삭제가 정확한지 규칙 집합으로 검산했다

계산값 diff와 별개로, 삭제 전후 스타일시트에서 **규칙 셀렉터 다중집합**을 뽑아
비교했다. 사라진 셀렉터 중 검증된 부재 클래스를 담지 않은 것이 있으면 오삭제다.

- 규칙 수 **3281 → 3037 = 244개 감소** — 삭제기가 보고한 수와 정확히 일치
- 사문 클래스 없이 사라진 규칙 **0개**

경계 사례 하나를 확인했다. `.diagnosis-stepper`(사문)는 지워졌고
`.diagnosis-step`(살아 있음, `index.html`에 4곳)은 **6개 규칙 그대로 남았다.**
접두사가 겹치는 클래스를 싸잡아 지우지 않았다는 뜻이다.

**이 검산의 첫 판은 248건의 오삭제를 보고했는데 전부 가짜였다.**
`git show`는 LF를, 작업 파일은 CRLF를 준다. 정규화하지 않아 `\r`가 셀렉터
문자열에 섞였고, 같은 규칙이 서로 다른 문자열로 보였다. 줄바꿈을 맞추자 0이 됐다.
**측정 도구가 틀렸을 가능성을 먼저 의심해야 한다** — 이 라운드에서 도구가
잘못된 답을 준 것이 이번까지 두 번이다.

## e2e — 이 삭제와 무관한 선행 실패

`onboarding` · `pricing` · `auth` · `responsive` · `legal` · `tap-targets` 206건 중
19건이 실패했다. 삭제가 원인인지 가르려고 **같은 환경에서 post → pre → post로
세 번** 돌렸다.

| 실행 | `styles.css` | `tap-targets` | `onboarding`+`legal` |
| --- | --- | --- | --- |
| post | 900=42 (삭제 적용) | 8 failed | — |
| **pre** | **900=90 (원본)** | **8 failed** | — |
| post2 | 900=42 | 8 failed | — |
| **pre2** | **900=90 (원본)** | — | **10 failed** / 42 passed |
| post3 | 900=42 | — | **10 failed** / 42 passed |

**삭제 전후가 완전히 같다.** 실패한 테스트 목록도 프로젝트별로 한 건씩 일치한다
(`onboarding.spec.js:106`·`286`·`330`).

`tap-targets` 실패 내용은 plan 뷰 달력의 날짜 셀 157개가 41.72px로 44px에 못 미치는
것이고, 라벨이 전부 지난달(2026년 7월) 날짜다 — 월 경계에서 드러나는 선행 결함
계열이다(`today.spec.js:6`과 같은 가족). `onboarding` 3종도 계획이 어제부터
시작하는 픽스처를 쓰므로 같은 가족으로 보인다.

`legal.spec.js:4`는 큰 실행에서 한 번 실패했으나 `pre2`·`post3` 양쪽에서 통과했다 —
부하 플레이키다.

한 차례 "삭제 전 8 통과"가 나왔지만 그 측정은 **다른 세션의 stash가 오가던
창에서 잰 것**이라 신뢰할 수 없다(아래 참고). 통제된 실행들이 그것을 뒤집었다.

### 측정 중 겪은 세션 충돌 — `git stash`를 쓰지 말 것

`git stash`는 워크트리마다 따로가 아니라 **저장소 전체가 하나의 스택을 공유한다.**
삭제 전후를 재려고 `stash push` → 테스트 → `stash pop`을 했는데, 그 사이 다른
세션이 stash를 밀어 넣어 **pop이 남의 작업을 이 워크트리로 가져왔다**
(`app.html`·`script.js`·e2e 스펙 3종). 그 변경은 패치로 보존한 뒤 `HEAD`로 되돌리고
삭제를 다시 적용했다.

앞으로 이런 A/B는 **파일 복사로 한다.** `cp styles.css keep.css` →
`git checkout HEAD -- styles.css` → 측정 → `cp keep.css styles.css`.
공유 스택을 건드리지 않는다.
