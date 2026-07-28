import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLAN_CONFIG } from "./plan-policy.mjs";
import { createBillingLedger, createMemoryBillingDb } from "./billing-ledger.mjs";

/* PRO 가격은 PLAN_CONFIG.pro.priceKRW 한 곳에서만 나온다. 이 파일은 그 단일 출처가
   깨지는 두 가지 방식을 막는다 — 청구 코드가 숫자를 다시 적어 넣는 것, 그리고 화면·문서
   문구가 정책과 따로 노는 것. 이전에 정책 4,900과 화면 2,900이 갈라진 원인이 이 둘이다. */

const PRO_PRICE = PLAN_CONFIG.pro.priceKRW;
const PRO_PRICE_TEXT = `${PRO_PRICE.toLocaleString("ko-KR")}원`;
// "4,900원"처럼 세 자리 구분 쉼표가 있는 금액만 본다. 화면의 "0원"이나 "30분"은 가격이 아니다.
const PRICE_TOKEN = /\d{1,3},\d{3}\s*원/g;
// JS 비교(`amount !== 4900`)와 SQL 리터럴(`amount = 4900`)을 함께 잡는다.
const HARDCODED_AMOUNT = /amount\s*(?:!==|===|==|=)\s*\d/gi;

function read(file) {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

function priceTokens(file) {
  return (read(file).match(PRICE_TOKEN) || []).map((token) => token.replace(/\s+/g, ""));
}

test("결제 금액을 판정하는 코드에 가격 리터럴이 없다", () => {
  for (const file of ["auth-service.mjs", "billing-ledger.mjs", "worker.mjs"]) {
    const found = read(file).match(HARDCODED_AMOUNT) || [];
    assert.deepEqual(found, [], `${file}에 하드코딩된 결제 금액이 있다: ${found.join(", ")}`);
  }
});

test("원장의 외부 승인 복구는 정책 가격을 기준으로 판정한다", async () => {
  const db = createMemoryBillingDb();
  const ledger = createBillingLedger(db);
  await ledger.getOrCreateBillingAccount({ userId: "user-policy", customerKey: "omw_customer_policy" });

  const order = await ledger.createOrReusePaymentOrder({
    userId: "user-policy",
    customerKey: "omw_customer_policy",
    amount: PRO_PRICE,
    logicalRequestKey: "auth-policy",
  });
  await ledger.markOrderPending({ orderId: order.orderId });
  await ledger.markOrderFailed({ orderId: order.orderId, failureCode: "PAYMENT_AMOUNT_MISMATCH" });
  const reconciled = await ledger.reconcileExternallyApprovedOrder({ orderId: order.orderId, paymentKey: "payment-policy" });
  assert.equal(reconciled.order.status, "succeeded");
  assert.equal(reconciled.order.amount, PRO_PRICE);

  // 정책 가격이 아닌 주문은 여전히 복구 대상이 아니다.
  const offPolicy = await ledger.createOrReusePaymentOrder({
    userId: "user-policy",
    customerKey: "omw_customer_policy",
    amount: PRO_PRICE + 1000,
    logicalRequestKey: "auth-off-policy",
  });
  await ledger.markOrderPending({ orderId: offPolicy.orderId });
  await ledger.markOrderFailed({ orderId: offPolicy.orderId, failureCode: "PAYMENT_AMOUNT_MISMATCH" });
  await assert.rejects(
    ledger.reconcileExternallyApprovedOrder({ orderId: offPolicy.orderId, paymentKey: "payment-off-policy" }),
    (error) => error.code === "BILLING_RECONCILIATION_POLICY_CONFLICT",
  );
});

test("앱 화면은 가격을 직접 적지 않고 정책에서 읽는다", () => {
  for (const file of ["index.html", "app.html", "admin.html"]) {
    assert.deepEqual(
      priceTokens(file),
      [],
      `${file}은 가격을 하드코딩하면 안 된다. data-policy-field로 정책 값을 읽어야 한다.`,
    );
  }
  // 정책이 실리는 자리가 실제로 있는지까지 확인한다. 없으면 화면에서 가격이 사라진다.
  for (const file of ["index.html", "app.html"]) {
    const markup = read(file);
    assert.match(markup, /data-policy-plan="pro" data-policy-field="price-won"/);
  }
});

test("스크립트의 결제 문구는 가격을 직접 적지 않는다", () => {
  assert.deepEqual(priceTokens("script.js"), []);
});

test("정적 문구와 정책 문서의 가격은 정책 값과 같다", () => {
  const files = [
    "terms.html",
    "README.md",
    "docs/pricing-and-credits.md",
    "docs/account-billing-setup.md",
    "docs/pricing-system-v1.md",
  ];
  for (const file of files) {
    const tokens = priceTokens(file);
    assert.notEqual(tokens.length, 0, `${file}에 PRO 가격 표기가 없다.`);
    for (const token of tokens) {
      assert.equal(token, PRO_PRICE_TEXT, `${file}의 가격 표기 ${token}이 정책 값 ${PRO_PRICE_TEXT}과 다르다.`);
    }
  }
});

test("v2 문서의 월 요금 표기는 정책 값과 같고 에너지 팩 가격은 그대로 둔다", () => {
  const doc = read("docs/pricing-system-v2.md");
  const monthly = doc.match(/월\s*\d{1,3},\d{3}\s*원/g) || [];
  assert.notEqual(monthly.length, 0, "v2 문서에 PRO 월 요금 표기가 없다.");
  for (const token of monthly) {
    assert.equal(token.replace(/\s+/g, ""), `월${PRO_PRICE_TEXT}`, `v2 문서의 ${token}이 정책 값과 다르다.`);
  }
  // 에너지 팩은 구독과 별개 상품이라 가격 통일 대상이 아니다.
  assert.match(doc, /\|\s*1,000\s*\|\s*4,900원\s*\|\s*4\.90원\s*\|/);
  assert.match(doc, /\|\s*100\s*\|\s*990원\s*\|/);
  assert.match(doc, /\|\s*300\s*\|\s*1,990원\s*\|/);
});
