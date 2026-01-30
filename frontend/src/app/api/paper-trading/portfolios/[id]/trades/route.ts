import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * GET /api/paper-trading/portfolios/[id]/trades
 *
 * Get paper trades for a portfolio with pagination
 *
 * Query params:
 *   - limit?: number - Max trades to return (default: 50, max: 100)
 *   - offset?: number - Pagination offset (default: 0)
 *   - startDate?: string - ISO date string for start filter
 *   - endDate?: string - ISO date string for end filter
 *   - status?: string - Filter by execution status (FILLED, SKIPPED)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;

    const limit = Math.min(
      parseInt(searchParams.get("limit") || "50", 10),
      100
    );
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const status = searchParams.get("status");

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

    // Build query with filters
    const conditions = ["portfolio_id = $1"];
    const queryParams: unknown[] = [id];
    let paramIndex = 2;

    if (startDate) {
      conditions.push(`time >= $${paramIndex++}`);
      queryParams.push(new Date(startDate));
    }

    if (endDate) {
      conditions.push(`time <= $${paramIndex++}`);
      queryParams.push(new Date(endDate));
    }

    if (status) {
      conditions.push(`execution_status = $${paramIndex++}`);
      queryParams.push(status.toUpperCase());
    }

    const whereClause = conditions.join(" AND ");

    // Get total count
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM paper_trades WHERE ${whereClause}`,
      queryParams
    );
    const totalCount = parseInt(countResult.rows[0].count, 10);

    // Get trades
    queryParams.push(limit, offset);

    const result = await pool.query<{
      id: string;
      portfolio_id: string;
      time: Date;
      original_trader_address: string;
      original_tx_hash: string;
      original_trade_time: Date;
      original_price: string;
      original_size_usd: string;
      condition_id: string;
      asset: string;
      market_title: string | null;
      market_slug: string | null;
      outcome: string | null;
      side: string;
      simulated_price: string;
      simulated_size_usd: string;
      simulated_size_tokens: string;
      delay_ms: number;
      slippage_percent: string;
      execution_status: string;
      skip_reason: string | null;
      balance_before: string;
      balance_after: string;
      trader_alias: string | null;
    }>(
      `SELECT
        t.id, t.portfolio_id, t.time, t.original_trader_address, t.original_tx_hash,
        t.original_trade_time, t.original_price, t.original_size_usd,
        t.condition_id, t.asset, t.market_title, t.market_slug, t.outcome, t.side,
        t.simulated_price, t.simulated_size_usd, t.simulated_size_tokens,
        t.delay_ms, t.slippage_percent, t.execution_status, t.skip_reason,
        t.balance_before, t.balance_after,
        tr.alias as trader_alias
      FROM paper_trades t
      LEFT JOIN tracked_traders tr ON t.original_trader_address = tr.address
      WHERE ${whereClause}
      ORDER BY t.time DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      queryParams
    );

    const trades = result.rows.map((row) => ({
      id: row.id,
      portfolioId: row.portfolio_id,
      time: row.time,
      originalTraderAddress: row.original_trader_address,
      originalTxHash: row.original_tx_hash,
      originalTradeTime: row.original_trade_time,
      originalPrice: parseFloat(row.original_price),
      originalSizeUsd: parseFloat(row.original_size_usd),
      conditionId: row.condition_id,
      asset: row.asset,
      marketTitle: row.market_title,
      marketSlug: row.market_slug,
      outcome: row.outcome,
      side: row.side,
      simulatedPrice: parseFloat(row.simulated_price),
      simulatedSizeUsd: parseFloat(row.simulated_size_usd),
      simulatedSizeTokens: parseFloat(row.simulated_size_tokens),
      delayMs: row.delay_ms,
      slippagePercent: parseFloat(row.slippage_percent),
      executionStatus: row.execution_status,
      skipReason: row.skip_reason,
      balanceBefore: parseFloat(row.balance_before),
      balanceAfter: parseFloat(row.balance_after),
      traderAlias: row.trader_alias,
    }));

    return NextResponse.json({
      trades,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + trades.length < totalCount,
      },
    });
  } catch (error) {
    console.error("Error fetching trades:", error);
    return NextResponse.json(
      { error: "Failed to fetch trades" },
      { status: 500 }
    );
  }
}
