import test from "node:test";
import assert from "node:assert/strict";
import { durableCommand, memoryDurableObjectNamespace } from "./guest-plan-draft-fixture.mjs";
import { GUEST_DRAFT_GENERATION_LEASE_MS, GUEST_DRAFT_TTL_MS } from "./guest-plan-draft-object.mjs";

const DRAFT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CAPABILITY_HASH = "b".repeat(64);
const INPUT_HASH = "c".repeat(64);

function input(goal = "첫 고객 10명 만들기") {
  return {
    draftPlanId: DRAFT_ID,
    goal,
    periodDays: 90,
    routine: { readiness: "바로 실행", preferredTime: "저녁", existingRoutine: "" },
    material: { hasMaterial: false },
    availability: { availableDays: ["월"], sessionMinutes: 30, difficultDays: [], excludedDates: [], weeklyFrequency: 1 },
  };
}

function plan(goal = "첫 고객 10명 만들기") {
  return {
    goal,
    firstAction: "고객 한 명에게 연락하기",
    firstWeekSchedule: [{
      dayNumber: 1,
      dayLabel: "월",
      isRestDay: false,
      items: [{ id: "action-1", planId: DRAFT_ID, type: "ACTION", title: "고객 한 명에게 연락하기" }],
    }],
  };
}

async function jsonCommand(stub, command, body) {
  const response = await durableCommand(stub, command, body);
  return { status: response.status, body: await response.json() };
}

async function seedReady(stub, { now = 1_000, inputHash = INPUT_HASH, goal = "첫 고객 10명 만들기" } = {}) {
  const generationToken = "initial-token";
  const initialInput = input(goal);
  const begin = await jsonCommand(stub, "begin-initial", {
    now,
    draftPlanId: DRAFT_ID,
    anonymousActorHash: "owner-hash",
    capabilityHash: CAPABILITY_HASH,
    input: initialInput,
    inputHash,
    generationToken,
    idempotencyKey: `initial:${inputHash}`,
  });
  assert.equal(begin.status, 200);
  const commit = await jsonCommand(stub, "commit-generation", {
    now: now + 1,
    generationToken,
    idempotencyKey: `initial:${inputHash}`,
    inputHash,
    plan: plan(goal),
    preview: { firstAction: "고객 한 명에게 연락하기" },
  });
  assert.equal(commit.status, 200);
  return commit.body;
}

test("SQLite Durable Object 상태는 새 isolate 인스턴스에서도 READY 초안을 복원한다", async () => {
  const namespace = memoryDurableObjectNamespace();
  const first = namespace.newIsolate(DRAFT_ID);
  const ready = await seedReady(first.stub);
  assert.equal(ready.activeRevision, 1);

  const restarted = namespace.newIsolate(DRAFT_ID);
  const inspected = await jsonCommand(restarted.stub, "inspect", { now: 2_000, capabilityHash: CAPABILITY_HASH });
  assert.equal(inspected.status, 200);
  assert.equal(inspected.body.status, "READY");
  assert.equal(inspected.body.activeInputHash, INPUT_HASH);
  assert.equal(inspected.body.preview.firstAction, "고객 한 명에게 연락하기");
});

test("서로 다른 isolate의 64개 동시 claim에서 정확히 한 사용자만 소유권을 얻는다", async () => {
  const namespace = memoryDurableObjectNamespace();
  const isolateA = namespace.newIsolate(DRAFT_ID);
  const isolateB = namespace.newIsolate(DRAFT_ID);
  await seedReady(isolateA.stub);

  const attempts = Array.from({ length: 64 }, (_, index) => {
    const userId = `user-${index + 1}`;
    const stub = index % 3 ? isolateA.stub : isolateB.stub;
    return jsonCommand(stub, "claim", {
      now: 3_000 + index,
      capabilityHash: CAPABILITY_HASH,
      userId,
      expectedRevision: 1,
      expectedInputHash: INPUT_HASH,
    }).then((result) => ({ userId, ...result }));
  });
  const results = await Promise.all(attempts);
  const state = await isolateA.storage.get("draft");
  assert.equal(state.status, "CLAIMED");
  assert.match(state.claimedBy, /^user-\d+$/);
  assert.equal(results.filter((result) => result.status === 200).length, 1);
  assert.equal(results.find((result) => result.status === 200).userId, state.claimedBy);
  assert.equal(results.filter((result) => result.body.idempotent === false).length, 1);
  assert.ok(results.filter((result) => result.userId !== state.claimedBy).every((result) => result.status === 409));
  assert.equal(state.claimPlanId, DRAFT_ID);
});

test("동일 사용자의 중복 claim과 네트워크 재시도는 같은 planId로 멱등이다", async () => {
  const namespace = memoryDurableObjectNamespace();
  const first = namespace.newIsolate(DRAFT_ID);
  const second = namespace.newIsolate(DRAFT_ID);
  await seedReady(first.stub);
  const requests = Array.from({ length: 20 }, (_, index) => jsonCommand(index % 2 ? first.stub : second.stub, "claim", {
    now: 4_000 + index,
    capabilityHash: CAPABILITY_HASH,
    userId: "same-user",
    expectedRevision: 1,
    expectedInputHash: INPUT_HASH,
  }));
  const results = await Promise.all(requests);
  assert.ok(results.every((result) => result.status === 200));
  assert.ok(results.every((result) => result.body.claimPlanId === DRAFT_ID));
  assert.equal((await first.storage.get("draft")).claimedBy, "same-user");
});

test("revision은 CAS와 idempotency key를 검사하고 성공 전에는 active plan을 바꾸지 않는다", async () => {
  const namespace = memoryDurableObjectNamespace();
  const { stub, storage } = namespace.newIsolate(DRAFT_ID);
  await seedReady(stub);
  const nextHash = "d".repeat(64);
  const begin = await jsonCommand(stub, "begin-revision", {
    now: 5_000,
    capabilityHash: CAPABILITY_HASH,
    expectedRevision: 1,
    expectedInputHash: INPUT_HASH,
    input: input("매일 20분 운동하기"),
    inputHash: nextHash,
    generationToken: "revision-token",
    idempotencyKey: "revision:fixture-key-0001",
  });
  assert.equal(begin.body.shouldGenerate, true);
  const duringGeneration = await storage.get("draft");
  assert.equal(duringGeneration.status, "GENERATING");
  assert.equal(duringGeneration.activeInputHash, INPUT_HASH);
  assert.equal(duringGeneration.activePlan.goal, "첫 고객 10명 만들기");

  const duplicate = await jsonCommand(stub, "begin-revision", {
    now: 5_001,
    capabilityHash: CAPABILITY_HASH,
    expectedRevision: 1,
    expectedInputHash: INPUT_HASH,
    input: input("매일 20분 운동하기"),
    inputHash: nextHash,
    generationToken: "duplicate-token",
    idempotencyKey: "revision:fixture-key-0001",
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.code, "DRAFT_REVISION_PENDING");

  const commit = await jsonCommand(stub, "commit-generation", {
    now: 5_002,
    generationToken: "revision-token",
    idempotencyKey: "revision:fixture-key-0001",
    inputHash: nextHash,
    plan: plan("매일 20분 운동하기"),
    preview: { firstAction: "운동복 꺼내기" },
  });
  assert.equal(commit.body.activeRevision, 2);
  assert.equal(commit.body.activeInputHash, nextHash);
  const retry = await jsonCommand(stub, "begin-revision", {
    now: 5_003,
    capabilityHash: CAPABILITY_HASH,
    expectedRevision: 1,
    expectedInputHash: INPUT_HASH,
    input: input("매일 20분 운동하기"),
    inputHash: nextHash,
    generationToken: "retry-token",
    idempotencyKey: "revision:fixture-key-0001",
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.cached, true);
  assert.equal(retry.body.idempotent, true);
  assert.equal(retry.body.activeRevision, 2);
});

test("revision AI 실패는 기존 active input과 plan을 보존하고 stale claim을 차단한다", async () => {
  const namespace = memoryDurableObjectNamespace();
  const { stub, storage } = namespace.newIsolate(DRAFT_ID);
  await seedReady(stub);
  const nextHash = "e".repeat(64);
  await jsonCommand(stub, "begin-revision", {
    now: 6_000,
    capabilityHash: CAPABILITY_HASH,
    expectedRevision: 1,
    expectedInputHash: INPUT_HASH,
    input: input("실패할 수정"),
    inputHash: nextHash,
    generationToken: "failed-revision-token",
    idempotencyKey: "revision:fixture-key-0002",
  });
  await jsonCommand(stub, "fail-generation", { now: 6_001, generationToken: "failed-revision-token" });
  const state = await storage.get("draft");
  assert.equal(state.status, "READY");
  assert.equal(state.activeRevision, 1);
  assert.equal(state.activeInputHash, INPUT_HASH);
  assert.equal(state.activePlan.goal, "첫 고객 10명 만들기");

  const staleClaim = await jsonCommand(stub, "claim", {
    now: 6_002,
    capabilityHash: CAPABILITY_HASH,
    userId: "user-a",
    expectedRevision: 2,
    expectedInputHash: nextHash,
  });
  assert.equal(staleClaim.status, 412);
  assert.equal(staleClaim.body.code, "DRAFT_REVISION_CONFLICT");
});

test("중단된 generation lease는 active revision을 보존하고 새 revision을 다시 시작할 수 있다", async () => {
  const namespace = memoryDurableObjectNamespace();
  const { stub, storage } = namespace.newIsolate(DRAFT_ID);
  await seedReady(stub, { now: 30_000 });
  const abandonedHash = "5".repeat(64);
  await jsonCommand(stub, "begin-revision", {
    now: 31_000,
    capabilityHash: CAPABILITY_HASH,
    expectedRevision: 1,
    expectedInputHash: INPUT_HASH,
    input: input("중단된 수정"),
    inputHash: abandonedHash,
    generationToken: "abandoned-token",
    idempotencyKey: "revision:abandoned-key",
  });

  const recoveredAt = 31_000 + GUEST_DRAFT_GENERATION_LEASE_MS;
  const inspected = await jsonCommand(stub, "inspect", { now: recoveredAt, capabilityHash: CAPABILITY_HASH });
  assert.equal(inspected.status, 200);
  assert.equal(inspected.body.status, "READY");
  assert.equal(inspected.body.activeRevision, 1);
  assert.equal(inspected.body.activeInputHash, INPUT_HASH);
  assert.equal((await storage.get("draft")).activePlan.goal, "첫 고객 10명 만들기");

  const replacementHash = "6".repeat(64);
  const replacement = await jsonCommand(stub, "begin-revision", {
    now: recoveredAt + 1,
    capabilityHash: CAPABILITY_HASH,
    expectedRevision: 1,
    expectedInputHash: INPUT_HASH,
    input: input("다시 시작한 수정"),
    inputHash: replacementHash,
    generationToken: "replacement-token",
    idempotencyKey: "revision:replacement-key",
  });
  assert.equal(replacement.status, 200);
  assert.equal(replacement.body.shouldGenerate, true);
});

test("중단된 최초 generation은 lease 뒤 삭제되어 동일 draft에서 안전하게 다시 시작한다", async () => {
  const namespace = memoryDurableObjectNamespace();
  const { stub } = namespace.newIsolate(DRAFT_ID);
  const first = await jsonCommand(stub, "begin-initial", {
    now: 40_000,
    draftPlanId: DRAFT_ID,
    anonymousActorHash: "owner-hash",
    capabilityHash: CAPABILITY_HASH,
    input: input(),
    inputHash: INPUT_HASH,
    generationToken: "abandoned-initial-token",
    idempotencyKey: `initial:${INPUT_HASH}`,
  });
  assert.equal(first.status, 200);

  const replacement = await jsonCommand(stub, "begin-initial", {
    now: 40_000 + GUEST_DRAFT_GENERATION_LEASE_MS,
    draftPlanId: DRAFT_ID,
    anonymousActorHash: "owner-hash",
    capabilityHash: CAPABILITY_HASH,
    input: input(),
    inputHash: INPUT_HASH,
    generationToken: "replacement-initial-token",
    idempotencyKey: `initial:${INPUT_HASH}`,
  });
  assert.equal(replacement.status, 200);
  assert.equal(replacement.body.shouldGenerate, true);
  assert.equal(replacement.body.generationToken, "replacement-initial-token");
});

test("commit은 generation token뿐 아니라 pending idempotency key도 일치해야 한다", async () => {
  const namespace = memoryDurableObjectNamespace();
  const { stub, storage } = namespace.newIsolate(DRAFT_ID);
  await jsonCommand(stub, "begin-initial", {
    now: 50_000,
    draftPlanId: DRAFT_ID,
    anonymousActorHash: "owner-hash",
    capabilityHash: CAPABILITY_HASH,
    input: input(),
    inputHash: INPUT_HASH,
    generationToken: "commit-key-token",
    idempotencyKey: `initial:${INPUT_HASH}`,
  });
  const mismatched = await jsonCommand(stub, "commit-generation", {
    now: 50_001,
    generationToken: "commit-key-token",
    idempotencyKey: "initial:wrong-key",
    inputHash: INPUT_HASH,
    plan: plan(),
    preview: { firstAction: "고객 한 명에게 연락하기" },
  });
  assert.equal(mismatched.status, 409);
  assert.equal((await storage.get("draft")).status, "GENERATING");
});

test("동일 base revision 경쟁은 하나만 시작하고 pending claim 및 claimed revision을 차단한다", async () => {
  const namespace = memoryDurableObjectNamespace();
  const first = namespace.newIsolate(DRAFT_ID);
  const second = namespace.newIsolate(DRAFT_ID);
  await seedReady(first.stub);
  const revisions = [
    { token: "competing-token-a", hash: "1".repeat(64), key: "revision:competing-key-a" },
    { token: "competing-token-b", hash: "2".repeat(64), key: "revision:competing-key-b" },
  ];
  const results = await Promise.all(revisions.map((revision, index) => jsonCommand(index ? second.stub : first.stub, "begin-revision", {
    now: 7_000,
    capabilityHash: CAPABILITY_HASH,
    expectedRevision: 1,
    expectedInputHash: INPUT_HASH,
    input: input(`경쟁 수정 ${index}`),
    inputHash: revision.hash,
    generationToken: revision.token,
    idempotencyKey: revision.key,
  })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const winner = revisions[results.findIndex((result) => result.status === 200)];

  const claimDuringRevision = await jsonCommand(second.stub, "claim", {
    now: 7_001,
    capabilityHash: CAPABILITY_HASH,
    userId: "claim-during-revision",
    expectedRevision: 1,
    expectedInputHash: INPUT_HASH,
  });
  assert.equal(claimDuringRevision.status, 409);
  assert.equal(claimDuringRevision.body.code, "DRAFT_REVISION_PENDING");
  await jsonCommand(first.stub, "fail-generation", { now: 7_002, generationToken: winner.token });

  const claimed = await jsonCommand(first.stub, "claim", {
    now: 7_003,
    capabilityHash: CAPABILITY_HASH,
    userId: "claim-owner",
    expectedRevision: 1,
    expectedInputHash: INPUT_HASH,
  });
  assert.equal(claimed.status, 200);
  const revisionAfterClaim = await jsonCommand(second.stub, "begin-revision", {
    now: 7_004,
    capabilityHash: CAPABILITY_HASH,
    expectedRevision: 1,
    expectedInputHash: INPUT_HASH,
    input: input("claim 후 수정"),
    inputHash: "3".repeat(64),
    generationToken: "post-claim-token",
    idempotencyKey: "revision:post-claim-key",
  });
  assert.equal(revisionAfterClaim.status, 409);
  assert.equal(revisionAfterClaim.body.code, "DRAFT_PLAN_ALREADY_CLAIMED");
});

test("잘못된 capability, 만료 상태, alarm cleanup은 전체 초안을 공개하지 않는다", async () => {
  const namespace = memoryDurableObjectNamespace();
  const { object, stub, storage } = namespace.newIsolate(DRAFT_ID);
  const ready = await seedReady(stub, { now: 10_000 });
  const denied = await jsonCommand(stub, "inspect", { now: 10_002, capabilityHash: "f".repeat(64) });
  assert.equal(denied.status, 403);
  assert.equal("activeInput" in denied.body, false);

  const expired = await jsonCommand(stub, "inspect", { now: ready.expiresAt + 1, capabilityHash: CAPABILITY_HASH });
  assert.equal(expired.status, 410);
  assert.equal(await storage.get("draft"), undefined);

  await seedReady(stub, { now: 20_000 });
  await object.alarm();
  assert.equal(await storage.get("draft"), undefined);
  assert.equal(storage.alarmAt, null);
});

test("24시간 절대 TTL은 revision과 claim 재시도로 연장되지 않는다", async () => {
  const namespace = memoryDurableObjectNamespace();
  const { stub, storage } = namespace.newIsolate(DRAFT_ID);
  const createdAt = 100_000;
  const ready = await seedReady(stub, { now: createdAt });
  const originalExpiry = ready.expiresAt;
  assert.equal(originalExpiry, createdAt + GUEST_DRAFT_TTL_MS);
  const beforeExpiry = await jsonCommand(stub, "inspect", { now: originalExpiry - 1, capabilityHash: CAPABILITY_HASH });
  assert.equal(beforeExpiry.status, 200);

  await jsonCommand(stub, "begin-revision", {
    now: originalExpiry - 10_000,
    capabilityHash: CAPABILITY_HASH,
    expectedRevision: 1,
    expectedInputHash: INPUT_HASH,
    input: input("만료 직전 수정"),
    inputHash: "4".repeat(64),
    generationToken: "expiry-revision-token",
    idempotencyKey: "revision:expiry-key",
  });
  await jsonCommand(stub, "fail-generation", { now: originalExpiry - 9_999, generationToken: "expiry-revision-token" });
  assert.equal((await storage.get("draft")).expiresAt, originalExpiry);

  const claim = await jsonCommand(stub, "claim", {
    now: originalExpiry - 1,
    capabilityHash: CAPABILITY_HASH,
    userId: "expiry-owner",
    expectedRevision: 1,
    expectedInputHash: INPUT_HASH,
  });
  assert.equal(claim.status, 200);
  assert.equal(claim.body.expiresAt, originalExpiry);
  const retryAfterExpiry = await jsonCommand(stub, "claim", {
    now: originalExpiry,
    capabilityHash: CAPABILITY_HASH,
    userId: "expiry-owner",
    expectedRevision: 1,
    expectedInputHash: INPUT_HASH,
  });
  assert.equal(retryAfterExpiry.status, 410);
  assert.equal(retryAfterExpiry.body.status, "EXPIRED");
  assert.equal(await storage.get("draft"), undefined);
});
