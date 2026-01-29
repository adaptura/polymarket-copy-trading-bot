-- Migration: 002_create_duplicate_trades
-- Description: Table to track duplicate trades for debugging data processing

CREATE TABLE IF NOT EXISTS duplicate_trades (
    id                      SERIAL PRIMARY KEY,
    detected_at             TIMESTAMPTZ DEFAULT NOW(),
    original_time           TIMESTAMPTZ NOT NULL,
    transaction_hash        TEXT NOT NULL,
    trader_address          TEXT NOT NULL,
    condition_id            TEXT NOT NULL,
    asset                   TEXT,
    side                    TEXT,
    size                    DECIMAL(18,8),
    usdc_size               DECIMAL(18,6),
    price                   DECIMAL(10,6),
    duplicate_key           TEXT NOT NULL,  -- The composite key used for deduplication
    source                  TEXT DEFAULT 'backfill',  -- 'backfill' or 'live'
    batch_offset            INTEGER  -- Which API offset this came from
);

CREATE INDEX IF NOT EXISTS idx_duplicate_trades_trader ON duplicate_trades (trader_address, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_duplicate_trades_key ON duplicate_trades (duplicate_key);
CREATE INDEX IF NOT EXISTS idx_duplicate_trades_tx ON duplicate_trades (transaction_hash);
