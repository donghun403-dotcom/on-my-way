import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function page(name) {
  return readFile(new URL(name, import.meta.url), "utf8");
}

test("공개 법적 페이지에 운영자와 지원 연락처가 표시된다", async () => {
  for (const name of ["privacy.html", "terms.html", "support.html", "delete-account.html"]) {
    const html = await page(name);
    assert.match(html, /On My Way/);
    assert.match(html, /support@olivenrich\.com|privacy@olivenrich\.com/);
  }
  assert.match(await page("privacy.html"), /Donghun Jung/);
  assert.match(await page("terms.html"), /Donghun Jung/);
});

test("개인정보 처리방침은 브라우저 저장과 주요 보관 기간을 알린다", async () => {
  const html = await page("privacy.html");
  assert.match(html, /localStorage/);
  assert.match(html, /5년/);
  assert.match(html, /3년/);
  assert.match(html, /6개월/);
  assert.match(html, /OpenAI/);
  assert.match(html, /토스페이먼츠/);
});

test("계정 탈퇴 페이지는 인증된 삭제 API와 명시적 확인 문구를 사용한다", async () => {
  const html = await page("delete-account.html");
  const script = await page("account-delete.js");
  assert.match(html, /계정 삭제/);
  assert.match(script, /\/api\/account\/delete/);
  assert.match(script, /confirmation\.value\.trim\(\) !== "계정 삭제"/);
  assert.match(script, /localStorage\.clear\(\)/);
});
