import timescaleService, { TradeRecord } from '../services/timescaleService';

/**
 * Time-based trading pattern
 */
export interface TimePattern {
    hourOfDay: number;
    dayOfWeek: number;
    tradeCount: number;
    avgVolume: number;
    buyRatio: number;
    avgPnl: number;
}

/**
 * Volume correlation data
 */
export interface VolumeCorrelation {
    smallTrades: { count: number; avgPnl: number; winRate: number };
    mediumTrades: { count: number; avgPnl: number; winRate: number };
    largeTrades: { count: number; avgPnl: number; winRate: number };
}

/**
 * Market preference pattern
 */
export interface MarketPreference {
    marketType: string;
    tradeCount: number;
    volume: number;
    avgPnl: number;
    winRate: number;
}

/**
 * Trading behavior summary
 */
export interface TradingBehavior {
    avgTimeBetweenTrades: number; // minutes
    tradingFrequency: number; // trades per day
    preferredHours: number[];
    preferredDays: number[];
    avgHoldTime: number | null; // minutes (if calculable)
    scalperScore: number; // 0-100, higher = more scalping behavior
    swingScore: number; // 0-100, higher = more swing trading behavior
}

/**
 * Analyze time-based trading patterns
 */
export async function analyzeTimePatterns(
    traderAddress: string,
    startDate?: Date,
    endDate?: Date
): Promise<TimePattern[]> {
    const trades = await timescaleService.getTradeHistory({
        traderAddress,
        startDate,
        endDate,
        limit: 10000,
    });

    if (trades.length === 0) {
        return [];
    }

    // Group by hour and day
    const patterns: Record<string, { trades: TradeRecord[] }> = {};

    for (const trade of trades) {
        const hour = trade.time.getUTCHours();
        const day = trade.time.getUTCDay();
        const key = `${hour}-${day}`;

        if (!patterns[key]) {
            patterns[key] = { trades: [] };
        }
        patterns[key].trades.push(trade);
    }

    // Calculate metrics for each time slot
    const results: TimePattern[] = [];

    for (const [key, data] of Object.entries(patterns)) {
        const [hour, day] = key.split('-').map(Number);
        const slotTrades = data.trades;

        const buyTrades = slotTrades.filter((t) => t.side === 'BUY');
        const totalVolume = slotTrades.reduce((sum, t) => sum + (t.usdcSize || 0), 0);

        // Calculate P&L per market in this time slot
        const marketPnL: Record<string, number> = {};
        for (const trade of slotTrades) {
            if (!marketPnL[trade.conditionId]) {
                marketPnL[trade.conditionId] = 0;
            }
            const value = trade.usdcSize || 0;
            marketPnL[trade.conditionId] += trade.side === 'BUY' ? -value : value;
        }
        const avgPnl =
            Object.values(marketPnL).reduce((sum, p) => sum + p, 0) / Object.keys(marketPnL).length || 0;

        results.push({
            hourOfDay: hour,
            dayOfWeek: day,
            tradeCount: slotTrades.length,
            avgVolume: totalVolume / slotTrades.length,
            buyRatio: slotTrades.length > 0 ? buyTrades.length / slotTrades.length : 0,
            avgPnl,
        });
    }

    // Sort by trade count descending
    results.sort((a, b) => b.tradeCount - a.tradeCount);

    return results;
}

/**
 * Analyze volume-based correlations
 */
export async function analyzeVolumeCorrelations(
    traderAddress: string,
    startDate?: Date,
    endDate?: Date
): Promise<VolumeCorrelation> {
    const trades = await timescaleService.getTradeHistory({
        traderAddress,
        startDate,
        endDate,
        limit: 10000,
    });

    // Define volume thresholds
    const smallThreshold = 50; // < $50
    const largeThreshold = 500; // > $500

    const categories = {
        small: [] as TradeRecord[],
        medium: [] as TradeRecord[],
        large: [] as TradeRecord[],
    };

    for (const trade of trades) {
        const volume = trade.usdcSize || 0;
        if (volume < smallThreshold) {
            categories.small.push(trade);
        } else if (volume > largeThreshold) {
            categories.large.push(trade);
        } else {
            categories.medium.push(trade);
        }
    }

    const calculateCategoryMetrics = (categoryTrades: TradeRecord[]) => {
        if (categoryTrades.length === 0) {
            return { count: 0, avgPnl: 0, winRate: 0 };
        }

        // Group by market
        const marketPnL: Record<string, number> = {};
        for (const trade of categoryTrades) {
            if (!marketPnL[trade.conditionId]) {
                marketPnL[trade.conditionId] = 0;
            }
            const value = trade.usdcSize || 0;
            marketPnL[trade.conditionId] += trade.side === 'BUY' ? -value : value;
        }

        const pnlValues = Object.values(marketPnL);
        const wins = pnlValues.filter((p) => p > 0);

        return {
            count: categoryTrades.length,
            avgPnl: pnlValues.length > 0 ? pnlValues.reduce((sum, p) => sum + p, 0) / pnlValues.length : 0,
            winRate: pnlValues.length > 0 ? (wins.length / pnlValues.length) * 100 : 0,
        };
    };

    return {
        smallTrades: calculateCategoryMetrics(categories.small),
        mediumTrades: calculateCategoryMetrics(categories.medium),
        largeTrades: calculateCategoryMetrics(categories.large),
    };
}

/**
 * Analyze trading behavior patterns
 */
export async function analyzeTradingBehavior(
    traderAddress: string,
    startDate?: Date,
    endDate?: Date
): Promise<TradingBehavior> {
    const trades = await timescaleService.getTradeHistory({
        traderAddress,
        startDate,
        endDate,
        limit: 10000,
    });

    if (trades.length === 0) {
        return {
            avgTimeBetweenTrades: 0,
            tradingFrequency: 0,
            preferredHours: [],
            preferredDays: [],
            avgHoldTime: null,
            scalperScore: 0,
            swingScore: 0,
        };
    }

    // Sort by time ascending
    const sortedTrades = [...trades].sort((a, b) => a.time.getTime() - b.time.getTime());

    // Calculate time between trades
    const timeDiffs: number[] = [];
    for (let i = 1; i < sortedTrades.length; i++) {
        const diff = (sortedTrades[i].time.getTime() - sortedTrades[i - 1].time.getTime()) / (1000 * 60);
        timeDiffs.push(diff);
    }
    const avgTimeBetweenTrades =
        timeDiffs.length > 0 ? timeDiffs.reduce((sum, d) => sum + d, 0) / timeDiffs.length : 0;

    // Calculate trading frequency (trades per day)
    const firstTrade = sortedTrades[0].time;
    const lastTrade = sortedTrades[sortedTrades.length - 1].time;
    const daysDiff = Math.max(1, (lastTrade.getTime() - firstTrade.getTime()) / (1000 * 60 * 60 * 24));
    const tradingFrequency = trades.length / daysDiff;

    // Find preferred hours
    const hourCounts: Record<number, number> = {};
    for (const trade of trades) {
        const hour = trade.time.getUTCHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
    const avgHourCount = trades.length / 24;
    const preferredHours = Object.entries(hourCounts)
        .filter(([, count]) => count > avgHourCount * 1.5)
        .map(([hour]) => parseInt(hour))
        .sort((a, b) => a - b);

    // Find preferred days
    const dayCounts: Record<number, number> = {};
    for (const trade of trades) {
        const day = trade.time.getUTCDay();
        dayCounts[day] = (dayCounts[day] || 0) + 1;
    }
    const avgDayCount = trades.length / 7;
    const preferredDays = Object.entries(dayCounts)
        .filter(([, count]) => count > avgDayCount * 1.2)
        .map(([day]) => parseInt(day))
        .sort((a, b) => a - b);

    // Calculate scalper vs swing trader score
    // Scalper: many trades, small time between, quick exits
    // Swing: fewer trades, longer hold times

    // Score based on trading frequency (higher = more scalping)
    const freqScore = Math.min(100, tradingFrequency * 10);

    // Score based on time between trades (lower time = more scalping)
    const timeScore = Math.max(0, 100 - avgTimeBetweenTrades / 10);

    const scalperScore = Math.round((freqScore + timeScore) / 2);
    const swingScore = 100 - scalperScore;

    return {
        avgTimeBetweenTrades: Math.round(avgTimeBetweenTrades),
        tradingFrequency: Math.round(tradingFrequency * 100) / 100,
        preferredHours,
        preferredDays,
        avgHoldTime: null, // Would need position tracking to calculate
        scalperScore,
        swingScore,
    };
}

/**
 * Detect momentum patterns (buying after price increase, etc.)
 */
export async function detectMomentumPatterns(
    traderAddress: string,
    startDate?: Date,
    endDate?: Date
): Promise<{
    followsMomentum: boolean;
    contrarian: boolean;
    avgPriceAtBuy: number;
    avgPriceAtSell: number;
    buyPriceVsSellPrice: number;
}> {
    const trades = await timescaleService.getTradeHistory({
        traderAddress,
        startDate,
        endDate,
        limit: 10000,
    });

    if (trades.length === 0) {
        return {
            followsMomentum: false,
            contrarian: false,
            avgPriceAtBuy: 0,
            avgPriceAtSell: 0,
            buyPriceVsSellPrice: 0,
        };
    }

    const buyPrices = trades.filter((t) => t.side === 'BUY' && t.price).map((t) => t.price!);
    const sellPrices = trades.filter((t) => t.side === 'SELL' && t.price).map((t) => t.price!);

    const avgPriceAtBuy = buyPrices.length > 0 ? buyPrices.reduce((sum, p) => sum + p, 0) / buyPrices.length : 0;
    const avgPriceAtSell =
        sellPrices.length > 0 ? sellPrices.reduce((sum, p) => sum + p, 0) / sellPrices.length : 0;

    // If buying at lower prices and selling at higher = good momentum following
    // If buying at higher prices = momentum chasing (potentially bad)
    const buyPriceVsSellPrice = avgPriceAtSell > 0 ? avgPriceAtBuy / avgPriceAtSell : 1;

    // Heuristic: if avg buy price < avg sell price, trader is contrarian (buying low)
    // if avg buy price > avg sell price, trader follows momentum (buying high)
    const contrarian = buyPriceVsSellPrice < 0.95;
    const followsMomentum = buyPriceVsSellPrice > 1.05;

    return {
        followsMomentum,
        contrarian,
        avgPriceAtBuy: Math.round(avgPriceAtBuy * 1000) / 1000,
        avgPriceAtSell: Math.round(avgPriceAtSell * 1000) / 1000,
        buyPriceVsSellPrice: Math.round(buyPriceVsSellPrice * 1000) / 1000,
    };
}
