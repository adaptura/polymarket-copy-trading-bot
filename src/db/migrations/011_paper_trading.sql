-- Migration: 011_paper_trading
-- Description: Paper trading system for validating copy strategies without real funds.
--              Supports multiple portfolios with independent allocations and realistic
--              execution simulation with slippage tracking.

-- ============================================================================
-- PHASE 1: PAPER PORTFOLIOS
-- ============================================================================

CREATE TABLE IF NOT EXISTS paper_portfolios (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL UNIQUE,
    starting_capital    NUMERIC(18, 2) NOT NULL,
    current_balance     NUMERIC(18, 2) NOT NULL,  -- Virtual USDC balance
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_paper_portfolios_updated_at ON paper_portfolios;
CREATE TRIGGER update_paper_portfolios_updated_at
    BEFORE UPDATE ON paper_portfolios
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Index for active portfolios
CREATE INDEX IF NOT EXISTS idx_paper_portfolios_active
    ON paper_portfolios (is_active) WHERE is_active = TRUE;

-- ============================================================================
-- PHASE 2: PORTFOLIO-SPECIFIC TRADER ALLOCATIONS
-- ============================================================================

-- Each portfolio can have different allocation % for each tracked trader
CREATE TABLE IF NOT EXISTS paper_portfolio_allocations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id        UUID NOT NULL REFERENCES paper_portfolios(id) ON DELETE CASCADE,
    trader_address      TEXT NOT NULL REFERENCES tracked_traders(address) ON DELETE CASCADE,
    allocation_percent  NUMERIC(5, 2) NOT NULL DEFAULT 100.0,  -- % of trader's position to copy
    max_position_usd    NUMERIC(18, 2),  -- Optional per-trader position limit
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (portfolio_id, trader_address)
);

-- Indexes for lookups
CREATE INDEX IF NOT EXISTS idx_paper_allocations_portfolio
    ON paper_portfolio_allocations (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_paper_allocations_trader
    ON paper_portfolio_allocations (trader_address);

-- ============================================================================
-- PHASE 3: PAPER TRADES (TimescaleDB Hypertable)
-- ============================================================================

-- Records every simulated trade execution with slippage metrics
CREATE TABLE IF NOT EXISTS paper_trades (
    id                      UUID DEFAULT gen_random_uuid(),
    portfolio_id            UUID NOT NULL REFERENCES paper_portfolios(id) ON DELETE CASCADE,
    time                    TIMESTAMPTZ NOT NULL,

    -- Original trader's trade info
    original_trader_address TEXT NOT NULL,
    original_tx_hash        TEXT NOT NULL,
    original_trade_time     TIMESTAMPTZ NOT NULL,
    original_price          NUMERIC(10, 6) NOT NULL,
    original_size_usd       NUMERIC(18, 2) NOT NULL,

    -- Market info
    condition_id            TEXT NOT NULL,
    asset                   TEXT NOT NULL,
    market_title            TEXT,
    market_slug             TEXT,
    outcome                 TEXT,
    side                    TEXT NOT NULL,  -- 'BUY' or 'SELL'

    -- Simulated execution (after delay)
    simulated_price         NUMERIC(10, 6) NOT NULL,  -- Best ask/bid at execution time
    simulated_size_usd      NUMERIC(18, 2) NOT NULL,  -- Amount "bought/sold" in USD
    simulated_size_tokens   NUMERIC(18, 6) NOT NULL,  -- Tokens acquired/sold

    -- Execution quality metrics
    delay_ms                INTEGER NOT NULL DEFAULT 300,
    slippage_percent        NUMERIC(8, 4) NOT NULL,  -- (sim_price - orig_price) / orig_price * 100
    execution_status        TEXT NOT NULL DEFAULT 'FILLED',  -- 'FILLED', 'PARTIAL', 'SKIPPED'
    skip_reason             TEXT,  -- If skipped: 'INSUFFICIENT_BALANCE', 'BELOW_MIN', 'NO_LIQUIDITY', etc.

    -- Balance tracking
    balance_before          NUMERIC(18, 2) NOT NULL,
    balance_after           NUMERIC(18, 2) NOT NULL,

    PRIMARY KEY (time, id)
);

-- Convert to hypertable for time-series efficiency
SELECT create_hypertable('paper_trades', 'time', if_not_exists => TRUE);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_paper_trades_portfolio
    ON paper_trades (portfolio_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_paper_trades_trader
    ON paper_trades (original_trader_address, time DESC);
CREATE INDEX IF NOT EXISTS idx_paper_trades_market
    ON paper_trades (condition_id, time DESC);

-- Compression policy (compress data older than 7 days)
ALTER TABLE paper_trades SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'portfolio_id'
);
SELECT add_compression_policy('paper_trades', INTERVAL '7 days', if_not_exists => TRUE);

-- Retention policy (keep 1 year of paper trade data)
SELECT add_retention_policy('paper_trades', INTERVAL '365 days', if_not_exists => TRUE);

-- ============================================================================
-- PHASE 4: PAPER POSITIONS
-- ============================================================================

-- Current holdings per portfolio (updated on each trade)
CREATE TABLE IF NOT EXISTS paper_positions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id        UUID NOT NULL REFERENCES paper_portfolios(id) ON DELETE CASCADE,
    condition_id        TEXT NOT NULL,
    asset               TEXT NOT NULL,
    market_title        TEXT,
    market_slug         TEXT,
    outcome             TEXT,

    size_tokens         NUMERIC(18, 6) NOT NULL DEFAULT 0,
    avg_entry_price     NUMERIC(10, 6) NOT NULL,
    total_cost_usd      NUMERIC(18, 2) NOT NULL DEFAULT 0,
    current_price       NUMERIC(10, 6),  -- Updated periodically from market
    unrealized_pnl      NUMERIC(18, 2) DEFAULT 0,
    realized_pnl        NUMERIC(18, 2) DEFAULT 0,

    opened_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (portfolio_id, asset)
);

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_paper_positions_updated_at ON paper_positions;
CREATE TRIGGER update_paper_positions_updated_at
    BEFORE UPDATE ON paper_positions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Index for portfolio lookups
CREATE INDEX IF NOT EXISTS idx_paper_positions_portfolio
    ON paper_positions (portfolio_id);

-- ============================================================================
-- PHASE 5: PAPER PORTFOLIO SNAPSHOTS (TimescaleDB Hypertable)
-- ============================================================================

-- Periodic snapshots for equity curve (every 5 minutes)
CREATE TABLE IF NOT EXISTS paper_portfolio_snapshots (
    portfolio_id        UUID NOT NULL REFERENCES paper_portfolios(id) ON DELETE CASCADE,
    time                TIMESTAMPTZ NOT NULL,

    cash_balance        NUMERIC(18, 2) NOT NULL,   -- Virtual USDC remaining
    positions_value     NUMERIC(18, 2) NOT NULL,   -- Sum of position values
    total_equity        NUMERIC(18, 2) NOT NULL,   -- cash + positions
    total_pnl           NUMERIC(18, 2) NOT NULL,   -- total_equity - starting_capital
    total_pnl_percent   NUMERIC(8, 4) NOT NULL,    -- (total_pnl / starting_capital) * 100
    open_positions      INTEGER NOT NULL,          -- Count of positions with size > 0
    trade_count         INTEGER NOT NULL,          -- Total trades executed so far

    PRIMARY KEY (portfolio_id, time)
);

-- Convert to hypertable
SELECT create_hypertable('paper_portfolio_snapshots', 'time', if_not_exists => TRUE);

-- Index for portfolio-specific queries
CREATE INDEX IF NOT EXISTS idx_paper_snapshots_portfolio
    ON paper_portfolio_snapshots (portfolio_id, time DESC);

-- Compression policy
ALTER TABLE paper_portfolio_snapshots SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'portfolio_id'
);
SELECT add_compression_policy('paper_portfolio_snapshots', INTERVAL '7 days', if_not_exists => TRUE);

-- Retention policy (keep 1 year of snapshots)
SELECT add_retention_policy('paper_portfolio_snapshots', INTERVAL '365 days', if_not_exists => TRUE);

-- ============================================================================
-- PHASE 6: HELPER VIEWS
-- ============================================================================

-- View: Latest snapshot for each portfolio
CREATE OR REPLACE VIEW latest_paper_portfolio_snapshot AS
SELECT DISTINCT ON (portfolio_id)
    portfolio_id,
    time AS snapshot_time,
    cash_balance,
    positions_value,
    total_equity,
    total_pnl,
    total_pnl_percent,
    open_positions,
    trade_count
FROM paper_portfolio_snapshots
ORDER BY portfolio_id, time DESC;

-- View: Portfolio summary with stats
CREATE OR REPLACE VIEW paper_portfolio_summary AS
SELECT
    p.id,
    p.name,
    p.starting_capital,
    p.current_balance,
    p.is_active,
    p.created_at,
    COALESCE(s.total_equity, p.starting_capital) AS total_equity,
    COALESCE(s.total_pnl, 0) AS total_pnl,
    COALESCE(s.total_pnl_percent, 0) AS total_pnl_percent,
    COALESCE(s.open_positions, 0) AS open_positions,
    COALESCE(s.trade_count, 0) AS trade_count,
    s.snapshot_time AS last_updated,
    (
        SELECT COUNT(*)
        FROM paper_portfolio_allocations a
        WHERE a.portfolio_id = p.id AND a.is_active = TRUE
    ) AS tracked_traders_count
FROM paper_portfolios p
LEFT JOIN latest_paper_portfolio_snapshot s ON p.id = s.portfolio_id;

-- View: Slippage statistics by portfolio
CREATE OR REPLACE VIEW paper_slippage_stats AS
SELECT
    portfolio_id,
    COUNT(*) AS total_trades,
    COUNT(*) FILTER (WHERE execution_status = 'FILLED') AS filled_trades,
    COUNT(*) FILTER (WHERE execution_status = 'SKIPPED') AS skipped_trades,
    AVG(slippage_percent) AS avg_slippage_percent,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY slippage_percent) AS median_slippage_percent,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY slippage_percent) AS p95_slippage_percent,
    MIN(slippage_percent) AS min_slippage_percent,
    MAX(slippage_percent) AS max_slippage_percent,
    SUM(simulated_size_usd * slippage_percent / 100) AS total_slippage_cost_usd
FROM paper_trades
WHERE execution_status = 'FILLED'
GROUP BY portfolio_id;

-- View: Slippage by trader
CREATE OR REPLACE VIEW paper_slippage_by_trader AS
SELECT
    portfolio_id,
    original_trader_address,
    get_trader_name(original_trader_address) AS trader_name,
    COUNT(*) AS trade_count,
    AVG(slippage_percent) AS avg_slippage_percent,
    SUM(simulated_size_usd) AS total_volume_usd
FROM paper_trades
WHERE execution_status = 'FILLED'
GROUP BY portfolio_id, original_trader_address;
