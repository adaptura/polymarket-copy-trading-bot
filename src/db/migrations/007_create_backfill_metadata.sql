-- Migration: 007_create_backfill_metadata
-- Description: Track what data has been fetched (time ranges per trader/type)

CREATE TABLE IF NOT EXISTS backfill_metadata (
    id                  SERIAL PRIMARY KEY,
    trader_address      TEXT NOT NULL,
    activity_type       TEXT NOT NULL,
    fetch_start         TIMESTAMPTZ NOT NULL,  -- Start of fetched range
    fetch_end           TIMESTAMPTZ NOT NULL,  -- End of fetched range
    trades_fetched      INTEGER NOT NULL,
    trades_inserted     INTEGER NOT NULL,
    fetched_at          TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure we can query by trader and type
    UNIQUE (trader_address, activity_type, fetch_start, fetch_end)
);

CREATE INDEX IF NOT EXISTS idx_backfill_trader ON backfill_metadata (trader_address);
CREATE INDEX IF NOT EXISTS idx_backfill_type ON backfill_metadata (activity_type);
CREATE INDEX IF NOT EXISTS idx_backfill_range ON backfill_metadata (fetch_start, fetch_end);
