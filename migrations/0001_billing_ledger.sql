CREATE TABLE IF NOT EXISTS billing_accounts (
  user_id TEXT PRIMARY KEY,
  customer_key TEXT NOT NULL UNIQUE,
  billing_status TEXT NOT NULL DEFAULT 'inactive',
  billing_key_fingerprint TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_orders (
  order_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  customer_key TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('initial_subscription', 'renewal')),
  logical_request_fingerprint TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('created', 'pending', 'succeeded', 'failed', 'unknown', 'cancelled')),
  payment_key TEXT,
  failure_code TEXT,
  failure_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  UNIQUE (user_id, purpose, logical_request_fingerprint)
);

CREATE TABLE IF NOT EXISTS billing_events (
  event_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES billing_orders(order_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_orders_user_created
  ON billing_orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_events_order_created
  ON billing_events (order_id, created_at ASC);
