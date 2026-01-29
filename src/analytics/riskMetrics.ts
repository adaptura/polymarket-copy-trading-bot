import timescaleService, { TradeRecord } from '../services/timescaleService';

/**
 * Risk metrics for a trader
 */
export interface RiskMetrics {
    traderAddress: string;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    avgDrawdown: number;
    recoveryFactor: number;
    valueAtRisk: number; // 95% VaR
    expectedShortfall: number; // CVaR
    volatility: number;
    sortinoRatio: number | null;
    calmarRatio: number | null;
    ulcerIndex: number;
    currentExposure: number;
    peakExposure: number;
    periodStart: Date;
    periodEnd: Date;
}

/**
 * Position concentration metrics
 */
export interface ConcentrationMetrics {
    herfindahlIndex: number; // 0-1, higher = more concentrated
    top3MarketsShare: number; // % of volume in top 3 markets
    avgPositionSize: number;
    maxPositionSize: number;
    positionCount: number;
}

/**
 * Daily return data point
 */
interface DailyReturn {
    date: Date;
    return: number;
    cumulativeReturn: number;
}

/**
 * Calculate comprehensive risk metrics
 */
export async function calculateRiskMetrics(
    traderAddress: string,
    startDate?: Date,
    endDate?: Date
): Promise<RiskMetrics | null> {
    const trades = await timescaleService.getTradeHistory({
        traderAddress,
        startDate,
        endDate,
        limit: 10000,
    });

    if (trades.length === 0) {
        return null;
    }

    // Calculate daily returns
    const dailyReturns = calculateDailyReturns(trades);

    if (dailyReturns.length < 2) {
        return null;
    }

    // Calculate drawdown series
    const { maxDrawdown, maxDrawdownPercent, avgDrawdown, ulcerIndex } = calculateDrawdowns(dailyReturns);

    // Calculate VaR and Expected Shortfall (95%)
    const returns = dailyReturns.map((d) => d.return);
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const varIndex = Math.floor(sortedReturns.length * 0.05);
    const valueAtRisk = Math.abs(sortedReturns[varIndex] || 0);
    const expectedShortfall =
        Math.abs(
            sortedReturns.slice(0, varIndex + 1).reduce((sum, r) => sum + r, 0) / (varIndex + 1 || 1)
        ) || 0;

    // Calculate volatility (standard deviation of daily returns)
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);

    // Calculate Sortino ratio (using only downside deviation)
    const negativeReturns = returns.filter((r) => r < 0);
    const downsideVariance =
        negativeReturns.length > 0
            ? negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length
            : 0;
    const downsideDeviation = Math.sqrt(downsideVariance);
    const sortinoRatio = downsideDeviation > 0 ? (avgReturn / downsideDeviation) * Math.sqrt(365) : null;

    // Calculate Calmar ratio (return / max drawdown)
    const totalReturn = dailyReturns[dailyReturns.length - 1].cumulativeReturn;
    const calmarRatio = maxDrawdown > 0 ? totalReturn / maxDrawdown : null;

    // Recovery factor (total profit / max drawdown)
    const totalProfit = Math.max(0, totalReturn);
    const recoveryFactor = maxDrawdown > 0 ? totalProfit / maxDrawdown : 0;

    // Calculate current and peak exposure
    const { currentExposure, peakExposure } = calculateExposure(trades);

    return {
        traderAddress,
        maxDrawdown: Math.round(maxDrawdown * 100) / 100,
        maxDrawdownPercent: Math.round(maxDrawdownPercent * 100) / 100,
        avgDrawdown: Math.round(avgDrawdown * 100) / 100,
        recoveryFactor: Math.round(recoveryFactor * 100) / 100,
        valueAtRisk: Math.round(valueAtRisk * 100) / 100,
        expectedShortfall: Math.round(expectedShortfall * 100) / 100,
        volatility: Math.round(volatility * 100) / 100,
        sortinoRatio: sortinoRatio ? Math.round(sortinoRatio * 100) / 100 : null,
        calmarRatio: calmarRatio ? Math.round(calmarRatio * 100) / 100 : null,
        ulcerIndex: Math.round(ulcerIndex * 100) / 100,
        currentExposure: Math.round(currentExposure * 100) / 100,
        peakExposure: Math.round(peakExposure * 100) / 100,
        periodStart: trades[trades.length - 1].time,
        periodEnd: trades[0].time,
    };
}

/**
 * Calculate daily returns from trades
 */
function calculateDailyReturns(trades: TradeRecord[]): DailyReturn[] {
    // Group trades by day
    const dailyPnL: Record<string, number> = {};

    for (const trade of trades) {
        const dateKey = trade.time.toISOString().split('T')[0];
        if (!dailyPnL[dateKey]) {
            dailyPnL[dateKey] = 0;
        }

        const value = trade.usdcSize || 0;
        dailyPnL[dateKey] += trade.side === 'BUY' ? -value : value;
    }

    // Convert to sorted array
    const sortedDates = Object.keys(dailyPnL).sort();
    let cumulative = 0;

    return sortedDates.map((dateStr) => {
        const ret = dailyPnL[dateStr];
        cumulative += ret;
        return {
            date: new Date(dateStr),
            return: ret,
            cumulativeReturn: cumulative,
        };
    });
}

/**
 * Calculate drawdown metrics
 */
function calculateDrawdowns(dailyReturns: DailyReturn[]): {
    maxDrawdown: number;
    maxDrawdownPercent: number;
    avgDrawdown: number;
    ulcerIndex: number;
} {
    let peak = 0;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    const drawdowns: number[] = [];
    const drawdownPercents: number[] = [];

    for (const day of dailyReturns) {
        if (day.cumulativeReturn > peak) {
            peak = day.cumulativeReturn;
        }

        const drawdown = peak - day.cumulativeReturn;
        const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;

        drawdowns.push(drawdown);
        drawdownPercents.push(drawdownPercent);

        if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
            maxDrawdownPercent = drawdownPercent;
        }
    }

    const avgDrawdown = drawdowns.length > 0 ? drawdowns.reduce((sum, d) => sum + d, 0) / drawdowns.length : 0;

    // Ulcer Index: sqrt(mean of squared drawdown percentages)
    const sumSquaredDD = drawdownPercents.reduce((sum, d) => sum + d * d, 0);
    const ulcerIndex = Math.sqrt(sumSquaredDD / drawdownPercents.length);

    return {
        maxDrawdown,
        maxDrawdownPercent,
        avgDrawdown,
        ulcerIndex,
    };
}

/**
 * Calculate exposure metrics
 */
function calculateExposure(trades: TradeRecord[]): {
    currentExposure: number;
    peakExposure: number;
} {
    // Track running exposure by market
    const marketExposure: Record<string, number> = {};
    let peakExposure = 0;

    // Sort by time ascending
    const sortedTrades = [...trades].sort((a, b) => a.time.getTime() - b.time.getTime());

    for (const trade of sortedTrades) {
        const conditionId = trade.conditionId;
        if (!marketExposure[conditionId]) {
            marketExposure[conditionId] = 0;
        }

        const value = trade.usdcSize || 0;
        if (trade.side === 'BUY') {
            marketExposure[conditionId] += value;
        } else {
            marketExposure[conditionId] = Math.max(0, marketExposure[conditionId] - value);
        }

        // Calculate total exposure
        const totalExposure = Object.values(marketExposure).reduce((sum, e) => sum + e, 0);
        peakExposure = Math.max(peakExposure, totalExposure);
    }

    const currentExposure = Object.values(marketExposure).reduce((sum, e) => sum + e, 0);

    return { currentExposure, peakExposure };
}

/**
 * Calculate position concentration metrics
 */
export async function calculateConcentrationMetrics(
    traderAddress: string,
    startDate?: Date,
    endDate?: Date
): Promise<ConcentrationMetrics | null> {
    const trades = await timescaleService.getTradeHistory({
        traderAddress,
        startDate,
        endDate,
        limit: 10000,
    });

    if (trades.length === 0) {
        return null;
    }

    // Calculate volume per market
    const marketVolume: Record<string, number> = {};

    for (const trade of trades) {
        const conditionId = trade.conditionId;
        if (!marketVolume[conditionId]) {
            marketVolume[conditionId] = 0;
        }
        marketVolume[conditionId] += trade.usdcSize || 0;
    }

    const volumes = Object.values(marketVolume);
    const totalVolume = volumes.reduce((sum, v) => sum + v, 0);

    if (totalVolume === 0) {
        return null;
    }

    // Calculate Herfindahl Index (sum of squared market shares)
    const herfindahlIndex = volumes.reduce((sum, v) => {
        const share = v / totalVolume;
        return sum + share * share;
    }, 0);

    // Top 3 markets share
    const sortedVolumes = [...volumes].sort((a, b) => b - a);
    const top3Volume = sortedVolumes.slice(0, 3).reduce((sum, v) => sum + v, 0);
    const top3MarketsShare = (top3Volume / totalVolume) * 100;

    // Position sizes (buy volume per market)
    const positionSizes = volumes;
    const avgPositionSize = totalVolume / volumes.length;
    const maxPositionSize = Math.max(...positionSizes);

    return {
        herfindahlIndex: Math.round(herfindahlIndex * 1000) / 1000,
        top3MarketsShare: Math.round(top3MarketsShare * 100) / 100,
        avgPositionSize: Math.round(avgPositionSize * 100) / 100,
        maxPositionSize: Math.round(maxPositionSize * 100) / 100,
        positionCount: volumes.length,
    };
}

/**
 * Calculate rolling risk metrics over time
 */
export async function calculateRollingRisk(
    traderAddress: string,
    windowDays: number = 7,
    startDate?: Date,
    endDate?: Date
): Promise<
    Array<{
        date: Date;
        volatility: number;
        drawdown: number;
        sharpeRatio: number | null;
    }>
> {
    const trades = await timescaleService.getTradeHistory({
        traderAddress,
        startDate,
        endDate,
        limit: 10000,
    });

    if (trades.length === 0) {
        return [];
    }

    // Calculate daily returns
    const dailyReturns = calculateDailyReturns(trades);

    if (dailyReturns.length < windowDays) {
        return [];
    }

    const results: Array<{
        date: Date;
        volatility: number;
        drawdown: number;
        sharpeRatio: number | null;
    }> = [];

    for (let i = windowDays - 1; i < dailyReturns.length; i++) {
        const window = dailyReturns.slice(i - windowDays + 1, i + 1);
        const returns = window.map((d) => d.return);

        // Volatility
        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
        const volatility = Math.sqrt(variance);

        // Drawdown in window
        let peak = window[0].cumulativeReturn;
        let maxDD = 0;
        for (const day of window) {
            if (day.cumulativeReturn > peak) peak = day.cumulativeReturn;
            maxDD = Math.max(maxDD, peak - day.cumulativeReturn);
        }

        // Sharpe ratio
        const sharpeRatio = volatility > 0 ? (avgReturn / volatility) * Math.sqrt(365) : null;

        results.push({
            date: dailyReturns[i].date,
            volatility: Math.round(volatility * 100) / 100,
            drawdown: Math.round(maxDD * 100) / 100,
            sharpeRatio: sharpeRatio ? Math.round(sharpeRatio * 100) / 100 : null,
        });
    }

    return results;
}
