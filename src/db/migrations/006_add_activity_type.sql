-- Migration: 006_add_activity_type
-- Description: Add activity type column to support TRADE, REDEEM, etc.

-- Add type column (default to TRADE for existing records)
ALTER TABLE trades ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'TRADE';

-- Update index for querying by type
CREATE INDEX IF NOT EXISTS idx_trades_type ON trades (type, time DESC);
