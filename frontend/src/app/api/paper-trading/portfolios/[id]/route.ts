import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * GET /api/paper-trading/portfolios/[id]
 *
 * Get a single portfolio with full details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get portfolio from summary view (includes stats)
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
    }>(
      `SELECT
        id, name, starting_capital, current_balance, is_active, created_at,
        total_equity, total_pnl, total_pnl_percent, open_positions, trade_count,
        last_updated, tracked_traders_count
      FROM paper_portfolio_summary
      WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Portfolio not found" },
        { status: 404 }
      );
    }

    const row = result.rows[0];
    const portfolio = {
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
    };

    return NextResponse.json({ portfolio });
  } catch (error) {
    console.error("Error fetching portfolio:", error);
    return NextResponse.json(
      { error: "Failed to fetch portfolio" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/paper-trading/portfolios/[id]
 *
 * Update a portfolio
 *
 * Body:
 *   - name?: string - New name
 *   - isActive?: boolean - Active status
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, isActive } = body as {
      name?: string;
      isActive?: boolean;
    };

    // Build dynamic update query
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "Name cannot be empty" },
          { status: 400 }
        );
      }
      updates.push(`name = $${paramIndex++}`);
      values.push(name.trim());
    }

    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(isActive);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    updates.push("updated_at = NOW()");
    values.push(id);

    const result = await pool.query<{
      id: string;
      name: string;
      starting_capital: string;
      current_balance: string;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
    }>(
      `UPDATE paper_portfolios
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING id, name, starting_capital, current_balance, is_active, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Portfolio not found" },
        { status: 404 }
      );
    }

    const portfolio = result.rows[0];

    return NextResponse.json({
      message: "Portfolio updated successfully",
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
    console.error("Error updating portfolio:", error);

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
      { error: "Failed to update portfolio" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/paper-trading/portfolios/[id]
 *
 * Delete a portfolio and all associated data
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = await pool.query(
      `DELETE FROM paper_portfolios WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Portfolio not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "Portfolio deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting portfolio:", error);
    return NextResponse.json(
      { error: "Failed to delete portfolio" },
      { status: 500 }
    );
  }
}
