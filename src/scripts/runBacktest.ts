/**
 * Backtesting CLI Script
 *
 * Simulate copy trading strategies against historical data.
 *
 * Usage:
 *   npm run analytics:backtest -- --trader <address> [options]
 */

import * as dotenv from 'dotenv';
dotenv.config();

import timescaleService from '../services/timescaleService';
import {
    runBacktest,
    runParameterSweep,
    compareTraderBacktests,
    generateBacktestReport,
    CopyStrategyParams,
} from '../analytics/backtesting';

const TIMESCALE_URL = process.env.TIMESCALE_URL as string;

if (!TIMESCALE_URL) {
    console.error('Error: TIMESCALE_URL environment variable is not set');
    process.exit(1);
}

interface CliArgs {
    trader?: string;
    days: number;
    copyPercent: number;
    maxOrder: number;
    minOrder: number;
    slippage: number;
    fee: number;
    sweep: boolean;
    compare: boolean;
}

// Parse command line arguments
function parseArgs(): CliArgs {
    const args = process.argv.slice(2);
    const result: CliArgs = {
        days: 30,
        copyPercent: 10,
        maxOrder: 100,
        minOrder: 1,
        slippage: 0.005, // 0.5%
        fee: 0.001, // 0.1%
        sweep: false,
        compare: false,
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--trader':
                result.trader = args[++i];
                break;
            case '--days':
                result.days = parseInt(args[++i], 10);
                break;
            case '--copy-percent':
                result.copyPercent = parseFloat(args[++i]);
                break;
            case '--max-order':
                result.maxOrder = parseFloat(args[++i]);
                break;
            case '--min-order':
                result.minOrder = parseFloat(args[++i]);
                break;
            case '--slippage':
                result.slippage = parseFloat(args[++i]) / 100; // Convert from percent
                break;
            case '--fee':
                result.fee = parseFloat(args[++i]) / 100; // Convert from percent
                break;
            case '--sweep':
                result.sweep = true;
                break;
            case '--compare':
                result.compare = true;
                break;
        }
    }

    return result;
}

async function runSingleBacktest(
    traderAddress: string,
    strategy: CopyStrategyParams,
    days: number
): Promise<void> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    console.log(`\nRunning backtest for ${traderAddress.slice(0, 6)}...${traderAddress.slice(-4)}...`);
    console.log(`Period: ${days} days`);
    console.log('');

    const results = await runBacktest(traderAddress, strategy, startDate);
    console.log(generateBacktestReport(results));

    // Show trade summary
    const executedTrades = results.trades.filter((t) => !t.skipped);
    const skippedTrades = results.trades.filter((t) => t.skipped);

    if (skippedTrades.length > 0) {
        console.log('\n⚠️  SKIPPED TRADES SUMMARY');
        console.log('───────────────────────────────────────────────────────────');

        const skipReasons: Record<string, number> = {};
        for (const trade of skippedTrades) {
            const reason = trade.skipReason || 'Unknown';
            skipReasons[reason] = (skipReasons[reason] || 0) + 1;
        }

        for (const [reason, count] of Object.entries(skipReasons)) {
            console.log(`  ${reason}: ${count} trades`);
        }
    }
}

async function runSweepBacktest(
    traderAddress: string,
    baseStrategy: CopyStrategyParams,
    days: number
): Promise<void> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    console.log(`\nRunning parameter sweep for ${traderAddress.slice(0, 6)}...${traderAddress.slice(-4)}...`);
    console.log(`Period: ${days} days`);
    console.log('');

    const results = await runParameterSweep(
        traderAddress,
        baseStrategy,
        {
            copyPercentage: [5, 10, 15, 20, 25],
            maxOrderSize: [50, 100, 200, 500],
            slippage: [0.001, 0.005, 0.01],
        },
        startDate
    );

    console.log('═══════════════════════════════════════════════════════════');
    console.log('                  PARAMETER SWEEP RESULTS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Copy%  MaxOrder  Slippage   Net P&L    Win Rate  Sharpe');
    console.log('─────  ────────  ────────   ─────────  ────────  ──────');

    // Show top 10 results
    const topResults = results.slice(0, 10);
    for (const r of topResults) {
        const pnl = r.netPnl >= 0 ? `+$${r.netPnl.toFixed(0)}` : `-$${Math.abs(r.netPnl).toFixed(0)}`;
        console.log(
            `${r.strategy.copyPercentage.toString().padStart(4)}%  ` +
                `$${r.strategy.maxOrderSize.toString().padStart(6)}  ` +
                `${(r.strategy.slippage * 100).toFixed(1).padStart(6)}%   ` +
                `${pnl.padStart(9)}  ` +
                `${r.winRate.toFixed(1).padStart(6)}%  ` +
                `${r.sharpeRatio?.toFixed(2) ?? 'N/A'}`
        );
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');

    // Show best configuration
    const best = results[0];
    console.log('\n🏆 BEST CONFIGURATION');
    console.log('───────────────────────────────────────────────────────────');
    console.log(`  Copy Percentage:  ${best.strategy.copyPercentage}%`);
    console.log(`  Max Order Size:   $${best.strategy.maxOrderSize}`);
    console.log(`  Slippage:         ${best.strategy.slippage * 100}%`);
    console.log(`  Net P&L:          $${best.netPnl.toFixed(2)}`);
    console.log(`  Win Rate:         ${best.winRate}%`);
    console.log(`  Sharpe Ratio:     ${best.sharpeRatio ?? 'N/A'}`);
}

async function runCompareBacktest(strategy: CopyStrategyParams, days: number): Promise<void> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const traders = await timescaleService.getUniqueTraders();

    if (traders.length === 0) {
        console.log('No traders found in database');
        return;
    }

    console.log(`\nComparing backtests for ${traders.length} traders...`);
    console.log(`Period: ${days} days`);
    console.log('');

    const results = await compareTraderBacktests(traders, strategy, startDate);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('                  TRADER COMPARISON');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Rank  Trader                    Net P&L     Win Rate  MaxDD     Sharpe');
    console.log('────  ────────────────────────  ──────────  ────────  ────────  ──────');

    results.forEach((r, i) => {
        const addr = `${r.traderAddress.slice(0, 6)}...${r.traderAddress.slice(-4)}`;
        const pnl = r.netPnl >= 0 ? `+$${r.netPnl.toFixed(0)}` : `-$${Math.abs(r.netPnl).toFixed(0)}`;
        console.log(
            `${(i + 1).toString().padStart(4)}  ` +
                `${addr.padEnd(24)}  ` +
                `${pnl.padStart(10)}  ` +
                `${r.winRate.toFixed(1).padStart(6)}%  ` +
                `$${r.maxDrawdown.toFixed(0).padStart(6)}  ` +
                `${r.sharpeRatio?.toFixed(2) ?? 'N/A'}`
        );
    });

    console.log('═══════════════════════════════════════════════════════════');
}

function showUsage(): void {
    console.log('Backtest CLI - Simulate copy trading strategies');
    console.log('');
    console.log('Usage:');
    console.log('  npm run analytics:backtest -- --trader <address> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --trader <address>    Trader address to backtest');
    console.log('  --days <n>            Analysis period in days (default: 30)');
    console.log('  --copy-percent <n>    Copy percentage (default: 10)');
    console.log('  --max-order <n>       Max order size in USD (default: 100)');
    console.log('  --min-order <n>       Min order size in USD (default: 1)');
    console.log('  --slippage <n>        Slippage percentage (default: 0.5)');
    console.log('  --fee <n>             Trading fee percentage (default: 0.1)');
    console.log('  --sweep               Run parameter sweep');
    console.log('  --compare             Compare all traders');
    console.log('');
    console.log('Examples:');
    console.log('  npm run analytics:backtest -- --trader 0x1234...5678');
    console.log('  npm run analytics:backtest -- --trader 0x1234...5678 --sweep');
    console.log('  npm run analytics:backtest -- --compare --days 14');
    console.log('  npm run analytics:backtest -- --trader 0x1234...5678 --copy-percent 20 --max-order 200');
}

async function main(): Promise<void> {
    const args = parseArgs();

    if (!args.trader && !args.compare) {
        showUsage();
        return;
    }

    const strategy: CopyStrategyParams = {
        copyPercentage: args.copyPercent,
        maxOrderSize: args.maxOrder,
        minOrderSize: args.minOrder,
        slippage: args.slippage,
        tradingFee: args.fee,
    };

    try {
        // Connect to TimescaleDB
        await timescaleService.connect(TIMESCALE_URL);

        if (args.compare) {
            await runCompareBacktest(strategy, args.days);
        } else if (args.sweep && args.trader) {
            await runSweepBacktest(args.trader, strategy, args.days);
        } else if (args.trader) {
            await runSingleBacktest(args.trader, strategy, args.days);
        }
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        await timescaleService.disconnect();
    }
}

main();
