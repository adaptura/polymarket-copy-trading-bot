import { NextRequest, NextResponse } from "next/server";
import { getAllTraders, getAllTraderAliases } from "@/lib/queries/traders";
import { pool } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const includeAliases = searchParams.get("aliases") === "true";

    if (includeAliases) {
      const aliases = await getAllTraderAliases();
      return NextResponse.json({ aliases });
    }

    const traders = await getAllTraders();
    return NextResponse.json({ traders });
  } catch (error) {
    console.error("Error fetching traders:", error);
    return NextResponse.json(
      { error: "Failed to fetch traders" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/traders
 *
 * Add a new trader to track
 *
 * Body:
 *   - address: string - Wallet address
 *   - alias: string - Display name
 *   - color?: string - Hex color
 *   - notes?: string - Optional notes
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, alias, color, notes } = body as {
      address: string;
      alias: string;
      color?: string;
      notes?: string;
    };

    if (!address || !alias) {
      return NextResponse.json(
        { error: "Address and alias are required" },
        { status: 400 }
      );
    }

    // Validate address format (basic check)
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { error: "Invalid wallet address format" },
        { status: 400 }
      );
    }

    // Insert trader
    const result = await pool.query<{
      address: string;
      alias: string;
      color: string | null;
      notes: string | null;
      is_active: boolean;
      created_at: Date;
    }>(
      `INSERT INTO tracked_traders (address, alias, color, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (address) DO UPDATE SET
         alias = EXCLUDED.alias,
         color = COALESCE(EXCLUDED.color, tracked_traders.color),
         notes = COALESCE(EXCLUDED.notes, tracked_traders.notes),
         is_active = TRUE,
         updated_at = NOW()
       RETURNING address, alias, color, notes, is_active, created_at`,
      [address.toLowerCase(), alias, color || null, notes || null]
    );

    const trader = result.rows[0];

    return NextResponse.json({
      message: "Trader added successfully",
      trader: {
        address: trader.address,
        alias: trader.alias,
        color: trader.color,
        notes: trader.notes,
        isActive: trader.is_active,
        createdAt: trader.created_at,
      },
    });
  } catch (error) {
    console.error("Error adding trader:", error);
    return NextResponse.json(
      { error: "Failed to add trader" },
      { status: 500 }
    );
  }
}
