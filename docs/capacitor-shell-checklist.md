# Capacitor 검증 셸 — 실기기 체크리스트 (구성 A·B)

`docs/capacitor-spike.md`는 소스만 읽고 쓴 문서다. 그 §5에 **실기기 없이는 확인 불가능한
것 여섯**이 남아 있고, §2의 결론(CapacitorHttp 경로)이 그중 앞 둘에 달려 있다.
이 문서는 그 여섯을 실기기에서 재기 위한 절차서이자 기록지다.

셸은 `mobile/`에 있다. **서버 코드도 `script.js`도 이번 회차에서 바뀌지 않았다** —
무엇을 고쳐야 하는지를 먼저 재는 단계이기 때문이다.

## 규칙

- **관측만 적는다.** "될 것이다"·"아마"는 이 문서에 들어가지 않는다.
- 확인하지 못한 항목은 **미검증**으로 남긴다. 비워 두지 않는다 — 빈칸은 나중에
  "통과"로 읽힌다.
- 각 항목에는 **무엇을 보면 무엇으로 적는지**가 붙어 있다. 해석이 갈리면 그 사실을 적는다.

## 준비물

| | |
| --- | --- |
| 기기 | Android 실기기 1대 (USB 디버깅 켬) |
| 계측 | 데스크톱 Chrome의 `chrome://inspect/#devices` — 디버그 빌드라 WebView가 붙는다 |
| APK | GitHub Actions `Android debug APK` 워크플로를 `workflow_dispatch`로 실행 → 아티팩트 |
| 계정 | 카카오·네이버·구글 각 1개. **A-10/B-10(인쇄)만 Pro 계정이 필요하다** — `printDiaryBook`이 `canCreateDiaryBook()`으로 먼저 막는다. **A-9/B-9(`.md`)는 플랜과 무관해 어떤 계정으로도 잰다** |

두 구성은 appId가 달라 **한 대에 동시에 설치된다**. 런처에서 `OMW 검증 A` / `OMW 검증 B`로
구분한다.

## 계측 도구 — 같은 화면을 두 곳에서 본다

DevTools **Network** 탭에 요청이 **보이는지 아닌지** 자체가 관측값이다:

- 보인다 → WebView 네트워크 스택을 탔다 (= `CapacitorHttp`가 가로채지 않았다)
- 안 보이는데 응답은 돌아왔다 → 네이티브 HTTP로 나갔다 (= 가로챘다)

이 구분이 B-4·B-5의 근거다. 콘솔에서 직접 요청을 날릴 때도 같은 눈으로 본다.

---

## 구성 A — `server.url` 원격 로드

WebView가 실서버를 직접 연다. **되면 코드 변경이 거의 없다.** 대신 Capacitor 문서가
`server.url`을 "not intended for use in production"이라고 못박고 있고 심사에서 웹 래퍼로
걸릴 위험이 가장 크다. **상한선을 재는 용도다 — 이것마저 안 되면 나머지도 안 된다.**

### A-1. 앱이 뜨고 `data-app-ready`에 도달하는가

1. `OMW 검증 A` 실행 → 랜딩(`index.html`)이 떠야 한다.
2. **빨간 "구성 A — 원격 로드 실패" 화면이 뜨면 그 자리에서 실패로 적는다.**
   그 화면은 번들 폴백이고, 보인다는 것은 `server.url`이 열리지 않았다는 뜻이다.
3. 랜딩에서 앱으로 들어간다(`app.html`).
4. DevTools 콘솔: `document.body.dataset.appReady`

| 관측 | 적는 값 |
| --- | --- |
| `"true"` + 로그인 버튼이 보인다 | 통과 |
| `"true"`인데 로그인이 불가능하다 | **부분** — 스파이크 §3이 경고한 "가장 나쁜 형태의 성공". A-6까지 가서 확인한다 |
| `"false"` 또는 undefined | 실패. `document.body.dataset`의 `authReady`/`authState`/`pricingState` 셋을 함께 적는다 (`markAppReady`가 요구하는 값들이다) |

### A-2. `/api/health`가 200인가 — 요청이 워커에 닿는가

DevTools 콘솔:

```js
(await fetch("/api/health")).status
```

200이면 통과. 그 외에는 **상태 코드와 응답 본문 앞 100자**를 적는다.

### A-3. 워커의 동일 출처 검사를 통과하는가

A는 WebView origin과 서버 origin이 같아서 통과가 기본값이다. **그래도 재는 이유**는
WebView가 불투명 출처로 취급돼 `Origin: null`이 나가는 경우가 있기 때문이다 —
그러면 서버의 `if (origin && origin !== url.origin)`이 참이 되어 403이다.

```js
(await fetch("/api/auth/providers")).status
```

| 관측 | 적는 값 |
| --- | --- |
| 200 | 통과 |
| 403 | 실패. Network 탭에서 요청 헤더의 `Origin` 값을 그대로 적는다 |

### A-6. 카카오·네이버·구글 로그인이 완주하는가

**여기서 실제로 재는 것이 무엇인지 먼저 짚는다.** 이 셸에는 시스템 브라우저 플러그인도
딥링크 인텐트 필터도 넣지 않았다. `script.js`는 `location.assign("/api/auth/{provider}/start")`
로 **최상위 이동**을 할 뿐이다. 그 다음 무슨 일이 벌어지는지가 Capacitor의 기본 동작이고,
그 기본 동작이 이 항목의 관측 대상이다.

provider마다 따로 적는다.

1. 앱에서 로그인 → provider 선택
2. **어디서 열렸는지 적는다**: 앱 안(WebView) / 시스템 브라우저 / Custom Tab
3. 로그인 완료 후 **어디로 돌아왔는지 적는다**: 앱으로 복귀 / 브라우저에 머무름 / 빈 화면 / 오류
4. 앱으로 돌아왔다면 `document.body.dataset.authState`

| provider | 어디서 열림 | 완주 후 | `authState` |
| --- | --- | --- | --- |
| 카카오 | | | |
| 네이버 | | | |
| 구글 | | | |

**"브라우저에 머무름"이 나오면 그것이 결론이다** — 세션 쿠키가 시스템 브라우저의 잼에
들어갔고 WebView는 여전히 로그아웃 상태라는 뜻이다. 그 경우 A-7은 자동으로 실패이고,
`allowNavigation`에 provider 호스트를 넣어 WebView 안에 붙잡아 두는 변형을 다음 회차에
잰다(이번에는 기본 동작을 봐야 하므로 넣지 않았다).

#### A-6에서 잡힌 제품 결함: 복귀 후 provider 버튼이 잠긴 채 남음 (2026-08-02, 수정 완료)

구성 A / 실기기 Android / 프로덕션에서 관측했다. 로그인 시트 → "Google로 계속하기" →
시스템 브라우저 → 앱 복귀 시점에 `button.auth-provider`가 kakao·naver·google **전부**
`disabled === true`였다. `location.reload()` 후에는 셋 다 풀렸고, 그 시점에도 서버는
`/api/auth/providers`에서 셋 다 `configured:true, visible:true`로 내려주고 있었다. 서버 상태가
아니라 클라이언트 pending 상태다.

원인은 `startOAuth`가 **문서가 파괴된다고 가정**하는 데 있다. `setAuthProviderBusy(provider)`로
버튼을 모두 잠그고 `activeAuthProvider`를 세운 뒤 `location.assign`으로 떠나는데, 잠금을 푸는
경로가 시작 실패 catch와 `openAuthSheet` 둘뿐이다. 웹은 문서가 실제로 파괴되며 잠금도 같이
사라지지만, 셸은 그 URL을 시스템 브라우저로 넘기고 WebView 문서를 그대로 살려두므로 잠금만
남는다. `activeAuthProvider`도 남아 `startOAuth` 첫 줄 early return에 걸려 재시도까지 죽는다.

**데스크톱 웹은 재현되지 않는다** — 셸 전용이다. 근거 둘:

- Playwright 실측: OAuth 이동 후 뒤로가기로 복귀하면 문서가 새로 뜨고(사전에 심은 마커 소실)
  버튼 4개가 모두 `disabled:false`
- 프로덕션 `app.html` 응답이 `cache-control: no-cache, no-store, must-revalidate`. Chrome은
  `no-store` 문서를 bfcache에서 구조적으로 제외하므로 bfcache 복원 경로 자체가 성립하지 않는다

수정은 복귀 신호에서 잠금을 거두는 것이다(`script.js`, `releasePendingHandoffOnReturn`).
셸 복귀는 `visibilitychange`, bfcache 복원은 `pageshow`로 들어오므로 둘 다 연결했다. 회귀
테스트는 `tests/e2e/auth.spec.js`의 "외부 브라우저로 넘어간 뒤 앱으로 돌아오면 provider 잠금이
풀리고 다시 시도할 수 있다" — 떠나 있는 동안은 잠긴 채로 두어 연속 클릭 방지가 살아 있는지도
함께 잠근다.

**같은 결함이 결제 흐름에도 있었고 함께 고쳤다.** `performStartSubscription`의
`await payment.requestBillingAuth(...)`도 Toss 결제 페이지로 최상위 이동을 한다. 셸이 그 URL을
시스템 브라우저로 넘기면 약속이 끝내 끝나지 않아 `startSubscription`의 `.finally()`가 아예 돌지
않고, CTA 잠금과 `billingStartPromise`가 함께 남는다. `.finally()` 본문을 `settleBillingStart()`로
뽑아 복귀 핸들러가 같은 정리를 부르게 했다. 회귀 테스트는 `tests/e2e/pricing.spec.js`의
"외부 브라우저로 넘어간 뒤 앱으로 돌아오면 결제 CTA 잠금이 풀리고 다시 시도할 수 있다".

> 이 셸은 외부 URL을 시스템 브라우저로 넘기면서 WebView 문서를 살려둔다. **"떠난다"를 전제로
> 상태를 잠그는 코드는 전부 이 결함의 후보다.** 새로 그런 코드를 넣을 때는 복귀 신호에서
> 거두는 경로를 함께 넣는다.

### A-7. 완주 후 세션 쿠키가 웹뷰에서 유효한가

A-6에서 앱으로 복귀한 provider에 대해서만 잰다.

```js
(await fetch("/api/auth/me")).status
```

200이면 통과, 401이면 실패. **`document.cookie`도 함께 적는다** — 세션 쿠키는
`HttpOnly`라 여기 보이지 않는 게 정상이고, 보인다면 그것도 관측값이다.

### A-8. 앱 재시작 후 세션과 `localStorage`가 유지되는가

1. 재시작 전 콘솔에서 `Object.keys(localStorage).length` 를 적는다.
2. 앱을 **완전히 종료**한다(최근 앱 목록에서 스와이프). 백그라운드 전환이 아니다.
3. 다시 실행 → 같은 두 값을 다시 적는다.

| | 재시작 전 | 재시작 후 |
| --- | --- | --- |
| `/api/auth/me` 상태 | | |
| `localStorage` 키 수 | | |

### A-9. `.md` 기록 내보내기가 실제로 파일을 저장하는가 ★

**인쇄(A-10)보다 먼저 잰다. 그리고 이 항목만 Pro 계정이 필요 없다.**

**왜 앞 순번인가 — 깨졌을 때의 무게가 다르다.**

| | 깨지면 무엇을 잃는가 |
| --- | --- |
| **A-10 인쇄** | Pro 기능 **하나**. 유료 혜택이 줄어드는 문제다 |
| **A-9 `.md`** | **열람·이동권이라는 법적 요건.** 내 기록을 가져갈 수 있어야 한다는 개인정보 자기결정권이다 |

**[코드]** `plan-policy.mjs:38,55`가 `expired`·`trial_pending`에도 `basicRecords: true`를
주는 이유가 이것이고, `script.js:4954`의 주석이 "무료 `.md` 내보내기는 만료 계정에서도
반드시 되어야 하는 법적 요건"이라고 적고 있다.

**그래서 이 항목은 페이월을 켤 수 있는 전제 조건이다.** 앱에서 `.md`가 나오지 않는 상태로
`HARD_PAYWALL_ENABLED`를 켜면, 잠긴 유저가 자기 기록을 가져갈 방법이 앱에 하나도 없게 된다.

**플랜과 무관하므로 Pro 계정을 만들 필요가 없다.** **[코드]** `canCreateDiaryBook()`
게이트를 지나지 않는다. 로그인만 되면 어떤 플랜으로도 잰다 — A-6이 실패해 익명 상태로
남았더라도 기록 화면까지 갈 수 있으면 시도한다.

**절차**

1. 기록 화면 → 내보내기(`.md`)
2. DevTools 콘솔과 **기기의 알림·다운로드 표시**를 함께 본다
3. 파일 관리자에서 `on-my-way-기록-YYYY-MM-DD.md`를 찾는다

| 관측 | 적는 값 |
| --- | --- |
| 파일이 저장되고 **열어서 내용이 보인다** | 통과 |
| "기록을 텍스트로 내보냈어요" 토스트만 뜨고 **파일이 없다** | **실패 — 가장 위험한 형태.** 앱은 성공했다고 말하는데 파일이 없다. **[코드]** `script.js:1143-1153`의 토스트는 `link.click()` 성공 여부와 무관하게 뜬다 |
| 콘솔에 다운로드·blob 관련 오류 | 실패. 오류 문구를 그대로 적는다 |
| 아무 반응도 없다 | 실패. `link.click()` 직후 예외가 없는지 콘솔을 확인한다 |

두 번째 줄이 이 항목의 핵심이다. **[미검증]** Android WebView는 `blob:` URL과
`<a download>`를 네이티브 `DownloadListener` 없이는 처리하지 않는다. Capacitor 기본
`BridgeActivity`가 그걸 붙여 주는지가 이 측정의 전부다.

### A-10. `window.print()`가 어떻게 실패하는가

**Pro 계정이 필요하다.** 무료·체험 계정은 `printDiaryBook`이 토스트로 먼저 막는다.

**무엇이 잘못되는지 먼저 정정한다.** 실패해도 **화면은 바뀌지 않는다.**
**[코드]** `.diary-book-print { display: none }`은 화면 스타일시트에 있고
`is-printing-book` 규칙은 전부 `@media print` 안이다(`styles.css:18827-18829`).
그래서 "인쇄 화면에 갇힌다"는 일은 일어나지 않는다 — 이 문서의 이전 판이 그렇게 적었는데
틀렸다. 60초 동안 잘못돼 있는 것은 **`document.title`** 하나다.

1. 인쇄 전 콘솔에서 `document.title`을 적는다
2. 다이어리 북 → 인쇄
3. DevTools 콘솔을 **띄워 둔 채로** 관찰한다

| 관측 | 적는 값 |
| --- | --- |
| 인쇄 대화상자가 뜬다 | 통과 — 스파이크의 예상이 틀렸다 |
| 아무 일도 없고 콘솔도 조용하다 | **조용한 실패 재현.** `document.title`이 "올리 다이어리 북 …"으로 바뀌었는지 확인한다 |
| 콘솔에 `Unable to open print dialog` | 예외는 던져진다. `try/catch`가 잡아 즉시 복구된다 |

**이어서 탈출 경로를 확인한다.** 두 번째 줄이 나왔다면 화면을 한 번 탭하고
`document.title`을 다시 읽는다. 원래 값으로 돌아와 있으면 통과다 —
**[코드]** `printDiaryBook`이 `pointerdown`·`keydown`·`visibilitychange`에 되돌리기를
걸어 두었다(60초를 기다리지 않는다).

| 탭 뒤 `document.title` | 적는 값 |
| --- | --- |
| 원래 값 | 통과 — 탈출 경로가 동작한다 |
| 여전히 "올리 다이어리 북 …" | 실패. 60초 뒤에 돌아오는지까지 본다 |

**참고용 (실기기 관측이 필요한 것)**: `beforeprint`가 오는지,
`matchMedia("print").matches`가 참이 되는지. 둘 다 `docs/native-print-bridge.md` §5의
후보 E를 "시간 추정"이 아니라 "신호 기반"으로 만들 수 있는지에 달려 있다.
콘솔에서 직접 확인해 적는다.

---

## 구성 B — 번들 에셋 + `server.hostname` + `CapacitorHttp`

에셋은 앱 안에서 뜨고 origin만 실서버 도메인으로 위장한다. 그래서 `script.js`의 상대
경로가 **손대지 않고도** `https://onmyway.olivenrich.com/api/…`로 해석된다 — 스파이크가
"6곳 남짓 고쳐야 한다"고 적은 그 수정이 **0곳이 될 가능성**이 여기에 있다.

대신 새 질문이 생긴다: Capacitor의 로컬 서버가 그 origin의 `/api` 요청을 가로채서
번들에서 찾아 버리지 않는가. 그게 B-4다.

### B-1 · B-2 · B-3

A-1 · A-2 · A-3과 같은 절차로 잰다. 차이 하나: **B-1에는 빨간 폴백 화면이 없다.**
구성 B는 번들이 곧 앱이므로, 안 뜨면 흰 화면이거나 즉시 종료다. 그 경우
`chrome://inspect`에 WebView가 잡히는지부터 적는다 — 잡히면 앱은 살아 있고 렌더링이
깨진 것이고, 안 잡히면 프로세스가 죽은 것이다.

### B-4. `/api` 요청이 로컬 서버에 가로채이는가 ★

이 구성의 핵심 항목이다.

```js
const r = await fetch("/api/health");
[r.status, r.headers.get("content-type"), (await r.text()).slice(0, 120)]
```

| 관측 | 적는 값 |
| --- | --- |
| 200 + `application/json` + `{"ok":true,…` | **가로채이지 않았다.** 네이티브로 나가 워커에 닿았다 |
| 404, 또는 200인데 HTML | **가로채였다.** 로컬 서버가 번들에서 `/api/health`를 찾다 실패한 것이다 |

**교차 확인**: DevTools Network 탭에 이 요청이 보이는가. 안 보이는데 JSON이 돌아왔다면
네이티브 HTTP로 나갔다는 두 번째 증거다. 둘이 어긋나면 **어긋났다는 사실을 적는다.**

가로채였다면 그 자리에서 대조군을 만든다: `mobile/scripts/prepare.mjs`의
`CapacitorHttp: { enabled: true }`를 `false`로 바꿔 다시 빌드하면, 가로채기가
`CapacitorHttp` 때문에 없어지는 것인지 원래부터 없는 것인지가 갈린다.

### B-5. `CapacitorHttp`가 `Origin` 헤더를 붙이는가 ★★

`docs/capacitor-spike.md` §2의 결론 전체가 이 한 항목에 달려 있다.

**구성 B 안에서는 그냥 잴 수 없다.** WebView origin이 서버 origin과 같게 위장돼 있어서,
`Origin`을 붙이든 안 붙이든 서버 검사를 똑같이 통과하기 때문이다. 그래서 **origin이
다른 대상**에 같은 요청을 던져 서버의 기존 동작으로 가른다.

워커는 `on-my-way.jungslawyer.workers.dev`로도 열려 있다. **[검증] 2026-07-30** 두 호스트의
`/api/health` 응답이 바이트 단위로 같다 — 같은 배포다. 이게 깨지면 아래 403이 출처 검사가
아니라 배포 차이 때문일 수 있으므로, 측정 전에 두 응답을 먼저 비교한다.

데스크톱에서 미리 확인한 서버의 실제 응답은 이렇다 (**[검증] 2026-07-30 curl**):

| 요청 | 응답 |
| --- | --- |
| `Origin` 없음 → `…workers.dev/api/health` | **200** |
| `Origin: https://onmyway.olivenrich.com` → 같은 URL | **403** |

그래서 기기 콘솔에서:

```js
(await fetch("https://on-my-way.jungslawyer.workers.dev/api/health")).status
```

| 관측 | 적는 값 |
| --- | --- |
| **200** | `Origin`을 붙이지 않는다 → 스파이크 §2 성립, **서버 변경 불필요** |
| **403** | `Origin`을 붙인다 → ②가 되살아난다. 서버의 동일 출처 검사를 허용목록으로 바꿔야 한다 |
| 그 외 / 네트워크 오류 | 상태 코드와 오류 메시지를 그대로 적는다. 이 측정은 무효다 |

서버 코드를 고치지 않고 재려고 고른 방법이다. 값이 애매하면 **애매하다고 적는다** —
여기서 잘못 적으면 그 위에 쌓는 판단이 전부 틀어진다.

### B-6 · B-7 · B-8 · B-9 · B-10

A-6 · A-7 · A-8 · A-9 · A-10과 같은 절차. B에서 추가로 볼 것:

- **B-6**: `location.assign("/api/auth/…/start")`는 **최상위 이동**이라 `CapacitorHttp`가
  가로채지 않는다. 구성 B에서는 그 경로가 로컬 서버로 들어가 번들에서 찾다 실패할 수
  있다. **무엇이 화면에 떴는지 그대로 적는다** — 흰 화면, 404, provider 로그인 화면 중 어느 것인가.
- **B-7**: 쿠키가 붙지 않는다면 `SameSite=Lax` 때문인지 네이티브 잼이 비어서인지 아직
  갈리지 않는다. 이번 회차는 `CapacitorCookies`를 **일부러 끈 상태**다(변수를 하나씩
  움직이려고). 갈라야 하면 다음 회차에서 켠다.
- **B-8**: 번들 앱이라 `localStorage`가 앱 데이터 영역에 남는다. A와 결과가 다를 수 있으므로
  A의 값과 나란히 적는다.
- **B-9**: 구성 B는 origin이 위장된 번들이라 다운로드 처리가 A와 다를 수 있다. **A와 B를
  따로 적는다** — 한쪽만 되면 그 자체가 구성 선택의 근거가 된다.

---

## 기록지

빌드: 워크플로 실행 번호 ______ / 기기 ______ / Android 버전 ______ / 날짜 ______

| # | 항목 | A | B |
| --- | --- | --- | --- |
| 1 | 앱이 뜨고 `data-app-ready` | 미검증 | 미검증 |
| 2 | `/api/health` 200 | 미검증 | 미검증 |
| 3 | 동일 출처 검사 통과 (403 아님) | 미검증 | 미검증 |
| 4 | `/api`가 로컬 서버에 가로채이는가 | 해당 없음 | 미검증 |
| 5 | `CapacitorHttp`가 `Origin`을 붙이는가 | 해당 없음 | 미검증 |
| 6 | 카카오·네이버·구글 완주 | 미검증 | 미검증 |
| 7 | 완주 후 세션 쿠키 유효 | 미검증 | 미검증 |
| 8 | 재시작 후 세션·`localStorage` | 미검증 | 미검증 |
| **9** | **`.md` 내보내기가 파일을 저장하는가** ★ | 미검증 | 미검증 |
| 10 | `window.print()` 실패 방식 + 탈출 경로 | 미검증 | 미검증 |

9번이 굵은 이유: 나머지가 전부 실패해도 9번이 통과하면 앱을 낼 수는 있다. 9번이 실패하면
**페이월을 켤 수 없다** — 잠긴 유저가 자기 기록을 가져갈 방법이 앱에 없어진다.
그리고 이 항목만 Pro 계정 없이 잰다.

## 결과를 어떻게 읽는가

| 관측 조합 | 뜻 | 다음 |
| --- | --- | --- |
| B-4 통과 + B-5가 200 | `script.js`도 서버도 **변경 없이** API가 동작한다 | 남은 문제는 인증 왕복(6·7)뿐이다 |
| B-4 통과 + B-5가 403 | API는 나가지만 다른 origin은 막힌다 | 서버 검사를 허용목록으로 바꾸는 비용을 견적한다 |
| B-4 가로채임 | 구성 B의 전제가 깨진다 | 대조군(§B-4)으로 원인을 가른 뒤 A로 판단이 넘어간다 |
| A만 통과 | 웹 래퍼 형태만 동작한다 | `server.url`의 심사 위험을 감수할지가 결정 사항이 된다 |
| 둘 다 실패 | 서버를 고쳐야 한다 | 그때에만 스파이크 §1의 CSRF 방어 완화 거래를 다시 꺼낸다 |
| **9번이 A·B 모두 실패** | 다른 항목과 무관하게 **페이월을 켤 수 없다** | 네이티브 다운로드 처리를 먼저 붙인다. 그 전에는 `HARD_PAYWALL_ENABLED`를 켜지 않는다 |

**리드타임 추정은 이 표가 채워진 뒤에 한다.** 인증 경로가 미검증인 상태의 숫자는 근거가 없다.
