import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * GET /api/paper-trading/portfolios/[id]/positions
 *
 * Get current positions for a portfolio
 *
 * Query params:
 *   - includeZero?: boolean - Include positions with zero size (default: false)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const includeZero = searchParams.get("includeZero") === "true";

    // Verify portfolio exists
    const portfolioCheck = await pool.query(
      `SELECT id FROM paper_portfolios WHERE id = $1`,
      [id]
    );

    if (portfolioCheck.rows.length === 0) {
      return NextResponse.json(
        { error: "Portfolio not found" },
        { status: 404 }
      );
    }

    const sizeCondition = includeZero ? "" : "AND size_tokens > 0";

    const result = await pool.query<{
      id: string;
      portfolio_id: string;
      condition_id: string;
      asset: string;
      market_title: string | null;
      market_slug: string | null;
      outcome: string | null;
      size_tokens: string;
      avg_entry_price: string;
      total_cost_usd: string;
      current_price: string | null;
      unrealized_pnl: string;
      realized_pnl: string;
      opened_at: Date;
      updated_at: Date;
    }>(
      `SELECT
        id, portfolio_id, condition_id, asset, market_title, market_slug, outcome,
        size_tokens, avg_entry_price, total_cost_usd, current_price,
        unrealized_pnl, realized_pnl, opened_at, updated_at
      FROM paper_positions
      WHERE portfolio_id = $1 ${sizeCondition}
      ORDER BY updated_at DESC`,
      [id]
    );

    const positions = result.rows.map((row) => {
      const sizeTokens = parseFloat(row.size_tokens);
      const avgEntryPrice = parseFloat(row.avg_entry_price);
      const totalCostUsd = parseFloat(row.total_cost_usd);
      const currentPrice = row.current_price
        ? parseFloat(row.current_price)
        : null;

      // Calculate current value and P&L
      const currentValue = currentPrice ? sizeTokens * currentPrice : null;
      const unrealizedPnl = currentValue ? currentValue - totalCostUsd : null;
      const unrealizedPnlPercent =
        unrealizedPnl && totalCostUsd > 0
          ? (unrealizedPnl / totalCostUsd) * 100
          : null;

      return {
        id: row.id,
        portfolioId: row.portfolio_id,
        conditionId: row.condition_id,
        asset: row.asset,
        marketTitle: row.market_title,
        marketSlug: row.market_slug,
        outcome: row.outcome,
        sizeTokens,
        avgEntryPrice,
        totalCostUsd,
        currentPrice,
        currentValue,
        unrealizedPnl: unrealizedPnl ?? parseFloat(row.unrealized_pnl),
        unrealizedPnlPercent,
        realizedPnl: parseFloat(row.realized_pnl),
        openedAt: row.opened_at,
        updatedAt: row.updated_at,
      };
    });

    // Calculate summary stats
    const summary = {
      totalPositions: positions.length,
      totalValue: positions.reduce((sum, p) => sum + (p.currentValue || 0), 0),
      totalCost: positions.reduce((sum, p) => sum + p.totalCostUsd, 0),
      totalUnrealizedPnl: positions.reduce(
        (sum, p) => sum + (p.unrealizedPnl || 0),
        0
      ),
      totalRealizedPnl: positions.reduce((sum, p) => sum + p.realizedPnl, 0),
    };

    return NextResponse.json({ positions, summary });
  } catch (error) {
    console.error("Error fetching positions:", error);
    return NextResponse.json(
      { error: "Failed to fetch positions" },
      { status: 500 }
    );
  }
}
