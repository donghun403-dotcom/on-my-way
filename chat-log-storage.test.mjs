/* 대화 로그의 저장 범위 계약 (스펙 4장 「저장 범위」 · 7장 4-1항).

   omwChatLog는 계정별로 격리하되 서버로는 올리지 않는다. 서버 보관으로 바꾸는 순간
   감정·심리 기록을 우리가 들고 있게 되고, 현행 처리방침이 "서비스 서버는 AI 요청 원문을
   별도 대화 이력으로 저장하지 않는다"고 밝히고 있어 처리방침 개정이 선행돼야 한다(C6).

   script.js는 브라우저 스크립트라 import할 수 없으므로 두 목록의 본문을 읽어 확인한다.
   무심코 SERVER_SYNC_STORAGE_KEYS에 한 줄 추가하는 것을 막는 것이 이 테스트의 전부다. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("./script.js", import.meta.url), "utf8");

function readKeyList(name) {
  const match = client.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`));
  assert.ok(match, `script.js에 ${name} 목록이 있어야 한다`);
  return match[1];
}

const accountScoped = readKeyList("ACCOUNT_SCOPED_STORAGE_KEYS");
const serverSynced = readKeyList("SERVER_SYNC_STORAGE_KEYS");

test("대화 로그와 동의 기록은 계정 스코프 대상이다", () => {
  assert.match(accountScoped, /\bCHAT_LOG_KEY\b/, "다른 계정으로 로그인했을 때 앞사람의 대화가 남으면 안 된다");
  assert.match(accountScoped, /\bCHAT_CONSENT_KEY\b/, "별도 동의는 계정마다 따로 받아야 한다");
  assert.match(client, /const CHAT_LOG_KEY = "omwChatLog"/);
  assert.match(client, /const CHAT_CONSENT_KEY = "omwChatConsent"/);
});

test("대화 로그는 서버 동기화 대상이 아니다", () => {
  assert.doesNotMatch(serverSynced, /\bCHAT_LOG_KEY\b/, "대화 로그를 서버로 올리려면 처리방침 개정이 먼저다");
  assert.doesNotMatch(serverSynced, /omwChatLog/);
  assert.doesNotMatch(serverSynced, /\bCHAT_CONSENT_KEY\b/);
  assert.doesNotMatch(serverSynced, /omwChatConsent/);
});

test("처리방침은 여전히 서버가 대화 이력을 저장하지 않는다고 밝히고 있다", () => {
  const privacy = readFileSync(new URL("./privacy.html", import.meta.url), "utf8");
  assert.match(privacy, /별도 대화 이력으로 저장하지 않으며/, "이 문장이 바뀌면 위 두 테스트의 전제도 다시 봐야 한다");
});

test("회고 뷰가 기록의 저장 위치를 유저에게 밝힌다", () => {
  const markup = readFileSync(new URL("./app.html", import.meta.url), "utf8");
  assert.match(markup, /이 기록은 이 기기에 저장돼요/, "기기를 바꾸면 대화가 따라오지 않는다는 사실을 알려야 한다");
});

/* 보관 상한이 조용히 기록을 지우면 그건 정책이 아니라 데이터 손실로 읽힌다.
   상한값이 바뀌면 사전 안내 기준도 같이 움직여야 한다. */
test("보관 상한과 사전 안내 기준이 함께 정의돼 있다", () => {
  assert.match(client, /const CHAT_LOG_MAX_DAYS = 90;/);
  assert.match(client, /const CHAT_LOG_MAX_TURNS = 500;/);
  const warnDays = Number(client.match(/const CHAT_RETENTION_WARN_DAYS = (\d+);/)?.[1]);
  const warnTurns = Number(client.match(/const CHAT_RETENTION_WARN_TURNS = (\d+);/)?.[1]);
  assert.ok(warnDays > 0 && warnDays < 90, "만료 안내는 90일이 다 되기 전에 나와야 한다");
  assert.ok(warnTurns > 0 && warnTurns < 500, "턴 상한 안내도 상한에 닿기 전에 나와야 한다");
});
