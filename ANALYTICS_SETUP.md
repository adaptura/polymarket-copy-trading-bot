# Trade Analytics Database Setup

This document explains how to set up the TimescaleDB analytics system for the Polymarket copy trading bot.

## Environment Variables

Add these to your `.env` file:

```bash
# TimescaleDB Connection URL
# Format: postgresql://user:password@host:port/database
TIMESCALE_URL=postgresql://postgres:postgres@localhost:5432/polymarket_analytics

# Analysis Mode - when true, bot monitors and records but does NOT execute trades
ANALYSIS_MODE=true
```

## Quick Start

### 1. Start TimescaleDB

```bash
docker-compose up -d
```

### 2. Run Database Migrations

```bash
docker exec -i polymarket_timescaledb psql -U postgres -d polymarket_analytics < src/db/migrations/001_create_trades.sql
```

### 3. Start Bot in Analysis Mode

```bash
ANALYSIS_MODE=true npm run dev
```

The bot will now monitor traders and store all trade data in TimescaleDB without executing any orders.

## Analytics Commands

### View Trader Performance

```bash
# Single trader report
npm run analytics:performance -- --trader 0x1234...5678

# Compare all tracked traders
npm run analytics:performance -- --all

# Specify analysis period (default: 30 days)
npm run analytics:performance -- --trader 0x1234...5678 --days 7
```

### Run Backtests

```bash
# Single backtest with default parameters
npm run analytics:backtest -- --trader 0x1234...5678

# Backtest with custom parameters
npm run analytics:backtest -- --trader 0x1234...5678 --copy-percent 15 --max-order 200

# Parameter sweep (find optimal settings)
npm run analytics:backtest -- --trader 0x1234...5678 --sweep

# Compare all traders
npm run analytics:backtest -- --compare --days 14
```

### Backtest Options

| Option | Description | Default |
|--------|-------------|---------|
| `--trader <addr>` | Trader address to backtest | Required |
| `--days <n>` | Analysis period in days | 30 |
| `--copy-percent <n>` | Copy percentage | 10 |
| `--max-order <n>` | Max order size in USD | 100 |
| `--min-order <n>` | Min order size in USD | 1 |
| `--slippage <n>` | Slippage percentage | 0.5 |
| `--fee <n>` | Trading fee percentage | 0.1 |
| `--sweep` | Run parameter sweep | false |
| `--compare` | Compare all traders | false |

## Architecture

```
Polymarket API → Trade Monitor → MongoDB (bot operations)
                              ↘ TimescaleDB (analytics)
                                      ↓
                              Analytics Layer (P&L, patterns, backtest)
```

- **MongoDB**: Existing role (trade state, execution flags)
- **TimescaleDB**: Analytics store (all trades, continuous aggregates)
- **Analysis Mode**: Collect and analyze without executing trades

## Database Schema

The TimescaleDB schema includes:

- **trades**: Core hypertable with all trade data
- **trader_hourly_stats**: Continuous aggregate for hourly statistics
- **trader_daily_pnl**: Continuous aggregate for daily P&L per market
- **trader_daily_summary**: Continuous aggregate for daily summary stats

Data is automatically:
- Compressed after 7 days
- Retained for 365 days
- Aggregated hourly into materialized views

## Verification

After setup, verify everything is working:

1. Check TimescaleDB is running:
   ```bash
   docker-compose ps
   ```

2. Check trades are being recorded:
   ```bash
   docker exec -it polymarket_timescaledb psql -U postgres -d polymarket_analytics -c "SELECT COUNT(*) FROM trades;"
   ```

3. Run analytics to verify data access:
   ```bash
   npm run analytics:performance -- --all
   ```
