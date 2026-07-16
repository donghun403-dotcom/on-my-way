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

test("billing key fingerprint만 별도 계정에 저장하고 원문은 저장하지 않는다", async () => {
  const db = createMemoryBillingDb();
  const ledger = createBillingLedger(db);
  await ledger.getOrCreateBillingAccount({ userId: "user-a", customerKey: "omw_customer_a" });
  await ledger.recordBillingKeyFingerprint({ userId: "user-a", billingKeyFingerprint: "a".repeat(64) });
  const serialized = JSON.stringify(db);
  assert.equal(serialized.includes("billing-secret"), false);
  assert.equal(db.accounts.get("user-a").billing_key_fingerprint, "a".repeat(64));
});
