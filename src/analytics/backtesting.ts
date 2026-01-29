import timescaleService, { TradeRecord } from '../services/timescaleService';

/**
 * Copy strategy configuration for backtesting
 */
export interface CopyStrategyParams {
    /** Percentage of trader's position to copy (1-100) */
    copyPercentage: number;
    /** Maximum USD per trade */
    maxOrderSize: number;
    /** Minimum USD per trade */
    minOrderSize: number;
    /** Simulated slippage percentage (0-1) */
    slippage: number;
    /** Trading fee percentage (0-1) */
    tradingFee: number;
    /** Maximum total exposure allowed */
    maxExposure?: number;
    /** Delay in seconds before copying (to simulate reaction time) */
    copyDelay?: number;
}

/**
 * Backtest result for a single trade
 */
export interface BacktestTrade {
    originalTrade: TradeRecord;
    copySize: number;
    copyPrice: number;
    slippageCost: number;
    feeCost: number;
    skipped: boolean;
    skipReason?: string;
}

/**
 * Overall backtest results
 */
export interface BacktestResults {
    strategy: CopyStrategyParams;
    traderAddress: string;
    periodStart: Date;
    periodEnd: Date;
    totalTrades: number;
    executedTrades: number;
    skippedTrades: number;
    totalVolume: number;
    totalFees: number;
    totalSlippage: number;
    grossPnl: number;
    netPnl: number;
    netPnlPercent: number;
    winRate: number;
    profitFactor: number;
    maxDrawdown: number;
    sharpeRatio: number | null;
    trades: BacktestTrade[];
}

/**
 * Run a backtest simulation
 */
export async function runBacktest(
    traderAddress: string,
    strategy: CopyStrategyParams,
    startDate?: Date,
    endDate?: Date
): Promise<BacktestResults> {
    const trades = await timescaleService.getTradeHistory({
        traderAddress,
        startDate,
        endDate,
        limit: 10000,
    });

    // Sort by time ascending for simulation
    const sortedTrades = [...trades].sort((a, b) => a.time.getTime() - b.time.getTime());

    const backtestTrades: BacktestTrade[] = [];
    const marketPosition: Record<string, number> = {}; // Track position per market
    let totalExposure = 0;
    let totalFees = 0;
    let totalSlippage = 0;
    let totalVolume = 0;
    let executedTrades = 0;
    let skippedTrades = 0;

    for (const trade of sortedTrades) {
        const originalSize = trade.usdcSize || 0;
        let copySize = originalSize * (strategy.copyPercentage / 100);

        // Apply size limits
        let skipped = false;
        let skipReason: string | undefined;

        if (copySize < strategy.minOrderSize) {
            skipped = true;
            skipReason = `Below minimum order size ($${strategy.minOrderSize})`;
        } else if (copySize > strategy.maxOrderSize) {
            copySize = strategy.maxOrderSize;
        }

        // Check exposure limits
        if (!skipped && strategy.maxExposure) {
            const newExposure =
                trade.side === 'BUY' ? totalExposure + copySize : totalExposure - copySize;
            if (newExposure > strategy.maxExposure) {
                skipped = true;
                skipReason = `Would exceed max exposure ($${strategy.maxExposure})`;
            }
        }

        // Calculate costs
        const slippageCost = copySize * strategy.slippage;
        const feeCost = copySize * strategy.tradingFee;
        const copyPrice = trade.price || 0;

        if (!skipped) {
            executedTrades++;
            totalVolume += copySize;
            totalFees += feeCost;
            totalSlippage += slippageCost;

            // Update position tracking
            if (!marketPosition[trade.conditionId]) {
                marketPosition[trade.conditionId] = 0;
            }

            if (trade.side === 'BUY') {
                marketPosition[trade.conditionId] += copySize;
                totalExposure += copySize;
            } else {
                marketPosition[trade.conditionId] = Math.max(
                    0,
                    marketPosition[trade.conditionId] - copySize
                );
                totalExposure = Math.max(0, totalExposure - copySize);
            }
        } else {
            skippedTrades++;
        }

        backtestTrades.push({
            originalTrade: trade,
            copySize: skipped ? 0 : copySize,
            copyPrice,
            slippageCost: skipped ? 0 : slippageCost,
            feeCost: skipped ? 0 : feeCost,
            skipped,
            skipReason,
        });
    }

    // Calculate P&L
    const { grossPnl, netPnl, marketPnL } = calculateBacktestPnL(backtestTrades, totalFees, totalSlippage);

    // Calculate metrics
    const pnlValues = Object.values(marketPnL);
    const wins = pnlValues.filter((p) => p > 0);
    const losses = pnlValues.filter((p) => p < 0);

    const winRate = pnlValues.length > 0 ? (wins.length / pnlValues.length) * 100 : 0;
    const totalWins = wins.reduce((sum, p) => sum + p, 0);
    const totalLosses = Math.abs(losses.reduce((sum, p) => sum + p, 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

    // Calculate drawdown
    const maxDrawdown = calculateBacktestDrawdown(backtestTrades);

    // Calculate Sharpe ratio
    const sharpeRatio = calculateBacktestSharpe(backtestTrades);

    const netPnlPercent = totalVolume > 0 ? (netPnl / totalVolume) * 100 : 0;

    return {
        strategy,
        traderAddress,
        periodStart: sortedTrades.length > 0 ? sortedTrades[0].time : new Date(),
        periodEnd: sortedTrades.length > 0 ? sortedTrades[sortedTrades.length - 1].time : new Date(),
        totalTrades: trades.length,
        executedTrades,
        skippedTrades,
        totalVolume: Math.round(totalVolume * 100) / 100,
        totalFees: Math.round(totalFees * 100) / 100,
        totalSlippage: Math.round(totalSlippage * 100) / 100,
        grossPnl: Math.round(grossPnl * 100) / 100,
        netPnl: Math.round(netPnl * 100) / 100,
        netPnlPercent: Math.round(netPnlPercent * 100) / 100,
        winRate: Math.round(winRate * 100) / 100,
        profitFactor: profitFactor === Infinity ? Infinity : Math.round(profitFactor * 100) / 100,
        maxDrawdown: Math.round(maxDrawdown * 100) / 100,
        sharpeRatio: sharpeRatio ? Math.round(sharpeRatio * 100) / 100 : null,
        trades: backtestTrades,
    };
}

/**
 * Calculate P&L from backtest trades
 */
function calculateBacktestPnL(
    trades: BacktestTrade[],
    totalFees: number,
    totalSlippage: number
): {
    grossPnl: number;
    netPnl: number;
    marketPnL: Record<string, number>;
} {
    const marketPnL: Record<string, number> = {};

    for (const trade of trades) {
        if (trade.skipped) continue;

        const conditionId = trade.originalTrade.conditionId;
        if (!marketPnL[conditionId]) {
            marketPnL[conditionId] = 0;
        }

        if (trade.originalTrade.side === 'BUY') {
            marketPnL[conditionId] -= trade.copySize;
        } else {
            marketPnL[conditionId] += trade.copySize;
        }
    }

    const grossPnl = Object.values(marketPnL).reduce((sum, p) => sum + p, 0);
    const netPnl = grossPnl - totalFees - totalSlippage;

    return { grossPnl, netPnl, marketPnL };
}

/**
 * Calculate max drawdown from backtest trades
 */
function calculateBacktestDrawdown(trades: BacktestTrade[]): number {
    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;

    for (const trade of trades) {
        if (trade.skipped) continue;

        const pnl =
            trade.originalTrade.side === 'BUY'
                ? -trade.copySize - trade.feeCost - trade.slippageCost
                : trade.copySize - trade.feeCost - trade.slippageCost;

        equity += pnl;

        if (equity > peak) {
            peak = equity;
        }

        const drawdown = peak - equity;
        if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
        }
    }

    return maxDrawdown;
}

/**
 * Calculate Sharpe ratio from backtest trades
 */
function calculateBacktestSharpe(trades: BacktestTrade[]): number | null {
    // Group by day
    const dailyReturns: Record<string, number> = {};

    for (const trade of trades) {
        if (trade.skipped) continue;

        const dateKey = trade.originalTrade.time.toISOString().split('T')[0];
        if (!dailyReturns[dateKey]) {
            dailyReturns[dateKey] = 0;
        }

        const pnl =
            trade.originalTrade.side === 'BUY'
                ? -trade.copySize - trade.feeCost - trade.slippageCost
                : trade.copySize - trade.feeCost - trade.slippageCost;

        dailyReturns[dateKey] += pnl;
    }

    const returns = Object.values(dailyReturns);
    if (returns.length < 2) return null;

    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return null;

    return (avgReturn / stdDev) * Math.sqrt(365);
}

/**
 * Run multiple backtests with different parameters
 */
export async function runParameterSweep(
    traderAddress: string,
    baseStrategy: CopyStrategyParams,
    parameterRanges: {
        copyPercentage?: number[];
        maxOrderSize?: number[];
        slippage?: number[];
    },
    startDate?: Date,
    endDate?: Date
): Promise<BacktestResults[]> {
    const results: BacktestResults[] = [];

    const copyPercentages = parameterRanges.copyPercentage || [baseStrategy.copyPercentage];
    const maxOrderSizes = parameterRanges.maxOrderSize || [baseStrategy.maxOrderSize];
    const slippages = parameterRanges.slippage || [baseStrategy.slippage];

    for (const copyPercentage of copyPercentages) {
        for (const maxOrderSize of maxOrderSizes) {
            for (const slippage of slippages) {
                const strategy: CopyStrategyParams = {
                    ...baseStrategy,
                    copyPercentage,
                    maxOrderSize,
                    slippage,
                };

                const result = await runBacktest(traderAddress, strategy, startDate, endDate);
                results.push(result);
            }
        }
    }

    // Sort by net P&L descending
    results.sort((a, b) => b.netPnl - a.netPnl);

    return results;
}

/**
 * Compare backtests across multiple traders
 */
export async function compareTraderBacktests(
    traderAddresses: string[],
    strategy: CopyStrategyParams,
    startDate?: Date,
    endDate?: Date
): Promise<BacktestResults[]> {
    const results: BacktestResults[] = [];

    for (const address of traderAddresses) {
        const result = await runBacktest(address, strategy, startDate, endDate);
        results.push(result);
    }

    // Sort by net P&L descending
    results.sort((a, b) => b.netPnl - a.netPnl);

    return results;
}

/**
 * Generate a summary report of backtest results
 */
export function generateBacktestReport(results: BacktestResults): string {
    const lines: string[] = [
        '═══════════════════════════════════════════════════════════',
        '                    BACKTEST REPORT',
        '═══════════════════════════════════════════════════════════',
        '',
        '📊 STRATEGY PARAMETERS',
        '───────────────────────────────────────────────────────────',
        `  Copy Percentage:    ${results.strategy.copyPercentage}%`,
        `  Max Order Size:     $${results.strategy.maxOrderSize}`,
        `  Min Order Size:     $${results.strategy.minOrderSize}`,
        `  Slippage:           ${results.strategy.slippage * 100}%`,
        `  Trading Fee:        ${results.strategy.tradingFee * 100}%`,
        '',
        '📈 PERFORMANCE SUMMARY',
        '───────────────────────────────────────────────────────────',
        `  Trader:             ${results.traderAddress.slice(0, 6)}...${results.traderAddress.slice(-4)}`,
        `  Period:             ${results.periodStart.toISOString().split('T')[0]} to ${results.periodEnd.toISOString().split('T')[0]}`,
        `  Total Trades:       ${results.totalTrades}`,
        `  Executed:           ${results.executedTrades}`,
        `  Skipped:            ${results.skippedTrades}`,
        '',
        '💰 PROFIT & LOSS',
        '───────────────────────────────────────────────────────────',
        `  Total Volume:       $${results.totalVolume.toLocaleString()}`,
        `  Total Fees:         $${results.totalFees.toLocaleString()}`,
        `  Total Slippage:     $${results.totalSlippage.toLocaleString()}`,
        `  Gross P&L:          $${results.grossPnl.toLocaleString()}`,
        `  Net P&L:            $${results.netPnl.toLocaleString()} (${results.netPnlPercent}%)`,
        '',
        '📉 RISK METRICS',
        '───────────────────────────────────────────────────────────',
        `  Win Rate:           ${results.winRate}%`,
        `  Profit Factor:      ${results.profitFactor === Infinity ? '∞' : results.profitFactor}`,
        `  Max Drawdown:       $${results.maxDrawdown.toLocaleString()}`,
        `  Sharpe Ratio:       ${results.sharpeRatio ?? 'N/A'}`,
        '',
        '═══════════════════════════════════════════════════════════',
    ];

    return lines.join('\n');
}
