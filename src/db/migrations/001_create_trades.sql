-- Migration: 001_create_trades
-- Description: Create trades hypertable and continuous aggregates for analytics

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Core trades table (will be converted to hypertable)
CREATE TABLE IF NOT EXISTS trades (
    time                    TIMESTAMPTZ NOT NULL,
    transaction_hash        TEXT NOT NULL,
    trader_address          TEXT NOT NULL,
    condition_id            TEXT NOT NULL,
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
    PRIMARY KEY (time, transaction_hash)
);

-- Convert to hypertable (partitioned by time)
SELECT create_hypertable('trades', 'time', if_not_exists => TRUE);

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_trades_trader ON trades (trader_address, time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_market ON trades (condition_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_side ON trades (side, time DESC);

-- Continuous aggregate: Hourly trader statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS trader_hourly_stats
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

-- Continuous aggregate: Daily P&L per trader and market
CREATE MATERIALIZED VIEW IF NOT EXISTS trader_daily_pnl
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

-- Continuous aggregate: Daily overall stats per trader
CREATE MATERIALIZED VIEW IF NOT EXISTS trader_daily_summary
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

-- Set up refresh policies for continuous aggregates (refresh every hour)
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

-- Set up compression policy (compress data older than 7 days)
ALTER TABLE trades SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'trader_address'
);

SELECT add_compression_policy('trades', INTERVAL '7 days', if_not_exists => TRUE);

-- Set up retention policy (keep data for 1 year)
SELECT add_retention_policy('trades', INTERVAL '365 days', if_not_exists => TRUE);
