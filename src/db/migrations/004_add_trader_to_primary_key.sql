-- Migration: 004_add_trader_to_primary_key
-- Description: Add trader_address to primary key to store both sides of a trade
--
-- Issue: PRIMARY KEY (time, transaction_hash, asset) drops counterparty trades
-- When two tracked traders are counterparties, only one trade is stored

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
    simulated_copy_size     DECIMAL(18,8),
    simulated_copy_price    DECIMAL(10,6),
    simulated_slippage      DECIMAL(10,6),
    simulated_pnl           DECIMAL(18,6),
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    -- New primary key includes trader_address
    PRIMARY KEY (time, transaction_hash, asset, trader_address)
);

-- Copy data from old table
INSERT INTO trades_new
SELECT
    time,
    transaction_hash,
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
ON CONFLICT (time, transaction_hash, asset, trader_address) DO NOTHING;

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
