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
 *
 * Body:
 *   - allocations: Array<{ traderAddress: string, percentage: number }>
 *   - windows: string[] (e.g., ["7d", "30d", "90d", "1y"])
 *   - initialCapital: number (optional, default 100000)
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

      // Get weighted portfolio P&L changes for each day in the window
      const portfolioQuery = await pool.query<{
        time: Date;
        weighted_pnl: string;
        daily_change: string;
      }>(
        `
        WITH trader_daily AS (
          SELECT
            DATE_TRUNC('day', time) AS day,
            trader_address,
            total_pnl,
            total_pnl - LAG(total_pnl) OVER (PARTITION BY trader_address ORDER BY time) AS daily_change
          FROM pnl_snapshots
          WHERE time >= NOW() - $1::INTERVAL
            AND trader_address = ANY($2::text[])
        ),
        weighted_changes AS (
          SELECT
            t.day,
            SUM(
              t.daily_change * (a.percentage / 100.0)
            ) AS weighted_daily_change,
            SUM(
              t.total_pnl * (a.percentage / 100.0)
            ) AS weighted_total_pnl
          FROM trader_daily t
          JOIN (
            SELECT unnest($2::text[]) AS address, unnest($3::float[]) AS percentage
          ) a ON t.trader_address = a.address
          WHERE t.daily_change IS NOT NULL
          GROUP BY t.day
          ORDER BY t.day
        )
        SELECT
          day AS time,
          weighted_total_pnl AS weighted_pnl,
          weighted_daily_change AS daily_change
        FROM weighted_changes
        ORDER BY day
        `,
        [
          interval,
          allocations.map((a) => a.traderAddress.toLowerCase()),
          allocations.map((a) => a.percentage),
        ]
      );

      const dailyChanges = portfolioQuery.rows.map((r) => parseFloat(r.daily_change));
      const pnlSeries = portfolioQuery.rows.map((r) => parseFloat(r.weighted_pnl));

      if (dailyChanges.length === 0) {
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

      // Calculate metrics
      const wins = dailyChanges.filter((c) => c > 0);
      const losses = dailyChanges.filter((c) => c < 0);
      const winRate = (wins.length / dailyChanges.length) * 100;
      const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
      const totalPnL = pnlSeries.length > 0 ? pnlSeries[pnlSeries.length - 1] : 0;

      // Profit factor
      const grossWins = wins.reduce((a, b) => a + b, 0);
      const grossLosses = Math.abs(losses.reduce((a, b) => a + b, 0));
      const profitFactor = grossLosses > 0 ? grossWins / grossLosses : null;

      // Max drawdown
      let maxDrawdown = 0;
      let peak = pnlSeries[0] || 0;
      for (const pnl of pnlSeries) {
        if (pnl > peak) peak = pnl;
        const drawdown = peak > 0 ? ((peak - pnl) / peak) * 100 : 0;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }

      // Volatility & Sharpe
      const mean = dailyChanges.reduce((a, b) => a + b, 0) / dailyChanges.length;
      const variance =
        dailyChanges.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / dailyChanges.length;
      const stdDev = Math.sqrt(variance);
      const sharpeRatio = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : null; // Annualized

      // Sortino (downside deviation)
      const negativeChanges = dailyChanges.filter((c) => c < 0);
      const downsideVariance =
        negativeChanges.length > 0
          ? negativeChanges.reduce((sum, c) => sum + c * c, 0) / negativeChanges.length
          : 0;
      const downsideDev = Math.sqrt(downsideVariance);
      const sortinoRatio = downsideDev > 0 ? (mean / downsideDev) * Math.sqrt(252) : null;

      // CAGR (annualized)
      const daysInWindow = dailyChanges.length;
      const startValue = initialCapital;
      const endValue = initialCapital + totalPnL;
      const years = daysInWindow / 365;
      const cagr =
        years > 0 && startValue > 0
          ? (Math.pow(endValue / startValue, 1 / years) - 1) * 100
          : 0;

      results.push({
        window,
        maxDrawdown: -maxDrawdown,
        cagr,
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
