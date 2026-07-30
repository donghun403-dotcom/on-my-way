# Capacitor 스파이크 — 인증 경로 판정 (2026-07-30)

> 조사·프로토타입. 제품 코드는 바꾸지 않았다. 결론은 **가설 A 실패**이고, 대신 실행 가능한
> 경로를 하나 찾았다. 그 경로의 핵심 가정 하나는 실기기 없이 확인할 수 없다.

## 0. 이 스파이크가 실제로 검증한 범위

이 머신에는 **Java·Android SDK·Gradle이 없다.** Windows이므로 iOS 빌드는 애초에 불가능하다.
그래서 APK 빌드·에뮬레이터 실행·실제 OAuth 왕복은 **하나도 돌려 보지 못했다.**

대신 두 가지를 했고, 각 항목의 근거를 아래에 표시한다.

| 표시 | 뜻 |
| --- | --- |
| **[코드]** | 이 리포지토리 소스를 읽어 확인 |
| **[CAP]** | 실제 설치한 Capacitor 8.4.2 패키지 소스를 읽어 확인 |
| **[미검증]** | 실기기·에뮬레이터가 있어야 확인 가능. 아래 §5에 모아 둠 |

Capacitor 8.4.2(`@capacitor/core`·`cli`·`android`)는 스크래치패드에 실제로 설치해서 읽었다.

## 1. 판정 — 가설 A는 실패한다

**가설 A**: 시스템 브라우저로 로그인 → 일회용 코드 → 앱이 받아 쿠키를 WebView에 주입.

가설 A가 푸는 문제는 **"세션을 어떻게 얻는가"** 다. 그런데 이 앱이 막히는 지점은 거기가 아니다.
**"요청이 서버에 닿는가"** 와 **"쿠키가 붙는가"** 에서 먼저 막힌다. 쿠키를 손에 넣어도 쓸 곳이 없다.

막히는 순서대로 셋:

### ① 상대 경로가 서버까지 가지 않는다 — 앱이 뜨자마자

Capacitor Android의 WebView origin 기본값은 **`https://localhost`** 다
(**[CAP]** `CapConfig.java`: `androidScheme = CAPACITOR_HTTPS_SCHEME`, `hostname = "localhost"`).
iOS는 `capacitor://localhost`다(**[CAP]** `iosScheme` 기본값 `capacitor`).

클라이언트의 API 호출은 전부 상대 경로다 — **[코드]** `fetch("/api/auth/me")`,
`fetch("/api/account/state")`, `fetch("/api/ai/companion-chat")` 등. 절대 URL 호출은 0건이다.

그래서 부팅 직후 `/api/auth/me`는 **`https://localhost/api/auth/me`** 로 해석되고,
Capacitor의 로컬 에셋 서버로 들어간다. **워커에는 도달조차 하지 않는다.**

### ② 절대 URL로 고쳐도 403이다

**[코드]** `worker.mjs`의 출처 검사:

```js
if (origin && origin !== url.origin && !trustedApplePost) return json({ error: "허용되지 않은 요청 출처입니다." }, 403);
```

허용목록이 아니라 **동일 출처 일치 검사**다. 추가할 자리가 없다. WebView 페이지 origin이
`https://localhost`이므로 브라우저가 붙이는 `Origin: https://localhost`가 `url.origin`과 달라
**모든 API 호출이 403**이다.

### ③ 쿠키를 주입해도 붙지 않는다

**[코드]** `auth-service.mjs`의 세션 쿠키는 `SameSite=Lax`이고 `Domain` 속성이 없다(host-only).
클라이언트는 **[코드]** 6곳 모두 `credentials: "same-origin"`이다.

`https://localhost` 페이지에서 `https://onmyway.app`으로 나가는 요청은 cross-site라
`SameSite=Lax` 쿠키는 **정의상 실리지 않는다.** 주입한 쿠키는 잼(jar)에 앉아만 있는다.

### 그래서

**세 블로커 중 쿠키 주입이 건드리는 것은 하나도 없다.** 셋 다 "세션을 어떻게 얻었는가"와
무관하다. 가설 A를 그대로 구현하면 로그인은 성공하고 앱은 여전히 아무것도 못 한다.

그리고 셋을 정면으로 뚫으려면 **보안 자세를 두 군데 바꿔야 한다** — 엄격 동일 출처를
출처 허용목록으로, `SameSite=Lax`를 `SameSite=None; Secure`로. 앱 하나 때문에 웹의
CSRF 방어를 낮추는 거래다. 권하지 않는다.

## 2. 실행 가능해 보이는 경로 — CapacitorHttp

Capacitor 8.4.2에는 **`CapacitorHttp`** 와 **`CapacitorCookies`** 가 들어 있고, 설정 플래그로
**네이티브에서 전역 `fetch`와 `XMLHttpRequest`를 가로챌 수 있다**
(**[CAP]** `declarations.d.ts`: "Enable CapacitorHttp to override the global `fetch` and
`XMLHttpRequest` on native").

가로채면 요청이 WebView가 아니라 **네이티브 HTTP 스택**으로 나간다. 그러면:

- **브라우저 CORS가 적용되지 않는다.** 프리플라이트도, `Origin` 헤더 강제도 없다.
- **네이티브 쿠키 잼**을 쓴다.

여기서 결정적인 것 하나 — **[코드]** 서버의 검사는 `if (origin && origin !== url.origin)`이다.
**`Origin` 헤더가 아예 없으면 이 조건은 거짓이라 통과한다.** 네이티브 HTTP 클라이언트는
`Origin`을 붙이지 않는다. 즉 **②가 서버 변경 없이 사라질 가능성이 높다.**

그래서 예상 변경 범위가 크게 줄어든다:

| 무엇 | 어디 | 비고 |
| --- | --- | --- |
| API 베이스 URL을 절대 경로로 | `script.js` 6곳 남짓 | 호출이 `accountRequest`와 직접 `fetch` 몇 개로 모여 있어 주입 지점이 적다 |
| `capacitor.config` 플래그 | 신규 | `CapacitorHttp.enabled`, `CapacitorCookies.enabled` |
| 서버 | **아마 변경 없음** | ②가 사라지고, ③은 §5의 미검증 항목에 달렸다 |

**script.js 수정은 필요하다.** 다만 "전면 개조"가 아니라 상대 경로를 절대 경로로 바꾸는
주입 지점 몇 곳이다.

## 3. 나머지 스파이크 항목

### 앱이 뜨는가 / `data-app-ready`에 도달하는가

**[미검증]** — 다만 코드상 정적 번들에 절대 URL 가정이 없어 부팅 자체는 될 것으로 본다.
**[코드]** `markAppReady()`는 `authReady`·`authState`·`pricingState` 셋을 요구한다. API가
전부 실패하는 상태에서 `authState`가 `anonymous`로 떨어지면 `data-app-ready`에는 도달하되
**로그인이 불가능한 앱**이 된다 — 가장 나쁜 형태의 "성공"이다. 스파이크 재개 시 이 구분을
먼저 확인해야 한다.

### 소셜 로그인 리다이렉트 (4개 provider)

**[코드]** `redirect_uri`가 `${url.origin}/api/auth/callback/${provider}`로 **서버 origin에서
파생**된다. 앱이 무엇을 하든 콜백은 서버로 돌아온다 — 그래서 OAuth 왕복 자체는 시스템
브라우저에서 정상 완주한다. 문제는 완주 후 **세션 쿠키가 시스템 브라우저의 잼에 앉는다**는
것이다. WebView와 공유되지 않는다. 이것이 가설 A가 풀려던 문제이고, §1에서 본 대로 그것만
풀어서는 부족하다.

### 쿠키 세션 유지 / localStorage 영속

**[미검증]**. localStorage는 WebView에서 앱 재시작 후에도 남는 것이 표준 동작이라 큰 위험은
아니라고 본다. 쿠키 쪽이 §5의 핵심 질문이다.

### `window.print()` 기반 북 출력

**[코드]** 북 출력의 유일한 경로가 `window.print()`다(`script.js:9809`). 실패 시 `afterprint`가
오지 않아 60초 타임아웃으로만 복구된다.

**Android WebView와 iOS WKWebView는 `window.print()`를 구현하지 않는다** — 예외도 던지지 않고
아무 일도 일어나지 않는다. `try/catch`도 걸리지 않으므로 **유저에게는 60초 동안 인쇄 모드
화면만 남는다.** **[미검증]** 이지만 위험도가 높아 실기기 확인 1순위다.

대안 둘:

| 대안 | 비용 |
| --- | --- |
| 네이티브 인쇄 브릿지 (Android `PrintManager` + `WebView.createPrintDocumentAdapter`, iOS `UIPrintInteractionController`) | 플러그인 1개 + 플랫폼당 네이티브 파일 1개. 현재 인쇄 CSS를 그대로 쓴다 |
| JS로 PDF 생성 후 공유 (`@capacitor/share`·`filesystem`) | 조판을 인쇄 CSS에서 PDF 라이브러리로 옮겨야 한다. 결과물 품질을 다시 맞추는 비용이 크다 |

**네이티브 브릿지를 권한다.** 조판 자산을 버리지 않는다.

### 심사 지침 4.2 대응 네이티브 기능 후보

| 후보 | 구현 비용 | 4.2 설득력 |
| --- | --- | --- |
| **일정 알림 푸시** (로컬 알림) | 낮음 — `@capacitor/local-notifications`, 서버 불필요 | **높음.** 이 앱의 본질(오늘 할 일)과 직결된다 |
| **체크 햅틱** | 매우 낮음 — `@capacitor/haptics`, 호출 몇 줄 | 낮음. 단독으로는 부족하지만 같이 넣을 값어치는 있다 |
| **기록 오프라인 열람** | 중간 — 이미 localStorage 기반이라 읽기는 되지만 "오프라인 우선"을 주장하려면 동기화 충돌 처리가 필요 | 중간 |
| **홈 화면 위젯** | 높음 — 플랫폼별 네이티브 UI를 따로 만든다 | 높지만 비용 대비 나중 |

**푸시 + 햅틱 먼저**를 권한다. 위젯은 4.2를 통과한 뒤 볼 일이다.

### 구글 플레이 먼저 낼 때의 최소 작업 목록

1. 인증 경로 확정 (§2 검증) — **모든 것의 선행 조건**
2. `capacitor.config` + Android 프로젝트 스캐폴드
3. API 베이스 URL 절대 경로화 (`script.js`)
4. 인쇄 대안 (네이티브 브릿지)
5. 로컬 알림 + 햅틱 (4.2)
6. 스토어 자산 — 아이콘·스플래시·스크린샷·데이터 안전 양식·개인정보 처리방침 URL
7. 내부 테스트 트랙 업로드 → 비공개 테스트

**리드타임 추정은 하지 않는다.** 1번이 미검증인 상태에서 낸 숫자는 근거가 없다. 1번이
확인되면 그때 잡는다.

## 4. 결론

- **가설 A는 실패다.** 쿠키 주입이 세 블로커 중 무엇도 건드리지 않는다.
- **가설 B로 넘어가기 전에 CapacitorHttp 경로를 먼저 보라.** 서버 변경 없이 풀릴 가능성이
  있고, 그렇다면 웹의 CSRF 방어를 낮추지 않아도 된다.
- **`script.js` 수정은 어느 경로든 필요하다** (상대 → 절대 API URL). 주입 지점은 적다.

## 5. 실기기 없이 확인 불가능한 것 (다음 스파이크의 1순위)

이 머신에 Java·Android SDK·Gradle이 없어 아래는 전부 열려 있다. **위 §2의 결론은 첫 두
항목에 달려 있다.**

1. **CapacitorHttp가 `Origin` 헤더를 붙이지 않는가?** 붙인다면 ②가 되살아나고 서버 변경이 필요하다.
2. **네이티브 쿠키 잼이 `SameSite=Lax` 세션 쿠키를 네이티브 요청에 실어 주는가?** 실어 주지
   않으면 `SameSite=None; Secure`로 바꿔야 하고, 그건 웹의 CSRF 방어를 낮추는 결정이다.
3. `window.print()`가 정말 무반응인가, 그래서 60초 타임아웃 화면이 뜨는가.
4. 앱이 `data-app-ready`에 도달하는가, 도달한다면 "로그인 불가 앱"인가.
5. 시스템 브라우저 OAuth 완주 후 딥링크 복귀가 4개 provider 모두 되는가.
6. localStorage가 앱 재시작 후 남는가.
