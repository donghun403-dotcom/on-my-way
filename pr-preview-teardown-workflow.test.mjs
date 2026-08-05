/* PR 프리뷰 워커를 닫힌 PR에서 지우는 잡의 계약 검사.
 *
 * 2026-08-05에 없어서 겪은 일: pr-preview.yml이 [opened, synchronize, reopened]
 * 에만 반응해 PR이 닫혀도 워커가 남았고, 1~89번 88개가 쌓여 계정의 Durable Object
 * 네임스페이스 100개 한도를 다 썼다. 그 뒤 모든 PR의 프리뷰 배포가 실패했다.
 *
 * 이 잡이 조용히 어긋나면 같은 일이 그대로 반복되고, 다음에도 한도가 찰 때까지
 * 아무도 모른다. 어긋날 수 있는 자리가 둘이라 그 둘을 고정한다:
 *   ① 닫힘에 반응하지 않게 되는 것
 *   ② 지우는 이름이 배포하는 이름과 달라지는 것
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) =>
  readFileSync(new URL(`./.github/workflows/${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const teardown = read("pr-preview-teardown.yml");
const preview = read("pr-preview.yml");

/* 워커 이름을 만드는 부분만 뽑는다. 배포와 삭제가 같은 규칙을 써야 한다. */
const WORKER_NAME = /on-my-way-pr-\$\{\{\s*github\.event\.pull_request\.number/;

test("닫힌 PR에 반응한다", () => {
  assert.match(teardown, /types:\s*\[closed\]/);
});

test("배포와 삭제가 같은 이름 규칙을 쓴다", () => {
  /* 어느 한쪽의 접두사를 바꾸면 삭제가 조용히 빗나간다 — 워커는 남고 잡은 성공한다. */
  assert.match(preview, WORKER_NAME, "pr-preview.yml의 배포 이름 규칙이 바뀌었다");
  assert.match(teardown, WORKER_NAME, "teardown의 삭제 이름 규칙이 배포와 다르다");
});

test("없는 워커만 통과시키고 나머지 실패는 드러낸다", () => {
  /* `|| true`로 통째로 삼키면 이 잡이 고장 나도 초록으로 보인다. 그 형태를 막는다. */
  assert.match(teardown, /not found\|does not exist\|script_not_found\|10007/);
  assert.match(teardown, /exit 1/, "실패를 드러내는 경로가 없다");
  assert.ok(!/delete[^\n]*\|\|\s*true/.test(teardown), "삭제 실패를 || true로 삼키고 있다");
});

test("삭제에 필요한 자격증명을 배포와 같은 시크릿에서 받는다", () => {
  for (const secret of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]) {
    assert.match(teardown, new RegExp(`secrets\\.${secret}`), `${secret}를 쓰지 않는다`);
    assert.match(preview, new RegExp(`secrets\\.${secret}`));
  }
});
