import test from "node:test";
import assert from "node:assert/strict";
import { createBillingLedger, createMemoryBillingDb } from "./billing-ledger.mjs";

test("동일 사용자와 logical request는 하나의 주문과 Idempotency-Key를 재사용한다", async () => {
  const db = createMemoryBillingDb();
  const ledger = createBillingLedger(db);
  await ledger.getOrCreateBillingAccount({ userId: "user-a", customerKey: "omw_customer_a" });
  const first = await ledger.createOrReusePaymentOrder({ userId: "user-a", customerKey: "omw_customer_a", amount: 4900, logicalRequestKey: "auth-a" });
  const second = await ledger.createOrReusePaymentOrder({ userId: "user-a", customerKey: "omw_customer_a", amount: 4900, logicalRequestKey: "auth-a" });
  assert.equal(second.orderId, first.orderId);
  assert.equal(second.idempotencyKey, first.idempotencyKey);
  assert.equal(db.orders.size, 1);
});

test("사용자 A와 B의 주문 및 customerKey는 서로 격리된다", async () => {
  const db = createMemoryBillingDb();
  const ledger = createBillingLedger(db);
  await ledger.getOrCreateBillingAccount({ userId: "user-a", customerKey: "omw_customer_a" });
  await ledger.getOrCreateBillingAccount({ userId: "user-b", customerKey: "omw_customer_b" });
  const a = await ledger.createOrReusePaymentOrder({ userId: "user-a", customerKey: "omw_customer_a", amount: 4900, logicalRequestKey: "auth-a" });
  const b = await ledger.createOrReusePaymentOrder({ userId: "user-b", customerKey: "omw_customer_b", amount: 4900, logicalRequestKey: "auth-b" });
  assert.notEqual(a.orderId, b.orderId);
  assert.notEqual(a.idempotencyKey, b.idempotencyKey);
  await assert.rejects(() => ledger.getOrCreateBillingAccount({ userId: "user-c", customerKey: "omw_customer_a" }), /already linked|conflict/i);
});

test("주문 상태 전이는 append-only event를 남기고 허용되지 않은 역행을 거부한다", async () => {
  const db = createMemoryBillingDb();
  const ledger = createBillingLedger(db);
  await ledger.getOrCreateBillingAccount({ userId: "user-a", customerKey: "omw_customer_a" });
  const order = await ledger.createOrReusePaymentOrder({ userId: "user-a", customerKey: "omw_customer_a", amount: 4900, logicalRequestKey: "auth-a" });
  await ledger.markOrderPending({ orderId: order.orderId });
  await ledger.markOrderSucceeded({ orderId: order.orderId, paymentKey: "payment-a" });
  assert.equal((await ledger.getPaymentOrder(order.orderId)).status, "succeeded");
  assert.equal(db.events.length, 3);
  await assert.rejects(() => ledger.markOrderFailed({ orderId: order.orderId, failureCode: "LATE" }), /transition/);
});

test("일반 상태 전이는 failed 주문을 succeeded로 되돌릴 수 없다", async () => {
  const db = createMemoryBillingDb();
  const ledger = createBillingLedger(db);
  await ledger.getOrCreateBillingAccount({ userId: "user-a", customerKey: "omw_customer_a" });
  const order = await ledger.createOrReusePaymentOrder({ userId: "user-a", customerKey: "omw_customer_a", amount: 4900, logicalRequestKey: "auth-failed" });
  await ledger.markOrderPending({ orderId: order.orderId });
  await ledger.markOrderFailed({ orderId: order.orderId, failureCode: "PAYMENT_AMOUNT_MISMATCH" });
  await assert.rejects(
    ledger.markOrderSucceeded({ orderId: order.orderId, paymentKey: "payment-a" }),
    (error) => error.code === "BILLING_ORDER_STATE_CONFLICT",
  );
  assert.equal((await ledger.getPaymentOrder(order.orderId)).status, "failed");
  assert.equal(db.events.length, 3);
});

test("외부 승인 복구 전용 메서드는 failed 최초 주문만 원자적 succeeded로 전이하고 재실행은 no-op이다", async () => {
  const db = createMemoryBillingDb();
  const ledger = createBillingLedger(db);
  await ledger.getOrCreateBillingAccount({ userId: "user-a", customerKey: "omw_customer_a" });
  const order = await ledger.createOrReusePaymentOrder({ userId: "user-a", customerKey: "omw_customer_a", amount: 4900, logicalRequestKey: "auth-reconcile" });
  await ledger.markOrderPending({ orderId: order.orderId });
  await ledger.markOrderFailed({ orderId: order.orderId, failureCode: "PAYMENT_AMOUNT_MISMATCH", failureMessage: "amount mismatch" });
  const approvedAt = Date.parse("2026-07-17T10:20:30.000Z");
  const first = await ledger.reconcileExternallyApprovedOrder({ orderId: order.orderId, paymentKey: "payment-a", approvedAt, now: approvedAt + 1 });
  assert.equal(first.reconciled, true);
  assert.equal(first.order.status, "succeeded");
  assert.equal(first.order.paymentKey, "payment-a");
  assert.equal(first.order.failureCode, null);
  assert.equal(first.order.failureMessage, null);
  assert.equal(first.order.completedAt, approvedAt);
  assert.equal(db.events.length, 4);
  assert.equal(db.events.at(-1).event_type, "order_reconciled_succeeded");
  assert.deepEqual(JSON.parse(db.events.at(-1).metadata_json), {
    source: "toss_order_lookup",
    reason: "payment_total_amount_field_fix",
    recovered: true,
  });

  const second = await ledger.reconcileExternallyApprovedOrder({ orderId: order.orderId, paymentKey: "payment-a", approvedAt, now: approvedAt + 2 });
  assert.equal(second.reconciled, false);
  assert.equal(second.alreadySucceeded, true);
  assert.equal(second.reconciliationEventExists, true);
  assert.equal(db.events.length, 4);
});

test("이미 정상 succeeded인 주문의 외부 승인 복구는 같은 paymentKey에서만 no-op이다", async () => {
  const db = createMemoryBillingDb();
  const ledger = createBillingLedger(db);
  await ledger.getOrCreateBillingAccount({ userId: "user-a", customerKey: "omw_customer_a" });
  const order = await ledger.createOrReusePaymentOrder({ userId: "user-a", customerKey: "omw_customer_a", amount: 4900, logicalRequestKey: "auth-succeeded" });
  await ledger.markOrderPending({ orderId: order.orderId });
  await ledger.markOrderSucceeded({ orderId: order.orderId, paymentKey: "payment-a" });
  const eventCount = db.events.length;
  const same = await ledger.reconcileExternallyApprovedOrder({ orderId: order.orderId, paymentKey: "payment-a" });
  assert.equal(same.reconciled, false);
  assert.equal(same.alreadySucceeded, true);
  assert.equal(db.events.length, eventCount);
  await assert.rejects(
    ledger.reconcileExternallyApprovedOrder({ orderId: order.orderId, paymentKey: "payment-b" }),
    (error) => error.code === "BILLING_RECONCILIATION_PAYMENT_CONFLICT",
  );
});

test("billing key fingerprint만 별도 계정에 저장하고 원문은 저장하지 않는다", async () => {
  const db = createMemoryBillingDb();
  const ledger = createBillingLedger(db);
  await ledger.getOrCreateBillingAccount({ userId: "user-a", customerKey: "omw_customer_a" });
  await ledger.recordBillingKeyFingerprint({ userId: "user-a", billingKeyFingerprint: "a".repeat(64) });
  const serialized = JSON.stringify(db);
  assert.equal(serialized.includes("billing-secret"), false);
  assert.equal(db.accounts.get("user-a").billing_key_fingerprint, "a".repeat(64));
});
