-- Migration: 003_fix_primary_key
-- Description: Fix primary key to handle multi-fill trades properly
--
-- Issue: PRIMARY KEY (time, transaction_hash) drops legitimate trades
-- when multiple activities share the same tx hash/time (multi-fill, multi-outcome)

-- Step 1: Drop existing primary key constraint and recreate table
-- (TimescaleDB hypertables can't ALTER PRIMARY KEY easily)

-- Create new table with correct primary key
CREATE TABLE IF NOT EXISTS trades_new (
    time                    TIMESTAMPTZ NOT NULL,
    transaction_hash        TEXT NOT NULL,
    trader_address          TEXT NOT NULL,
    condition_id            TEXT NOT NULL,
    asset                   TEXT,
    market_title            TEXT,
    market_slug             TEXT,
    market_link             TEXT,
    outcome                 TEXT,
    side                    TEXT NOT NULL,
    size                    DECIMAL(18,8),
    usdc_size               DECIMAL(18,6),
    price                   DECIMAL(10,6),
    -- Simulated copy fields for backtesting
    simulated_copy_size     DECIMAL(18,8),
    simulated_copy_price    DECIMAL(10,6),
    simulated_slippage      DECIMAL(10,6),
    simulated_pnl           DECIMAL(18,6),
    -- Metadata
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    -- New composite primary key: includes asset to handle multi-fill/multi-outcome
    PRIMARY KEY (time, transaction_hash, asset)
);

-- Copy data from old table (if exists)
INSERT INTO trades_new
SELECT
    time,
    LOWER(transaction_hash) as transaction_hash,  -- Normalize to lowercase
    trader_address,
    condition_id,
    asset,
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
ON CONFLICT (time, transaction_hash, asset) DO NOTHING;

-- Drop old table
DROP TABLE IF EXISTS trades;

-- Rename new table
ALTER TABLE trades_new RENAME TO trades;

-- Convert to hypertable
SELECT create_hypertable('trades', 'time', if_not_exists => TRUE, migrate_data => TRUE);

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_trades_trader ON trades (trader_address, time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_market ON trades (condition_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_side ON trades (side, time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_tx ON trades (transaction_hash);

-- Set up compression policy
ALTER TABLE trades SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'trader_address'
);

SELECT add_compression_policy('trades', INTERVAL '7 days', if_not_exists => TRUE);

-- Recreate continuous aggregates (they reference the old table)
-- First drop existing ones
DROP MATERIALIZED VIEW IF EXISTS trader_hourly_stats CASCADE;
DROP MATERIALIZED VIEW IF EXISTS trader_daily_pnl CASCADE;
DROP MATERIALIZED VIEW IF EXISTS trader_daily_summary CASCADE;

-- Recreate: Hourly trader statistics
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

-- Recreate: Daily P&L per trader and market
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

-- Recreate: Daily overall stats per trader
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
