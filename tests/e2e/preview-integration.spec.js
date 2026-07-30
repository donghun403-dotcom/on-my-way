/* 프리뷰 전용 통합 스펙 — 배포된 워커에만 있는 배선을 검증한다.

   로컬 패스(serve-local.cjs)는 worker.mjs의 fetch 핸들러를 실행하지 않는다.
   `import("./worker.mjs")`를 하긴 하지만 꺼내 쓰는 것은 recordFunnelEvent 하나뿐이고,
   라우팅·저장소·정적 자산은 전부 별도 구현이다. 그래서 아래 분기는 프리뷰에서만 실행된다:

     - ASSETS 바인딩과 SPA 폴백        (로컬: fs.readFile, 미스 → plain 404)
     - NON_HTML_ASSET_PATH 가드        (로컬: 없음)
     - USERS_KV 저장소 배선            (로컬: tmp/*.json 파일)
     - /api/ 출처 검사 403             (로컬: 없음)
     - 세션 없는 요청의 401 게이트     (로컬: 라우트 구현이 다름)

   E2E_BASE_URL이 없으면 테스트를 아예 정의하지 않는다. 로컬 패스에서 skip 소음을
   남기지 않기 위해서다 — 이 파일은 프리뷰 잡에서만 의미가 있다. */
const { test, expect } = require("@playwright/test");

const previewBaseUrl = process.env.E2E_BASE_URL;

if (previewBaseUrl) {
  /* ── 정적 자산과 SPA 폴백 (fetchStaticAsset 경로) ───────────────────────── */

  test("실제 파일은 ASSETS 바인딩이 원래 타입으로 돌려준다", async ({ request }) => {
    const html = await request.get("/app.html");
    expect(html.status()).toBe(200);
    expect(html.headers()["content-type"]).toContain("text/html");

    const script = await request.get("/script.js");
    expect(script.status()).toBe(200);
    expect(script.headers()["content-type"]).toContain("javascript");
  });

  test("알 수 없는 경로는 SPA 폴백으로 HTML을 돌려준다", async ({ request }) => {
    const response = await request.get("/this-route-does-not-exist");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");
  });

  /* SPA 폴백이 없는 .js 요청에 index.html을 돌려주면 브라우저가 HTML을 스크립트로
     파싱하다 죽는다. worker.mjs의 NON_HTML_ASSET_PATH 가드가 그것을 404로 바꾼다.
     이 가드는 로컬 서버에 존재하지 않으므로 여기서만 검증된다. */
  test("없는 .js 요청은 SPA 폴백 HTML이 아니라 404로 끝난다", async ({ request }) => {
    const response = await request.get("/this-asset-does-not-exist.js");
    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).not.toContain("text/html");
  });

  /* ── 저장소 배선 ────────────────────────────────────────────────────────── */

  /* /api/health의 ok와 accountStorage는 둘 다 Boolean(env.USERS_KV)이다.
     KV 바인딩이 빠진 채 배포되면 여기서 503으로 걸린다. */
  test("health는 KV 바인딩이 붙은 preview 환경을 보고한다", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.environment).toBe("preview");
    expect(body.services.accountStorage).toBe(true);
  });

  test("auth providers는 로그인 수단 목록을 돌려준다", async ({ request }) => {
    const response = await request.get("/api/auth/providers");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");

    const body = await response.json();
    expect(Array.isArray(body.providers)).toBe(true);
    expect(body.providers.length).toBeGreaterThan(0);
  });

  /* ── 세션 없는 요청의 게이트 ────────────────────────────────────────────── */

  /* 401은 "막혔다"는 것보다 "라우트가 실제 배포본에 살아 있고 세션 판정까지
     도달한다"는 것을 증명한다. 라우트가 통째로 빠지면 SPA 폴백이 200 HTML을
     돌려주므로 이 단언이 깨진다. */
  test("세션 없는 계정·사용량 조회는 401로 끝난다", async ({ request }) => {
    for (const path of ["/api/ai/usage", "/api/account/state"]) {
      const response = await request.get(path);
      expect(response.status(), `${path} 응답 코드`).toBe(401);
      expect(response.headers()["content-type"], `${path} 콘텐츠 타입`).toContain("application/json");
    }
  });

  test("세션 없는 AI 생성 요청은 401 AUTH_REQUIRED로 끝난다", async ({ request }) => {
    const response = await request.post("/api/ai/companion-chat", {
      headers: { "X-Request-ID": "preview-integration-probe" },
      data: { message: "안녕" },
    });
    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("AUTH_REQUIRED");
  });

  test("다른 출처에서 온 /api 요청은 403으로 막힌다", async ({ request }) => {
    const response = await request.get("/api/health", {
      headers: { Origin: "https://not-my-origin.example" },
    });
    expect(response.status()).toBe(403);
  });

  /* ── 실제 워커로 부팅 ───────────────────────────────────────────────────── */

  /* 목 없이 앱을 띄운다. 부팅 경로가 실제 워커의 /api/auth/me와 /api/health를
     타므로, KV 읽기와 정적 자산 서빙이 함께 검증된다. */
  test("게스트가 목 없이 실제 워커에서 앱을 띄운다", async ({ page }) => {
    const failed = [];
    page.on("response", (response) => {
      const { pathname } = new URL(response.url());
      if (pathname.startsWith("/api/") && response.status() >= 500) {
        failed.push(`${pathname} → ${response.status()}`);
      }
    });

    await page.goto("/app.html");
    await expect(page.locator("body")).toHaveAttribute("data-app-ready", "true", { timeout: 20_000 });
    expect(failed, "5xx를 돌려준 API").toEqual([]);
  });

  /* responsive 1건. 디바이스 매트릭스 전체는 로컬 패스가 담당한다 — CSS와 뷰포트
     동작은 서버가 달라진다고 바뀌지 않는다. 여기서는 프리뷰가 실제로 서빙한
     styles.css가 붙어 레이아웃이 성립하는지만 본다. */
  test("390x844에서 실제 프리뷰 자산으로 가로 넘침이 없다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app.html");
    await expect(page.locator("body")).toHaveAttribute("data-app-ready", "true", { timeout: 20_000 });

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });
}
