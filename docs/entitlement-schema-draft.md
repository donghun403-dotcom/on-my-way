# 엔타이틀먼트 스키마 초안 (2026-07-30)

**설계만이다. 구현하지 않았다.** 마이그레이션 파일도 만들지 않았다 — `migrations/`에 넣는
순간 배포 경로가 집어간다.

## 0. 이 스키마가 토스 스키마와 근본적으로 다른 점

토스와 스토어 IAP는 **진실의 소유자가 반대**다. 컬럼을 하나씩 옮기는 문제가 아니라
표의 역할이 바뀐다.

| | 토스 (현행) | 스토어 IAP |
| --- | --- | --- |
| 결제를 **누가 시작**하는가 | **우리**가 빌링키로 청구한다 | **스토어**가 갱신한다. 우리는 개입하지 못한다 |
| "결제됐다"의 **권위** | 우리 `billing_orders` 행 | **스토어**. 우리 행은 검증된 **사본**이다 |
| 실패를 누가 다루는가 | 우리가 재시도·유예를 구현 | 스토어가 재시도·유예·계정 보류를 처리하고 **결과만 통보**한다 |
| 멱등성의 대상 | **우리가 보내는 요청** | **스토어가 보내는 통보** |

그래서 이 표에는 **`last_verified_at`이 반드시 있어야 한다.** 토스 스키마에는 그런 컬럼이
없다 — 우리 기록이 곧 사실이었으니 "언제 확인했는가"를 물을 이유가 없었다. 스토어에서는
확인 시각이 없는 상태 값은 **얼마나 낡았는지 모르는 값**이고, 그걸 근거로 PRO 권한을
주면 환불된 계정이 조용히 계속 열려 있게 된다.

## 1. 애플 컬럼을 지금 넣는 이유

지시대로 `store` 판별자를 처음부터 넣는다. 애플은 나중이지만, 나중에 넣으면
**`UNIQUE (store, store_subscription_id)` 제약을 다시 세워야 한다.** SQLite에서 UNIQUE
제약 변경은 컬럼 추가와 달리 테이블 재작성이고, 그때는 이미 실데이터가 있다.

그리고 두 스토어의 **식별자 모양이 다르다** — 이게 이 스키마의 유일한 어려운 결정이다:

| | 갱신을 가로지르는 **영속 식별자** | 갱신 1회의 식별자 |
| --- | --- | --- |
| Google | `purchaseToken` | (없음 — 같은 토큰이 갱신돼도 유지된다) |
| Apple | `originalTransactionId` | `transactionId` (갱신마다 새로 발급) |

**`store_subscription_id`를 "그 스토어에서 구독을 가로질러 유지되는 식별자"로 정의한다.**
구글은 `purchaseToken`, 애플은 `originalTransactionId`를 넣는다. 이 정의를 컬럼 주석으로
박아 두지 않으면 애플을 붙일 때 누군가 `transactionId`를 넣고, 갱신마다 행이 하나씩
늘어난다.

**[확인 필요]** 구글은 업그레이드·다운그레이드 때 **새 `purchaseToken`을 발급**하고 옛
토큰을 `linkedPurchaseToken`으로 가리킨다. 그래서 구글에서는 영속 식별자도 완전히
영속적이지 않다. 아래 `linked_prior_subscription_id`가 그 체인을 잇는 자리다.
실제 동작은 실결제로 확인해야 한다.

---

## 2. D1 스키마 초안

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- 0002_store_entitlements.sql  (초안 — migrations/에 넣지 않았다)
-- ─────────────────────────────────────────────────────────────────────────────

/* 구독 하나 = 한 행.

   이 표는 권위가 아니라 스토어 상태의 검증된 사본이다. PRO 권한 판정은 이 행을 읽되,
   last_verified_at이 너무 오래됐으면 스토어에 다시 물어야 한다. 그 기준값은 구현
   시점에 정한다(이 문서는 설계까지만이다). */
CREATE TABLE IF NOT EXISTS entitlements (
  entitlement_id            TEXT PRIMARY KEY,

  /* 회원 매핑. auth-service.mjs의 usr_<HMAC> 형태 내부 ID를 쓴다.
     제공자 식별자를 쓰지 않는 이유: 같은 사람이 카카오·구글로 각각 가입하면 다른
     계정이고, 구독은 계정에 붙는다. */
  user_id                   TEXT NOT NULL,

  store                     TEXT NOT NULL CHECK (store IN ('google', 'apple')),

  /* 그 스토어에서 갱신을 가로질러 유지되는 식별자.
       google → purchaseToken
       apple  → originalTransactionId  (transactionId가 아니다. §1 참조)
     이 정의를 어기면 갱신마다 행이 하나씩 늘어난다. */
  store_subscription_id     TEXT NOT NULL,

  /* 상품 식별자. 구글은 productId + basePlanId + offerId 삼단이고 애플은 productId
     하나다. 애플에 없는 두 칸은 NULL로 남긴다 — 스토어마다 다른 표를 만들지 않는
     대가다. 조회는 언제나 store와 함께 한다. */
  product_id                TEXT NOT NULL,
  base_plan_id              TEXT,
  offer_id                  TEXT,

  /* 구독 상태. 두 스토어의 상태 이름이 다르므로 우리 어휘로 정규화한다.
     매핑표는 §3에 있고, 그 표가 없으면 이 컬럼은 해석 불가능한 문자열이 된다. */
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

  /* 만료 시각. canceled 상태에서도 이 시각까지는 권한이 살아 있다.
     grace_period_expires_at은 결제 실패 유예의 끝이다 — expires_at과 다른 시계다. */
  expires_at                INTEGER,
  grace_period_expires_at   INTEGER,

  /* 구글은 구매를 3일 안에 acknowledge 하지 않으면 자동 환불한다.
     이 컬럼이 없으면 "우리가 확인했는가"를 물을 수 없고, 조용히 환불되는 구매가 생긴다.
     애플에는 대응물이 없어 NULL로 남는다. */
  acknowledged_at           INTEGER,

  /* 구글의 업/다운그레이드 체인. 새 purchaseToken이 옛 토큰을 가리킨다.
     이 컬럼이 없으면 요금제를 바꾼 유저가 두 개의 활성 구독으로 보인다. */
  linked_prior_subscription_id TEXT,

  /* 스토어가 알려준 가격. 우리가 정한 값이 아니라 관측값이다 —
     지역·프로모션에 따라 다르고, 우리 plan-policy.mjs의 3,900원과 다를 수 있다.
     회계용이지 권한 판정에 쓰지 않는다. */
  reported_price_micros     INTEGER,
  reported_currency         TEXT,

  /* 이 표가 사본이라는 사실을 컬럼으로 만든 것. §0 참조. */
  first_verified_at         INTEGER NOT NULL,
  last_verified_at          INTEGER NOT NULL,

  created_at                INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL,

  /* 같은 스토어 구독이 두 행이 되지 않게 한다. store를 포함하는 이유:
     구글 토큰과 애플 originalTransactionId가 우연히 같을 이유는 없지만,
     제약이 그걸 보장하지는 않는다. */
  UNIQUE (store, store_subscription_id)
);

/* 한 계정의 현재 권한을 찾는 조회. 활성 구독은 보통 0~1개다. */
CREATE INDEX IF NOT EXISTS idx_entitlements_user_state
  ON entitlements (user_id, state, expires_at DESC);

/* 오래된 사본을 찾아 재검증하는 배치용. */
CREATE INDEX IF NOT EXISTS idx_entitlements_verified
  ON entitlements (last_verified_at);


/* ─────────────────────────────────────────────────────────────────────────────
   스토어 알림 수신 이력.

   구글 RTDN(Pub/Sub)도 애플 App Store Server Notifications도 **최소 1회 전달**이다.
   같은 알림이 두 번 온다. 현행 billing_orders의 idempotency_key UNIQUE가 하던 일을
   여기가 이어받는다 — 다만 막는 대상이 "우리가 보내는 요청"에서 "스토어가 보내는
   통보"로 바뀐다(§0).

   원문을 보관하는 이유: 우리가 아직 모르는 알림 유형이 온다. 파싱에 실패해도 원문이
   남아 있어야 나중에 재처리할 수 있다. */
CREATE TABLE IF NOT EXISTS store_notifications (
  notification_id       TEXT PRIMARY KEY,
  store                 TEXT NOT NULL CHECK (store IN ('google', 'apple')),

  /* 스토어가 준 알림 고유 ID.
       google → Pub/Sub messageId
       apple  → notificationUUID
     중복 전달을 여기서 막는다. */
  store_notification_id TEXT NOT NULL,

  notification_type     TEXT NOT NULL,
  subtype               TEXT,

  /* 어느 구독에 대한 알림인지. 아직 entitlements에 없는 구독일 수 있으므로
     외래키를 걸지 않는다 — 알림이 최초 구매보다 먼저 도착할 수 있다. */
  store_subscription_id TEXT,

  payload_json          TEXT NOT NULL,

  received_at           INTEGER NOT NULL,
  /* 수신과 처리는 다른 시각이다. NULL이면 아직 처리되지 않았다는 뜻이고,
     그 자체가 재처리 대상 목록이 된다. */
  processed_at          INTEGER,
  process_error         TEXT,

  UNIQUE (store, store_notification_id)
);

CREATE INDEX IF NOT EXISTS idx_store_notifications_unprocessed
  ON store_notifications (processed_at, received_at)
  WHERE processed_at IS NULL;


/* ─────────────────────────────────────────────────────────────────────────────
   상태 변화 이력. append-only.

   현행 billing_events가 하던 역할을 그대로 잇는다. 다르게 하는 것 하나 —
   source_notification_id로 **무엇 때문에 바뀌었는지**를 남긴다. 토스에서는 우리가
   바꿨으니 물을 필요가 없었지만, 여기서는 상태가 스토어 통보·주기적 재검증·수동 개입
   셋 중 무엇으로 바뀌었는지가 사고 조사에서 갈린다. */
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


/* ─────────────────────────────────────────────────────────────────────────────
   환불·회수 이력.

   왜 entitlement_events의 한 유형이 아니라 별도 표인가 — 두 가지를 따로 물어야 한다:

   (1) 회계. 환불은 매출 차감이라 기간별로 합산해야 하고, 상태 로그에서 뽑아 쓰는 것과
       전용 표를 읽는 것은 정확성이 다르다.

   (2) 남용 판정. **이 리포에는 이미 같은 형태의 결함이 있었다** — 체험 크레딧 무한 리필
       (#40). 플랜 전환이 원장 재지급을 부르는데, 재지급 이력을 아무도 안 봤다.
       구독도 똑같다: 결제 → 250 크레딧 소진 → 환불 → 재구매로 다시 250. 그 구멍을 막으려면
       지급 로직이 "이 계정이 환불한 적 있는가"를 **조회할 수 있어야** 한다.
       체험 남용 마커(ai-credits-service.mjs:544)가 하는 일과 같은 종류다.

   막는 방법은 설계하지 않았다 — 이 문서는 스키마까지다. 다만 **조회 가능한 자리를
   만들어 두지 않으면 나중에 막을 수 없다.** */
CREATE TABLE IF NOT EXISTS entitlement_refunds (
  refund_id              TEXT PRIMARY KEY,
  entitlement_id         TEXT NOT NULL,
  user_id                TEXT NOT NULL,
  store                  TEXT NOT NULL CHECK (store IN ('google', 'apple')),

  /* 스토어가 준 환불 대상 거래 식별자.
       google → 해당 purchaseToken
       apple  → 그 갱신의 transactionId (originalTransactionId가 아니다 —
                환불은 갱신 1회 단위로 일어난다) */
  store_transaction_id   TEXT NOT NULL,

  refund_type            TEXT NOT NULL CHECK (refund_type IN ('full', 'partial', 'revoke')),
  refunded_amount_micros INTEGER,
  refunded_currency      TEXT,
  /* 스토어가 주는 사유 코드. 애플만 제공하고 구글은 대체로 비어 있다. */
  reason_code            TEXT,

  /* 소급 회수 여부. 구글의 revoke는 즉시 권한을 뺏고, 단순 환불은 그렇지 않을 수 있다.
     이 둘을 구분하지 않으면 권한 판정이 갈린다. */
  entitlement_revoked    INTEGER NOT NULL DEFAULT 0 CHECK (entitlement_revoked IN (0, 1)),

  refunded_at            INTEGER NOT NULL,
  recorded_at            INTEGER NOT NULL,

  FOREIGN KEY (entitlement_id) REFERENCES entitlements(entitlement_id),
  UNIQUE (store, store_transaction_id, refund_type)
);

/* 남용 판정이 읽을 인덱스. "이 계정의 환불 이력"이 한 번의 조회로 나와야 한다. */
CREATE INDEX IF NOT EXISTS idx_entitlement_refunds_user
  ON entitlement_refunds (user_id, refunded_at DESC);
```

---

## 3. 스토어 상태 → 우리 `state` 매핑

이 표가 없으면 `state` 컬럼은 해석 불가능한 문자열이다.
**[확인 필요]** 두 스토어의 실제 알림 유형은 실결제로 확인해야 한다. 아래는 문서 기준이다.

| 우리 `state` | Google (RTDN `subscriptionNotificationType`) | Apple (`notificationType`/`subtype`) | 권한 |
| --- | --- | --- | --- |
| `active` | `SUBSCRIPTION_PURCHASED`, `SUBSCRIPTION_RENEWED`, `SUBSCRIPTION_RECOVERED`, `SUBSCRIPTION_RESTARTED` | `SUBSCRIBED`, `DID_RENEW` | 있음 |
| `grace` | `SUBSCRIPTION_IN_GRACE_PERIOD` | `DID_FAIL_TO_RENEW` (subtype `GRACE_PERIOD`) | **있음** |
| `on_hold` | `SUBSCRIPTION_ON_HOLD` | `DID_FAIL_TO_RENEW` (subtype 없음) | 없음 |
| `paused` | `SUBSCRIPTION_PAUSED` | (대응물 없음) | 없음 |
| `canceled` | `SUBSCRIPTION_CANCELED` | `DID_CHANGE_RENEWAL_STATUS` (subtype `AUTO_RENEW_DISABLED`) | **만료 시각까지 있음** |
| `expired` | `SUBSCRIPTION_EXPIRED` | `EXPIRED` | 없음 |
| `revoked` | `SUBSCRIPTION_REVOKED` | `REFUND`, `REVOKE` | 없음(즉시) |

**`grace`와 `canceled`가 권한을 유지한다는 것이 이 표의 핵심이다.** 상태 이름만 보고
막으면 정상 결제 유저가 잠긴다. 현행 코드에도 같은 판단이 이미 있다 —
`PAYMENT_FAILURE_GRACE_MS = 3일`(`plan-policy.mjs:92`). 스토어로 옮기면 **그 유예를
우리가 계산하지 않고 스토어의 grace 통보를 따른다.**

---

## 4. 토스 스키마 대조 — 무엇이 남고 무엇이 버려지는가

현행: `migrations/0001_billing_ledger.sql`

### 남는 것 (개념으로)

| 토스 | 새 스키마 | 어떻게 달라지는가 |
| --- | --- | --- |
| `billing_orders.user_id` | `entitlements.user_id` | 그대로. 회원 매핑은 바뀌지 않는다 |
| `billing_orders.idempotency_key UNIQUE` | `store_notifications (store, store_notification_id) UNIQUE` | **막는 대상이 반대다.** 우리가 보내는 요청 → 스토어가 보내는 통보 |
| `billing_events` 전체 | `entitlement_events` | append-only 감사 로그라는 성격은 유지. `source` 컬럼이 추가된다(§2 주석) |
| `billing_orders.status` CHECK | `entitlements.state` CHECK | 값 집합이 통째로 바뀐다. 우리 결제 결과 → 스토어 구독 생애주기 |
| `billing_accounts.billing_status` | `entitlements.state`에 흡수 | 계정 단위 상태와 구독 단위 상태를 나눌 이유가 없어진다 |

### 버려지는 것

| 토스 컬럼 | 왜 버리는가 |
| --- | --- |
| `billing_accounts.customer_key` | 토스가 요구하는 고객 식별자다. 스토어에는 대응물이 없다 |
| `billing_accounts.billing_key_fingerprint` | **결제 수단을 우리가 들지 않는다.** IAP에서 이 컬럼은 언제나 NULL이고, 남겨 두면 "우리가 카드를 보관한다"는 오해를 남긴다 |
| `billing_orders.purpose` (`initial_subscription`/`renewal`) | 스토어는 최초와 갱신을 우리에게 다른 것으로 주지 않는다. 구글은 같은 토큰이 갱신되고, 애플은 같은 originalTransactionId 아래 새 transactionId가 붙는다 |
| `billing_orders.logical_request_fingerprint` + `UNIQUE (user_id, purpose, logical_request_fingerprint)` | **우리가 같은 청구를 두 번 보내는 것**을 막는 장치다. 우리가 청구하지 않으므로 막을 대상 자체가 없다 |
| `billing_orders.amount`, `currency` | 우리가 정하는 값이 아니다. 관측값으로서 `reported_price_micros`·`reported_currency`에 남되 **권한 판정에 쓰지 않는다** |
| `billing_orders.failure_code`, `failure_message` | 우리 API 호출의 실패다. 스토어에서는 결제 실패를 스토어가 재시도·유예로 처리하고 우리에게는 상태만 통보한다 |
| `billing_orders.payment_key` | 토스 결제 승인 키. `store_subscription_id`가 그 자리를 대신하되 의미가 다르다 |
| `billing_orders.completed_at` | 승인 완료 시각. 구독에서는 `expires_at`과 갱신 이벤트가 그 역할을 한다 |

### 어느 쪽도 아닌 것 — 기존 표를 지울지

**[확인 필요]** 웹 결제(토스)를 유지할지 앱 결제로 일원화할지가 미정이다
(`docs/play-store-submission.md` §2-5의 같은 항목).

- **일원화하면**: `billing_*` 세 표는 **지우지 않고 남긴다.** 이미 결제한 유저의 법정 보관
  대상이고(`auth-service.mjs:1076-1092`가 탈퇴 시 5년 보관 레코드를 만든다), 5년 안에
  지우면 그 약속을 어긴다. 새 쓰기만 멈춘다.
- **병행하면**: `entitlements`에 `store` 값으로 `'toss'`를 추가하는 것이 **가장 나쁜
  선택이다.** §0의 표 그대로 진실의 소유자가 반대라서, 한 표에 넣으면 `last_verified_at`이
  토스 행에서는 의미가 없고 `store_subscription_id`도 대응물이 없다. 두 표를 두고 권한
  판정에서 합치는 쪽이 맞다.

---

## 5. 원장(EnergyLedger)과의 경계 — 설계하지 않은 것

이 스키마는 **"권한이 있는가"까지만** 답한다. 크레딧 지급은 여전히 `EnergyLedger` DO의
일이고, 둘을 잇는 것은 `plan` 값이다(`plan-policy.mjs`).

**의도적으로 설계하지 않았다.** 지시가 "설계만, 구현 금지"이고, 무엇보다 그 연결은
`resolveEffectivePlan`과 `resetLedgerForPlan`을 건드린다 — 인증 구조가 확정되기 전에
상태 머신을 더 쌓지 않는다는 결정이 아직 유효하다.

다만 그때 반드시 답해야 할 질문 셋만 적어 둔다. 셋 다 이 리포에서 이미 한 번씩 틀린
자리다:

1. **`revoked`가 들어오면 이미 쓴 크레딧을 어떻게 하는가.** 회수하면 유저가 마이너스가
   되고, 두면 환불 후 재구매로 무한 리필이다 — #40과 같은 형태.
2. **구독 재개가 `resetLedgerForPlan`을 부르는가.** 부르면 `lastGrantMonthKey`가 비고
   재지급된다. 체험 무한 리필이 정확히 그 경로였다.
3. **`grace` 상태에서 `RESET_DISPOSITION`의 어느 필드가 움직이는가.** 권한은 유지되는데
   플랜 값이 흔들리면 그 사이 전환이 원장을 건드린다.

`CONTRIBUTING.md` ④가 요구하는 필드별 처분 선언은 이 표에도 필요하다. 새 필드를 넣을 때
"구독 상태가 바뀌면 이 값은 어떻게 되는가"가 자동으로 물어지지 않으면 다섯 번째가 온다.
