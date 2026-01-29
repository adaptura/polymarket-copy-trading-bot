import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

interface AllocationInput {
  traderAddress: string;
  percentage: number;
}

interface PortfolioMetrics {
  window: string;
  maxDrawdown: number;
  cagr: number;
  totalPnL: number;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number | null;
}

/**
 * POST /api/calculator
 *
 * Calculate portfolio metrics for given allocations and time windows
 * Uses percentage returns from each trader weighted by allocation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { allocations, windows, initialCapital = 100000 } = body as {
      allocations: AllocationInput[];
      windows: string[];
      initialCapital?: number;
    };

    if (!allocations || allocations.length === 0) {
      return NextResponse.json(
        { error: "At least one allocation is required" },
        { status: 400 }
      );
    }

    if (!windows || windows.length === 0) {
      return NextResponse.json(
        { error: "At least one window is required" },
        { status: 400 }
      );
    }

    // Parse window to interval
    const windowToInterval = (window: string): string => {
      const match = window.match(/^(\d+)([dmyh])$/);
      if (!match) return "30 days";
      const [, num, unit] = match;
      const units: Record<string, string> = {
        h: "hours",
        d: "days",
        m: "months",
        y: "years",
      };
      return `${num} ${units[unit] || "days"}`;
    };

    const results: PortfolioMetrics[] = [];

    for (const window of windows) {
      const interval = windowToInterval(window);

      // Get daily P&L changes for each trader (absolute dollar amounts)
      const portfolioQuery = await pool.query<{
        day: Date;
        weighted_daily_pnl: string;
      }>(
        `
        WITH trader_daily AS (
          -- Get one value per day per trader (last value of the day)
          SELECT DISTINCT ON (trader_address, DATE_TRUNC('day', time))
            DATE_TRUNC('day', time) AS day,
            trader_address,
            total_pnl
          FROM pnl_snapshots
          WHERE time >= NOW() - $1::INTERVAL
            AND trader_address = ANY($2::text[])
          ORDER BY trader_address, DATE_TRUNC('day', time), time DESC
        ),
        trader_with_prev AS (
          SELECT
            day,
            trader_address,
            total_pnl,
            LAG(total_pnl) OVER (PARTITION BY trader_address ORDER BY day) AS prev_pnl
          FROM trader_daily
        ),
        trader_returns AS (
          -- Calculate daily P&L change (absolute dollars)
          SELECT
            day,
            trader_address,
            CASE
              WHEN prev_pnl IS NULL THEN 0
              ELSE total_pnl - prev_pnl
            END AS daily_pnl_change
          FROM trader_with_prev
        ),
        weighted_returns AS (
          -- Weight each trader's daily P&L change by their allocation percentage
          SELECT
            t.day,
            SUM(t.daily_pnl_change * (a.percentage / 100.0)) AS weighted_daily_pnl
          FROM trader_returns t
          JOIN (
            SELECT unnest($2::text[]) AS address, unnest($3::float[]) AS percentage
          ) a ON t.trader_address = a.address
          WHERE t.daily_pnl_change IS NOT NULL
          GROUP BY t.day
          ORDER BY t.day
        )
        SELECT
          day,
          weighted_daily_pnl
        FROM weighted_returns
        ORDER BY day
        `,
        [
          interval,
          allocations.map((a) => a.traderAddress.toLowerCase()),
          allocations.map((a) => a.percentage),
        ]
      );

      const dailyPnLChanges = portfolioQuery.rows.map((r) => parseFloat(r.weighted_daily_pnl));

      if (dailyPnLChanges.length === 0) {
        results.push({
          window,
          maxDrawdown: 0,
          cagr: 0,
          totalPnL: 0,
          sharpeRatio: null,
          sortinoRatio: null,
          winRate: 0,
          avgWin: 0,
          avgLoss: 0,
          profitFactor: null,
        });
        continue;
      }

      // Build equity curve by ADDING scaled P&L changes (not compounding)
      // Scale factor: user's capital / $1M reference
      const scaleFactor = initialCapital / 1000000;
      const equityCurve: number[] = [initialCapital];
      let equity = initialCapital;

      for (const dailyPnL of dailyPnLChanges) {
        // Add scaled P&L change to equity (additive, not multiplicative)
        equity += dailyPnL * scaleFactor;
        equityCurve.push(equity);
      }

      // Calculate metrics from equity curve
      const totalPnL = equity - initialCapital;
      const totalReturn = (equity / initialCapital - 1) * 100;

      // Calculate daily percentage returns FROM the equity curve (for Sharpe, etc.)
      const dailyPctReturns: number[] = [];
      for (let i = 1; i < equityCurve.length; i++) {
        const pctReturn = ((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]) * 100;
        dailyPctReturns.push(pctReturn);
      }

      // Win rate
      const wins = dailyPctReturns.filter((r) => r > 0);
      const losses = dailyPctReturns.filter((r) => r < 0);
      const winRate = dailyPctReturns.length > 0
        ? (wins.length / dailyPctReturns.length) * 100
        : 0;

      // Avg win/loss (in dollars)
      const avgWin = wins.length > 0
        ? (wins.reduce((a, b) => a + b, 0) / wins.length) * initialCapital / 100
        : 0;
      const avgLoss = losses.length > 0
        ? (losses.reduce((a, b) => a + b, 0) / losses.length) * initialCapital / 100
        : 0;

      // Profit factor
      const grossWins = wins.reduce((a, b) => a + b, 0);
      const grossLosses = Math.abs(losses.reduce((a, b) => a + b, 0));
      const profitFactor = grossLosses > 0 ? grossWins / grossLosses : null;

      // Max drawdown from equity curve
      let maxDrawdown = 0;
      let peak = equityCurve[0];
      for (const value of equityCurve) {
        if (value > peak) peak = value;
        const drawdown = peak > 0 ? ((peak - value) / peak) * 100 : 0;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }

      // Sharpe ratio (annualized)
      const meanReturn = dailyPctReturns.length > 0
        ? dailyPctReturns.reduce((a, b) => a + b, 0) / dailyPctReturns.length
        : 0;
      const variance = dailyPctReturns.length > 0
        ? dailyPctReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / dailyPctReturns.length
        : 0;
      const stdDev = Math.sqrt(variance);
      const sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(252) : null;

      // Sortino ratio (annualized)
      const negativeReturns = dailyPctReturns.filter((r) => r < 0);
      const downsideVariance = negativeReturns.length > 0
        ? negativeReturns.reduce((sum, r) => sum + r * r, 0) / negativeReturns.length
        : 0;
      const downsideDev = Math.sqrt(downsideVariance);
      const sortinoRatio = downsideDev > 0 ? (meanReturn / downsideDev) * Math.sqrt(252) : null;

      // CAGR - calculated from the equity curve built from percentage returns
      const daysInPeriod = dailyPctReturns.length;
      const years = daysInPeriod / 365;
      const cagr = years > 0 && initialCapital > 0 && equity > 0
        ? (Math.pow(equity / initialCapital, 1 / years) - 1) * 100
        : totalReturn;

      results.push({
        window,
        maxDrawdown: -maxDrawdown,
        cagr: Math.min(cagr, 99999), // Cap at reasonable value
        totalPnL,
        sharpeRatio,
        sortinoRatio,
        winRate,
        avgWin,
        avgLoss,
        profitFactor,
      });
    }

    return NextResponse.json({ metrics: results });
  } catch (error) {
    console.error("Calculator error:", error);
    return NextResponse.json(
      { error: "Failed to calculate metrics" },
      { status: 500 }
    );
  }
}
