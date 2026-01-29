import timescaleService, { TradeRecord } from '../services/timescaleService';

/**
 * Detailed trader performance metrics
 */
export interface TraderMetrics {
    traderAddress: string;
    totalTrades: number;
    buyTrades: number;
    sellTrades: number;
    totalVolume: number;
    buyVolume: number;
    sellVolume: number;
    avgTradeSize: number;
    uniqueMarkets: number;
    winRate: number;
    profitFactor: number;
    realizedPnl: number;
    largestWin: number;
    largestLoss: number;
    avgWin: number;
    avgLoss: number;
    consecutiveWins: number;
    consecutiveLosses: number;
    sharpeRatio: number | null;
    periodStart: Date;
    periodEnd: Date;
}

/**
 * Market-level performance for a trader
 */
export interface MarketPerformance {
    conditionId: string;
    marketTitle: string;
    tradeCount: number;
    buyVolume: number;
    sellVolume: number;
    realizedPnl: number;
    avgPrice: number;
    firstTrade: Date;
    lastTrade: Date;
}

/**
 * Calculate comprehensive trader performance metrics
 */
export async function calculateTraderMetrics(
    traderAddress: string,
    startDate?: Date,
    endDate?: Date
): Promise<TraderMetrics | null> {
    const trades = await timescaleService.getTradeHistory({
        traderAddress,
        startDate,
        endDate,
        limit: 10000, // Get all trades for calculation
    });

    if (trades.length === 0) {
        return null;
    }

    // Basic counts
    const buyTrades = trades.filter((t) => t.side === 'BUY');
    const sellTrades = trades.filter((t) => t.side === 'SELL');

    // Volume calculations
    const buyVolume = buyTrades.reduce((sum, t) => sum + (t.usdcSize || 0), 0);
    const sellVolume = sellTrades.reduce((sum, t) => sum + (t.usdcSize || 0), 0);
    const totalVolume = buyVolume + sellVolume;

    // Unique markets
    const uniqueMarkets = new Set(trades.map((t) => t.conditionId)).size;

    // Calculate P&L per market (simplified - buy negative, sell positive)
    const marketPnL = calculateMarketPnL(trades);
    const pnlValues = Object.values(marketPnL);

    const wins = pnlValues.filter((p) => p > 0);
    const losses = pnlValues.filter((p) => p < 0);

    const winRate = pnlValues.length > 0 ? (wins.length / pnlValues.length) * 100 : 0;
    const realizedPnl = pnlValues.reduce((sum, p) => sum + p, 0);

    const totalWins = wins.reduce((sum, p) => sum + p, 0);
    const totalLosses = Math.abs(losses.reduce((sum, p) => sum + p, 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

    // Calculate consecutive streaks
    const { consecutiveWins, consecutiveLosses } = calculateStreaks(pnlValues);

    // Calculate Sharpe ratio (annualized, assuming daily returns)
    const sharpeRatio = calculateSharpeRatio(trades);

    return {
        traderAddress,
        totalTrades: trades.length,
        buyTrades: buyTrades.length,
        sellTrades: sellTrades.length,
        totalVolume,
        buyVolume,
        sellVolume,
        avgTradeSize: totalVolume / trades.length,
        uniqueMarkets,
        winRate,
        profitFactor,
        realizedPnl,
        largestWin: wins.length > 0 ? Math.max(...wins) : 0,
        largestLoss: losses.length > 0 ? Math.min(...losses) : 0,
        avgWin: wins.length > 0 ? totalWins / wins.length : 0,
        avgLoss: losses.length > 0 ? totalLosses / losses.length : 0,
        consecutiveWins,
        consecutiveLosses,
        sharpeRatio,
        periodStart: trades[trades.length - 1].time,
        periodEnd: trades[0].time,
    };
}

/**
 * Calculate P&L per market (conditionId)
 * Simplified: BUY = -usdcSize, SELL = +usdcSize
 */
function calculateMarketPnL(trades: TradeRecord[]): Record<string, number> {
    const marketPnL: Record<string, number> = {};

    for (const trade of trades) {
        const conditionId = trade.conditionId;
        if (!marketPnL[conditionId]) {
            marketPnL[conditionId] = 0;
        }

        const value = trade.usdcSize || 0;
        if (trade.side === 'BUY') {
            marketPnL[conditionId] -= value;
        } else {
            marketPnL[conditionId] += value;
        }
    }

    return marketPnL;
}

/**
 * Calculate consecutive win/loss streaks
 */
function calculateStreaks(pnlValues: number[]): { consecutiveWins: number; consecutiveLosses: number } {
    let maxWins = 0;
    let maxLosses = 0;
    let currentWins = 0;
    let currentLosses = 0;

    for (const pnl of pnlValues) {
        if (pnl > 0) {
            currentWins++;
            currentLosses = 0;
            maxWins = Math.max(maxWins, currentWins);
        } else if (pnl < 0) {
            currentLosses++;
            currentWins = 0;
            maxLosses = Math.max(maxLosses, currentLosses);
        }
    }

    return { consecutiveWins: maxWins, consecutiveLosses: maxLosses };
}

/**
 * Calculate Sharpe ratio (simplified, assuming risk-free rate of 0)
 */
function calculateSharpeRatio(trades: TradeRecord[]): number | null {
    if (trades.length < 2) return null;

    // Group trades by day
    const dailyReturns: Record<string, number> = {};

    for (const trade of trades) {
        const dateKey = trade.time.toISOString().split('T')[0];
        if (!dailyReturns[dateKey]) {
            dailyReturns[dateKey] = 0;
        }

        const value = trade.usdcSize || 0;
        if (trade.side === 'BUY') {
            dailyReturns[dateKey] -= value;
        } else {
            dailyReturns[dateKey] += value;
        }
    }

    const returns = Object.values(dailyReturns);
    if (returns.length < 2) return null;

    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return null;

    // Annualized (assuming 365 trading days)
    return (avgReturn / stdDev) * Math.sqrt(365);
}

/**
 * Get performance breakdown by market
 */
export async function getMarketPerformance(
    traderAddress: string,
    startDate?: Date,
    endDate?: Date
): Promise<MarketPerformance[]> {
    const trades = await timescaleService.getTradeHistory({
        traderAddress,
        startDate,
        endDate,
        limit: 10000,
    });

    // Group by market
    const marketData: Record<
        string,
        {
            title: string;
            trades: TradeRecord[];
        }
    > = {};

    for (const trade of trades) {
        const conditionId = trade.conditionId;
        if (!marketData[conditionId]) {
            marketData[conditionId] = {
                title: trade.marketTitle || 'Unknown Market',
                trades: [],
            };
        }
        marketData[conditionId].trades.push(trade);
    }

    // Calculate metrics per market
    const results: MarketPerformance[] = [];

    for (const [conditionId, data] of Object.entries(marketData)) {
        const marketTrades = data.trades;
        const buyTrades = marketTrades.filter((t) => t.side === 'BUY');
        const sellTrades = marketTrades.filter((t) => t.side === 'SELL');

        const buyVolume = buyTrades.reduce((sum, t) => sum + (t.usdcSize || 0), 0);
        const sellVolume = sellTrades.reduce((sum, t) => sum + (t.usdcSize || 0), 0);
        const realizedPnl = sellVolume - buyVolume;

        const prices = marketTrades.map((t) => t.price || 0).filter((p) => p > 0);
        const avgPrice = prices.length > 0 ? prices.reduce((sum, p) => sum + p, 0) / prices.length : 0;

        // Sort by time to get first/last
        marketTrades.sort((a, b) => a.time.getTime() - b.time.getTime());

        results.push({
            conditionId,
            marketTitle: data.title,
            tradeCount: marketTrades.length,
            buyVolume,
            sellVolume,
            realizedPnl,
            avgPrice,
            firstTrade: marketTrades[0].time,
            lastTrade: marketTrades[marketTrades.length - 1].time,
        });
    }

    // Sort by P&L descending
    results.sort((a, b) => b.realizedPnl - a.realizedPnl);

    return results;
}

/**
 * Compare multiple traders' performance
 */
export async function compareTraders(
    traderAddresses: string[],
    startDate?: Date,
    endDate?: Date
): Promise<TraderMetrics[]> {
    const metrics: TraderMetrics[] = [];

    for (const address of traderAddresses) {
        const traderMetrics = await calculateTraderMetrics(address, startDate, endDate);
        if (traderMetrics) {
            metrics.push(traderMetrics);
        }
    }

    // Sort by realized P&L descending
    metrics.sort((a, b) => b.realizedPnl - a.realizedPnl);

    return metrics;
}
