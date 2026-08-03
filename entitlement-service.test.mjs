/* entitlement-service.mjs 계약 검사.
 *
 * 실결제 없이 고정할 수 있는 것을 고정한다: 상태 매핑, 통보 멱등성, verify 전 도착의
 * 유예(deferred), 환불 기록, purchaseToken의 계정 바인딩, 서비스 계정 JWT의 서명.
 * 구글이 실제로 보내는 값의 모양은 [확인 필요]로 남아 있고(초안 §3), 실결제 검증
 * 라운드에서 이 픽스처들을 실측값으로 바꾼다. */

import test from "node:test";
import assert from "node:assert/strict";

import {
  createEntitlementStore,
  createMemoryEntitlementDb,
  getGoogleAccessToken,
  googlePlayConfig,
  hasEntitlementAccess,
  mapGoogleNotificationToState,
  mapGoogleSubscriptionState,
  parseRtdnEnvelope,
  processGoogleRtdn,
  publicEntitlement,
  verifyGooglePurchase,
} from "./entitlement-service.mjs";
import { handleAccountApi, parseCookies } from "./auth-service.mjs";

const NOW = Date.parse("2026-08-04T03:00:00.000Z");

function rtdnEnvelope({ messageId = "msg-1", notificationType = 4, purchaseToken = "token-a", packageName = "com.olivenrich.onmyway", test = false } = {}) {
  const notification = test
    ? { version: "1.0", packageName, eventTimeMillis: String(NOW), testNotification: { version: "1.0" } }
    : {
        version: "1.0",
        packageName,
        eventTimeMillis: String(NOW),
        subscriptionNotification: { version: "1.0", notificationType, purchaseToken, subscriptionId: "pro_monthly" },
      };
  return {
    message: {
      data: Buffer.from(JSON.stringify(notification), "utf8").toString("base64url"),
      messageId,
    },
    subscription: "projects/x/subscriptions/y",
  };
}

/* verify가 만드는 행을 지름길로 만든다 — RTDN 적용 테스트의 전제다. */
async function seedEntitlement(store, { userId = "usr_a", purchaseToken = "token-a", state = "active" } = {}) {
  await store.insertEntitlement({
    entitlement_id: `ent_seed_${purchaseToken}`,
    user_id: userId,
    store: "google",
    store_subscription_id: purchaseToken,
    product_id: "pro_monthly",
    base_plan_id: "monthly",
    offer_id: null,
    state,
    auto_renewing: 1,
    expires_at: NOW + 30 * 24 * 60 * 60 * 1000,
    grace_period_expires_at: null,
    acknowledged_at: NOW - 1000,
    linked_prior_subscription_id: null,
    reported_price_micros: null,
    reported_currency: null,
    first_verified_at: NOW - 1000,
    last_verified_at: NOW - 1000,
    created_at: NOW - 1000,
    updated_at: NOW - 1000,
  });
  return store.getEntitlement("google", purchaseToken);
}

test("RTDN 유형 매핑은 초안 §3 표와 일치하고, 상태를 바꾸지 않는 유형은 null이다", () => {
  assert.equal(mapGoogleNotificationToState(4), "active");   // PURCHASED
  assert.equal(mapGoogleNotificationToState(2), "active");   // RENEWED
  assert.equal(mapGoogleNotificationToState(1), "active");   // RECOVERED
  assert.equal(mapGoogleNotificationToState(7), "active");   // RESTARTED
  assert.equal(mapGoogleNotificationToState(6), "grace");
  assert.equal(mapGoogleNotificationToState(5), "on_hold");
  assert.equal(mapGoogleNotificationToState(10), "paused");
  assert.equal(mapGoogleNotificationToState(3), "canceled");
  assert.equal(mapGoogleNotificationToState(13), "expired");
  assert.equal(mapGoogleNotificationToState(12), "revoked");
  // 가격 변경 확인·연기·일시정지 예약 변경·보류 취소는 상태 전이가 아니다
  for (const type of [8, 9, 11, 20, 999]) assert.equal(mapGoogleNotificationToState(type), null);
});

test("권한은 active·grace에서 유지되고 canceled는 만료 시각까지만 유지된다", () => {
  assert.equal(hasEntitlementAccess({ state: "active" }, NOW), true);
  assert.equal(hasEntitlementAccess({ state: "grace" }, NOW), true);
  assert.equal(hasEntitlementAccess({ state: "canceled", expiresAt: NOW + 1 }, NOW), true);
  assert.equal(hasEntitlementAccess({ state: "canceled", expiresAt: NOW - 1 }, NOW), false);
  // 만료 시각을 모르는 canceled(verify 전)는 보수적으로 닫는다
  assert.equal(hasEntitlementAccess({ state: "canceled", expiresAt: null }, NOW), false);
  for (const state of ["on_hold", "paused", "expired", "revoked"]) {
    assert.equal(hasEntitlementAccess({ state, expiresAt: NOW + 1 }, NOW), false, state);
  }
  assert.equal(hasEntitlementAccess(null, NOW), false);
});

test("Pub/Sub 봉투를 developerNotification으로 풀고, 아닌 것은 거부한다", () => {
  const parsed = parseRtdnEnvelope(rtdnEnvelope({ messageId: "m-7", notificationType: 3 }));
  assert.equal(parsed.messageId, "m-7");
  assert.equal(parsed.packageName, "com.olivenrich.onmyway");
  assert.equal(parsed.subscriptionNotification.notificationType, 3);
  assert.throws(() => parseRtdnEnvelope({}), TypeError);
  assert.throws(() => parseRtdnEnvelope({ message: { messageId: "m", data: "!!!not-base64-json" } }), TypeError);
});

test("같은 messageId의 재전달은 한 번만 처리된다 (최소 1회 전달 대비)", async () => {
  const db = createMemoryEntitlementDb();
  const store = createEntitlementStore(db);
  await seedEntitlement(store);
  const envelope = parseRtdnEnvelope(rtdnEnvelope({ messageId: "dup-1", notificationType: 3 }));
  const first = await processGoogleRtdn(store, envelope, NOW);
  const second = await processGoogleRtdn(store, envelope, NOW + 1);
  assert.equal(first.outcome, "applied");
  assert.equal(second.outcome, "duplicate");
  assert.equal(db.notifications.size, 1);
  assert.equal(db.events.length, 1);
});

test("verify 전에 도착한 알림은 행을 만들지 않고 미처리로 남긴다", async () => {
  const db = createMemoryEntitlementDb();
  const store = createEntitlementStore(db);
  const result = await processGoogleRtdn(store, parseRtdnEnvelope(rtdnEnvelope({ notificationType: 4 })), NOW);
  assert.equal(result.outcome, "deferred");
  assert.equal(db.entitlements.size, 0, "주인을 모르는 구독의 행을 만들면 안 된다");
  const stored = [...db.notifications.values()][0];
  assert.equal(stored.processed_at, null, "재처리 목록(idx_store_notifications_unprocessed)에 남아야 한다");
});

test("상태 전이를 적용하고 append-only 이력에 무엇 때문인지(source)를 남긴다", async () => {
  const db = createMemoryEntitlementDb();
  const store = createEntitlementStore(db);
  await seedEntitlement(store);

  const canceled = await processGoogleRtdn(store, parseRtdnEnvelope(rtdnEnvelope({ messageId: "m-1", notificationType: 3 })), NOW);
  assert.equal(canceled.outcome, "applied");
  let row = await store.getEntitlement("google", "token-a");
  assert.equal(row.state, "canceled");
  assert.equal(row.auto_renewing, 0, "해지는 자동갱신 꺼짐으로 본다");

  const expired = await processGoogleRtdn(store, parseRtdnEnvelope(rtdnEnvelope({ messageId: "m-2", notificationType: 13 })), NOW + 1);
  assert.equal(expired.outcome, "applied");
  row = await store.getEntitlement("google", "token-a");
  assert.equal(row.state, "expired");

  assert.deepEqual(db.events.map((event) => [event.previous_state, event.new_state, event.source]), [
    ["active", "canceled", "notification"],
    ["canceled", "expired", "notification"],
  ]);
  assert.equal(db.events[0].source_notification_id, "m-1");
});

test("REVOKED는 환불 이력을 남기고, 같은 회수의 중복 기록은 막힌다", async () => {
  const db = createMemoryEntitlementDb();
  const store = createEntitlementStore(db);
  await seedEntitlement(store);
  await processGoogleRtdn(store, parseRtdnEnvelope(rtdnEnvelope({ messageId: "r-1", notificationType: 12 })), NOW);
  // 다른 messageId로 같은 회수가 다시 통보돼도 UNIQUE(store, transaction, type)가 막는다
  await processGoogleRtdn(store, parseRtdnEnvelope(rtdnEnvelope({ messageId: "r-2", notificationType: 12 })), NOW + 1);
  assert.equal(db.refunds.size, 1);
  const refund = [...db.refunds.values()][0];
  assert.equal(refund.refund_type, "revoke");
  assert.equal(refund.entitlement_revoked, 1);
  assert.equal(refund.user_id, "usr_a", "환불 이력은 계정으로 조회 가능해야 한다(초안 §5.2)");
  const listed = await store.listRefundsByUser("usr_a");
  assert.equal(listed.length, 1);
});

test("테스트 알림과 미지원 유형은 기록만 남기고 상태를 건드리지 않는다", async () => {
  const db = createMemoryEntitlementDb();
  const store = createEntitlementStore(db);
  await seedEntitlement(store);
  const testResult = await processGoogleRtdn(store, parseRtdnEnvelope(rtdnEnvelope({ messageId: "t-1", test: true })), NOW);
  assert.equal(testResult.outcome, "test");
  const priceResult = await processGoogleRtdn(store, parseRtdnEnvelope(rtdnEnvelope({ messageId: "t-2", notificationType: 8 })), NOW);
  assert.equal(priceResult.outcome, "ignored");
  const row = await store.getEntitlement("google", "token-a");
  assert.equal(row.state, "active");
  assert.equal(db.events.length, 0);
  assert.equal(db.notifications.size, 2, "원문은 남아야 나중에 재처리할 수 있다");
});

/* ---------- 구글 API 검증 ---------- */

async function serviceAccountFixture() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)).toString("base64");
  const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;
  return { keyPair, pem };
}

function subscriptionsV2Fixture(overrides = {}) {
  return {
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
    latestOrderId: "GPA.1234-5678",
    lineItems: [{
      productId: "pro_monthly",
      expiryTime: new Date(NOW + 31 * 24 * 60 * 60 * 1000).toISOString(),
      autoRenewingPlan: { autoRenewEnabled: true },
      offerDetails: { basePlanId: "monthly" },
    }],
    ...overrides,
  };
}

function googleFetcher({ purchase = subscriptionsV2Fixture(), ackStatus = 200 } = {}) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    /* 구매 조회 URL에도 /tokens/가 들어가므로 토큰 엔드포인트 판정을 마지막에 둔다 */
    if (String(url).includes(":acknowledge")) {
      return new Response("{}", { status: ackStatus });
    }
    if (String(url).includes("subscriptionsv2")) {
      return new Response(JSON.stringify(purchase), { status: 200 });
    }
    if (String(url).includes("oauth2")) {
      return new Response(JSON.stringify({ access_token: "fixture-access-token", expires_in: 3600 }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
  return { fetcher, calls };
}

test("구성 판정: 패키지명·서비스 계정이 온전할 때만 configured다", () => {
  assert.equal(googlePlayConfig({}).configured, false);
  assert.equal(googlePlayConfig({ GOOGLE_PLAY_PACKAGE_NAME: "com.x" }).configured, false);
  assert.equal(googlePlayConfig({ GOOGLE_PLAY_PACKAGE_NAME: "com.x", GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: "{broken" }).configured, false);
  assert.equal(googlePlayConfig({
    GOOGLE_PLAY_PACKAGE_NAME: "com.x",
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "a@b", private_key: "p" }),
  }).configured, true);
});

test("액세스 토큰 요청의 JWT는 올바른 claims를 담고 서비스 계정 키로 서명된다", async () => {
  const { keyPair, pem } = await serviceAccountFixture();
  const config = googlePlayConfig({
    GOOGLE_PLAY_PACKAGE_NAME: "com.olivenrich.onmyway",
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: "svc@project.iam.gserviceaccount.com",
      private_key: pem,
      token_uri: "https://oauth2.googleapis.com/token",
    }),
  });
  const { fetcher, calls } = googleFetcher();
  const token = await getGoogleAccessToken(config, fetcher, NOW);
  assert.equal(token, "fixture-access-token");

  const body = String(calls[0].init.body);
  const assertion = decodeURIComponent(body.split("assertion=")[1]);
  const [header, claims, signature] = assertion.split(".");
  const decoded = JSON.parse(Buffer.from(claims, "base64url").toString("utf8"));
  assert.equal(decoded.iss, "svc@project.iam.gserviceaccount.com");
  assert.equal(decoded.scope, "https://www.googleapis.com/auth/androidpublisher");
  assert.equal(decoded.aud, "https://oauth2.googleapis.com/token");
  assert.equal(decoded.exp - decoded.iat, 3600);
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    keyPair.publicKey,
    Buffer.from(signature, "base64url"),
    Buffer.from(`${header}.${claims}`, "utf8"),
  );
  assert.equal(verified, true, "JWT 서명이 서비스 계정 키와 일치해야 한다");
});

async function verifyFixture({ purchase, ackStatus } = {}) {
  const { pem } = await serviceAccountFixture();
  const config = googlePlayConfig({
    GOOGLE_PLAY_PACKAGE_NAME: "com.olivenrich.onmyway",
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "svc@p.iam", private_key: pem }),
  });
  const db = createMemoryEntitlementDb();
  const store = createEntitlementStore(db);
  const { fetcher, calls } = googleFetcher({ purchase, ackStatus });
  return { config, db, store, fetcher, calls };
}

test("verify는 구매를 계정에 붙이고 만료 시각을 채우고 acknowledge까지 한다", async () => {
  const { config, db, store, fetcher, calls } = await verifyFixture();
  const result = await verifyGooglePurchase({ config, store, fetcher, userId: "usr_buyer", purchaseToken: "vt-1", now: NOW });

  assert.equal(result.access, true);
  assert.equal(result.acknowledged, true);
  assert.equal(result.entitlement.userId, "usr_buyer");
  assert.equal(result.entitlement.state, "active");
  assert.equal(result.entitlement.productId, "pro_monthly");
  assert.equal(result.entitlement.expiresAt, NOW + 31 * 24 * 60 * 60 * 1000);
  assert.ok(result.entitlement.acknowledgedAt, "acknowledge 시각이 남아야 3일 자동 환불을 추적할 수 있다");
  assert.equal(db.events.length, 1);
  assert.equal(db.events[0].source, "reverify");

  const ackCall = calls.find((call) => call.url.includes(":acknowledge"));
  assert.ok(ackCall, "PENDING 구매는 acknowledge를 호출해야 한다");
  assert.ok(ackCall.url.includes("/purchases/subscriptions/pro_monthly/tokens/vt-1"), ackCall.url);

  // 공개 형태에는 purchaseToken이 없다 — 자격 증명에 준한다
  const exposed = publicEntitlement(result.entitlement);
  assert.equal(JSON.stringify(exposed).includes("vt-1"), false);
  assert.equal(exposed.state, "active");
});

test("acknowledge 실패는 검증을 깨지 않고, acknowledged_at이 비어 다음 verify가 재시도한다", async () => {
  const { config, store, fetcher } = await verifyFixture({ ackStatus: 500 });
  const result = await verifyGooglePurchase({ config, store, fetcher, userId: "usr_buyer", purchaseToken: "vt-2", now: NOW });
  assert.equal(result.access, true);
  assert.equal(result.acknowledged, false);
  assert.equal(result.entitlement.acknowledgedAt, null);
});

test("같은 purchaseToken을 다른 계정이 보내면 409로 거절한다 — 결제 하나로 계정 여러 개가 열리면 안 된다", async () => {
  const { config, store, fetcher } = await verifyFixture();
  await verifyGooglePurchase({ config, store, fetcher, userId: "usr_first", purchaseToken: "vt-3", now: NOW });
  await assert.rejects(
    () => verifyGooglePurchase({ config, store, fetcher, userId: "usr_second", purchaseToken: "vt-3", now: NOW + 1 }),
    (error) => error.status === 409 && error.code === "SUBSCRIPTION_OWNED_BY_OTHER",
  );
});

test("스토어가 모르는 purchaseToken은 404로 구분해 알려준다", async () => {
  const { config, store } = await verifyFixture();
  const fetcher = async (url) => String(url).includes("subscriptionsv2")
    ? new Response("not found", { status: 404 })
    : new Response(JSON.stringify({ access_token: "t" }), { status: 200 });
  await assert.rejects(
    () => verifyGooglePurchase({ config, store, fetcher, userId: "usr_a", purchaseToken: "missing", now: NOW }),
    (error) => error.status === 404 && error.code === "INVALID_PURCHASE_TOKEN",
  );
});

test("verify 후 도착한 RTDN이 같은 행에 전이를 적용한다 — 두 경로가 한 사본을 공유한다", async () => {
  const { config, store, db, fetcher } = await verifyFixture();
  await verifyGooglePurchase({ config, store, fetcher, userId: "usr_buyer", purchaseToken: "vt-4", now: NOW });
  const result = await processGoogleRtdn(store, parseRtdnEnvelope(rtdnEnvelope({ messageId: "after-verify", notificationType: 3, purchaseToken: "vt-4" })), NOW + 10);
  assert.equal(result.outcome, "applied");
  const row = await store.getEntitlement("google", "vt-4");
  assert.equal(row.state, "canceled");
  assert.equal(row.user_id, "usr_buyer");
  assert.equal(db.entitlements.size, 1, "같은 구독이 두 행이 되면 안 된다");
});

/* ---------- 라우트 게이트 ---------- */

function routeContext({ path, method = "POST", env = {}, body = {}, cookie = "" }) {
  const cookies = parseCookies(cookie);
  return {
    method,
    url: new URL(path, "https://example.test/"),
    secure: true,
    getCookie: (name) => cookies[name],
    readJson: async () => body,
    readForm: async () => ({}),
    env,
    store: null,
  };
}

test("RTDN 라우트: 미구성이면 503, 토큰이 틀리면 401, 맞으면 봉투를 처리하고 200이다", async () => {
  const base = { SESSION_SECRET: "s".repeat(40), BILLING_DB: createMemoryEntitlementDb() };

  const unconfigured = await handleAccountApi(routeContext({ path: "/api/billing/google/rtdn", env: base, body: rtdnEnvelope() }));
  assert.equal(unconfigured.status, 503);

  const env = { ...base, GOOGLE_RTDN_PUSH_TOKEN: "push-secret" };
  const wrongToken = await handleAccountApi(routeContext({ path: "/api/billing/google/rtdn?token=nope", env, body: rtdnEnvelope() }));
  assert.equal(wrongToken.status, 401);

  const malformed = await handleAccountApi(routeContext({ path: "/api/billing/google/rtdn?token=push-secret", env, body: { hello: 1 } }));
  assert.equal(malformed.status, 400);

  const wrongPackage = await handleAccountApi(routeContext({
    path: "/api/billing/google/rtdn?token=push-secret",
    env: { ...env, GOOGLE_PLAY_PACKAGE_NAME: "com.olivenrich.onmyway" },
    body: rtdnEnvelope({ packageName: "com.evil.app" }),
  }));
  assert.equal(wrongPackage.status, 400);

  const ok = await handleAccountApi(routeContext({ path: "/api/billing/google/rtdn?token=push-secret", env, body: rtdnEnvelope() }));
  assert.equal(ok.status, 200);
  assert.equal(ok.json.outcome, "deferred", "verify 전 도착은 200으로 받되 미처리로 남는다");
});

test("verify 라우트는 로그인 없이는 401이다", async () => {
  const result = await handleAccountApi(routeContext({
    path: "/api/billing/google/verify",
    env: { SESSION_SECRET: "s".repeat(40), BILLING_DB: createMemoryEntitlementDb() },
    body: { purchaseToken: "t" },
  }));
  assert.equal(result.status, 401);
});
