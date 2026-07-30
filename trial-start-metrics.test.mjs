/* provider별 체험 시작 계측 (P1 §J).
 *
 * userId가 provider:providerUserId의 HMAC이라 한 사람이 provider를 갈아 최대 4번 체험을 받을 수
 * 있다. 그 우회를 이메일 병합으로 막지 않기로 했으므로(오탐 비용 > 누락 비용, 그리고
 * cross-provider 동일인 판정을 위한 이메일 정규화·보관은 새로운 처리 목적이라 처리방침 개정과
 * 동의 항목이 붙는다) 대신 규모를 볼 수 있어야 한다.
 *
 * 그래서 이 계측이 지켜야 할 성질은 두 가지다.
 *   ① provider별로 세어진다
 *   ② 개인을 식별할 수 있는 것은 아무것도 남기지 않는다 — 남기면 그 자체가 cross-provider
 *      추적이 되어 막지 않기로 한 이유와 모순된다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { TRIAL_START_COUNTER_PREFIX, recordTrialStartByProvider } from "./worker.mjs";

const KST_NOON = Date.UTC(2026, 6, 27, 3, 0, 0); // 2026-07-27 12:00 KST
const DAY_MS = 24 * 60 * 60 * 1_000;

function memoryKv() {
  const values = new Map();
  return {
    values,
    async get(key) {
      const value = values.get(key);
      return value === undefined ? null : value;
    },
    async put(key, value) {
      values.set(key, String(value));
    },
  };
}

test("provider별로 체험 시작 수를 센다", async () => {
  const kv = memoryKv();
  await recordTrialStartByProvider({ provider: "google", kv, now: KST_NOON });
  await recordTrialStartByProvider({ provider: "kakao", kv, now: KST_NOON });
  const last = await recordTrialStartByProvider({ provider: "google", kv, now: KST_NOON });

  assert.deepEqual(last.counts, { google: 2, kakao: 1 });
  assert.equal(last.key, `${TRIAL_START_COUNTER_PREFIX}2026-07-27`);
});

test("KST 일자별로 버킷이 갈린다", async () => {
  const kv = memoryKv();
  await recordTrialStartByProvider({ provider: "naver", kv, now: KST_NOON });
  await recordTrialStartByProvider({ provider: "naver", kv, now: KST_NOON + DAY_MS });

  const today = JSON.parse(await kv.get(`${TRIAL_START_COUNTER_PREFIX}2026-07-27`));
  const tomorrow = JSON.parse(await kv.get(`${TRIAL_START_COUNTER_PREFIX}2026-07-28`));
  assert.deepEqual(today, { naver: 1 });
  assert.deepEqual(tomorrow, { naver: 1 });
});

/* 개인 식별 없이 카운트만. 값에 userId·이메일·providerUserId가 섞이면 이 테스트가 걸린다. */
test("저장하는 것은 provider 이름과 횟수뿐이다", async () => {
  const kv = memoryKv();
  await recordTrialStartByProvider({ provider: "google", kv, now: KST_NOON });

  const raw = await kv.get(`${TRIAL_START_COUNTER_PREFIX}2026-07-27`);
  const counts = JSON.parse(raw);
  assert.deepEqual(Object.keys(counts), ["google"]);
  for (const value of Object.values(counts)) assert.equal(typeof value, "number");
  // 키에도 날짜만 들어간다.
  assert.deepEqual([...kv.values.keys()], [`${TRIAL_START_COUNTER_PREFIX}2026-07-27`]);
});

/* 알 수 없는 값이 키 공간을 늘리면 집계가 못 쓰게 된다. 모양이 아닌 것은 한 버킷으로 모은다. */
test("모양이 이상한 provider는 unknown 하나로 모인다", async () => {
  const kv = memoryKv();
  for (const provider of ["", null, undefined, "GOOGLE!!", "a".repeat(64), { evil: 1 }]) {
    await recordTrialStartByProvider({ provider, kv, now: KST_NOON });
  }
  const counts = JSON.parse(await kv.get(`${TRIAL_START_COUNTER_PREFIX}2026-07-27`));
  assert.deepEqual(counts, { unknown: 6 });
});

test("대문자 provider는 소문자 한 버킷으로 합쳐진다", async () => {
  const kv = memoryKv();
  await recordTrialStartByProvider({ provider: "Google", kv, now: KST_NOON });
  await recordTrialStartByProvider({ provider: "google", kv, now: KST_NOON });
  const counts = JSON.parse(await kv.get(`${TRIAL_START_COUNTER_PREFIX}2026-07-27`));
  assert.deepEqual(counts, { google: 2 });
});

/* 계측은 체험 시작을 막을 권한이 없다. KV가 없거나 깨져도 체험은 이미 시작된 상태다. */
test("KV가 없으면 조용히 넘어간다", async () => {
  assert.equal(await recordTrialStartByProvider({ provider: "google", kv: null, now: KST_NOON }), null);
  assert.equal(await recordTrialStartByProvider({ provider: "google", kv: {}, now: KST_NOON }), null);
});

test("저장된 값이 깨져 있으면 0에서 다시 센다", async () => {
  const kv = memoryKv();
  await kv.put(`${TRIAL_START_COUNTER_PREFIX}2026-07-27`, "{not json");
  const result = await recordTrialStartByProvider({ provider: "kakao", kv, now: KST_NOON });
  assert.deepEqual(result.counts, { kakao: 1 });
});
