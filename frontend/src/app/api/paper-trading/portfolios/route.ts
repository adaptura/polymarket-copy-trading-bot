import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * GET /api/paper-trading/portfolios
 *
 * List all paper portfolios with stats
 */
export async function GET() {
  try {
    const result = await pool.query<{
      id: string;
      name: string;
      starting_capital: string;
      current_balance: string;
      is_active: boolean;
      created_at: Date;
      total_equity: string;
      total_pnl: string;
      total_pnl_percent: string;
      open_positions: string;
      trade_count: string;
      last_updated: Date | null;
      tracked_traders_count: string;
    }>(`
      SELECT
        id, name, starting_capital, current_balance, is_active, created_at,
        total_equity, total_pnl, total_pnl_percent, open_positions, trade_count,
        last_updated, tracked_traders_count
      FROM paper_portfolio_summary
      ORDER BY created_at DESC
    `);

    const portfolios = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      startingCapital: parseFloat(row.starting_capital),
      currentBalance: parseFloat(row.current_balance),
      isActive: row.is_active,
      createdAt: row.created_at,
      totalEquity: parseFloat(row.total_equity),
      totalPnl: parseFloat(row.total_pnl),
      totalPnlPercent: parseFloat(row.total_pnl_percent),
      openPositions: parseInt(row.open_positions, 10),
      tradeCount: parseInt(row.trade_count, 10),
      lastUpdated: row.last_updated,
      trackedTradersCount: parseInt(row.tracked_traders_count, 10),
    }));

    return NextResponse.json({ portfolios });
  } catch (error) {
    console.error("Error fetching portfolios:", error);
    return NextResponse.json(
      { error: "Failed to fetch portfolios" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/paper-trading/portfolios
 *
 * Create a new paper portfolio
 *
 * Body:
 *   - name: string - Portfolio name (unique)
 *   - startingCapital: number - Initial virtual USDC balance
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, startingCapital } = body as {
      name: string;
      startingCapital: number;
    };

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (
      typeof startingCapital !== "number" ||
      startingCapital <= 0 ||
      startingCapital > 10000000
    ) {
      return NextResponse.json(
        { error: "Starting capital must be a positive number up to $10,000,000" },
        { status: 400 }
      );
    }

    const result = await pool.query<{
      id: string;
      name: string;
      starting_capital: string;
      current_balance: string;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO paper_portfolios (name, starting_capital, current_balance)
       VALUES ($1, $2, $2)
       RETURNING id, name, starting_capital, current_balance, is_active, created_at, updated_at`,
      [name.trim(), startingCapital]
    );

    const portfolio = result.rows[0];

    return NextResponse.json({
      message: "Portfolio created successfully",
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        startingCapital: parseFloat(portfolio.starting_capital),
        currentBalance: parseFloat(portfolio.current_balance),
        isActive: portfolio.is_active,
        createdAt: portfolio.created_at,
        updatedAt: portfolio.updated_at,
      },
    });
  } catch (error) {
    console.error("Error creating portfolio:", error);

    // Check for unique constraint violation
    if (
      error instanceof Error &&
      error.message.includes("unique constraint")
    ) {
      return NextResponse.json(
        { error: "A portfolio with this name already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create portfolio" },
      { status: 500 }
    );
  }
}
