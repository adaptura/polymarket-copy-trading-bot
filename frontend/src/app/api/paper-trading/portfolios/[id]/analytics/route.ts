import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * GET /api/paper-trading/portfolios/[id]/analytics
 *
 * Get analytics data for a portfolio
 *
 * Query params:
 *   - startDate?: string - ISO date for equity curve start
 *   - endDate?: string - ISO date for equity curve end
 *   - limit?: number - Max equity curve points (default: 500)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "500", 10),
      1000
    );

    // Verify portfolio exists and get basic info
    const portfolioResult = await pool.query<{
      id: string;
      name: string;
      starting_capital: string;
    }>(`SELECT id, name, starting_capital FROM paper_portfolios WHERE id = $1`, [
      id,
    ]);

    if (portfolioResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Portfolio not found" },
        { status: 404 }
      );
    }

    const portfolio = portfolioResult.rows[0];
    const startingCapital = parseFloat(portfolio.starting_capital);

    // Build equity curve query
    const equityConditions = ["portfolio_id = $1"];
    const equityParams: unknown[] = [id];
    let paramIndex = 2;

    if (startDate) {
      equityConditions.push(`time >= $${paramIndex++}`);
      equityParams.push(new Date(startDate));
    }

    if (endDate) {
      equityConditions.push(`time <= $${paramIndex++}`);
      equityParams.push(new Date(endDate));
    }

    equityParams.push(limit);

    // Get equity curve
    const equityCurveResult = await pool.query<{
      time: Date;
      cash_balance: string;
      positions_value: string;
      total_equity: string;
      total_pnl: string;
      total_pnl_percent: string;
      open_positions: number;
      trade_count: number;
    }>(
      `SELECT time, cash_balance, positions_value, total_equity, total_pnl, total_pnl_percent, open_positions, trade_count
       FROM paper_portfolio_snapshots
       WHERE ${equityConditions.join(" AND ")}
       ORDER BY time ASC
       LIMIT $${paramIndex}`,
      equityParams
    );

    const equityCurve = equityCurveResult.rows.map((row) => ({
      time: row.time,
      cashBalance: parseFloat(row.cash_balance),
      positionsValue: parseFloat(row.positions_value),
      totalEquity: parseFloat(row.total_equity),
      totalPnl: parseFloat(row.total_pnl),
      totalPnlPercent: parseFloat(row.total_pnl_percent),
      openPositions: row.open_positions,
      tradeCount: row.trade_count,
    }));

    // Get slippage stats from view
    const slippageResult = await pool.query<{
      total_trades: string;
      filled_trades: string;
      skipped_trades: string;
      avg_slippage_percent: string | null;
      median_slippage_percent: string | null;
      p95_slippage_percent: string | null;
      min_slippage_percent: string | null;
      max_slippage_percent: string | null;
      total_slippage_cost_usd: string | null;
    }>(
      `SELECT
        total_trades, filled_trades, skipped_trades,
        avg_slippage_percent, median_slippage_percent, p95_slippage_percent,
        min_slippage_percent, max_slippage_percent, total_slippage_cost_usd
      FROM paper_slippage_stats
      WHERE portfolio_id = $1`,
      [id]
    );

    let slippageStats = null;
    if (slippageResult.rows.length > 0) {
      const row = slippageResult.rows[0];
      const totalTrades = parseInt(row.total_trades, 10);
      const filledTrades = parseInt(row.filled_trades, 10);

      slippageStats = {
        totalTrades,
        filledTrades,
        skippedTrades: parseInt(row.skipped_trades, 10),
        fillRate: totalTrades > 0 ? (filledTrades / totalTrades) * 100 : 0,
        avgSlippagePercent: row.avg_slippage_percent
          ? parseFloat(row.avg_slippage_percent)
          : 0,
        medianSlippagePercent: row.median_slippage_percent
          ? parseFloat(row.median_slippage_percent)
          : 0,
        p95SlippagePercent: row.p95_slippage_percent
          ? parseFloat(row.p95_slippage_percent)
          : 0,
        minSlippagePercent: row.min_slippage_percent
          ? parseFloat(row.min_slippage_percent)
          : 0,
        maxSlippagePercent: row.max_slippage_percent
          ? parseFloat(row.max_slippage_percent)
          : 0,
        totalSlippageCostUsd: row.total_slippage_cost_usd
          ? parseFloat(row.total_slippage_cost_usd)
          : 0,
      };
    }

    // Get slippage by trader
    const slippageByTraderResult = await pool.query<{
      original_trader_address: string;
      trader_name: string;
      trade_count: string;
      avg_slippage_percent: string;
      total_volume_usd: string;
    }>(
      `SELECT original_trader_address, trader_name, trade_count, avg_slippage_percent, total_volume_usd
       FROM paper_slippage_by_trader
       WHERE portfolio_id = $1
       ORDER BY trade_count DESC`,
      [id]
    );

    const slippageByTrader = slippageByTraderResult.rows.map((row) => ({
      traderAddress: row.original_trader_address,
      traderName: row.trader_name,
      tradeCount: parseInt(row.trade_count, 10),
      avgSlippagePercent: parseFloat(row.avg_slippage_percent),
      totalVolumeUsd: parseFloat(row.total_volume_usd),
    }));

    // Calculate performance metrics from equity curve
    let performanceMetrics = null;
    if (equityCurve.length > 1) {
      const firstPoint = equityCurve[0];
      const lastPoint = equityCurve[equityCurve.length - 1];

      // Calculate max drawdown
      let maxEquity = startingCapital;
      let maxDrawdown = 0;
      let maxDrawdownPercent = 0;

      for (const point of equityCurve) {
        maxEquity = Math.max(maxEquity, point.totalEquity);
        const drawdown = maxEquity - point.totalEquity;
        const drawdownPercent =
          maxEquity > 0 ? (drawdown / maxEquity) * 100 : 0;

        if (drawdownPercent > maxDrawdownPercent) {
          maxDrawdown = drawdown;
          maxDrawdownPercent = drawdownPercent;
        }
      }

      // Calculate daily returns for volatility
      const dailyReturns: number[] = [];
      for (let i = 1; i < equityCurve.length; i++) {
        const prevEquity = equityCurve[i - 1].totalEquity;
        const currEquity = equityCurve[i].totalEquity;
        if (prevEquity > 0) {
          dailyReturns.push(((currEquity - prevEquity) / prevEquity) * 100);
        }
      }

      const avgReturn =
        dailyReturns.length > 0
          ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
          : 0;
      const volatility =
        dailyReturns.length > 1
          ? Math.sqrt(
              dailyReturns.reduce(
                (sum, r) => sum + Math.pow(r - avgReturn, 2),
                0
              ) /
                (dailyReturns.length - 1)
            )
          : 0;

      // Win rate
      const winningDays = dailyReturns.filter((r) => r > 0).length;
      const winRate =
        dailyReturns.length > 0
          ? (winningDays / dailyReturns.length) * 100
          : 0;

      // Time period in days
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysPassed =
        (lastPoint.time.getTime() - firstPoint.time.getTime()) / msPerDay;

      performanceMetrics = {
        totalReturn: lastPoint.totalPnlPercent,
        totalPnl: lastPoint.totalPnl,
        maxDrawdown,
        maxDrawdownPercent,
        volatility,
        winRate,
        tradingDays: dailyReturns.length,
        daysPassed: Math.max(1, Math.round(daysPassed)),
      };
    }

    return NextResponse.json({
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        startingCapital,
      },
      equityCurve,
      slippageStats,
      slippageByTrader,
      performanceMetrics,
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
