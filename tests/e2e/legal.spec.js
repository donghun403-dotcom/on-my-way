const { test, expect } = require("@playwright/test");
const { expectNoHorizontalOverflow, monitorPage } = require("./helpers");

test("법적 페이지 네 곳이 공개 경로에서 열리고 서로 연결된다", async ({ page }) => {
  const monitor = monitorPage(page);
  for (const [pathname, heading] of [
    ["/privacy", "개인정보 처리방침"],
    ["/terms", "서비스 이용약관"],
    ["/support", "고객지원"],
    ["/delete-account", "계정 탈퇴"],
  ]) {
    if (pathname === "/delete-account") {
      await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"user":null}' }));
    }
    await page.goto(pathname);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
  monitor.expectClean();
});

test("로그인 회원은 명시적 확인 후 탈퇴를 요청하고 이 기기 저장 데이터를 지운다", async ({ page }) => {
  const monitor = monitorPage(page);
  await page.addInitScript(() => localStorage.setItem("omw-e2e-delete", "stored"));
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user: { id: "usr_e2e", name: "탈퇴 테스트", email: "delete@example.com" } }),
  }));
  let requestBody;
  await page.route("**/api/account/delete", async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.goto("/delete-account");
  await page.getByLabel(/계정 삭제.*입력/).fill("계정 삭제");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "계정 영구 삭제 요청" }).click();
  await expect(page.getByText("탈퇴 요청이 완료되었습니다.")).toBeVisible();
  expect(requestBody).toEqual({ confirmation: "계정 삭제" });
  await expect.poll(() => page.evaluate(() => localStorage.getItem("omw-e2e-delete"))).toBeNull();
  monitor.expectClean();
});
