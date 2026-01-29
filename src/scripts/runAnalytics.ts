/**
 * Analytics CLI Script
 *
 * Generate performance reports for tracked traders.
 *
 * Usage:
 *   npm run analytics:performance [-- --trader <address>] [-- --days <n>]
 */

import * as dotenv from 'dotenv';
dotenv.config();

import timescaleService from '../services/timescaleService';
import {
    calculateTraderMetrics,
    getMarketPerformance,
    compareTraders,
} from '../analytics/traderPerformance';
import {
    analyzeTimePatterns,
    analyzeVolumeCorrelations,
    analyzeTradingBehavior,
} from '../analytics/patternDetection';
import { calculateRiskMetrics, calculateConcentrationMetrics } from '../analytics/riskMetrics';

const TIMESCALE_URL = process.env.TIMESCALE_URL as string;

if (!TIMESCALE_URL) {
    console.error('Error: TIMESCALE_URL environment variable is not set');
    process.exit(1);
}

// Parse command line arguments
function parseArgs(): { trader?: string; days: number; all: boolean } {
    const args = process.argv.slice(2);
    let trader: string | undefined;
    let days = 30;
    let all = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--trader' && args[i + 1]) {
            trader = args[i + 1];
            i++;
        } else if (args[i] === '--days' && args[i + 1]) {
            days = parseInt(args[i + 1], 10);
            i++;
        } else if (args[i] === '--all') {
            all = true;
        }
    }

    return { trader, days, all };
}

async function generateTraderReport(traderAddress: string, days: number): Promise<void> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                    TRADER ANALYTICS REPORT');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\nTrader: ${traderAddress}`);
    console.log(`Period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]} (${days} days)`);

    // Performance metrics
    console.log('\n📊 PERFORMANCE METRICS');
    console.log('───────────────────────────────────────────────────────────');

    const metrics = await calculateTraderMetrics(traderAddress, startDate, endDate);
    if (metrics) {
        console.log(`  Total Trades:       ${metrics.totalTrades}`);
        console.log(`  Buy Trades:         ${metrics.buyTrades}`);
        console.log(`  Sell Trades:        ${metrics.sellTrades}`);
        console.log(`  Total Volume:       $${metrics.totalVolume.toLocaleString()}`);
        console.log(`  Avg Trade Size:     $${metrics.avgTradeSize.toFixed(2)}`);
        console.log(`  Unique Markets:     ${metrics.uniqueMarkets}`);
        console.log(`  Win Rate:           ${metrics.winRate.toFixed(1)}%`);
        console.log(`  Profit Factor:      ${metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor.toFixed(2)}`);
        console.log(`  Realized P&L:       $${metrics.realizedPnl.toFixed(2)}`);
        console.log(`  Largest Win:        $${metrics.largestWin.toFixed(2)}`);
        console.log(`  Largest Loss:       $${metrics.largestLoss.toFixed(2)}`);
        console.log(`  Sharpe Ratio:       ${metrics.sharpeRatio?.toFixed(2) ?? 'N/A'}`);
    } else {
        console.log('  No trade data available');
    }

    // Risk metrics
    console.log('\n📉 RISK METRICS');
    console.log('───────────────────────────────────────────────────────────');

    const riskMetrics = await calculateRiskMetrics(traderAddress, startDate, endDate);
    if (riskMetrics) {
        console.log(`  Max Drawdown:       $${riskMetrics.maxDrawdown.toFixed(2)} (${riskMetrics.maxDrawdownPercent.toFixed(1)}%)`);
        console.log(`  Avg Drawdown:       $${riskMetrics.avgDrawdown.toFixed(2)}`);
        console.log(`  Value at Risk (95%): $${riskMetrics.valueAtRisk.toFixed(2)}`);
        console.log(`  Expected Shortfall: $${riskMetrics.expectedShortfall.toFixed(2)}`);
        console.log(`  Volatility:         $${riskMetrics.volatility.toFixed(2)}`);
        console.log(`  Sortino Ratio:      ${riskMetrics.sortinoRatio?.toFixed(2) ?? 'N/A'}`);
        console.log(`  Calmar Ratio:       ${riskMetrics.calmarRatio?.toFixed(2) ?? 'N/A'}`);
        console.log(`  Ulcer Index:        ${riskMetrics.ulcerIndex.toFixed(2)}`);
        console.log(`  Current Exposure:   $${riskMetrics.currentExposure.toFixed(2)}`);
        console.log(`  Peak Exposure:      $${riskMetrics.peakExposure.toFixed(2)}`);
    } else {
        console.log('  Insufficient data for risk analysis');
    }

    // Concentration metrics
    console.log('\n🎯 CONCENTRATION METRICS');
    console.log('───────────────────────────────────────────────────────────');

    const concentration = await calculateConcentrationMetrics(traderAddress, startDate, endDate);
    if (concentration) {
        console.log(`  Herfindahl Index:   ${concentration.herfindahlIndex.toFixed(3)}`);
        console.log(`  Top 3 Markets:      ${concentration.top3MarketsShare.toFixed(1)}% of volume`);
        console.log(`  Avg Position Size:  $${concentration.avgPositionSize.toFixed(2)}`);
        console.log(`  Max Position Size:  $${concentration.maxPositionSize.toFixed(2)}`);
        console.log(`  Position Count:     ${concentration.positionCount}`);
    } else {
        console.log('  No concentration data available');
    }

    // Trading behavior
    console.log('\n🕐 TRADING BEHAVIOR');
    console.log('───────────────────────────────────────────────────────────');

    const behavior = await analyzeTradingBehavior(traderAddress, startDate, endDate);
    console.log(`  Avg Time Between:   ${behavior.avgTimeBetweenTrades} minutes`);
    console.log(`  Trading Frequency:  ${behavior.tradingFrequency} trades/day`);
    console.log(`  Preferred Hours:    ${behavior.preferredHours.length > 0 ? behavior.preferredHours.map(h => `${h}:00`).join(', ') : 'None detected'}`);
    console.log(`  Preferred Days:     ${behavior.preferredDays.length > 0 ? behavior.preferredDays.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ') : 'None detected'}`);
    console.log(`  Scalper Score:      ${behavior.scalperScore}/100`);
    console.log(`  Swing Score:        ${behavior.swingScore}/100`);

    // Volume correlations
    console.log('\n📈 VOLUME ANALYSIS');
    console.log('───────────────────────────────────────────────────────────');

    const volumeCorr = await analyzeVolumeCorrelations(traderAddress, startDate, endDate);
    console.log(`  Small Trades (<$50):`);
    console.log(`    Count: ${volumeCorr.smallTrades.count}, Win Rate: ${volumeCorr.smallTrades.winRate.toFixed(1)}%, Avg P&L: $${volumeCorr.smallTrades.avgPnl.toFixed(2)}`);
    console.log(`  Medium Trades ($50-$500):`);
    console.log(`    Count: ${volumeCorr.mediumTrades.count}, Win Rate: ${volumeCorr.mediumTrades.winRate.toFixed(1)}%, Avg P&L: $${volumeCorr.mediumTrades.avgPnl.toFixed(2)}`);
    console.log(`  Large Trades (>$500):`);
    console.log(`    Count: ${volumeCorr.largeTrades.count}, Win Rate: ${volumeCorr.largeTrades.winRate.toFixed(1)}%, Avg P&L: $${volumeCorr.largeTrades.avgPnl.toFixed(2)}`);

    // Top markets
    console.log('\n🏆 TOP MARKETS BY P&L');
    console.log('───────────────────────────────────────────────────────────');

    const marketPerf = await getMarketPerformance(traderAddress, startDate, endDate);
    const topMarkets = marketPerf.slice(0, 5);
    for (const market of topMarkets) {
        const pnlSign = market.realizedPnl >= 0 ? '+' : '';
        console.log(`  ${market.marketTitle.slice(0, 40).padEnd(40)} ${pnlSign}$${market.realizedPnl.toFixed(2)}`);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
}

async function main(): Promise<void> {
    const { trader, days, all } = parseArgs();

    try {
        // Connect to TimescaleDB
        await timescaleService.connect(TIMESCALE_URL);

        if (trader) {
            // Single trader report
            await generateTraderReport(trader, days);
        } else if (all) {
            // All traders comparison
            const traders = await timescaleService.getUniqueTraders();

            if (traders.length === 0) {
                console.log('No traders found in database');
                return;
            }

            console.log(`\nComparing ${traders.length} traders over ${days} days...\n`);

            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const comparison = await compareTraders(traders, startDate, new Date());

            console.log('═══════════════════════════════════════════════════════════');
            console.log('                    TRADER COMPARISON');
            console.log('═══════════════════════════════════════════════════════════');
            console.log('');
            console.log('Rank  Trader                                    P&L         Win Rate  Trades');
            console.log('────  ────────────────────────────────────────  ──────────  ────────  ──────');

            comparison.forEach((m, i) => {
                const addr = `${m.traderAddress.slice(0, 6)}...${m.traderAddress.slice(-4)}`;
                const pnl = m.realizedPnl >= 0 ? `+$${m.realizedPnl.toFixed(0)}` : `-$${Math.abs(m.realizedPnl).toFixed(0)}`;
                console.log(
                    `${(i + 1).toString().padStart(4)}  ${addr.padEnd(42)}  ${pnl.padStart(10)}  ${m.winRate.toFixed(1).padStart(6)}%  ${m.totalTrades.toString().padStart(6)}`
                );
            });

            console.log('═══════════════════════════════════════════════════════════');
        } else {
            // Show usage
            console.log('Usage:');
            console.log('  npm run analytics:performance -- --trader <address>  # Single trader report');
            console.log('  npm run analytics:performance -- --all               # Compare all traders');
            console.log('  npm run analytics:performance -- --days <n>          # Set analysis period (default: 30)');
            console.log('');
            console.log('Examples:');
            console.log('  npm run analytics:performance -- --trader 0x1234...5678 --days 7');
            console.log('  npm run analytics:performance -- --all --days 14');
        }
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        await timescaleService.disconnect();
    }
}

main();
