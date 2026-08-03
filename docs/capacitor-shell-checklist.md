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
| 카카오 | **시스템 브라우저(삼성 인터넷)** — 최상위 액티비티가 `com.sec.android.app.sbrowser/.SBrowserMainActivity`로 바뀐다. Custom Tab도 아닌 전체 브라우저다 | **브라우저에 머무름** — 로그인 성공 후에도 최상위는 계속 삼성 인터넷이고, 앱 WebView는 랜딩(`#designFlow`)에 남아 있었다 | `anonymous` |
| 네이버 | **시스템 브라우저(삼성 인터넷)** — `SBrowserLauncherActivity`, 넘어간 URL은 `nid.naver.com/…` | 미검증 — 브라우저에서 완주하지 않았다 | 미검증 |
| 구글 | **시스템 브라우저(삼성 인터넷)** — 브라우저가 `handleIntentForExternalApp`으로 받았고, 넘어간 URL은 `accounts.google.com/…`이었다 | 미검증 — 브라우저에서 로그인을 완주하지 않았다 | 미검증 |

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
| `/api/auth/me` 상태 | 200 `{"user":null}` | 200 `{"user":null}` |
| `localStorage` 키 수 | 4 | 4 (`omwCompanionState` · `onmyway:anonymous-device` · `onmyway:active-scope` · `omwExecutionTheme`) |

**세션 쪽은 이 측정으로 갈리지 않는다.** A-7이 실패해 애초에 세션이 없었으므로 "재시작해도
유지되는가"가 아니라 "없던 것이 여전히 없다"를 본 것이다. 로그인이 완주되는 변형이 나온 뒤에
다시 재야 한다. B는 `/api/auth/me`마저 로컬 서버가 먹어(B-4) 물어볼 수조차 없었고,
`localStorage`는 2키(`onmyway:anonymous-device` · `onmyway:active-scope`)가 그대로 남았다.

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

빌드: 워크플로 실행 번호 **30548479600** / 기기 **SM-G977N (갤럭시 S10 5G)** /
Android 버전 **12** / 날짜 **2026-08-02**

| # | 항목 | A | B |
| --- | --- | --- | --- |
| 1 | 앱이 뜨고 `data-app-ready` | **부분** — 실서버를 열고 `app.html`에서 `appReady:"true"`. 로그인이 완주되지 않으므로 스파이크가 경고한 "가장 나쁜 형태의 성공" | **통과** — 번들이 렌더된다(흰 화면·즉시 종료 아님) |
| 2 | `/api/health` 200 | **통과** — 200 `{"ok":true,"environment":"production",…}` | **해당 없음** — 로컬 서버가 삼킨다(4 참조) |
| 3 | 동일 출처 검사 통과 (403 아님) | **통과** — `/api/auth/providers` 200. `Origin: null` 문제 없음 | **무효** — 200이지만 본문이 번들 HTML이라 출처 검사를 잰 것이 아니다 |
| 4 | `/api`가 로컬 서버에 가로채이는가 | 해당 없음 | **가로채인다** — 상대·절대 URL 모두 `text/html` + 번들 `index.html` |
| 5 | `CapacitorHttp`가 `Origin`을 붙이는가 | 해당 없음 | **붙이지 않는다** — `…workers.dev/api/health` 200 + JSON |
| 6 | 카카오·네이버·구글 완주 | **실패** — 셋 다 시스템 브라우저로 이탈. 카카오는 완주 후 복귀도 안 됨 | **실패** — provider 화면에 도달조차 못 한다. 로컬 서버가 `/api/auth/…/start`를 먹는다 |
| 7 | 완주 후 세션 쿠키 유효 | **실패** — `/api/auth/me`가 200 `{"user":null}`, `document.cookie` 빈 문자열 | **측정 불가** — 6이 시작조차 못 하고 `/api/auth/me`도 번들 HTML이다 |
| 8 | 재시작 후 세션·`localStorage` | **부분** — `localStorage` 4키 유지. 세션은 없던 상태라 갈리지 않는다 | **부분** — `localStorage` 2키 유지. 세션은 로컬 서버가 먹어 물을 수 없다 |
| **9** | **`.md` 내보내기가 파일을 저장하는가** ★ | **실패** | **실패** |
| 10 | `window.print()` 실패 방식 + 탈출 경로 | **조용한 실패** — 예외도 대화상자도 신호도 없다. 제품 경로(`printDiaryBook`)는 도달 불가 | **조용한 실패** — A와 동일 |

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

---

## 1회차가 갈라 놓은 것 (2026-08-02)

### ① 9번이 A·B 모두 실패했다 — 페이월을 켤 수 없다

위 표의 마지막 줄이 발동했다. `exportRecordsFile()`은 **예외 없이 끝나고 토스트도 뜨는데
파일이 생기지 않는다.** 앱이 성공했다고 말하는 그 형태다.

근거 셋이 같은 방향을 가리킨다 — `/sdcard` 전체에 `.md` 없음, **DownloadManager에 기록
자체가 없음**(다운로드가 시작조차 안 됐다), logcat에 download·blob 관련 줄 없음.
`[미검증]`으로 남아 있던 가설이 확인됐다: Capacitor 기본 `BridgeActivity`는
`DownloadListener`를 붙여 주지 않는다.

`HARD_PAYWALL_ENABLED`를 켜기 전에 네이티브 다운로드 처리를 먼저 붙여야 한다.

### ② B-4는 깨졌지만 B-5가 길을 하나 열었다

`/api/*`는 **상대 경로든 절대 URL이든** 번들 `index.html`로 돌아온다 — 위장한 origin
전체를 로컬 서버가 소유한다. `CapacitorHttp`가 켜져 있어도(패치는 확인됐다) 같은 origin은
구해 주지 않는다. 스파이크의 "수정 0곳" 기대는 여기서 끝난다.

대신 **다른 호스트로 나가는 요청은 네이티브로 빠지고 `Origin`을 붙이지 않는다**(B-5 200).
그날 데스크톱 curl로 확인한 판별자(Origin 없음 200 / 있음 403)는 **2026-08-02에도 그대로**라
이 200은 "Origin이 없었다"는 뜻이다. 즉 위장 origin을 버리고 `script.js`가 API를 절대
URL로 부르게 하면, 네이티브 경로로 나가면서 서버의 동일 출처 검사도 통과한다 —
스파이크가 "6곳 남짓"이라 적은 그 수정이 실제 후보가 된다. **서버 변경은 불필요하다.**

### ③ A-6은 세 provider 모두 시스템 브라우저로 이탈했다

`location.assign`이 삼성 인터넷을 띄우고 로그인이 거기서 끝난다. 세션 쿠키는 그 브라우저의
잼에 들어가고 WebView는 익명으로 남는다. 문서가 예고한 대로 다음 회차 변형은
`allowNavigation`에 provider 호스트를 넣어 WebView 안에 붙잡아 두는 것이다.

**구성 B는 이탈조차 못 한다.** `/api/auth/kakao/start`로 최상위 이동을 해도 로컬 서버가
번들 `index.html`을 돌려주고 앱 안에 머문다. URL만 그 경로로 남아서 **상대 경로 에셋이
`/api/auth/kakao/assets/…`로 새는 것**까지 관측됐다. 6번은 4번의 따름정리다.

### ④ 인쇄는 조용히 죽는다 — 신호가 하나도 없다

A·B 모두 같다. `window.print()`는 **1ms 안에 반환하고 예외를 던지지 않으며**, 인쇄 창도
뜨지 않고, `beforeprint`도 오지 않고, `matchMedia("print").matches`는 계속 `false`이며,
logcat에 print 관련 줄도 printspooler 액티비티도 없다.

**`docs/native-print-bridge.md` §5의 후보 E는 이 관측으로 닫힌다.** 그 후보는 인쇄 종료를
"시간 추정" 대신 "신호 기반"으로 잡자는 것이었는데, **잡을 신호가 없다.**

제품 경로(`printDiaryBook`)는 이번 회차에서 도달할 수 없었다 — Pro 계정이 없어서가 아니라
A-7이 실패해 앱에서 로그인이 완주되지 않으므로 `canCreateDiaryBook()`이 열리지 않는다.
그래서 잰 것은 게이트 뒤의 `window.print()` 자체이고, `document.title` 탈출 경로는 여전히
**미검증**이다.

## 이 회차의 측정 방법이 문서와 다른 점

관측을 그대로 믿으려면 어떻게 쟀는지도 남아야 한다.

- **계측 경로**: USB 케이블이 데이터를 물지 않아(`adb devices`에 아무것도 안 잡힘)
  **무선 디버깅**(`adb pair`/`connect`)으로 붙었고, DevTools 화면 대신
  `adb forward` + CDP `Runtime.evaluate`로 같은 콘솔을 쳤다. 관측 대상은 동일하다.
- **9번의 진입점**: `exportRecordsFile`은 잠금 화면의 `#paywallExportRecords`에만 묶여
  있고 기록 탭에는 버튼이 없다. `HARD_PAYWALL_ENABLED`가 꺼져 있어 그 화면에 도달할 수
  없으므로 프로덕션에 노출된 `window.__omwTest.exportRecordsFile()`로 **같은 함수**를
  호출했다. 다운로드 경로(blob → `<a download>` → `click`)는 손대지 않았다.
- **파일 유무 판정**: 파일 관리자 눈확인이 아니라 `adb shell find /sdcard`,
  `dumpsys DownloadManager`, `logcat`으로 갈랐다.
- **A-1의 `app.html` 진입**: 랜딩의 "로그인/회원가입"은 이동이 아니라 인증 시트를 연다.
  그래서 WebView를 코드로 `/app.html`에 보내고 `appReady`를 읽었다.
- **A-7의 값이 문서 예상과 다르다**: 401이 아니라 **200 `{"user":null}`** 이다.
  뜻은 같지만(세션 없음) 표의 판정 기준은 이 값으로 읽어야 한다.
- **8번의 "완전 종료"**: 최근 앱 스와이프 대신 `adb shell am force-stop`으로 죽였다.
  스와이프보다 강한 종료라 유지 판정이 느슨해지지는 않는다.
- **10번은 게이트 뒤를 직접 쳤다**: 제품 경로가 막혀 있어 `window.print()`를 그대로 불렀다.
  호출 전후로 최상위 액티비티가 앱인 것을 확인한 측정만 채택했다 — **백그라운드에서 잰
  첫 시도는 버렸다.** 화면이 꺼지면 WebView JS가 얼어 측정이 통째로 무효가 된다
  (그 상태에서 타이머를 기다리면 평가가 영원히 멈춘다).
- **B-6은 버튼 클릭과 직접 이동을 둘 다 했다**: 버튼만으로는 UI 상태와 구분되지 않아
  `location.assign("/api/auth/kakao/start")`로 같은 코드 경로를 직접 밟았다.

## 곁가지로 잡힌 제품 결함 후보 (셸과 무관)

**provider 로그인이 앱을 떠나면 인증 시트의 버튼이 잠긴 채 남는다.** 구글을 눌러 삼성
인터넷으로 나간 뒤 앱으로 돌아오니 카카오·네이버·구글 버튼이 전부 `disabled=true`였고,
`location.reload()` 뒤에야 셋 다 풀렸다. 서버는 그 시점에도 셋을 `configured:true,
visible:true`로 내려주고 있었으므로 서버 상태가 아니라 클라이언트의 pending 상태다.

웹에서도 같은 형태가 나오는지는 확인하지 않았다 — 확인하고 재현되면 셸과 무관하게 고칠
대상이다. (Apple 버튼은 DOM에 있지만 숨겨져 있어 결함이 아니다. 서버가 `visible:false`로
내려주는 대로 화면에 없다.)

## 다음 회차에 잴 것

이번 회차에서 미검증으로 남은 것은 **인증이 완주되어야만 잴 수 있는 것들뿐이다.**
그래서 순서가 정해진다 — 3번을 먼저 세우지 않으면 나머지를 잴 수 없다.

1. **네이티브 다운로드 처리** — 9번이 이걸로 갈린다. 페이월의 선행 조건이라 가장 무겁다.
   **붙였다**(`mobile/scripts/patch-download.mjs`, 2026-08-02): 생성된 `MainActivity`에
   `DownloadListener`를 심고 `blob:`은 페이지에서 읽어 `MediaStore.Downloads`에 쓴다.
   다음 빌드에서 잴 것 — ⓐ 파일이 실제로 생기는가 ⓑ **이름이 `on-my-way-기록-YYYY-MM-DD.md`로
   남는가**(`blob:`에는 `Content-Disposition`이 없어 기본 이름으로 떨어질 수 있다)
   ⓒ A와 B 양쪽에서 같은가
2. **`allowNavigation`에 provider 호스트를 넣은 A 변형** — 6·7이 여기에 달려 있고,
   7이 서야 8의 세션 칸과 10의 제품 경로가 열린다.
   **넣었다**(`mobile/scripts/prepare.mjs`의 구성 `a`, 2026-08-03) → 아래 2회차 절차
3. 절대 URL 구성 — B-5가 연 길이 실제로 서는지
4. 그 뒤에 남는 것: 8번의 세션 유지, 10번의 `document.title` 탈출 경로(**Pro 계정 필요**),
   provider 3종의 완주 후 복귀

---

# 2회차 (A′) — 준비 2026-08-03

## 이번 회차가 움직인 변수는 하나다

구성 A의 `server.allowNavigation`에 `*.kakao.com` · `*.naver.com` ·
`accounts.google.com`을 넣었다. **그 외에는 아무것도 바꾸지 않았다** — 서버도
`script.js`도 구성 B도 1회차 그대로다. 3번(절대 URL)은 이번에 넣지 않는다. 한 회차에
변수를 둘 움직이면 결과가 어느 쪽 것인지 갈리지 않는다.

**구성 B는 1회차와 동일한 채로 다시 빌드한다.** 재는 것은 다운로드 하나뿐이고(아래 D),
B는 그 대조군이다.

## 왜 이 한 줄에 로그인 전체가 걸려 있는가

구성 A는 페이지 origin이 곧 서버 origin이라 **스파이크 §1의 블로커 셋이 애초에
해당되지 않는다** — 상대 경로도(A-2 통과), 동일 출처 검사도(A-3 통과), 쿠키도 웹과 같다.
1회차에서 A가 실패한 이유는 단 하나, **OAuth가 앱 밖으로 나가서 돌아오지 않는 것**이었다.

콜백이 WebView 안에서 끝나면 쿠키는 같은 잼에 앉는다. 즉 **이게 서면 제품 코드 수정
0곳으로 로그인이 선다.** 서지 않으면 Custom Tab + App Link로 넘어가고, 그건 훨씬 큰
작업이다. 이번 회차는 그 갈림길을 정하는 측정이다.

## 예상 — 적기 전에 먼저 적어 둔다

**구글은 실패할 것으로 예상한다.** 구글이 WebView 내 OAuth를 정책으로 막는다
(`disallowed_useragent`). 카카오·네이버는 선다고 본다.

예상을 미리 적는 이유는 맞히려는 게 아니라, **관측이 예상과 다를 때 그것이 발견이라는
것을 알아보기 위해서**다. 구글이 WebView 안에서 완주하면 그건 예상이 틀린 것이고,
그 사실을 적는다.

## 준비물 — 1회차와 다른 점 둘

| | |
| --- | --- |
| APK | `Android debug APK` 워크플로를 **A′ 변경이 올라간 브랜치**에서 `workflow_dispatch` (`both`) |
| **Pro 계정** | 10번의 제품 경로에 필요하다. 결제가 꺼져 있으므로 **관리자 승격으로 만든다** — `/api/admin/users/update`에 `plan: "pro"` (`auth-service.mjs:1312-1322`). 로그인이 완주된 뒤에 한다 |
| 계측 | 1회차와 동일 — 케이블이 데이터를 물지 않으므로 무선 `adb pair`/`connect` + `adb forward` + CDP `Runtime.evaluate` |

**A′는 appId가 1회차 A와 같다**(`…verifya`). 설치하면 덮어쓰므로 1회차 A는 기기에서
사라진다. 1회차 값은 위 기록지에 있으니 잃는 것은 없다.

## D. 다운로드 — 순서상 먼저 잰다 ★

1회차 9번이 A·B 모두 실패했고 그 뒤 `patch-download.mjs`를 붙였다. **아직 가설이다**
(CI에서만 돌고 산출물이 APK 안으로 사라진다). 로그인보다 먼저 재는 이유는 **로그인과
무관하게 잴 수 있고**(익명으로도 기록 화면에 간다), 페이월의 선행 조건이기 때문이다.

1회차와 같은 진입점을 쓴다 — `window.__omwTest.exportRecordsFile()`.

| # | 관측 | A′ | B |
| --- | --- | --- | --- |
| D-a | 파일이 실제로 생기는가 | ~~실패~~ → **통과** (CSP 배포 후 재측정) | **통과** — `/sdcard/Download/…md` 83 bytes |
| D-b | 이름이 `on-my-way-기록-YYYY-MM-DD.md`로 남는가 | **실패** — `d08a2d6e-6bb2-4cf1-8163-24dc29944fde.md` (blob UUID) | **실패** — `851527af-2396-4b6f-81a8-882976aecfcd.md` (blob UUID) |
| D-c | 열어서 내용이 보이는가 | **통과** — 회원 기록이 들어 있다(목표 1줄 + `## 2026-08-01` 항목, 152 bytes) | **통과** — `# 내 기록 원본 / 내보낸 날: 2026-08-03 / 아직 남긴 기록이 없어요.` |
| D-d | logcat `OmwDownload` | ~~`blob 읽기 실패`~~ → `저장 완료: d08a2d6e-….md (152 bytes)` | `저장 완료: …md (83 bytes)` |

### A′ 재측정 (2026-08-03, CSP 배포 후)

`connect-src`에 `blob:`을 넣은 커밋이 **PR #74로 머지되어 프로덕션에 배포된 뒤** 같은
기기·같은 앱으로 다시 쟀다. **D-a가 뒤집혔다.**

측정 순서를 이렇게 잡은 이유가 있다 — 기기부터 재면 실패했을 때 원인이 CSP인지 배포
지연인지 갈리지 않는다. 그래서 **먼저 프로덕션 응답 헤더를 확인**했다:

```
connect-src 'self' blob: https://*.tosspayments.com
```

그 다음에 앱을 재시작하고 `window.__omwTest.exportRecordsFile()`을 불렀다. 콘솔에 CSP
오류가 사라졌고 logcat에 `저장 완료`가 찍혔으며, 파일이 실재하고 내용도 열렸다.
**진단이 끝에서 끝까지 확인됐다.**

**A′는 이번엔 로그인된 회원(`kakao`) 상태로 쟀다** — 그래서 파일이 152 bytes이고 실제
목표·기록이 들어 있다. B의 83 bytes는 익명 상태의 "아직 남긴 기록이 없어요"였다.
**빈 파일이 아니라 실제 데이터가 나온다는 것이 여기서 처음 확인됐다.**

**남은 것은 D-b 하나다.** 이름은 A′·B 양쪽에서 blob UUID로 떨어진다. 파일이 생기고 내용이
열리므로 **열람·이동권은 선다** — 페이월을 막던 근거는 사라졌다. 이름은 별건이다.

**네이티브 패치는 동작한다.** B가 그 증거다 — `DownloadListener`가 잡고, 페이지에서 blob을
읽고, `MediaStore.Downloads`에 쓰는 경로가 끝까지 돌았다. 1회차의 실패 원인(DownloadListener
부재)은 닫혔다.

### D-a가 A′에서만 실패하는 이유 — 워커의 CSP

WebView 콘솔이 원인을 그대로 말한다:

```
Connecting to 'blob:https://onmyway.olivenrich.com/f38551e1-…' violates the following
Content Security Policy directive: "connect-src 'self' https://*.tosspayments.com".
```

**[코드]** `worker.mjs:67`의 `connect-src`에 `blob:`이 없다. `'self'`는 blob URL을 덮지
않는다 — blob 스킴은 따로 적어야 한다. 그래서 패치가 주입한 읽기 조각의 `fetch(blob:…)`가
거부되고 `OmwBlobBridge.fail`로 떨어진다.

**B에서는 같은 코드가 통과한다.** B의 페이지는 Capacitor 로컬 서버가 주므로 워커의 CSP
헤더가 붙지 않는다(`meta[http-equiv=Content-Security-Policy]`도 없음을 확인했다).
**변수 하나만 다른 대조**이고 결과가 뒤집혔으므로 원인 판정은 이것으로 닫힌다.

웹에는 이 문제가 없다 — 브라우저의 `<a download>`는 blob을 `fetch`하지 않고 직접
내려받는다. **네이티브 경로에서만 blob을 읽어야 해서 드러난 것이다.**

### D-b — 이름이 blob UUID로 떨어진다

체크리스트가 예고한 그대로다. `blob:`에는 `Content-Disposition`이 없어
`URLUtil.guessFileName`이 URL 경로 조각(UUID)을 이름으로 쓴다. `<a download>`가 정한
이름은 네이티브까지 전달되지 않는다.

**D-a와 한 칸에 적지 않은 이유가 여기서 갈렸다** — 파일은 생기므로 열람·이동권은 선다.
이름은 그 다음 단이다.

### 측정 방법 정정 — `find /sdcard`를 쓰지 마라

**이 문서가 지정했던 `adb shell find /sdcard -iname '*.md'`는 파일이 있어도 못 찾는다.**
같은 시점에 `ls /sdcard/Download/*.md`는 파일을 보여 준다. 스코프드 스토리지의 FUSE
계층을 `find`가 제대로 훑지 못한다.

1회차의 9번 "실패" 판정은 유지된다 — 근거가 셋이었고 나머지 둘(DownloadManager 기록
없음, logcat 무음)이 독립적으로 같은 결론을 가리켰다. 하지만 **`find` 하나만 봤다면
거짓 음성이었다.** 앞으로는 `ls /sdcard/Download/*.md` 또는
`content query --uri content://media/external/downloads`로 판정한다.

**D-b가 갈리는 지점**: `blob:`에는 `Content-Disposition`이 없어 `<a download>`가 정한
이름이 살아남지 못할 수 있다. 이름이 깨져도 **D-a가 통과하면 페이월 차단은 풀린다** —
이름 보존은 그 다음 단이다. 둘을 한 칸에 적지 않는 이유가 그것이다.

**출처 검사가 작동하는지도 여기서 함께 본다.** 패치는 `ALLOWED_ORIGIN`을 config에서
끌어오므로 A′는 `https://onmyway.olivenrich.com`이다. A′는 이제 provider 도메인을
WebView 안에서 열므로, **카카오 로그인 화면에 머문 상태에서 같은 호출을 한 번 더
해 본다** — logcat에 "허용되지 않은 출처의 저장 요청을 무시했습니다"가 찍히고 파일이
생기지 않아야 한다. 이 검사가 실제로 도는 것을 보는 유일한 기회다.

## A′-6. provider 3종 — 어디서 열리고 어디로 돌아오는가 ★★

1회차와 같은 절차, 같은 칸. **바뀐 것은 기대값뿐이다.**

| provider | 어디서 열림 | 완주 후 | `authState` |
| --- | --- | --- | --- |
| 카카오 | **WebView 안** — 최상위 액티비티가 `…verifya/.MainActivity`. 페이지는 `accounts.kakao.com/login/?continue=…kauth.kakao.com/oauth/authorize…` | 미검증 — 자격증명 입력이 필요하다 | 미검증 |
| 네이버 | **WebView 안** — 같은 액티비티. 페이지는 `nid.naver.com/oauth2.0/authorize?client_id=…` | 미검증 — 같은 이유 | 미검증 |
| 구글 | **WebView 안** — 같은 액티비티. 페이지는 `accounts.google.com/v3/signin/identifier`, 제목 "로그인 - Google 계정", 이메일 입력 폼이 실제로 렌더된다 | 미검증 — 같은 이유 | 미검증 |

**셋 다 시스템 브라우저로 나가지 않았다.** 1회차에서 셋 모두 삼성 인터넷으로 이탈했던
것이 `allowNavigation` 한 줄로 뒤집혔다.

### 예상이 틀렸다 — 구글이 막지 않았다

**[관측]** UA는 `Mozilla/5.0 (Linux; Android 12; SM-G977N Build/SP1A.210812.016; wv)
AppleWebKit/537.36 … Chrome/150.0.7871.181 Mobile Safari/537.36`이다. **`; wv)`가 그대로
들어 있다** — 구글이 WebView를 식별하지 못해서 통과한 것이 아니다. 식별할 수 있는 상태로
로그인 화면을 내줬다.

이 문서는 `disallowed_useragent`를 예상했고, 그래서 구글을 목록에 넣은 이유가 "거절 화면이
WebView 안에서 뜨는 것과 브라우저로 나가는 것은 다른 관측이기 때문"이었다. **셋째 결과가
나왔다 — 거절 자체가 없었다.**

**이것을 "구글 로그인이 된다"로 읽으면 안 된다.** 잰 것은 식별 단계 화면이 렌더된다는
것뿐이다. 자격증명을 넣은 뒤 거절될 수 있고, 구글이 정책 집행을 바꾸면 예고 없이 막힐 수
있다. **완주는 미검증이고, 이 경로의 안정성은 우리가 통제하지 못한다.**

### 와일드카드가 실제로 필요했다

카카오는 `kauth.kakao.com`에서 시작해 **`accounts.kakao.com`으로 리다이렉트**했다.
`allowNavigation`에 `kauth.kakao.com`만 적었다면 그 리다이렉트에서 앱을 벗어났고,
관측은 "WebView에서 OAuth가 안 된다"는 **틀린 결론**으로 적혔을 것이다.
`*.kakao.com`으로 적은 판단이 여기서 값을 했다.

"어디서 열림"은 **최상위 액티비티로 판정한다** — `adb shell dumpsys activity activities`
가 앱 패키지면 WebView 안, `com.sec.android.app.sbrowser`면 이탈이다. 화면만 보고
적지 않는다. 1회차에서 이 판정으로 갈랐다.

| 관측 | 적는 값 |
| --- | --- |
| WebView 안에서 열리고 완주 후 앱 화면으로 돌아온다 | 통과 |
| WebView 안에서 열리는데 **provider가 거절**한다(구글 `disallowed_useragent` 등) | **정책 거절** — 거절 화면의 문구·오류 코드를 그대로 적는다. 이탈과 다른 값이다 |
| 여전히 삼성 인터넷으로 나간다 | **실패** — `allowNavigation`이 안 먹었다. 넘어간 URL의 호스트를 적는다(와일드카드가 못 잡은 호스트일 수 있다) |
| WebView 안에서 완주했는데 앱이 빈 화면·오류 | 실패. URL과 콘솔 오류를 적는다 |

세 번째 줄이 나오면 **그 호스트를 `allowNavigation`에 추가해 다시 빌드한다.** 그건
측정 실패이지 결론이 아니다.

## A′-7 · 8 · 10 — 6번이 서야 열린다

6번이 하나라도 통과했을 때만 잰다. 절차는 1회차 A-7 · A-8 · A-10과 같다.

| # | 항목 | 값 |
| --- | --- | --- |
| 7 | `/api/auth/me` 상태 + `document.cookie` | **통과** — 200 `{"user":{…}}`, `usr_jnqNBEje…` / provider `kakao` / plan `expired`, `authState: "member"`. `document.cookie`는 빈 문자열 — 세션 쿠키가 `HttpOnly`라 정상이다 |
| 8 | `am force-stop` 후 `/api/auth/me`와 `localStorage` 키 수 | **통과** — 세션 유지(`kakao`/`expired`, `authState: "member"`), `localStorage` 11키 그대로 |
| 10a | 제품 경로 `printDiaryBook()`가 열리는가 (**Pro 승격 후**) | **미검증** — 아래 참조 |
| 10b | `document.title` 탈출 경로 — 화면 탭 후 원래 값으로 돌아오는가 | **미검증** — 10a가 선행 |

### 7번이 이번 회차의 결론이다

**앱 안에서 로그인이 완주되고 세션이 선다. 제품 코드는 한 줄도 바꾸지 않았다.**
1회차에서 A가 "가장 나쁜 형태의 성공"(뜨지만 로그인 불가)이었던 것이 `allowNavigation`
한 줄로 닫혔다.

**측정 경로에 관한 정직한 기록**: 자격증명은 사용자가 직접 폰에서 입력했고, 이 세션은
그 뒤 `/api/auth/kakao/start`를 다시 밟아 **자격증명 입력 없이 왕복이 완주되는 것**을
관측했다(카카오 세션이 WebView 잼에 남아 있었다). 즉 OAuth 왕복 전체가 WebView 안에서
끝나고 우리 세션 쿠키가 같은 잼에 앉는다는 것이 확인된 것이고, 로그인 폼 입력 자체를
이 세션이 관측한 것은 아니다.

**8번은 1회차와 성격이 다르다.** 1회차 8번은 "없던 것이 여전히 없다"를 본 것이었다.
이번에는 세션이 실재하는 상태에서 죽였다 살렸으므로 유지 여부가 실제로 갈렸다.

### 10번이 미검증인 이유 — 측정자가 아니라 권한 문제다

`printDiaryBook()`은 `canCreateDiaryBook()` 뒤에 있고 계정이 `expired`다. Pro 승격은
`/api/admin/users/update`인데 그 앞에 `role === "admin"` 세션이 필요하고, 관리자 로그인은
`ADMIN_PASSWORD`를 요구한다(`auth-service.mjs:1123-1125`). **비밀번호 입력이 필요한
단계라 이 세션에서 진행하지 않았다.**

우선순위는 낮다 — 1회차에서 `window.print()`가 A·B 모두 신호 없이 죽는 것이 이미
확정됐고(`docs/native-print-bridge.md` §5 후보 E는 그때 닫혔다), 10번이 추가로 답하는 것은
`document.title`이 갇히지 않는지 하나다. 스토어 등록 정보에서 인쇄·PDF 줄을 빼야 한다는
결론은 이 칸과 무관하게 이미 서 있다.

**7번의 판정 기준을 1회차 값으로 고쳐 둔다**: 실패는 401이 아니라
**200 `{"user":null}`** 로 나타난다. 로그인이 섰다면 `user`에 객체가 들어 있어야 한다.

**10b는 1회차에서 잴 수 없었던 유일한 칸이다.** 게이트가 안 열려 `window.print()`를
직접 불렀고, 그건 `printDiaryBook`의 되돌리기 등록을 지나지 않는다.

## 이 회차가 무엇을 결정하는가

| A′-6 결과 | 뜻 | 다음 |
| --- | --- | --- |
| 셋 다 통과 | **제품 코드 수정 0곳으로 로그인이 선다** | 남는 건 `server.url`의 심사 위험 판단뿐 |
| 카카오·네이버 통과, 구글만 거절 | 예상대로 | 구글만 Custom Tab + App Link. 나머지는 그대로 |
| 카카오·네이버도 이탈 | `allowNavigation`이 이 앱에서는 답이 아니다 | 세 provider 전부 Custom Tab + App Link. **작업량이 크게 는다** |
| **D-a가 또 실패** | 네이티브 패치가 가설로 끝났다 | 6번 결과와 무관하게 **페이월은 여전히 못 켠다** |

**실제 결과: D-a는 A′·B 모두 통과했다.** 마지막 줄은 발동하지 않았다 —
`HARD_PAYWALL_ENABLED`를 막던 "잠긴 유저가 기록을 가져갈 방법이 앱에 없다"는 근거가
사라졌다. **다만 그것이 페이월을 켜도 된다는 뜻은 아니다.** 나머지 선행 조건
(`PAYMENTS_ENABLED=true` + 실결제 검증)은 그대로 남아 있고, 그쪽이 훨씬 무겁다.
