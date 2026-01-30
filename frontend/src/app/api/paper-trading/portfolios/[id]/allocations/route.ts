import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * GET /api/paper-trading/portfolios/[id]/allocations
 *
 * Get all trader allocations for a portfolio
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    // Get allocations with trader info
    const result = await pool.query<{
      id: string;
      portfolio_id: string;
      trader_address: string;
      allocation_percent: string;
      max_position_usd: string | null;
      is_active: boolean;
      created_at: Date;
      trader_alias: string | null;
      trader_color: string | null;
    }>(
      `SELECT
        a.id, a.portfolio_id, a.trader_address, a.allocation_percent,
        a.max_position_usd, a.is_active, a.created_at,
        t.alias as trader_alias, t.color as trader_color
      FROM paper_portfolio_allocations a
      LEFT JOIN tracked_traders t ON a.trader_address = t.address
      WHERE a.portfolio_id = $1
      ORDER BY a.created_at DESC`,
      [id]
    );

    const allocations = result.rows.map((row) => ({
      id: row.id,
      portfolioId: row.portfolio_id,
      traderAddress: row.trader_address,
      allocationPercent: parseFloat(row.allocation_percent),
      maxPositionUsd: row.max_position_usd
        ? parseFloat(row.max_position_usd)
        : null,
      isActive: row.is_active,
      createdAt: row.created_at,
      traderAlias: row.trader_alias,
      traderColor: row.trader_color,
    }));

    return NextResponse.json({ allocations });
  } catch (error) {
    console.error("Error fetching allocations:", error);
    return NextResponse.json(
      { error: "Failed to fetch allocations" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/paper-trading/portfolios/[id]/allocations
 *
 * Add or update a trader allocation
 *
 * Body:
 *   - traderAddress: string - Wallet address of trader to copy
 *   - allocationPercent: number - Percentage of trader's position to copy (0-100)
 *   - maxPositionUsd?: number - Optional per-trader position limit
 *   - isActive?: boolean - Whether allocation is active (default: true)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { traderAddress, allocationPercent, maxPositionUsd, isActive } =
      body as {
        traderAddress: string;
        allocationPercent: number;
        maxPositionUsd?: number;
        isActive?: boolean;
      };

    // Validate inputs
    if (!traderAddress || typeof traderAddress !== "string") {
      return NextResponse.json(
        { error: "Trader address is required" },
        { status: 400 }
      );
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(traderAddress)) {
      return NextResponse.json(
        { error: "Invalid trader address format" },
        { status: 400 }
      );
    }

    if (
      typeof allocationPercent !== "number" ||
      allocationPercent < 0 ||
      allocationPercent > 100
    ) {
      return NextResponse.json(
        { error: "Allocation percent must be between 0 and 100" },
        { status: 400 }
      );
    }

    if (
      maxPositionUsd !== undefined &&
      (typeof maxPositionUsd !== "number" || maxPositionUsd <= 0)
    ) {
      return NextResponse.json(
        { error: "Max position USD must be a positive number" },
        { status: 400 }
      );
    }

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

    // Verify trader is tracked
    const traderCheck = await pool.query(
      `SELECT address FROM tracked_traders WHERE address = $1`,
      [traderAddress.toLowerCase()]
    );

    if (traderCheck.rows.length === 0) {
      return NextResponse.json(
        {
          error:
            "Trader is not in tracked traders. Add them first via /api/traders.",
        },
        { status: 400 }
      );
    }

    // Upsert allocation
    const result = await pool.query<{
      id: string;
      portfolio_id: string;
      trader_address: string;
      allocation_percent: string;
      max_position_usd: string | null;
      is_active: boolean;
      created_at: Date;
    }>(
      `INSERT INTO paper_portfolio_allocations (portfolio_id, trader_address, allocation_percent, max_position_usd, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (portfolio_id, trader_address)
       DO UPDATE SET
         allocation_percent = EXCLUDED.allocation_percent,
         max_position_usd = EXCLUDED.max_position_usd,
         is_active = COALESCE(EXCLUDED.is_active, paper_portfolio_allocations.is_active)
       RETURNING id, portfolio_id, trader_address, allocation_percent, max_position_usd, is_active, created_at`,
      [
        id,
        traderAddress.toLowerCase(),
        allocationPercent,
        maxPositionUsd || null,
        isActive !== undefined ? isActive : true,
      ]
    );

    const allocation = result.rows[0];

    return NextResponse.json({
      message: "Allocation saved successfully",
      allocation: {
        id: allocation.id,
        portfolioId: allocation.portfolio_id,
        traderAddress: allocation.trader_address,
        allocationPercent: parseFloat(allocation.allocation_percent),
        maxPositionUsd: allocation.max_position_usd
          ? parseFloat(allocation.max_position_usd)
          : null,
        isActive: allocation.is_active,
        createdAt: allocation.created_at,
      },
    });
  } catch (error) {
    console.error("Error saving allocation:", error);
    return NextResponse.json(
      { error: "Failed to save allocation" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/paper-trading/portfolios/[id]/allocations
 *
 * Remove a trader allocation (deactivate)
 *
 * Query params:
 *   - traderAddress: string - Address of trader to remove
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const traderAddress = searchParams.get("traderAddress");

    if (!traderAddress) {
      return NextResponse.json(
        { error: "traderAddress query param is required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `UPDATE paper_portfolio_allocations
       SET is_active = FALSE
       WHERE portfolio_id = $1 AND trader_address = $2
       RETURNING id`,
      [id, traderAddress.toLowerCase()]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Allocation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "Allocation removed successfully",
    });
  } catch (error) {
    console.error("Error removing allocation:", error);
    return NextResponse.json(
      { error: "Failed to remove allocation" },
      { status: 500 }
    );
  }
}
