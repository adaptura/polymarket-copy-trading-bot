-- Migration: 010_pnl_snapshots_clean_sheet
-- Description: Clean sheet analytics - replace complex trade-based P&L with
--              Polymarket P&L snapshots. Keep trader_aliases, add pnl_snapshots.

-- ============================================================================
-- PHASE 1: DROP OLD ANALYTICS INFRASTRUCTURE
-- ============================================================================

-- Drop continuous aggregates first (depends on market_prices)
DROP MATERIALIZED VIEW IF EXISTS market_prices_daily CASCADE;
DROP MATERIALIZED VIEW IF EXISTS market_prices_hourly CASCADE;

-- Drop views that depend on old tables
DROP VIEW IF EXISTS trader_positions CASCADE;
DROP VIEW IF EXISTS latest_prices CASCADE;

-- Drop old analytics tables (order matters for foreign keys)
DROP TABLE IF EXISTS price_fetch_log CASCADE;
DROP TABLE IF EXISTS market_prices CASCADE;
DROP TABLE IF EXISTS market_tokens CASCADE;
DROP TABLE IF EXISTS markets CASCADE;
DROP TABLE IF EXISTS backfill_metadata CASCADE;
DROP TABLE IF EXISTS duplicate_trades CASCADE;
DROP TABLE IF EXISTS trades CASCADE;

-- ============================================================================
-- PHASE 2: ENSURE TRACKED_TRADERS TABLE EXISTS
-- ============================================================================

-- Rename trader_aliases to tracked_traders if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trader_aliases') THEN
        -- Check if tracked_traders already exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tracked_traders') THEN
            ALTER TABLE trader_aliases RENAME TO tracked_traders;
        END IF;
    END IF;
END $$;

-- Create tracked_traders if it doesn't exist (fresh install case)
CREATE TABLE IF NOT EXISTS tracked_traders (
    address             TEXT PRIMARY KEY,
    alias               TEXT NOT NULL,
    color               TEXT DEFAULT '#10b981',
    notes               TEXT,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Handle column rename if coming from trader_aliases
DO $$
BEGIN
    -- Check if trader_address column exists (old schema)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tracked_traders' AND column_name = 'trader_address'
    ) THEN
        -- Drop the primary key constraint if it exists
        ALTER TABLE tracked_traders DROP CONSTRAINT IF EXISTS trader_aliases_pkey;
        ALTER TABLE tracked_traders DROP CONSTRAINT IF EXISTS tracked_traders_pkey;

        -- Rename the column
        ALTER TABLE tracked_traders RENAME COLUMN trader_address TO address;

        -- Re-add primary key
        ALTER TABLE tracked_traders ADD PRIMARY KEY (address);
    END IF;
END $$;

-- Index for looking up active traders
CREATE INDEX IF NOT EXISTS idx_tracked_traders_active
    ON tracked_traders (is_active) WHERE is_active = TRUE;

-- Ensure update trigger exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_tracked_traders_updated_at ON tracked_traders;
CREATE TRIGGER update_tracked_traders_updated_at
    BEFORE UPDATE ON tracked_traders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PHASE 3: CREATE PNL_SNAPSHOTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS pnl_snapshots (
    trader_address      TEXT NOT NULL REFERENCES tracked_traders(address) ON DELETE CASCADE,
    time                TIMESTAMPTZ NOT NULL,
    realized_pnl        NUMERIC NOT NULL,       -- From Polymarket
    unrealized_pnl      NUMERIC NOT NULL,       -- From Polymarket
    total_pnl           NUMERIC NOT NULL,       -- realized + unrealized
    position_count      INTEGER,                -- Number of open positions

    PRIMARY KEY (trader_address, time)
);

-- Convert to hypertable for efficient time-series queries
SELECT create_hypertable('pnl_snapshots', 'time', if_not_exists => TRUE);

-- Index for fast trader lookups (most recent first)
CREATE INDEX IF NOT EXISTS idx_pnl_snapshots_trader_time
    ON pnl_snapshots (trader_address, time DESC);

-- Compression policy (compress data older than 7 days)
ALTER TABLE pnl_snapshots SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'trader_address'
);
SELECT add_compression_policy('pnl_snapshots', INTERVAL '7 days', if_not_exists => TRUE);

-- Retention policy (keep 3 years of snapshot data)
SELECT add_retention_policy('pnl_snapshots', INTERVAL '1095 days', if_not_exists => TRUE);

-- ============================================================================
-- PHASE 4: HELPER FUNCTIONS
-- ============================================================================

-- Drop existing functions first (they may have different parameter names)
DROP FUNCTION IF EXISTS generate_trader_color(text);
DROP FUNCTION IF EXISTS get_trader_name(text);
DROP FUNCTION IF EXISTS get_trader_color(text);

-- Function to generate deterministic color from address
CREATE OR REPLACE FUNCTION generate_trader_color(addr TEXT)
RETURNS TEXT AS $$
DECLARE
    hash_val BIGINT;
    colors TEXT[] := ARRAY[
        '#10b981', '#22c55e', '#a855f7', '#f59e0b',
        '#ef4444', '#ec4899', '#3b82f6', '#14b8a6',
        '#8b5cf6', '#f97316', '#06b6d4', '#84cc16'
    ];
BEGIN
    hash_val := abs(('x' || substring(md5(lower(addr)), 1, 8))::bit(32)::int);
    RETURN colors[(hash_val % array_length(colors, 1)) + 1];
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get trader display name
CREATE OR REPLACE FUNCTION get_trader_name(addr TEXT)
RETURNS TEXT AS $$
DECLARE
    alias_name TEXT;
BEGIN
    SELECT alias INTO alias_name
    FROM tracked_traders
    WHERE address = lower(addr);

    IF alias_name IS NOT NULL THEN
        RETURN alias_name;
    ELSE
        RETURN substring(addr, 1, 6) || '...' || substring(addr, length(addr) - 3);
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get trader color
CREATE OR REPLACE FUNCTION get_trader_color(addr TEXT)
RETURNS TEXT AS $$
DECLARE
    custom_color TEXT;
BEGIN
    SELECT color INTO custom_color
    FROM tracked_traders
    WHERE address = lower(addr);

    IF custom_color IS NOT NULL THEN
        RETURN custom_color;
    ELSE
        RETURN generate_trader_color(addr);
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- PHASE 5: ANALYTICS VIEWS
-- ============================================================================

-- View: Latest P&L for each trader
CREATE OR REPLACE VIEW latest_pnl AS
SELECT DISTINCT ON (trader_address)
    trader_address,
    time AS snapshot_time,
    realized_pnl,
    unrealized_pnl,
    total_pnl,
    position_count
FROM pnl_snapshots
ORDER BY trader_address, time DESC;

-- View: Trader summary with analytics
CREATE OR REPLACE VIEW trader_analytics_summary AS
WITH stats AS (
    SELECT
        trader_address,
        COUNT(*) AS snapshot_count,
        MIN(time) AS first_snapshot,
        MAX(time) AS last_snapshot,
        -- Max drawdown calculation
        MAX(total_pnl) OVER (PARTITION BY trader_address ORDER BY time) AS running_peak
    FROM pnl_snapshots
    GROUP BY trader_address, time, total_pnl
),
daily_changes AS (
    SELECT
        trader_address,
        time,
        total_pnl,
        total_pnl - LAG(total_pnl) OVER (PARTITION BY trader_address ORDER BY time) AS daily_change
    FROM pnl_snapshots
),
volatility AS (
    SELECT
        trader_address,
        STDDEV(daily_change) AS pnl_volatility,
        AVG(daily_change) AS avg_daily_change,
        COUNT(*) FILTER (WHERE daily_change > 0) AS positive_days,
        COUNT(*) FILTER (WHERE daily_change <= 0) AS negative_days
    FROM daily_changes
    WHERE daily_change IS NOT NULL
    GROUP BY trader_address
)
SELECT
    t.address,
    t.alias,
    t.color,
    t.is_active,
    lp.total_pnl AS current_pnl,
    lp.realized_pnl,
    lp.unrealized_pnl,
    lp.position_count,
    lp.snapshot_time AS last_updated,
    v.pnl_volatility,
    v.avg_daily_change,
    CASE
        WHEN (v.positive_days + v.negative_days) > 0
        THEN v.positive_days::NUMERIC / (v.positive_days + v.negative_days) * 100
        ELSE 0
    END AS win_rate_pct
FROM tracked_traders t
LEFT JOIN latest_pnl lp ON t.address = lp.trader_address
LEFT JOIN volatility v ON t.address = v.trader_address;
