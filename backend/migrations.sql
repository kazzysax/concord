-- migrations.sql
-- Idempotent. Runs on every startup when STORE_DRIVER=postgres.
-- Documents live in JSONB so app-level shapes can change without a migration
-- per field; only genuinely queryable things are promoted to columns.

CREATE TABLE IF NOT EXISTS concords (
    id          TEXT PRIMARY KEY,
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
    id          TEXT PRIMARY KEY,
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Encrypted blobs + wrapped keys. Never contains plaintext terms.
CREATE TABLE IF NOT EXISTS commitments (
    id          TEXT PRIMARY KEY,
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
    concord_id  TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (concord_id, seq)
);

-- Last block the indexer successfully processed, per chain. Without this a
-- restart either misses events or reprocesses from genesis.
CREATE TABLE IF NOT EXISTS checkpoints (
    chain         TEXT PRIMARY KEY,
    block_number  BIGINT NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency guard: a payment event must only ever be applied once, even if
-- the indexer replays a block range after a crash.
CREATE TABLE IF NOT EXISTS processed_events (
    tx_hash      TEXT NOT NULL,
    log_index    INTEGER NOT NULL,
    chain        TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tx_hash, log_index, chain)
);

CREATE INDEX IF NOT EXISTS idx_messages_concord ON messages (concord_id);
CREATE INDEX IF NOT EXISTS idx_concords_updated ON concords (updated_at DESC);
