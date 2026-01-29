-- Migration: 005_add_fill_id
-- Description: Add fill_id for proper deduplication of multi-fill transactions
--
-- Issue: PRIMARY KEY (time, transaction_hash, asset, trader_address) drops legitimate fills
-- when multiple fills occur in the same transaction for the same asset
--
-- Solution: Generate a deterministic fill_id from tx_hash:asset:size:price

-- Create new table with fill_id
CREATE TABLE IF NOT EXISTS trades_new (
    time                    TIMESTAMPTZ NOT NULL,
    transaction_hash        TEXT NOT NULL,
    trader_address          TEXT NOT NULL,
    condition_id            TEXT NOT NULL,
    asset                   TEXT,
    fill_id                 TEXT NOT NULL,  -- New: deterministic hash of tx+asset+size+price
    market_title            TEXT,
    market_slug             TEXT,
    market_link             TEXT,
    outcome                 TEXT,
    side                    TEXT NOT NULL,
    size                    DECIMAL(18,8),
    usdc_size               DECIMAL(18,6),
    price                   DECIMAL(10,6),
    simulated_copy_size     DECIMAL(18,8),
    simulated_copy_price    DECIMAL(10,6),
    simulated_slippage      DECIMAL(10,6),
    simulated_pnl           DECIMAL(18,6),
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    -- New primary key uses fill_id for uniqueness
    PRIMARY KEY (time, fill_id)
);

-- Copy data from old table, generating fill_id from existing fields
INSERT INTO trades_new
SELECT
    time,
    transaction_hash,
    trader_address,
    condition_id,
    asset,
    -- Generate fill_id: MD5 hash of tx_hash:asset:size:price (deterministic)
    MD5(transaction_hash || ':' || COALESCE(asset, '') || ':' || COALESCE(size::text, '0') || ':' || COALESCE(price::text, '0')) as fill_id,
    market_title,
    market_slug,
    market_link,
    outcome,
    side,
    size,
    usdc_size,
    price,
    simulated_copy_size,
    simulated_copy_price,
    simulated_slippage,
    simulated_pnl,
    created_at
FROM trades
ON CONFLICT (time, fill_id) DO NOTHING;

-- Drop old table
DROP TABLE IF EXISTS trades CASCADE;

-- Rename new table
ALTER TABLE trades_new RENAME TO trades;

-- Convert to hypertable
SELECT create_hypertable('trades', 'time', if_not_exists => TRUE, migrate_data => TRUE);

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_trades_trader ON trades (trader_address, time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_market ON trades (condition_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_side ON trades (side, time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_tx ON trades (transaction_hash);
CREATE INDEX IF NOT EXISTS idx_trades_fill_id ON trades (fill_id);

-- Set up compression policy
ALTER TABLE trades SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'trader_address'
);

SELECT add_compression_policy('trades', INTERVAL '7 days', if_not_exists => TRUE);

-- Recreate continuous aggregates
DROP MATERIALIZED VIEW IF EXISTS trader_hourly_stats CASCADE;
DROP MATERIALIZED VIEW IF EXISTS trader_daily_pnl CASCADE;
DROP MATERIALIZED VIEW IF EXISTS trader_daily_summary CASCADE;

CREATE MATERIALIZED VIEW trader_hourly_stats
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    trader_address,
    COUNT(*) AS trade_count,
    SUM(CASE WHEN side = 'BUY' THEN usdc_size ELSE 0 END) AS buy_volume,
    SUM(CASE WHEN side = 'SELL' THEN usdc_size ELSE 0 END) AS sell_volume,
    SUM(usdc_size) AS total_volume,
    AVG(price) AS avg_price,
    COUNT(DISTINCT condition_id) AS unique_markets
FROM trades
GROUP BY bucket, trader_address
WITH NO DATA;

CREATE MATERIALIZED VIEW trader_daily_pnl
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    trader_address,
    condition_id,
    MAX(market_title) AS market_title,
    SUM(CASE WHEN side = 'BUY' THEN -usdc_size ELSE usdc_size END) AS realized_pnl,
    SUM(CASE WHEN side = 'BUY' THEN usdc_size ELSE 0 END) AS buy_volume,
    SUM(CASE WHEN side = 'SELL' THEN usdc_size ELSE 0 END) AS sell_volume,
    COUNT(*) AS trade_count,
    AVG(price) AS avg_price
FROM trades
GROUP BY bucket, trader_address, condition_id
WITH NO DATA;

CREATE MATERIALIZED VIEW trader_daily_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    trader_address,
    COUNT(*) AS total_trades,
    COUNT(DISTINCT condition_id) AS unique_markets,
    SUM(usdc_size) AS total_volume,
    SUM(CASE WHEN side = 'BUY' THEN 1 ELSE 0 END) AS buy_count,
    SUM(CASE WHEN side = 'SELL' THEN 1 ELSE 0 END) AS sell_count,
    AVG(usdc_size) AS avg_trade_size,
    MAX(usdc_size) AS max_trade_size
FROM trades
GROUP BY bucket, trader_address
WITH NO DATA;

-- Set up refresh policies
SELECT add_continuous_aggregate_policy('trader_hourly_stats',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE);

SELECT add_continuous_aggregate_policy('trader_daily_pnl',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE);

SELECT add_continuous_aggregate_policy('trader_daily_summary',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE);
