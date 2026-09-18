# 웹 체험 → Play 구독 인계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹에서 구독하려는 사람을 막다른 길 대신 Google Play 앱으로 보낸다.

**Architecture:** 판별 함수 하나(`storeHandoffMode()`)가 `native` · `android` · `unsupported`
셋 중 하나를 답하고, 세 지점(가격 화면 Pro 버튼, `[data-pro-purchase]` 앵커, 체험 중 배너)이
같은 답을 읽는다. 클라이언트 전용 변경이며 서버는 건드리지 않는다.

**Tech Stack:** 순수 `script.js`(일반 스크립트, import 없음) + `app.html`/`index.html` DOM,
검증은 Playwright e2e.

## Global Constraints

- 스토어 주소는 정확히 `https://play.google.com/store/apps/details?id=com.olivenrich.onmyway`
- `localStorage` 키는 정확히 `omw.storeHandoffDismissed`
- **앱 안에서는 이 기능이 아무것도 하지 않는다.** 판별은 `nativeBilling`(= `window.OmwBilling`)
  존재 여부로 한다 — 플랫폼 추측이 아니라 "이 기기에서 바로 살 수 있는가"가 기준이다
- 안드로이드 판별은 `/Android/i.test(navigator.userAgent)` 한 줄
- 아이폰·데스크톱에는 **Play를 권하지 않는다.** iOS 앱이 없으므로 막다른 길이다
- "출시 준비 중" 이라는 표현을 웹 어디에도 남기지 않는다 — 앱은 2026-09-02에 출시됐다
- 문구에는 **"같은 계정으로 로그인하면 … 그대로 이어져요"** 가 반드시 들어간다
- 아직 체험을 안 한 사람(`trialEligible`)과 `pro` 이용자의 버튼은 건드리지 않는다
- 기존 테스트 503개가 계속 통과해야 한다 (`npm test`)

---

### Task 1: 판별 함수와 가격 화면 Pro 버튼

**Files:**
- Modify: `script.js` — 상단 상수 추가, `getProCtaState`(1769행), `handleProPricingCta`(2808행 부근),
  가격 상태 문구(2698~2699행)
- Test: `tests/e2e/store-handoff.spec.js` (신규)

**Interfaces:**
- Produces: `storeHandoffMode()` → `"native" | "android" | "unsupported"`,
  `PLAY_STORE_URL` 상수. Task 2·3이 둘 다 쓴다.
- Produces: `getProCtaState(plan, trialEligible)` → `{ label, disabled, href? }`
  (`href`가 새로 추가된다. 기존 호출처 3곳은 `label`·`disabled`만 읽으므로 깨지지 않는다.)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
/* tests/e2e/store-handoff.spec.js */
const { test, expect } = require("@playwright/test");
const { createUsageResponse, mockAccountExperience, prepareApp, waitForAppReady } = require("./helpers");

const PLAY_URL = "https://play.google.com/store/apps/details?id=com.olivenrich.onmyway";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const EXPIRED_USER = {
  id: "usr_handoff", provider: "google", name: "인계 테스트", email: "handoff@example.com",
  plan: "expired", role: "member",
  trialStartedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
  trialExpiresAt: Date.now() - 24 * 60 * 60 * 1000,
};

/* bridge=true면 앱 안이다. script.js가 평가 시점에 window.OmwBilling을 잡으므로
   가짜 다리는 페이지 스크립트보다 먼저 들어가야 한다 — store-billing.spec.js와 같은 이유. */
async function prepare(page, { plan = "expired", bridge = false, trialEligible = false } = {}) {
  await prepareApp(page);
  if (bridge) {
    await page.addInitScript(() => {
      window.OmwBilling = { purchase() {}, restore() {} };
    });
  }
  await mockAccountExperience(page, {
    user: { ...EXPIRED_USER, plan },
    usage: createUsageResponse({ plan, paywallEnabled: true, trialEligible }),
    paymentsEnabled: false,
  });
  await page.goto("/index.html#pricing");
}

test.describe("안드로이드 웹", () => {
  test.use({ userAgent: ANDROID_UA });

  test("가격 화면의 Pro 버튼이 Play 스토어로 간다", async ({ page }) => {
    await prepare(page);
    const cta = page.locator("#pricingProCta");
    await expect(cta).toHaveText("Google Play에서 구독하기");
    await expect(cta).toHaveAttribute("href", PLAY_URL);
    await expect(cta).not.toHaveAttribute("aria-disabled", "true");
  });
});

test.describe("아이폰 웹", () => {
  test.use({ userAgent: IPHONE_UA });

  test("Play를 권하지 않고 안드로이드 전용임을 밝힌다", async ({ page }) => {
    await prepare(page);
    const cta = page.locator("#pricingProCta");
    await expect(cta).toHaveText("안드로이드 앱에서 구독");
    await expect(cta).toHaveAttribute("aria-disabled", "true");
  });

  test("출시 준비 중이라고 말하지 않는다", async ({ page }) => {
    await prepare(page);
    await expect(page.locator("body")).not.toContainText("출시 준비 중");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx playwright test tests/e2e/store-handoff.spec.js --project=desktop-chromium`
Expected: FAIL — 지금 라벨은 `Pro 시작하기`이고 버튼은 비활성이며 본문에 "출시 준비 중"이 있다.

- [ ] **Step 3: 판별 함수와 상수를 추가한다**

`script.js`의 `const nativeBilling = globalThis.OmwBilling || null;`(986행) **바로 아래**에 둔다.
위에 두면 안 된다 — `nativeBilling`은 `const`라 선언 전에 읽으면 `typeof`로 감싸도
ReferenceError가 난다. 같은 자리에 두면 그 위험이 아예 없어진다.

```js
/* 웹에서 구독으로 가는 유일한 길은 Play 앱이다. 앱 안(다리가 있는 곳)에서는 바로 살 수
   있으니 인계 자체가 필요 없다 — 그래서 플랫폼이 아니라 "여기서 살 수 있는가"로 가른다. */
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.olivenrich.onmyway";
const STORE_HANDOFF_DISMISSED_KEY = "omw.storeHandoffDismissed";

function storeHandoffMode() {
  if (nativeBilling) return "native";
  /* iOS 앱이 없으므로 아이폰·데스크톱에는 Play를 권하지 않는다. 없는 것을 권하면 막다른 길이다. */
  return /Android/i.test(navigator.userAgent) ? "android" : "unsupported";
}
```

- [ ] **Step 4: `getProCtaState`를 고친다**

`script.js` 1769행의 함수를 통째로 아래로 바꾼다.

```js
function getProCtaState(plan, trialEligible) {
  if (plan === "pro") return { label: "현재 이용 중", disabled: true };
  const handoff = storeHandoffMode();
  const store = handoff === "android"
    ? { label: "Google Play에서 구독하기", disabled: false, href: PLAY_STORE_URL }
    : { label: "안드로이드 앱에서 구독", disabled: true };
  if (plan === "trial") {
    if (paymentsEnabled) return { label: "지금 Pro로 전환하기", disabled: false };
    return handoff === "native" ? { label: "Pro 결제 준비 중", disabled: true } : store;
  }
  /* 체험을 아직 안 한 사람에게는 체험을 권하는 것이 먼저다. 인계는 그다음 이야기다. */
  if (trialEligible) return { label: "무료 체험 시작", disabled: false };
  if (paymentsEnabled) return { label: "Pro 시작하기", disabled: false };
  return handoff === "native" ? { label: "Pro 시작하기", disabled: true } : store;
}
```

- [ ] **Step 5: 가격 CTA에 링크를 물리고 상태 문구를 고친다**

`script.js` 2695~2699행 부근을 아래로 바꾼다.

```js
    setPricingCta(pricingProCta, cta.label, { disabled: cta.disabled, href: cta.href });
    setPricingCta(pricingBottomProCta, cta.label, { disabled: cta.disabled, href: cta.href });
  }
  const handoff = storeHandoffMode();
  if (pricingPaymentState) {
    pricingPaymentState.textContent = paymentsEnabled
      ? "결제 연결 상태를 확인한 뒤 Pro를 시작할 수 있어요."
      : handoff === "android"
        ? "구독은 Google Play 앱에서 할 수 있어요. 같은 계정으로 로그인하면 기록과 남은 체험이 그대로 이어져요."
        : handoff === "unsupported"
          ? "지금은 안드로이드 앱에서만 구독할 수 있어요. 기록 열람과 내보내기는 계속 무료예요."
          : "현재 운영 결제는 비활성화되어 있어요. 실제 결제는 발생하지 않습니다.";
  }
  if (pricingProCtaStatus) {
    pricingProCtaStatus.textContent = paymentsEnabled
      ? "운영 결제 승인 상태"
      : handoff === "native"
        ? "Pro 결제는 현재 준비 중이며 자동 결제되지 않아요."
        : "구독과 결제는 Google Play가 처리해요.";
  }
```

- [ ] **Step 6: 클릭 처리에서 "준비 중" 안내를 걷어낸다**

`handleProPricingCta`(2808행 부근)의 토스트 두 줄을 바꾼다. `plan === "trial"`의 `else` 가지:

```js
    } else if (storeHandoffMode() === "android") {
      sendFunnelEvent("pro_cta_clicked");
      window.location.assign(PLAY_STORE_URL);
    } else if (storeHandoffMode() === "unsupported") {
      showToast("지금은 안드로이드 앱에서만 구독할 수 있어요. 무료 체험은 계속 이용할 수 있어요.");
    } else {
      showToast("무료 체험은 계속 이용할 수 있어요. Pro 결제는 현재 준비 중이에요.");
    }
```

함수 마지막 줄 `showToast("Pro 결제는 현재 출시 준비 중이에요. 실제 결제는 발생하지 않습니다.");` 을 바꾼다:

```js
  const handoff = storeHandoffMode();
  if (handoff === "android") {
    sendFunnelEvent("pro_cta_clicked");
    window.location.assign(PLAY_STORE_URL);
    return;
  }
  if (handoff === "unsupported") {
    showToast("지금은 안드로이드 앱에서만 구독할 수 있어요. 기록 열람과 내보내기는 계속 무료예요.");
    return;
  }
  showToast("Pro 결제는 현재 준비 중이에요. 실제 결제는 발생하지 않습니다.");
```

- [ ] **Step 7: 통과를 확인한다**

Run: `npx playwright test tests/e2e/store-handoff.spec.js --project=desktop-chromium`
Expected: PASS (3개)

Run: `npm test`
Expected: 503 passing, 0 failing

- [ ] **Step 8: 커밋**

```bash
git add script.js tests/e2e/store-handoff.spec.js
git commit -m "가격 화면에서 구독을 Play로 넘긴다"
```

---

### Task 2: 잠금·다이어리·샘플의 Pro 앵커

**Files:**
- Modify: `script.js` — 파일 맨 아래 위임 리스너(10079행 부근) 뒤에 호출 추가
- Test: `tests/e2e/store-handoff.spec.js` (Task 1에서 만든 파일에 추가)

**Interfaces:**
- Consumes: `storeHandoffMode()`, `PLAY_STORE_URL` (Task 1)
- Consumes: `PRO_CTA_SELECTOR`(= `"[data-pro-purchase]"`, 10078행)
- Produces: `applyProCtaHandoff()` — 인자 없음, 반환 없음

**배경:** `[data-pro-purchase]` 앵커는 `app.html`에 3개 있다(`#trialPaywallAction` 잠금 화면,
`#diaryBookLockedCta`, `#sampleBookCta`). 위임 리스너가 **다리가 있을 때만** 가로채므로
웹에서는 그냥 `index.html#pricing`으로 간다. 잠금 화면 → 가격 페이지 → 막다른 길이 된다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/e2e/store-handoff.spec.js`의 안드로이드 describe 안에 추가:

```js
  test("잠금 화면 버튼이 Play로 바로 간다", async ({ page }) => {
    await prepare(page);
    await page.goto("/app.html");
    await waitForAppReady(page);
    const action = page.locator("#trialPaywallAction");
    await expect(action).toHaveAttribute("href", PLAY_URL);
    await expect(action).toHaveText("Google Play에서 계속하기");
  });
```

아이폰 describe 안에 추가:

```js
  test("잠금 화면이 안드로이드 전용임을 밝히고 링크를 주지 않는다", async ({ page }) => {
    await prepare(page);
    await page.goto("/app.html");
    await waitForAppReady(page);
    const action = page.locator("#trialPaywallAction");
    await expect(action).toHaveText("지금은 안드로이드 앱에서만 구독할 수 있어요");
    await expect(action).not.toHaveAttribute("href", /.*/);
  });
```

파일 맨 아래에 앱 안 확인을 추가:

```js
test.describe("앱 안", () => {
  test.use({ userAgent: ANDROID_UA });

  test("다리가 있으면 앵커를 건드리지 않는다", async ({ page }) => {
    await prepare(page, { bridge: true });
    await page.goto("/app.html");
    await waitForAppReady(page);
    await expect(page.locator("#trialPaywallAction")).toHaveText("Pro 시작하기");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx playwright test tests/e2e/store-handoff.spec.js --project=desktop-chromium`
Expected: 새 테스트 2개 FAIL(앵커가 `Pro 시작하기` · `index.html#pricing` 그대로),
"앱 안" 테스트는 PASS (건드리는 코드가 아직 없으므로 — 이 테스트는 Task 2가 앱을
망가뜨리지 않는지 잠그는 회귀 테스트다).

- [ ] **Step 3: 구현한다**

`script.js` 맨 아래, 위임 리스너 등록 뒤에 추가:

```js
/* 웹의 Pro 앵커는 가격 페이지로 간다. 거기서 다시 막히면 잠금 화면 → 가격 → 막다른 길이
   되므로, 웹에서는 앵커를 목적지까지 직접 보낸다. 앱 안에서는 위임 리스너가 결제창을 열
   것이므로 건드리지 않는다. */
function applyProCtaHandoff() {
  const mode = storeHandoffMode();
  if (mode === "native") return;
  document.querySelectorAll(PRO_CTA_SELECTOR).forEach((cta) => {
    if (mode === "android") {
      cta.href = PLAY_STORE_URL;
      cta.textContent = "Google Play에서 계속하기";
      cta.removeAttribute("aria-disabled");
    } else {
      cta.removeAttribute("href");
      cta.textContent = "지금은 안드로이드 앱에서만 구독할 수 있어요";
      cta.setAttribute("aria-disabled", "true");
    }
  });
}

applyProCtaHandoff();
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx playwright test tests/e2e/store-handoff.spec.js --project=desktop-chromium`
Expected: PASS (6개)

Run: `npx playwright test tests/e2e/store-billing.spec.js --project=desktop-chromium`
Expected: PASS — 앱 안 결제 경로가 그대로여야 한다

- [ ] **Step 5: 커밋**

```bash
git add script.js tests/e2e/store-handoff.spec.js
git commit -m "잠금 화면의 Pro 버튼을 Play로 바로 보낸다"
```

---

### Task 3: 체험 중 설치 배너

**Files:**
- Modify: `app.html` — `<header class="execution-header">`(42행) 바로 앞에 배너 추가
- Modify: `styles.css` — 배너 스타일
- Modify: `script.js` — 렌더와 닫기
- Test: `tests/e2e/store-handoff.spec.js`

**Interfaces:**
- Consumes: `storeHandoffMode()`, `PLAY_STORE_URL`, `STORE_HANDOFF_DISMISSED_KEY` (Task 1)
- Produces: `renderStoreHandoffBanner()` — 인자 없음. `aiUsageState`가 바뀔 때마다 부른다.

**배경:** 체험이 길어야 이틀이라 안내를 놓치면 만회할 창이 없다. 그래서 토스트가 아니라
닫을 수 있는 배너로 둔다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

안드로이드 describe 안에 추가:

```js
  test("체험 중에는 설치 배너가 보인다", async ({ page }) => {
    await prepare(page, { plan: "trial" });
    await page.goto("/app.html");
    await waitForAppReady(page);
    const banner = page.locator("#storeHandoffBanner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("그대로 이어져요");
    await expect(banner.locator("a")).toHaveAttribute("href", PLAY_URL);
  });

  test("닫으면 다시 열어도 뜨지 않는다", async ({ page }) => {
    await prepare(page, { plan: "trial" });
    await page.goto("/app.html");
    await waitForAppReady(page);
    await page.locator("#storeHandoffDismiss").click();
    await expect(page.locator("#storeHandoffBanner")).toBeHidden();
    await page.reload();
    await waitForAppReady(page);
    await expect(page.locator("#storeHandoffBanner")).toBeHidden();
  });

  test("체험이 끝나면 배너는 사라지고 잠금이 맡는다", async ({ page }) => {
    await prepare(page, { plan: "expired" });
    await page.goto("/app.html");
    await waitForAppReady(page);
    await expect(page.locator("#storeHandoffBanner")).toBeHidden();
  });
```

아이폰 describe 안에 추가:

```js
  test("배너를 띄우지 않는다", async ({ page }) => {
    await prepare(page, { plan: "trial" });
    await page.goto("/app.html");
    await waitForAppReady(page);
    await expect(page.locator("#storeHandoffBanner")).toBeHidden();
  });
```

"앱 안" describe 안에 추가:

```js
  test("앱 안에서는 배너를 띄우지 않는다", async ({ page }) => {
    await prepare(page, { plan: "trial", bridge: true });
    await page.goto("/app.html");
    await waitForAppReady(page);
    await expect(page.locator("#storeHandoffBanner")).toBeHidden();
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx playwright test tests/e2e/store-handoff.spec.js --project=desktop-chromium`
Expected: `#storeHandoffBanner`가 없어 안드로이드 3개 중 2개 FAIL
(숨김을 기대하는 테스트는 요소가 없어도 통과한다 — 구현 뒤 다시 의미를 갖는다).

- [ ] **Step 3: DOM을 추가한다**

`app.html` 42행 `<header class="execution-header">` 바로 앞:

```html
    <!-- 웹 체험자에게만 뜨는 설치 안내. 앱 안에서는 렌더되지 않는다(script.js). -->
    <aside class="store-handoff" id="storeHandoffBanner" hidden>
      <p>구독은 앱에서 해요. 같은 계정으로 로그인하면 기록과 남은 체험이 그대로 이어져요.</p>
      <a id="storeHandoffLink" href="https://play.google.com/store/apps/details?id=com.olivenrich.onmyway">Google Play에서 받기</a>
      <button type="button" id="storeHandoffDismiss" aria-label="설치 안내 닫기">✕</button>
    </aside>
```

- [ ] **Step 4: 스타일을 추가한다**

`styles.css` 끝에:

```css
.store-handoff {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--surface-accent, #eef4ff);
  font-size: 14px;
}
.store-handoff p { margin: 0; flex: 1; }
.store-handoff a { font-weight: 600; white-space: nowrap; }
.store-handoff button { background: none; border: 0; cursor: pointer; font-size: 16px; line-height: 1; }
```

- [ ] **Step 5: 렌더를 붙인다**

`script.js`에서 `applyProCtaHandoff()` 정의 옆에 추가하고, `applyProCtaHandoff();` 아래에서 부른다.

```js
/* 체험은 길어야 이틀이다. 안내를 놓치면 만회할 창이 없어 토스트가 아니라 배너로 둔다.
   닫힘은 localStorage에 남긴다 — "이 기기에 깔라"는 요청이라 기기별로 기억하는 것이 맞다. */
function renderStoreHandoffBanner() {
  const banner = document.querySelector("#storeHandoffBanner");
  if (!banner) return;
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(STORE_HANDOFF_DISMISSED_KEY) === "1";
  } catch (error) {
    /* 저장소를 못 읽어도 배너는 떠야 한다 */
  }
  const plan = aiUsageState?.plan || authUiState.user?.plan;
  banner.hidden = dismissed || storeHandoffMode() !== "android" || plan !== "trial";
}

document.querySelector("#storeHandoffDismiss")?.addEventListener("click", () => {
  try {
    localStorage.setItem(STORE_HANDOFF_DISMISSED_KEY, "1");
  } catch (error) {
    /* 저장에 실패해도 이번 화면에서는 닫힌다 */
  }
  renderStoreHandoffBanner();
});

renderStoreHandoffBanner();
```

`applyAiUsage`(2497행)의 마지막 렌더 호출인 `renderPaywallLock();`(2515행) 바로 뒤에 한 줄을
추가한다. 플랜이 `trial` → `expired`로 바뀌는 순간 배너가 사라지고 잠금이 이어받아야 한다.

```js
  renderPaywallLock();
  renderStoreHandoffBanner();
```

함수 선언은 호이스팅되므로 정의가 파일 아래에 있어도 여기서 부를 수 있다. 다만
`STORE_HANDOFF_DISMISSED_KEY`는 `const`라, 986행에 두는 Task 1의 배치를 반드시 지켜야 한다.

- [ ] **Step 6: 통과를 확인한다**

Run: `npx playwright test tests/e2e/store-handoff.spec.js --project=desktop-chromium`
Expected: PASS (10개)

Run: `npm test`
Expected: 503 passing

- [ ] **Step 7: 전체 e2e를 돌린다**

Run: `npx playwright test --project=desktop-chromium`
Expected: 기존 스펙이 모두 통과. 실패하면 배너가 레이아웃을 밀어 낸 것이므로
`expectNoHorizontalOverflow`·`captureAcceptance` 계열부터 본다.

- [ ] **Step 8: 커밋**

```bash
git add app.html styles.css script.js tests/e2e/store-handoff.spec.js
git commit -m "체험 중에 앱 설치를 한 번 권한다"
```

---

## 마치고 확인할 것

- 실제 브라우저에서 안드로이드 UA로 `/app.html`을 열어 배너와 잠금 화면을 눈으로 본다
- `funnel:` 버킷에 `pro_cta_clicked`가 웹에서도 찍히는지 본다
  (앱 퍼널은 PR #105로 이미 열렸다)
