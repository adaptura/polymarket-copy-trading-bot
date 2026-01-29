-- Migration: 008_add_market_prices_and_aliases
-- Description: Add tables for market price history and trader aliases
--              to support unrealized P&L calculation and trader naming

-- ============================================================================
-- TRADER ALIASES
-- ============================================================================

CREATE TABLE IF NOT EXISTS trader_aliases (
    trader_address      TEXT PRIMARY KEY,
    alias               TEXT NOT NULL,
    color               TEXT,                    -- Hex color like '#00D9FF'
    notes               TEXT,                    -- Optional notes about this trader
    is_active           BOOLEAN DEFAULT TRUE,    -- Whether to track this trader
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Index for looking up active traders
CREATE INDEX IF NOT EXISTS idx_trader_aliases_active
    ON trader_aliases (is_active) WHERE is_active = TRUE;

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_trader_aliases_updated_at ON trader_aliases;
CREATE TRIGGER update_trader_aliases_updated_at
    BEFORE UPDATE ON trader_aliases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MARKETS (metadata cache)
-- ============================================================================

CREATE TABLE IF NOT EXISTS markets (
    condition_id        TEXT PRIMARY KEY,
    title               TEXT,
    slug                TEXT,
    description         TEXT,
    category            TEXT,
    end_date            TIMESTAMPTZ,
    resolved            BOOLEAN DEFAULT FALSE,
    resolution          TEXT,                    -- 'YES', 'NO', or NULL if unresolved
    resolution_price    DECIMAL(10,6),           -- Final price (1.0 for winner, 0 for loser)
    active              BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_markets_active ON markets (active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_markets_resolved ON markets (resolved);
CREATE INDEX IF NOT EXISTS idx_markets_end_date ON markets (end_date);

DROP TRIGGER IF EXISTS update_markets_updated_at ON markets;
CREATE TRIGGER update_markets_updated_at
    BEFORE UPDATE ON markets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MARKET TOKENS (YES/NO outcomes for each market)
-- ============================================================================

CREATE TABLE IF NOT EXISTS market_tokens (
    token_id                TEXT PRIMARY KEY,      -- CLOB token ID (used in API)
    condition_id            TEXT NOT NULL,         -- References markets
    outcome                 TEXT NOT NULL,         -- 'YES' or 'NO'
    complement_token_id     TEXT,                  -- The other outcome's token
    created_at              TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fk_market_tokens_condition
        FOREIGN KEY (condition_id) REFERENCES markets(condition_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_tokens_condition ON market_tokens (condition_id);
CREATE INDEX IF NOT EXISTS idx_market_tokens_outcome ON market_tokens (outcome);

-- ============================================================================
-- MARKET PRICES (time-series price history)
-- ============================================================================

CREATE TABLE IF NOT EXISTS market_prices (
    time                TIMESTAMPTZ NOT NULL,
    token_id            TEXT NOT NULL,
    price               DECIMAL(10,6) NOT NULL,  -- Price between 0 and 1
    volume              DECIMAL(18,6),           -- Optional: volume at this price
    source              TEXT DEFAULT 'api',      -- 'api', 'calculated', 'interpolated'

    PRIMARY KEY (time, token_id)
);

-- Convert to hypertable for efficient time-series queries
SELECT create_hypertable('market_prices', 'time', if_not_exists => TRUE);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_market_prices_token ON market_prices (token_id, time DESC);

-- Compression policy (compress data older than 7 days)
ALTER TABLE market_prices SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'token_id'
);
SELECT add_compression_policy('market_prices', INTERVAL '7 days', if_not_exists => TRUE);

-- Retention policy (keep 2 years of price data)
SELECT add_retention_policy('market_prices', INTERVAL '730 days', if_not_exists => TRUE);

-- ============================================================================
-- CONTINUOUS AGGREGATES for price data
-- ============================================================================

-- Hourly OHLC (Open, High, Low, Close) for candlestick charts
CREATE MATERIALIZED VIEW IF NOT EXISTS market_prices_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    token_id,
    first(price, time) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, time) AS close,
    avg(price) AS avg_price,
    count(*) AS tick_count
FROM market_prices
GROUP BY bucket, token_id
WITH NO DATA;

-- Daily OHLC
CREATE MATERIALIZED VIEW IF NOT EXISTS market_prices_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    token_id,
    first(price, time) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, time) AS close,
    avg(price) AS avg_price,
    count(*) AS tick_count
FROM market_prices
GROUP BY bucket, token_id
WITH NO DATA;

-- Refresh policies
SELECT add_continuous_aggregate_policy('market_prices_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE);

SELECT add_continuous_aggregate_policy('market_prices_daily',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE);

-- ============================================================================
-- PRICE FETCH LOG (track API fetching to avoid duplicates)
-- ============================================================================

CREATE TABLE IF NOT EXISTS price_fetch_log (
    id                  SERIAL PRIMARY KEY,
    token_id            TEXT NOT NULL,
    fetch_start         TIMESTAMPTZ NOT NULL,    -- Start of fetched range
    fetch_end           TIMESTAMPTZ NOT NULL,    -- End of fetched range
    fidelity            INTEGER NOT NULL,        -- Resolution in minutes
    records_fetched     INTEGER,
    records_inserted    INTEGER,
    fetched_at          TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate fetches for same range
    UNIQUE (token_id, fetch_start, fetch_end, fidelity)
);

CREATE INDEX IF NOT EXISTS idx_price_fetch_log_token ON price_fetch_log (token_id, fetch_end DESC);

-- ============================================================================
-- HELPER VIEWS
-- ============================================================================

-- View: Latest price for each token
CREATE OR REPLACE VIEW latest_prices AS
SELECT DISTINCT ON (token_id)
    token_id,
    time AS price_time,
    price
FROM market_prices
ORDER BY token_id, time DESC;

-- View: Trader positions with current value (open positions = net shares > 0)
CREATE OR REPLACE VIEW trader_positions AS
WITH position_calc AS (
    SELECT
        trader_address,
        condition_id,
        asset AS token_id,
        outcome,
        MAX(market_title) AS market_title,
        SUM(CASE
            WHEN side = 'BUY' THEN size
            WHEN side IN ('SELL', 'REDEEM') THEN -size
            ELSE 0
        END) AS net_shares,
        SUM(CASE WHEN side = 'BUY' THEN size ELSE 0 END) AS total_bought,
        SUM(CASE
            WHEN side = 'BUY' THEN usdc_size
            ELSE 0
        END) AS total_cost,
        SUM(CASE
            WHEN side IN ('SELL', 'REDEEM') THEN usdc_size
            ELSE 0
        END) AS total_proceeds,
        COUNT(*) AS trade_count,
        MAX(time) AS last_trade
    FROM trades
    WHERE (type = 'TRADE' OR type = 'REDEEM' OR type IS NULL)
      AND asset IS NOT NULL
    GROUP BY trader_address, condition_id, asset, outcome
)
SELECT
    p.trader_address,
    p.condition_id,
    p.token_id,
    p.outcome,
    p.market_title,
    p.net_shares,
    p.total_bought,
    p.total_cost,
    p.total_proceeds,
    p.trade_count,
    p.last_trade,
    CASE
        WHEN p.total_bought > 0 THEN p.total_cost / p.total_bought
        ELSE 0
    END AS avg_cost_per_share,
    lp.price AS current_price,
    lp.price_time,
    CASE
        WHEN p.net_shares > 0 AND lp.price IS NOT NULL THEN
            (lp.price * p.net_shares) - (p.total_cost * p.net_shares / NULLIF(p.total_bought, 0))
        ELSE 0
    END AS unrealized_pnl,
    p.total_proceeds - p.total_cost AS realized_pnl
FROM position_calc p
LEFT JOIN latest_prices lp ON p.token_id = lp.token_id;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to generate deterministic color from address
CREATE OR REPLACE FUNCTION generate_trader_color(address TEXT)
RETURNS TEXT AS $$
DECLARE
    hash_val BIGINT;
    hue INTEGER;
    colors TEXT[] := ARRAY[
        '#00D9FF', '#22C55E', '#A855F7', '#F59E0B',
        '#FF6B6B', '#EC4899', '#3B82F6', '#14B8A6',
        '#8B5CF6', '#F97316', '#06B6D4', '#84CC16'
    ];
BEGIN
    -- Get a hash of the address and pick from predefined colors
    hash_val := abs(('x' || substring(md5(lower(address)), 1, 8))::bit(32)::int);
    RETURN colors[(hash_val % array_length(colors, 1)) + 1];
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get trader display name (alias or truncated address)
CREATE OR REPLACE FUNCTION get_trader_name(address TEXT)
RETURNS TEXT AS $$
DECLARE
    alias_name TEXT;
BEGIN
    SELECT alias INTO alias_name
    FROM trader_aliases
    WHERE trader_address = lower(address);

    IF alias_name IS NOT NULL THEN
        RETURN alias_name;
    ELSE
        -- Return truncated address: 0x1234...5678
        RETURN substring(address, 1, 6) || '...' || substring(address, length(address) - 3);
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get trader color (custom or generated)
CREATE OR REPLACE FUNCTION get_trader_color(address TEXT)
RETURNS TEXT AS $$
DECLARE
    custom_color TEXT;
BEGIN
    SELECT color INTO custom_color
    FROM trader_aliases
    WHERE trader_address = lower(address);

    IF custom_color IS NOT NULL THEN
        RETURN custom_color;
    ELSE
        RETURN generate_trader_color(address);
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- POPULATE MARKETS FROM EXISTING TRADES
-- ============================================================================

-- Insert unique markets from trades table
INSERT INTO markets (condition_id, title, slug)
SELECT DISTINCT
    condition_id,
    MAX(market_title) AS title,
    MAX(market_slug) AS slug
FROM trades
WHERE condition_id IS NOT NULL
GROUP BY condition_id
ON CONFLICT (condition_id) DO UPDATE SET
    title = COALESCE(EXCLUDED.title, markets.title),
    slug = COALESCE(EXCLUDED.slug, markets.slug),
    updated_at = NOW();

-- Insert unique tokens from trades table
INSERT INTO market_tokens (token_id, condition_id, outcome)
SELECT DISTINCT
    asset AS token_id,
    condition_id,
    outcome
FROM trades
WHERE asset IS NOT NULL AND condition_id IS NOT NULL
ON CONFLICT (token_id) DO NOTHING;
