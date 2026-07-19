const VALID_PURPOSES = new Set(["initial_subscription", "renewal"]);
const VALID_STATUSES = new Set(["created", "pending", "succeeded", "failed", "unknown", "cancelled"]);
const TRANSITIONS = new Map([
  ["created", new Set(["pending", "failed", "unknown", "cancelled"])],
  ["pending", new Set(["succeeded", "failed", "unknown", "cancelled"])],
  ["unknown", new Set(["succeeded", "failed", "cancelled"])],
  ["succeeded", new Set()],
  ["failed", new Set()],
  ["cancelled", new Set()],
]);

const textEncoder = new TextEncoder();

function assertText(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function randomToken(prefix) {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${prefix}${token}`;
}

function orderId() {
  return `omw_${Date.now()}_${randomToken("").slice(0, 10)}`;
}

export async function fingerprint(value) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(String(value || "")));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sanitizeFailureMessage(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/(?:test|live)_[A-Za-z0-9_-]+/gi, "[redacted-key]")
    .replace(/[A-Za-z0-9+/=_-]{40,}/g, "[redacted-token]")
    .slice(0, 240);
}

function metadataJson(metadata = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(key)) continue;
    if (value === null || typeof value === "boolean" || typeof value === "number") safe[key] = value;
    else if (typeof value === "string") safe[key] = sanitizeFailureMessage(value);
  }
  return JSON.stringify(safe);
}

function normalizeAccount(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    customerKey: row.customer_key,
    billingStatus: row.billing_status,
    billingKeyFingerprint: row.billing_key_fingerprint || null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function normalizeOrder(row) {
  if (!row) return null;
  return {
    orderId: row.order_id,
    userId: row.user_id,
    customerKey: row.customer_key,
    purpose: row.purpose,
    logicalRequestFingerprint: row.logical_request_fingerprint,
    amount: Number(row.amount),
    currency: row.currency,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    paymentKey: row.payment_key || null,
    failureCode: row.failure_code || null,
    failureMessage: row.failure_message || null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    completedAt: row.completed_at === null || row.completed_at === undefined ? null : Number(row.completed_at),
  };
}

function requireDatabase(db) {
  if (!db) {
    const error = new Error("BILLING_DB is not configured");
    error.code = "BILLING_LEDGER_UNAVAILABLE";
    error.status = 503;
    throw error;
  }
}

function d1Adapter(db) {
  const first = async (sql, ...values) => db.prepare(sql).bind(...values).first();
  const run = async (sql, ...values) => db.prepare(sql).bind(...values).run();
  const batch = async (statements) => db.batch(statements);
  return {
    async getAccountByUserId(userId) {
      return first("SELECT * FROM billing_accounts WHERE user_id = ?1", userId);
    },
    async getAccountByCustomerKey(customerKey) {
      return first("SELECT * FROM billing_accounts WHERE customer_key = ?1", customerKey);
    },
    async insertAccount(values) {
      return run(
        "INSERT OR IGNORE INTO billing_accounts (user_id, customer_key, billing_status, billing_key_fingerprint, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        values.userId, values.customerKey, values.billingStatus, values.billingKeyFingerprint, values.now,
      );
    },
    async updateAccountFingerprint(values) {
      return run(
        "UPDATE billing_accounts SET billing_key_fingerprint = ?1, billing_status = ?2, updated_at = ?3 WHERE user_id = ?4",
        values.billingKeyFingerprint, values.billingStatus, values.now, values.userId,
      );
    },
    async getOrderById(orderIdValue) {
      return first("SELECT * FROM billing_orders WHERE order_id = ?1", orderIdValue);
    },
    async getOrderByLogicalRequest(values) {
      return first("SELECT * FROM billing_orders WHERE user_id = ?1 AND purpose = ?2 AND logical_request_fingerprint = ?3", values.userId, values.purpose, values.logicalRequestFingerprint);
    },
    async getOrderByIdempotencyKey(idempotencyKey) {
      return first("SELECT * FROM billing_orders WHERE idempotency_key = ?1", idempotencyKey);
    },
    async hasEvent(orderIdValue, eventType) {
      return Boolean(await first("SELECT 1 AS present FROM billing_events WHERE order_id = ?1 AND event_type = ?2 LIMIT 1", orderIdValue, eventType));
    },
    async insertOrder(values) {
      return run(
        "INSERT INTO billing_orders (order_id, user_id, customer_key, purpose, logical_request_fingerprint, amount, currency, idempotency_key, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'created', ?9, ?9)",
        values.orderId, values.userId, values.customerKey, values.purpose, values.logicalRequestFingerprint, values.amount, values.currency, values.idempotencyKey, values.now,
      );
    },
    async updateOrder(values) {
      return run(
        "UPDATE billing_orders SET status = ?1, payment_key = COALESCE(?2, payment_key), failure_code = ?3, failure_message = ?4, updated_at = ?5, completed_at = ?6 WHERE order_id = ?7",
        values.status, values.paymentKey, values.failureCode, values.failureMessage, values.now, values.completedAt, values.orderId,
      );
    },
    async insertEvent(values) {
      return run(
        "INSERT INTO billing_events (event_id, order_id, user_id, previous_status, new_status, event_type, metadata_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        values.eventId, values.orderId, values.userId, values.previousStatus, values.newStatus, values.eventType, values.metadataJson, values.now,
      );
    },
    async atomic(statements) {
      return batch(statements.map(({ sql, values }) => db.prepare(sql).bind(...values)));
    },
  };
}

function memoryAdapter(db) {
  return {
    async getAccountByUserId(userId) { return db.accounts.get(userId) || null; },
    async getAccountByCustomerKey(customerKey) { return [...db.accounts.values()].find((row) => row.customer_key === customerKey) || null; },
    async insertAccount(values) {
      if (db.accounts.has(values.userId) || [...db.accounts.values()].some((row) => row.customer_key === values.customerKey)) {
        const error = new Error("UNIQUE constraint failed: billing_accounts");
        error.code = "SQLITE_CONSTRAINT";
        throw error;
      }
      db.accounts.set(values.userId, { user_id: values.userId, customer_key: values.customerKey, billing_status: values.billingStatus, billing_key_fingerprint: values.billingKeyFingerprint, created_at: values.now, updated_at: values.now });
    },
    async updateAccountFingerprint(values) {
      const row = db.accounts.get(values.userId);
      if (row) Object.assign(row, { billing_key_fingerprint: values.billingKeyFingerprint, billing_status: values.billingStatus, updated_at: values.now });
    },
    async getOrderById(orderIdValue) { return db.orders.get(orderIdValue) || null; },
    async getOrderByLogicalRequest(values) { return [...db.orders.values()].find((row) => row.user_id === values.userId && row.purpose === values.purpose && row.logical_request_fingerprint === values.logicalRequestFingerprint) || null; },
    async getOrderByIdempotencyKey(idempotencyKey) { return [...db.orders.values()].find((row) => row.idempotency_key === idempotencyKey) || null; },
    async hasEvent(orderIdValue, eventType) { return db.events.some((event) => event.order_id === orderIdValue && event.event_type === eventType); },
    async insertOrder(values) {
      if (db.orders.has(values.orderId) || [...db.orders.values()].some((row) => row.idempotency_key === values.idempotencyKey || (row.user_id === values.userId && row.purpose === values.purpose && row.logical_request_fingerprint === values.logicalRequestFingerprint))) {
        const error = new Error("UNIQUE constraint failed: billing_orders");
        error.code = "SQLITE_CONSTRAINT";
        throw error;
      }
      db.orders.set(values.orderId, { order_id: values.orderId, user_id: values.userId, customer_key: values.customerKey, purpose: values.purpose, logical_request_fingerprint: values.logicalRequestFingerprint, amount: values.amount, currency: values.currency, idempotency_key: values.idempotencyKey, status: "created", payment_key: null, failure_code: null, failure_message: null, created_at: values.now, updated_at: values.now, completed_at: null });
    },
    async updateOrder(values) {
      const row = db.orders.get(values.orderId);
      if (!row) return;
      Object.assign(row, { status: values.status, payment_key: values.paymentKey || row.payment_key, failure_code: values.failureCode, failure_message: values.failureMessage, updated_at: values.now, completed_at: values.completedAt });
    },
    async insertEvent(values) { db.events.push({ event_id: values.eventId, order_id: values.orderId, user_id: values.userId, previous_status: values.previousStatus, new_status: values.newStatus, event_type: values.eventType, metadata_json: values.metadataJson, created_at: values.now }); },
    async atomic(statements) { for (const statement of statements) await statement.run(); },
  };
}

function createEventValues({ order, previousStatus, newStatus, eventType, metadata, now }) {
  return {
    eventId: randomToken("evt_"),
    orderId: order.orderId,
    userId: order.userId,
    previousStatus,
    newStatus,
    eventType,
    metadataJson: metadataJson(metadata),
    now,
  };
}

export function createBillingLedger(db) {
  requireDatabase(db);
  const adapter = db.__billingMemory ? memoryAdapter(db) : d1Adapter(db);

  async function getOrder(orderIdValue) {
    return normalizeOrder(await adapter.getOrderById(assertText(orderIdValue, "orderId")));
  }

  async function appendEvent({ orderId: orderIdValue, eventType, metadata = {}, now = Date.now() }) {
    const order = await getOrder(orderIdValue);
    if (!order) throw new Error("billing order not found");
    await adapter.insertEvent(createEventValues({ order, previousStatus: order.status, newStatus: order.status, eventType: assertText(eventType, "eventType"), metadata, now }));
  }

  async function transition({ orderId: orderIdValue, nextStatus, eventType, paymentKey = null, failureCode = null, failureMessage = null, now = Date.now(), metadata = {} }) {
    const order = await getOrder(orderIdValue);
    if (!order) throw new Error("billing order not found");
    if (!VALID_STATUSES.has(nextStatus)) throw new TypeError("invalid billing order status");
    if (order.status === nextStatus) return order;
    if (!TRANSITIONS.get(order.status)?.has(nextStatus)) {
      const error = new Error(`invalid billing order transition: ${order.status} -> ${nextStatus}`);
      error.code = "BILLING_ORDER_STATE_CONFLICT";
      error.status = 409;
      throw error;
    }
    const completedAt = ["succeeded", "failed", "cancelled"].includes(nextStatus) ? now : null;
    const event = createEventValues({ order, previousStatus: order.status, newStatus: nextStatus, eventType, metadata, now });
    if (db.__billingMemory) {
      await adapter.updateOrder({ orderId: order.orderId, status: nextStatus, paymentKey, failureCode, failureMessage, now, completedAt });
      await adapter.insertEvent(event);
    } else {
      await adapter.atomic([
        { sql: "UPDATE billing_orders SET status = ?1, payment_key = COALESCE(?2, payment_key), failure_code = ?3, failure_message = ?4, updated_at = ?5, completed_at = ?6 WHERE order_id = ?7 AND status = ?8", values: [nextStatus, paymentKey, failureCode, failureMessage, now, completedAt, order.orderId, order.status] },
        { sql: "INSERT INTO billing_events (event_id, order_id, user_id, previous_status, new_status, event_type, metadata_json, created_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE EXISTS (SELECT 1 FROM billing_orders WHERE order_id = ?9 AND status = ?10) AND NOT EXISTS (SELECT 1 FROM billing_events WHERE order_id = ?11 AND previous_status = ?12 AND new_status = ?13 AND event_type = ?14)", values: [event.eventId, event.orderId, event.userId, event.previousStatus, event.newStatus, event.eventType, event.metadataJson, event.now, order.orderId, nextStatus, order.orderId, order.status, nextStatus, event.eventType] },
      ]);
    }
    const finalOrder = await getOrder(order.orderId);
    if (!finalOrder || finalOrder.status !== nextStatus) {
      const error = new Error("billing order state changed during transition");
      error.code = "BILLING_ORDER_STATE_CONFLICT";
      error.status = 409;
      throw error;
    }
    return finalOrder;
  }

  async function reconcileExternallyApprovedOrder({ orderId: orderIdValue, paymentKey, approvedAt = null, now = Date.now() }) {
    const normalizedOrderId = assertText(orderIdValue, "orderId");
    const normalizedPaymentKey = assertText(paymentKey, "paymentKey");
    const order = await getOrder(normalizedOrderId);
    if (!order) throw new Error("billing order not found");
    if (order.purpose !== "initial_subscription" || order.amount !== 4900 || order.currency !== "KRW") {
      const error = new Error("billing order is not eligible for external approval reconciliation");
      error.code = "BILLING_RECONCILIATION_POLICY_CONFLICT";
      error.status = 409;
      throw error;
    }
    if (order.status === "succeeded") {
      if (order.paymentKey !== normalizedPaymentKey) {
        const error = new Error("reconciled paymentKey does not match the succeeded order");
        error.code = "BILLING_RECONCILIATION_PAYMENT_CONFLICT";
        error.status = 409;
        throw error;
      }
      return {
        order,
        reconciled: false,
        alreadySucceeded: true,
        reconciliationEventExists: await adapter.hasEvent(order.orderId, "order_reconciled_succeeded"),
      };
    }
    if (!new Set(["failed", "unknown"]).has(order.status) || order.paymentKey) {
      const error = new Error("billing order is not eligible for external approval reconciliation");
      error.code = "BILLING_ORDER_STATE_CONFLICT";
      error.status = 409;
      throw error;
    }
    if (await adapter.hasEvent(order.orderId, "order_reconciled_succeeded")) {
      const error = new Error("billing reconciliation event exists without a succeeded order");
      error.code = "BILLING_RECONCILIATION_STATE_CONFLICT";
      error.status = 409;
      throw error;
    }

    const completedAtValue = Number(approvedAt);
    const completedAt = Number.isFinite(completedAtValue) && completedAtValue > 0 ? completedAtValue : now;
    const event = createEventValues({
      order,
      previousStatus: order.status,
      newStatus: "succeeded",
      eventType: "order_reconciled_succeeded",
      metadata: {
        source: "toss_order_lookup",
        reason: "payment_total_amount_field_fix",
        recovered: true,
      },
      now,
    });

    if (db.__billingMemory) {
      await adapter.updateOrder({
        orderId: order.orderId,
        status: "succeeded",
        paymentKey: normalizedPaymentKey,
        failureCode: null,
        failureMessage: null,
        now,
        completedAt,
      });
      await adapter.insertEvent(event);
    } else {
      await adapter.atomic([
        {
          sql: "UPDATE billing_orders SET status = 'succeeded', payment_key = ?1, failure_code = NULL, failure_message = NULL, updated_at = ?2, completed_at = ?3 WHERE order_id = ?4 AND status = ?5 AND payment_key IS NULL AND purpose = 'initial_subscription' AND amount = 4900 AND currency = 'KRW'",
          values: [normalizedPaymentKey, now, completedAt, order.orderId, order.status],
        },
        {
          sql: "INSERT INTO billing_events (event_id, order_id, user_id, previous_status, new_status, event_type, metadata_json, created_at) SELECT ?1, ?2, ?3, ?4, 'succeeded', 'order_reconciled_succeeded', ?5, ?6 WHERE EXISTS (SELECT 1 FROM billing_orders WHERE order_id = ?7 AND status = 'succeeded' AND payment_key = ?8) AND NOT EXISTS (SELECT 1 FROM billing_events WHERE order_id = ?9 AND event_type = 'order_reconciled_succeeded')",
          values: [event.eventId, event.orderId, event.userId, event.previousStatus, event.metadataJson, event.now, order.orderId, normalizedPaymentKey, order.orderId],
        },
      ]);
    }

    const finalOrder = await getOrder(order.orderId);
    const eventExists = await adapter.hasEvent(order.orderId, "order_reconciled_succeeded");
    if (!finalOrder || finalOrder.status !== "succeeded" || finalOrder.paymentKey !== normalizedPaymentKey || !eventExists) {
      const error = new Error("billing order changed during external approval reconciliation");
      error.code = "BILLING_RECONCILIATION_STATE_CONFLICT";
      error.status = 409;
      throw error;
    }
    return { order: finalOrder, reconciled: true, alreadySucceeded: false, reconciliationEventExists: true };
  }

  return {
    async getOrCreateBillingAccount({ userId, customerKey, now = Date.now() }) {
      const normalizedUserId = assertText(userId, "userId");
      const normalizedCustomerKey = assertText(customerKey, "customerKey");
      const existing = normalizeAccount(await adapter.getAccountByUserId(normalizedUserId));
      if (existing) {
        if (existing.customerKey !== normalizedCustomerKey) {
          const error = new Error("customerKey does not match the billing account");
          error.code = "BILLING_CUSTOMER_KEY_CONFLICT";
          error.status = 409;
          throw error;
        }
        return existing;
      }
      const other = normalizeAccount(await adapter.getAccountByCustomerKey(normalizedCustomerKey));
      if (other && other.userId !== normalizedUserId) {
        const error = new Error("customerKey is already linked to another user");
        error.code = "BILLING_CUSTOMER_KEY_CONFLICT";
        error.status = 409;
        throw error;
      }
      try {
        await adapter.insertAccount({ userId: normalizedUserId, customerKey: normalizedCustomerKey, billingStatus: "inactive", billingKeyFingerprint: null, now });
      } catch (error) {
        const retried = normalizeAccount(await adapter.getAccountByUserId(normalizedUserId));
        if (retried) {
          if (retried.customerKey !== normalizedCustomerKey) {
            const conflict = new Error("customerKey does not match the billing account");
            conflict.code = "BILLING_CUSTOMER_KEY_CONFLICT";
            conflict.status = 409;
            throw conflict;
          }
          return retried;
        }
        throw error;
      }
      return normalizeAccount(await adapter.getAccountByUserId(normalizedUserId));
    },

    async recordBillingKeyFingerprint({ userId, billingKeyFingerprint, billingStatus = "ready", now = Date.now() }) {
      await adapter.updateAccountFingerprint({ userId: assertText(userId, "userId"), billingKeyFingerprint: assertText(billingKeyFingerprint, "billingKeyFingerprint"), billingStatus, now });
      return normalizeAccount(await adapter.getAccountByUserId(userId));
    },

    async createOrReusePaymentOrder({ userId, customerKey, purpose = "initial_subscription", amount, currency = "KRW", logicalRequestKey, now = Date.now() }) {
      const normalizedUserId = assertText(userId, "userId");
      const normalizedCustomerKey = assertText(customerKey, "customerKey");
      if (!VALID_PURPOSES.has(purpose)) throw new TypeError("invalid billing order purpose");
      if (!Number.isInteger(amount) || amount <= 0) throw new TypeError("amount must be a positive integer");
      const logicalRequestFingerprint = await fingerprint(assertText(logicalRequestKey, "logicalRequestKey"));
      const existing = normalizeOrder(await adapter.getOrderByLogicalRequest({ userId: normalizedUserId, purpose, logicalRequestFingerprint }));
      if (existing) {
        if (existing.customerKey !== normalizedCustomerKey || existing.amount !== amount || existing.currency !== currency) {
          const error = new Error("billing order policy mismatch");
          error.code = "BILLING_ORDER_POLICY_CONFLICT";
          error.status = 409;
          throw error;
        }
        return existing;
      }
      const values = {
        orderId: orderId(),
        userId: normalizedUserId,
        customerKey: normalizedCustomerKey,
        purpose,
        logicalRequestFingerprint,
        amount,
        currency,
        idempotencyKey: randomToken("idem_"),
        now,
      };
      try {
        if (db.__billingMemory) {
          await adapter.insertOrder(values);
          const created = normalizeOrder(await adapter.getOrderById(values.orderId));
          await adapter.insertEvent(createEventValues({ order: created, previousStatus: null, newStatus: "created", eventType: "order_created", metadata: { purpose, amount, currency }, now }));
        } else {
          const eventId = randomToken("evt_");
          await adapter.atomic([
            { sql: "INSERT INTO billing_orders (order_id, user_id, customer_key, purpose, logical_request_fingerprint, amount, currency, idempotency_key, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'created', ?9, ?9)", values: [values.orderId, values.userId, values.customerKey, values.purpose, values.logicalRequestFingerprint, values.amount, values.currency, values.idempotencyKey, values.now] },
            { sql: "INSERT INTO billing_events (event_id, order_id, user_id, previous_status, new_status, event_type, metadata_json, created_at) VALUES (?1, ?2, ?3, NULL, 'created', 'order_created', ?4, ?5)", values: [eventId, values.orderId, values.userId, metadataJson({ purpose, amount, currency }), values.now] },
          ]);
        }
      } catch (error) {
        const retried = normalizeOrder(await adapter.getOrderByLogicalRequest({ userId: normalizedUserId, purpose, logicalRequestFingerprint }));
        if (retried) {
          if (retried.customerKey !== normalizedCustomerKey || retried.amount !== amount || retried.currency !== currency) {
            const conflict = new Error("billing order policy mismatch");
            conflict.code = "BILLING_ORDER_POLICY_CONFLICT";
            conflict.status = 409;
            throw conflict;
          }
          return retried;
        }
        throw error;
      }
      return normalizeOrder(await adapter.getOrderById(values.orderId));
    },

    getPaymentOrder: getOrder,
    async findOrderByIdempotencyKey(key) { return normalizeOrder(await adapter.getOrderByIdempotencyKey(assertText(key, "idempotencyKey"))); },
    markOrderPending(args) { return transition({ ...args, nextStatus: "pending", eventType: "order_pending" }); },
    markOrderSucceeded(args) { return transition({ ...args, nextStatus: "succeeded", eventType: "order_succeeded" }); },
    markOrderFailed(args) { return transition({ ...args, nextStatus: "failed", eventType: "order_failed", failureMessage: sanitizeFailureMessage(args.failureMessage) }); },
    markOrderUnknown(args) { return transition({ ...args, nextStatus: "unknown", eventType: "order_unknown", failureMessage: sanitizeFailureMessage(args.failureMessage) }); },
    reconcileExternallyApprovedOrder,
    appendBillingEvent: appendEvent,
  };
}

export function createMemoryBillingDb() {
  return { __billingMemory: true, accounts: new Map(), orders: new Map(), events: [] };
}
