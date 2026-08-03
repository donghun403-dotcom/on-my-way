-- ─────────────────────────────────────────────────────────────────────────────
-- 0002_store_entitlements.sql — 스토어 IAP 엔타이틀먼트
--
-- 설계 근거와 컬럼별 이유는 docs/entitlement-schema-draft.md (2026-07-30).
-- 핵심 한 줄: 이 표들은 권위가 아니라 **스토어 상태의 검증된 사본**이다(초안 §0).
-- 토스 표(0001)와 반대로, 멱등성이 막는 대상은 "우리가 보내는 요청"이 아니라
-- "스토어가 보내는 통보"다.
--
-- 이 마이그레이션은 표만 만든다. 쓰기는 entitlement-service.mjs가 하고, 그 경로는
-- GOOGLE_PLAY_* 구성이 없으면 503으로 닫혀 있다 — 콘솔 승인 전의 배포에서는 아무
-- 일도 일어나지 않는다.
-- ─────────────────────────────────────────────────────────────────────────────

/* 구독 하나 = 한 행.
   PRO 권한 판정은 이 행을 읽되, last_verified_at이 너무 오래됐으면 스토어에 다시
   물어야 한다. user.plan·크레딧 지급과의 연결은 아직 하지 않는다(초안 §6 경계). */
CREATE TABLE IF NOT EXISTS entitlements (
  entitlement_id            TEXT PRIMARY KEY,

  /* 회원 매핑. auth-service.mjs의 usr_<HMAC> 형태 내부 ID.
     RTDN이 verify보다 먼저 도착하면 아직 주인을 모르는 구독이 있을 수 있는데,
     그 경우 행을 만들지 않고 알림을 미처리로 남긴다(store_notifications 참조). */
  user_id                   TEXT NOT NULL,

  store                     TEXT NOT NULL CHECK (store IN ('google', 'apple')),

  /* 그 스토어에서 갱신을 가로질러 유지되는 식별자.
       google → purchaseToken
       apple  → originalTransactionId  (transactionId가 아니다. 초안 §1)
     이 정의를 어기면 갱신마다 행이 하나씩 늘어난다. */
  store_subscription_id     TEXT NOT NULL,

  /* 상품 식별자. 구글은 productId + basePlanId + offerId 삼단, 애플은 productId 하나.
     애플에 없는 두 칸은 NULL. 조회는 언제나 store와 함께 한다. */
  product_id                TEXT NOT NULL,
  base_plan_id              TEXT,
  offer_id                  TEXT,

  /* 구독 상태. 두 스토어의 상태 이름을 우리 어휘로 정규화한다.
     매핑표는 entitlement-service.mjs의 GOOGLE_RTDN_STATE — 그 표가 없으면
     이 컬럼은 해석 불가능한 문자열이다. grace와 canceled가 권한을 유지한다. */
  state                     TEXT NOT NULL CHECK (state IN (
                              'active',        -- 정상 이용 중
                              'grace',         -- 결제 실패, 스토어가 재시도 중. 권한 유지
                              'on_hold',       -- 재시도 실패. 권한 정지, 복구 가능
                              'paused',        -- 사용자가 일시정지(구글). 권한 정지
                              'canceled',      -- 갱신 해지. 만료 시각까지는 권한 유지
                              'expired',       -- 종료
                              'revoked'        -- 환불·취소로 소급 회수. 즉시 권한 없음
                            )),

  auto_renewing             INTEGER NOT NULL DEFAULT 0 CHECK (auto_renewing IN (0, 1)),

  /* 만료 시각(ms). canceled 상태에서도 이 시각까지는 권한이 살아 있다.
     grace_period_expires_at은 결제 실패 유예의 끝 — expires_at과 다른 시계다.
     RTDN에는 만료 시각이 실려 오지 않으므로 verify(subscriptionsv2 조회)가 채운다. */
  expires_at                INTEGER,
  grace_period_expires_at   INTEGER,

  /* 구글은 구매를 3일 안에 acknowledge 하지 않으면 자동 환불한다.
     이 컬럼이 없으면 "우리가 확인했는가"를 물을 수 없고, 조용히 환불되는 구매가
     생긴다. 애플에는 대응물이 없어 NULL. */
  acknowledged_at           INTEGER,

  /* 구글의 업/다운그레이드 체인. 새 purchaseToken이 옛 토큰을 가리킨다.
     이 컬럼이 없으면 요금제를 바꾼 유저가 두 개의 활성 구독으로 보인다. */
  linked_prior_subscription_id TEXT,

  /* 스토어가 알려준 가격 — 우리가 정한 값이 아니라 관측값. 회계용이지 권한 판정에
     쓰지 않는다(plan-policy.mjs의 3,900원과 다를 수 있다). */
  reported_price_micros     INTEGER,
  reported_currency         TEXT,

  /* 이 표가 사본이라는 사실을 컬럼으로 만든 것. 초안 §0. */
  first_verified_at         INTEGER NOT NULL,
  last_verified_at          INTEGER NOT NULL,

  created_at                INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL,

  UNIQUE (store, store_subscription_id)
);

/* 한 계정의 현재 권한을 찾는 조회. 활성 구독은 보통 0~1개다. */
CREATE INDEX IF NOT EXISTS idx_entitlements_user_state
  ON entitlements (user_id, state, expires_at DESC);

/* 오래된 사본을 찾아 재검증하는 배치용. */
CREATE INDEX IF NOT EXISTS idx_entitlements_verified
  ON entitlements (last_verified_at);


/* 스토어 알림 수신 이력.
   구글 RTDN(Pub/Sub)은 최소 1회 전달이라 같은 알림이 두 번 온다 — UNIQUE가 막는다.
   원문(payload_json)을 보관하는 이유: 우리가 아직 모르는 알림 유형이 온다. 파싱에
   실패해도 원문이 남아 있어야 나중에 재처리할 수 있다.
   processed_at IS NULL = 재처리 대상 (엔타이틀먼트가 아직 없어 미룬 알림 포함). */
CREATE TABLE IF NOT EXISTS store_notifications (
  notification_id       TEXT PRIMARY KEY,
  store                 TEXT NOT NULL CHECK (store IN ('google', 'apple')),

  /* 스토어가 준 알림 고유 ID.
       google → Pub/Sub messageId
       apple  → notificationUUID */
  store_notification_id TEXT NOT NULL,

  notification_type     TEXT NOT NULL,
  subtype               TEXT,

  /* 어느 구독에 대한 알림인지. 아직 entitlements에 없는 구독일 수 있으므로
     외래키를 걸지 않는다 — 알림이 최초 구매(verify)보다 먼저 도착할 수 있다. */
  store_subscription_id TEXT,

  payload_json          TEXT NOT NULL,

  received_at           INTEGER NOT NULL,
  processed_at          INTEGER,
  process_error         TEXT,

  UNIQUE (store, store_notification_id)
);

CREATE INDEX IF NOT EXISTS idx_store_notifications_unprocessed
  ON store_notifications (processed_at, received_at)
  WHERE processed_at IS NULL;


/* 상태 변화 이력. append-only.
   source로 **무엇 때문에 바뀌었는지**를 남긴다 — 스토어 통보·주기적 재검증·수동 개입
   셋 중 무엇이었는지가 사고 조사에서 갈린다(초안 §2). */
CREATE TABLE IF NOT EXISTS entitlement_events (
  event_id               TEXT PRIMARY KEY,
  entitlement_id         TEXT NOT NULL,
  user_id                TEXT NOT NULL,
  previous_state         TEXT,
  new_state              TEXT NOT NULL,
  event_type             TEXT NOT NULL,
  source                 TEXT NOT NULL CHECK (source IN ('notification', 'reverify', 'manual')),
  source_notification_id TEXT,
  metadata_json          TEXT NOT NULL DEFAULT '{}',
  created_at             INTEGER NOT NULL,
  FOREIGN KEY (entitlement_id) REFERENCES entitlements(entitlement_id)
);

CREATE INDEX IF NOT EXISTS idx_entitlement_events_entitlement
  ON entitlement_events (entitlement_id, created_at ASC);


/* 환불·회수 이력. entitlement_events의 한 유형이 아니라 별도 표인 이유(초안 §2):
   (1) 회계 — 환불은 매출 차감이라 기간별 합산이 필요하다.
   (2) 남용 판정 — 크레딧 지급 경로가 "이 계정이 환불한 적 있는가"를 **조회할 수
       있어야** 결제→소진→환불→재구매 리필(#40과 같은 형태)을 막을 수 있다.
       막는 방법 자체는 지급 연결 시점에 정한다(초안 §5.2). */
CREATE TABLE IF NOT EXISTS entitlement_refunds (
  refund_id              TEXT PRIMARY KEY,
  entitlement_id         TEXT NOT NULL,
  user_id                TEXT NOT NULL,
  store                  TEXT NOT NULL CHECK (store IN ('google', 'apple')),

  /* 스토어가 준 환불 대상 거래 식별자.
       google → 해당 purchaseToken
       apple  → 그 갱신의 transactionId (환불은 갱신 1회 단위다) */
  store_transaction_id   TEXT NOT NULL,

  refund_type            TEXT NOT NULL CHECK (refund_type IN ('full', 'partial', 'revoke')),
  refunded_amount_micros INTEGER,
  refunded_currency      TEXT,
  reason_code            TEXT,

  /* 소급 회수 여부. 구글 revoke는 즉시 권한을 뺏고, 단순 환불은 그렇지 않을 수 있다. */
  entitlement_revoked    INTEGER NOT NULL DEFAULT 0 CHECK (entitlement_revoked IN (0, 1)),

  refunded_at            INTEGER NOT NULL,
  recorded_at            INTEGER NOT NULL,

  FOREIGN KEY (entitlement_id) REFERENCES entitlements(entitlement_id),
  UNIQUE (store, store_transaction_id, refund_type)
);

/* 남용 판정이 읽을 인덱스. "이 계정의 환불 이력"이 한 번의 조회로 나와야 한다. */
CREATE INDEX IF NOT EXISTS idx_entitlement_refunds_user
  ON entitlement_refunds (user_id, refunded_at DESC);
