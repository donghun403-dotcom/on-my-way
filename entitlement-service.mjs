/* 스토어 IAP 엔타이틀먼트 — 스토어 상태의 검증된 사본을 유지한다.
 *
 * 설계 근거는 docs/entitlement-schema-draft.md. 토스(billing-ledger.mjs)와 진실의
 * 소유자가 반대다: 결제를 스토어가 시작·갱신하고 우리는 통보를 받는 쪽이라,
 * 멱등성이 막는 대상이 "우리가 보내는 요청"에서 "스토어가 보내는 통보"로 바뀐다.
 *
 * 이 모듈이 하는 일 (1회차 경계)
 *   - RTDN(Pub/Sub) 통보를 멱등 수신하고 entitlements 표를 스토어 상태에 맞춘다
 *   - purchaseToken을 구글 API(subscriptionsv2)로 검증해 구매를 계정에 붙인다
 *   - 3일 자동 환불을 막는 acknowledge를 수행한다
 *
 * 하지 않는 일 — user.plan·크레딧 지급과의 연결. 초안 §6이 그 경계를 긋는 이유를
 * 적어 두었다(#40 체험 무한 리필과 같은 형태의 결함이 그 연결부에서 나온다).
 * 지급 키(§5.1)와 환불 정책(§5.2) 결정과 함께 2회차에서 잇는다.
 */

const GOOGLE_TOKEN_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const textEncoder = new TextEncoder();

/* ---------- 상태 매핑 (초안 §3) ---------- */

/* RTDN subscriptionNotification.notificationType 정수 코드 → 이름.
   [확인 필요] 문서 기준이다. 실결제 검증 라운드에서 실제 수신 값으로 확인한다. */
export const GOOGLE_RTDN_TYPES = Object.freeze({
  1: "SUBSCRIPTION_RECOVERED",
  2: "SUBSCRIPTION_RENEWED",
  3: "SUBSCRIPTION_CANCELED",
  4: "SUBSCRIPTION_PURCHASED",
  5: "SUBSCRIPTION_ON_HOLD",
  6: "SUBSCRIPTION_IN_GRACE_PERIOD",
  7: "SUBSCRIPTION_RESTARTED",
  8: "SUBSCRIPTION_PRICE_CHANGE_CONFIRMED",
  9: "SUBSCRIPTION_DEFERRED",
  10: "SUBSCRIPTION_PAUSED",
  11: "SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED",
  12: "SUBSCRIPTION_REVOKED",
  13: "SUBSCRIPTION_EXPIRED",
  20: "SUBSCRIPTION_PENDING_PURCHASE_CANCELED",
});

/* 상태를 바꾸는 유형만 담는다. 없는 유형(가격 변경 확인, 연기, 일시정지 예약 변경 등)은
   상태 전이가 아니라 기록만 남긴다 — null을 돌려주면 호출부가 그렇게 처리한다. */
const GOOGLE_RTDN_STATE = Object.freeze({
  SUBSCRIPTION_PURCHASED: "active",
  SUBSCRIPTION_RENEWED: "active",
  SUBSCRIPTION_RECOVERED: "active",
  SUBSCRIPTION_RESTARTED: "active",
  SUBSCRIPTION_IN_GRACE_PERIOD: "grace",
  SUBSCRIPTION_ON_HOLD: "on_hold",
  SUBSCRIPTION_PAUSED: "paused",
  SUBSCRIPTION_CANCELED: "canceled",
  SUBSCRIPTION_EXPIRED: "expired",
  SUBSCRIPTION_REVOKED: "revoked",
});

export function mapGoogleNotificationToState(notificationType) {
  const name = GOOGLE_RTDN_TYPES[Number(notificationType)] || null;
  return name ? (GOOGLE_RTDN_STATE[name] ?? null) : null;
}

/* subscriptionsv2 GET의 subscriptionState → 우리 상태. verify 경로가 쓴다.
   PENDING(미결제 대기)은 아직 구독이 아니므로 null — 행을 만들지 않는다. */
const GOOGLE_V2_STATE = Object.freeze({
  SUBSCRIPTION_STATE_ACTIVE: "active",
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: "grace",
  SUBSCRIPTION_STATE_ON_HOLD: "on_hold",
  SUBSCRIPTION_STATE_PAUSED: "paused",
  SUBSCRIPTION_STATE_CANCELED: "canceled",
  SUBSCRIPTION_STATE_EXPIRED: "expired",
});

export function mapGoogleSubscriptionState(subscriptionState) {
  return GOOGLE_V2_STATE[String(subscriptionState || "")] ?? null;
}

/* 권한 판정 (초안 §3의 '권한' 열). grace와 canceled가 권한을 유지한다는 것이 핵심 —
   상태 이름만 보고 막으면 정상 결제 유저가 잠긴다.
   canceled인데 expires_at이 비어 있으면(아직 verify 전) 보수적으로 닫는다. */
export function hasEntitlementAccess(entitlement, now = Date.now()) {
  if (!entitlement) return false;
  const state = String(entitlement.state || "");
  if (state === "active" || state === "grace") return true;
  if (state === "canceled") return Number(entitlement.expiresAt || 0) > now;
  return false;
}

/* ---------- 저장소 어댑터 ---------- */

function requireDatabase(db) {
  if (!db) {
    const error = new Error("BILLING_DB is not configured");
    error.code = "ENTITLEMENT_STORE_UNAVAILABLE";
    error.status = 503;
    throw error;
  }
}

function randomId(prefix) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `${prefix}${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function normalizeEntitlement(row) {
  if (!row) return null;
  return {
    entitlementId: row.entitlement_id,
    userId: row.user_id,
    store: row.store,
    storeSubscriptionId: row.store_subscription_id,
    productId: row.product_id,
    basePlanId: row.base_plan_id || null,
    offerId: row.offer_id || null,
    state: row.state,
    autoRenewing: Number(row.auto_renewing) === 1,
    expiresAt: row.expires_at === null || row.expires_at === undefined ? null : Number(row.expires_at),
    gracePeriodExpiresAt: row.grace_period_expires_at === null || row.grace_period_expires_at === undefined ? null : Number(row.grace_period_expires_at),
    acknowledgedAt: row.acknowledged_at === null || row.acknowledged_at === undefined ? null : Number(row.acknowledged_at),
    linkedPriorSubscriptionId: row.linked_prior_subscription_id || null,
    reportedPriceMicros: row.reported_price_micros === null || row.reported_price_micros === undefined ? null : Number(row.reported_price_micros),
    reportedCurrency: row.reported_currency || null,
    firstVerifiedAt: Number(row.first_verified_at),
    lastVerifiedAt: Number(row.last_verified_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export function createMemoryEntitlementDb() {
  return {
    __entitlementMemory: true,
    notifications: new Map(),
    entitlements: new Map(),
    events: [],
    refunds: new Map(),
  };
}

function memoryAdapter(db) {
  const entitlementKey = (store, storeSubscriptionId) => `${store}:${storeSubscriptionId}`;
  return {
    async insertNotification(values) {
      const key = `${values.store}:${values.storeNotificationId}`;
      if (db.notifications.has(key)) return { inserted: false };
      db.notifications.set(key, {
        notification_id: values.notificationId,
        store: values.store,
        store_notification_id: values.storeNotificationId,
        notification_type: values.notificationType,
        subtype: values.subtype ?? null,
        store_subscription_id: values.storeSubscriptionId ?? null,
        payload_json: values.payloadJson,
        received_at: values.receivedAt,
        processed_at: null,
        process_error: null,
      });
      return { inserted: true };
    },
    async setNotificationProcessed(values) {
      const row = db.notifications.get(`${values.store}:${values.storeNotificationId}`);
      if (!row) return;
      row.processed_at = values.processedAt;
      row.process_error = values.processError ?? null;
    },
    async resolveDeferredNotifications(store, storeSubscriptionId, processedAt) {
      let resolved = 0;
      for (const row of db.notifications.values()) {
        if (row.store !== store || row.store_subscription_id !== storeSubscriptionId) continue;
        if (row.processed_at !== null && row.processed_at !== undefined) continue;
        row.processed_at = processedAt;
        resolved += 1;
      }
      return { resolved };
    },
    async getEntitlement(store, storeSubscriptionId) {
      return db.entitlements.get(entitlementKey(store, storeSubscriptionId)) || null;
    },
    async insertEntitlement(values) {
      db.entitlements.set(entitlementKey(values.store, values.store_subscription_id), { ...values });
    },
    async updateEntitlement(entitlementId, patch) {
      for (const row of db.entitlements.values()) {
        if (row.entitlement_id !== entitlementId) continue;
        for (const [key, value] of Object.entries(patch)) if (value !== undefined) row[key] = value;
        return;
      }
    },
    async appendEvent(values) {
      db.events.push({ ...values });
    },
    async insertRefund(values) {
      const key = `${values.store}:${values.store_transaction_id}:${values.refund_type}`;
      if (db.refunds.has(key)) return { inserted: false };
      db.refunds.set(key, { ...values });
      return { inserted: true };
    },
    async listRefundsByUser(userId) {
      return [...db.refunds.values()].filter((row) => row.user_id === userId)
        .sort((a, b) => b.refunded_at - a.refunded_at);
    },
  };
}

function d1Adapter(db) {
  const first = async (sql, ...values) => db.prepare(sql).bind(...values).first();
  const run = async (sql, ...values) => db.prepare(sql).bind(...values).run();
  return {
    async insertNotification(values) {
      const result = await run(
        `INSERT OR IGNORE INTO store_notifications
           (notification_id, store, store_notification_id, notification_type, subtype,
            store_subscription_id, payload_json, received_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
        values.notificationId, values.store, values.storeNotificationId, values.notificationType,
        values.subtype ?? null, values.storeSubscriptionId ?? null, values.payloadJson, values.receivedAt,
      );
      return { inserted: Number(result?.meta?.changes ?? result?.changes ?? 0) > 0 };
    },
    async setNotificationProcessed(values) {
      await run(
        "UPDATE store_notifications SET processed_at = ?1, process_error = ?2 WHERE store = ?3 AND store_notification_id = ?4",
        values.processedAt, values.processError ?? null, values.store, values.storeNotificationId,
      );
    },
    async resolveDeferredNotifications(store, storeSubscriptionId, processedAt) {
      /* 부분 인덱스 idx_store_notifications_unprocessed가 이 WHERE를 받는다. */
      const result = await run(
        `UPDATE store_notifications SET processed_at = ?1
          WHERE store = ?2 AND store_subscription_id = ?3 AND processed_at IS NULL`,
        processedAt, store, storeSubscriptionId,
      );
      return { resolved: Number(result?.meta?.changes ?? result?.changes ?? 0) };
    },
    async getEntitlement(store, storeSubscriptionId) {
      return first("SELECT * FROM entitlements WHERE store = ?1 AND store_subscription_id = ?2", store, storeSubscriptionId);
    },
    async insertEntitlement(values) {
      await run(
        `INSERT INTO entitlements
           (entitlement_id, user_id, store, store_subscription_id, product_id, base_plan_id, offer_id,
            state, auto_renewing, expires_at, grace_period_expires_at, acknowledged_at,
            linked_prior_subscription_id, reported_price_micros, reported_currency,
            first_verified_at, last_verified_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`,
        values.entitlement_id, values.user_id, values.store, values.store_subscription_id,
        values.product_id, values.base_plan_id ?? null, values.offer_id ?? null,
        values.state, values.auto_renewing, values.expires_at ?? null, values.grace_period_expires_at ?? null,
        values.acknowledged_at ?? null, values.linked_prior_subscription_id ?? null,
        values.reported_price_micros ?? null, values.reported_currency ?? null,
        values.first_verified_at, values.last_verified_at, values.created_at, values.updated_at,
      );
    },
    async updateEntitlement(entitlementId, patch) {
      const assignments = [];
      const bindings = [];
      for (const [column, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        bindings.push(value);
        assignments.push(`${column} = ?${bindings.length}`);
      }
      if (!assignments.length) return;
      bindings.push(entitlementId);
      await run(`UPDATE entitlements SET ${assignments.join(", ")} WHERE entitlement_id = ?${bindings.length}`, ...bindings);
    },
    async appendEvent(values) {
      await run(
        `INSERT INTO entitlement_events
           (event_id, entitlement_id, user_id, previous_state, new_state, event_type, source,
            source_notification_id, metadata_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
        values.event_id, values.entitlement_id, values.user_id, values.previous_state ?? null,
        values.new_state, values.event_type, values.source, values.source_notification_id ?? null,
        values.metadata_json ?? "{}", values.created_at,
      );
    },
    async insertRefund(values) {
      const result = await run(
        `INSERT OR IGNORE INTO entitlement_refunds
           (refund_id, entitlement_id, user_id, store, store_transaction_id, refund_type,
            refunded_amount_micros, refunded_currency, reason_code, entitlement_revoked,
            refunded_at, recorded_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
        values.refund_id, values.entitlement_id, values.user_id, values.store,
        values.store_transaction_id, values.refund_type, values.refunded_amount_micros ?? null,
        values.refunded_currency ?? null, values.reason_code ?? null, values.entitlement_revoked,
        values.refunded_at, values.recorded_at,
      );
      return { inserted: Number(result?.meta?.changes ?? result?.changes ?? 0) > 0 };
    },
    async listRefundsByUser(userId) {
      const result = await db.prepare(
        "SELECT * FROM entitlement_refunds WHERE user_id = ?1 ORDER BY refunded_at DESC",
      ).bind(userId).all();
      return result?.results || [];
    },
  };
}

export function createEntitlementStore(db) {
  requireDatabase(db);
  return db.__entitlementMemory ? memoryAdapter(db) : d1Adapter(db);
}

/* ---------- RTDN 수신 ---------- */

/* Pub/Sub push 봉투를 developerNotification으로 푼다.
   { message: { data: base64(JSON), messageId }, subscription } 형태다. */
export function parseRtdnEnvelope(body) {
  const message = body?.message;
  const messageId = String(message?.messageId || "").trim();
  const data = String(message?.data || "");
  if (!messageId || !data) throw new TypeError("RTDN 봉투가 아닙니다");
  let notification;
  try {
    notification = JSON.parse(atob(data.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    throw new TypeError("RTDN data가 base64 JSON이 아닙니다");
  }
  return {
    messageId,
    packageName: String(notification?.packageName || ""),
    eventTimeMillis: Number(notification?.eventTimeMillis || 0) || null,
    subscriptionNotification: notification?.subscriptionNotification || null,
    /* 환불·차지백은 별도 봉투로 온다. 이걸 읽지 않으면 환불받은 유저가 Pro를 계속
       쓴다 — 실제로 테스트 결제에서 UNKNOWN_ENVELOPE로 버려지는 것을 확인했다. */
    voidedPurchaseNotification: notification?.voidedPurchaseNotification || null,
    testNotification: notification?.testNotification || null,
    raw: notification,
  };
}

/* 통보 하나를 멱등 처리한다. 반환값의 뜻:
     duplicate  같은 messageId를 이미 받았다 — 아무것도 다시 하지 않았다
     test       콘솔의 테스트 알림 — 기록만
     ignored    상태를 바꾸지 않는 유형 — 기록만
     deferred   대상 구독이 아직 entitlements에 없다(verify 전) — 미처리로 남겨
                재처리 대상 목록(idx_store_notifications_unprocessed)에 둔다
     applied    상태 전이를 적용했다
   호출부(라우트)는 어느 경우든 200을 돌려준다 — Pub/Sub는 200이 아니면 재전송한다. */
export async function processGoogleRtdn(store, envelope, now = Date.now()) {
  const sub = envelope.subscriptionNotification;
  const voided = envelope.voidedPurchaseNotification;
  const typeName = sub
    ? GOOGLE_RTDN_TYPES[Number(sub.notificationType)] || `UNKNOWN_${Number(sub.notificationType) || 0}`
    : voided ? "VOIDED_PURCHASE"
    : envelope.testNotification ? "TEST_NOTIFICATION" : "UNKNOWN_ENVELOPE";
  const purchaseToken = String((sub || voided)?.purchaseToken || "");
  /* 구글 refundType: 1 = 전액, 2 = 부분(수량 기반, 일회성 상품에만 온다).
     스키마의 refund_type CHECK가 'full'·'partial'·'revoke'라 그대로 맞는다. */
  const refundType = voided ? (Number(voided.refundType) === 2 ? "partial" : "full") : null;

  const inserted = await store.insertNotification({
    notificationId: randomId("snt_"),
    store: "google",
    storeNotificationId: envelope.messageId,
    notificationType: typeName,
    subtype: refundType,
    storeSubscriptionId: purchaseToken || null,
    payloadJson: JSON.stringify(envelope.raw ?? {}),
    receivedAt: now,
  });
  if (!inserted.inserted) return { outcome: "duplicate" };

  const markProcessed = (processError = null) =>
    store.setNotificationProcessed({ store: "google", storeNotificationId: envelope.messageId, processedAt: now, processError });

  if (envelope.testNotification) {
    await markProcessed();
    return { outcome: "test" };
  }
  if (!purchaseToken) {
    await markProcessed("구독·환불 알림이 아닙니다");
    return { outcome: "ignored" };
  }
  /* 환불·차지백은 유형 코드가 없다. 봉투가 곧 뜻이므로 바로 회수로 읽는다. */
  const nextState = voided ? "revoked" : mapGoogleNotificationToState(sub.notificationType);
  if (!nextState) {
    await markProcessed();
    return { outcome: "ignored", notificationType: typeName };
  }

  const row = await store.getEntitlement("google", purchaseToken);
  if (!row) {
    /* 알림이 최초 구매(verify)보다 먼저 도착했다. 주인(user_id)을 모르는 행을 만들지
       않고 미처리로 남긴다 — verify가 행을 만든 뒤 재처리 배치가 이어받는 설계다. */
    return { outcome: "deferred", notificationType: typeName };
  }

  const previousState = row.state;
  const patch = {
    state: nextState,
    updated_at: now,
    /* RTDN은 갱신 여부를 직접 주지 않는다. 해지는 자동갱신 꺼짐, 활성 복귀는 켜짐으로
       보고, 나머지 상태에서는 기존 값을 유지한다 — 정확한 값은 verify가 맞춘다. */
    auto_renewing: nextState === "canceled" ? 0 : nextState === "active" ? 1 : undefined,
  };
  await store.updateEntitlement(row.entitlement_id, patch);
  await store.appendEvent({
    event_id: randomId("ent_evt_"),
    entitlement_id: row.entitlement_id,
    user_id: row.user_id,
    previous_state: previousState,
    new_state: nextState,
    event_type: typeName,
    source: "notification",
    source_notification_id: envelope.messageId,
    metadata_json: JSON.stringify({ eventTimeMillis: envelope.eventTimeMillis }),
    created_at: now,
  });
  if (nextState === "revoked") {
    await store.insertRefund({
      refund_id: randomId("rfd_"),
      entitlement_id: row.entitlement_id,
      user_id: row.user_id,
      store: "google",
      store_transaction_id: purchaseToken,
      /* 같은 구매에 voided와 SUBSCRIPTION_REVOKED가 둘 다 올 수 있다(실제로 그랬다).
         refund_type이 달라 UNIQUE(store, 거래, 유형)에 걸리지 않고 둘 다 남는다 —
         회계에서 "환불됐다"와 "권한을 회수했다"는 세는 단위가 다르다. */
      refund_type: refundType ?? "revoke",
      refunded_amount_micros: null,
      refunded_currency: null,
      reason_code: null,
      entitlement_revoked: 1,
      refunded_at: envelope.eventTimeMillis || now,
      recorded_at: now,
    });
  }
  await markProcessed();
  return { outcome: "applied", previousState, state: nextState, notificationType: typeName };
}

/* ---------- 구글 API 검증 ---------- */

export function googlePlayConfig(env) {
  const packageName = String(env?.GOOGLE_PLAY_PACKAGE_NAME || "").trim();
  const raw = String(env?.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || "").trim();
  if (!packageName || !raw) return { configured: false };
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    return { configured: false };
  }
  if (!serviceAccount?.client_email || !serviceAccount?.private_key) return { configured: false };
  return {
    configured: true,
    packageName,
    serviceAccount,
    tokenUri: String(serviceAccount.token_uri || "https://oauth2.googleapis.com/token"),
  };
}

function base64Url(input) {
  const bytes = typeof input === "string" ? textEncoder.encode(input) : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importServiceAccountKey(pem) {
  const body = String(pem || "")
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/* 서비스 계정 JWT로 액세스 토큰을 받는다.
   ponytail: 요청마다 새로 받는다(토큰 유효 1시간). 검증 트래픽은 결제 이벤트 빈도라
   낮다 — 호출량이 문제가 되면 그때 캐시를 얹는다. */
export async function getGoogleAccessToken(config, fetcher = fetch, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: config.serviceAccount.client_email,
    scope: GOOGLE_TOKEN_SCOPE,
    aud: config.tokenUri,
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const key = await importServiceAccountKey(config.serviceAccount.private_key);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, textEncoder.encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${base64Url(signature)}`;
  const response = await fetcher(config.tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${assertion}`,
  });
  if (!response.ok) {
    await logGoogleFailure("token", response);
    const error = new Error("구글 토큰 발급에 실패했습니다");
    error.code = "GOOGLE_TOKEN_FAILED";
    error.status = 502;
    throw error;
  }
  const json = await response.json();
  if (!json?.access_token) {
    const error = new Error("구글 토큰 응답에 access_token이 없습니다");
    error.code = "GOOGLE_TOKEN_FAILED";
    error.status = 502;
    throw error;
  }
  return json.access_token;
}

/* 구글이 거절하면 그 이유는 구글의 응답에만 있다. 그걸 버리면 우리에게 남는 건 502뿐이고,
   502는 "서비스 계정에 권한이 없다"와 "API가 꺼져 있다"와 "서명이 틀렸다"를 구분해 주지
   않는다 — 실제로 그 구분이 안 돼서 실기기 결제를 여러 번 반복했다.
   싣는 것은 구글이 우리에게 한 말과 상태코드뿐이다. 액세스 토큰도 purchaseToken도
   요청 URL도 넣지 않는다(URL에 purchaseToken이 들어 있다). */
async function logGoogleFailure(label, response) {
  let detail = "(본문 없음)";
  try {
    detail = (await response.text()).slice(0, 400);
  } catch {
    /* 본문을 못 읽어도 상태코드만으로 대부분 좁혀진다. */
  }
  console.warn(`[billing] google ${label} ${response.status}: ${detail}`);
}

function verifyError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.publicMessage = message;
  return error;
}

/* purchaseToken을 subscriptionsv2로 검증하고 entitlements를 그 결과에 맞춘다.
 *
 * 계정 바인딩이 이 함수의 보안 경계다: 같은 purchaseToken을 다른 계정이 다시 보내면
 * 409로 거절한다. 이것이 없으면 결제 하나로 계정 여러 개가 PRO를 받는다.
 *
 * acknowledge는 검증이 성공하고 상태가 pending일 때 시도한다. 실패해도 검증 자체는
 * 성공으로 돌려준다 — acknowledged_at이 비어 있으므로 다음 verify가 다시 시도한다
 * (구글은 3일 안에 acknowledge가 없으면 자동 환불한다. 초안 §2). */
export async function verifyGooglePurchase({ config, store, fetcher = fetch, userId, purchaseToken, now = Date.now() }) {
  const accessToken = await getGoogleAccessToken(config, fetcher, now);
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(config.packageName)}`;
  const response = await fetcher(
    `${base}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (response.status === 404 || response.status === 410) {
    throw verifyError(404, "INVALID_PURCHASE_TOKEN", "구매를 찾을 수 없습니다. 스토어 결제가 완료됐는지 확인해 주세요.");
  }
  if (!response.ok) {
    await logGoogleFailure("subscriptionsv2", response);
    throw verifyError(502, "GOOGLE_API_FAILED", "구매 검증 중 스토어 응답이 올바르지 않습니다.");
  }
  const purchase = await response.json();

  const state = mapGoogleSubscriptionState(purchase.subscriptionState);
  if (!state) {
    throw verifyError(409, "SUBSCRIPTION_NOT_SETTLED", "아직 결제가 확정되지 않은 구독입니다. 잠시 후 다시 시도해 주세요.");
  }
  const line = Array.isArray(purchase.lineItems) ? purchase.lineItems[0] : null;
  const productId = String(line?.productId || "");
  if (!productId) {
    throw verifyError(502, "GOOGLE_API_FAILED", "구매 응답에 상품 정보가 없습니다.");
  }
  const expiresAt = line?.expiryTime ? Date.parse(line.expiryTime) : null;

  const existing = await store.getEntitlement("google", purchaseToken);
  if (existing && existing.user_id && existing.user_id !== userId) {
    throw verifyError(409, "SUBSCRIPTION_OWNED_BY_OTHER", "이미 다른 계정에 연결된 구독입니다.");
  }

  let entitlementId;
  let previousState = null;
  if (existing) {
    entitlementId = existing.entitlement_id;
    previousState = existing.state;
    await store.updateEntitlement(entitlementId, {
      user_id: userId,
      product_id: productId,
      base_plan_id: line?.offerDetails?.basePlanId ?? existing.base_plan_id ?? null,
      offer_id: line?.offerDetails?.offerId ?? existing.offer_id ?? null,
      state,
      auto_renewing: line?.autoRenewingPlan?.autoRenewEnabled ? 1 : 0,
      expires_at: expiresAt,
      linked_prior_subscription_id: purchase.linkedPurchaseToken || existing.linked_prior_subscription_id || null,
      last_verified_at: now,
      updated_at: now,
    });
  } else {
    entitlementId = randomId("ent_");
    await store.insertEntitlement({
      entitlement_id: entitlementId,
      user_id: userId,
      store: "google",
      store_subscription_id: purchaseToken,
      product_id: productId,
      base_plan_id: line?.offerDetails?.basePlanId ?? null,
      offer_id: line?.offerDetails?.offerId ?? null,
      state,
      auto_renewing: line?.autoRenewingPlan?.autoRenewEnabled ? 1 : 0,
      expires_at: expiresAt,
      grace_period_expires_at: null,
      acknowledged_at: null,
      linked_prior_subscription_id: purchase.linkedPurchaseToken || null,
      reported_price_micros: null,
      reported_currency: null,
      first_verified_at: now,
      last_verified_at: now,
      created_at: now,
      updated_at: now,
    });
  }
  await store.appendEvent({
    event_id: randomId("ent_evt_"),
    entitlement_id: entitlementId,
    user_id: userId,
    previous_state: previousState,
    new_state: state,
    event_type: "VERIFY_PURCHASE",
    source: "reverify",
    source_notification_id: null,
    metadata_json: JSON.stringify({ latestOrderId: purchase.latestOrderId || null }),
    created_at: now,
  });

  /* 이 구독의 주인을 몰라 미뤄 뒀던 알림들을 닫는다. 미처리로 남을 수 있는 이유는
     하나뿐이고(RTDN이 verify보다 먼저 도착), 그 하나를 푸는 순간도 여기뿐이다.
     그래서 배치도 cron도 필요 없다.

     닫기만 하고 **다시 적용하지 않는다.** 방금 우리가 쓴 state는 subscriptionsv2를
     지금 조회한 결과라 미뤄 둔 알림보다 언제나 최신이다. 되돌려 적용하면 잘해야
     같은 값이고, 순서가 어긋나면 만료·환불된 구독이 active로 되살아난다 —
     실제로 PURCHASED·REVOKED·EXPIRED 셋이 5분 안에 함께 쌓인 적이 있다.
     원문은 payload_json에 남아 있고, received_at과 processed_at의 간격이
     "미뤄졌다가 verify로 닫혔다"는 사실을 그대로 보여 준다. */
  if (typeof store.resolveDeferredNotifications === "function") {
    await store.resolveDeferredNotifications("google", purchaseToken, now);
  }

  let acknowledged = Boolean(existing?.acknowledged_at);
  if (!acknowledged && purchase.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
    const ackResponse = await fetcher(
      `${base}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
      { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: "{}" },
    );
    if (ackResponse.ok) {
      acknowledged = true;
      await store.updateEntitlement(entitlementId, { acknowledged_at: now, updated_at: now });
    }
  }

  const row = await store.getEntitlement("google", purchaseToken);
  const entitlement = normalizeEntitlement(row);
  return { entitlement, access: hasEntitlementAccess(entitlement, now), acknowledged };
}

/* 라우트 응답용 공개 형태. purchaseToken(=storeSubscriptionId)은 자격 증명에
   준하므로 클라이언트에 되돌려주지 않는다. */
export function publicEntitlement(entitlement) {
  if (!entitlement) return null;
  return {
    store: entitlement.store,
    productId: entitlement.productId,
    state: entitlement.state,
    autoRenewing: entitlement.autoRenewing,
    expiresAt: entitlement.expiresAt,
    acknowledged: Boolean(entitlement.acknowledgedAt),
  };
}
