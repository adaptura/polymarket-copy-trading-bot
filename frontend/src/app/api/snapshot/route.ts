import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * Polymarket API types
 */
interface Position {
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  realizedPnl: number;
  percentRealizedPnl: number;
  curPrice: number;
}

interface RawPnLPoint {
  t: number;
  p: number;
}

/**
 * Fetch current P&L from Polymarket positions API
 */
async function fetchCurrentPnL(address: string) {
  const response = await fetch(
    `https://data-api.polymarket.com/positions?user=${address}`
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const positions: Position[] = await response.json();

  if (!Array.isArray(positions)) {
    return { realizedPnl: 0, unrealizedPnl: 0, totalPnl: 0, positionCount: 0 };
  }

  const realizedPnl = positions.reduce((sum, p) => sum + (p.realizedPnl || 0), 0);
  const unrealizedPnl = positions.reduce((sum, p) => sum + (p.cashPnl || 0), 0);

  return {
    realizedPnl,
    unrealizedPnl,
    totalPnl: realizedPnl + unrealizedPnl,
    positionCount: positions.length,
  };
}

/**
 * Fetch historical P&L from Polymarket user-pnl API
 */
async function fetchHistoricalPnL(
  address: string,
  interval: "all" | "1m" = "all",
  fidelity: "1d" | "1h" = "1h"
) {
  const url = `https://user-pnl-api.polymarket.com/user-pnl?user_address=${address}&interval=${interval}&fidelity=${fidelity}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data: RawPnLPoint[] = await response.json();

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((point) => ({
    time: new Date(point.t * 1000),
    pnl: point.p, // Already in dollars
  }));
}

/**
 * POST /api/snapshot
 *
 * Take a P&L snapshot for one or all traders
 *
 * Body:
 *   - address?: string - Specific trader address (optional, if omitted snapshots all)
 *   - backfill?: boolean - If true, backfill historical data from Polymarket
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { address, backfill } = body as { address?: string; backfill?: boolean };

    // Get traders to snapshot
    let traders: { address: string; alias: string }[];

    if (address) {
      // Single trader
      const result = await pool.query<{ address: string; alias: string }>(
        "SELECT address, alias FROM tracked_traders WHERE address = $1 AND is_active = TRUE",
        [address.toLowerCase()]
      );
      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: "Trader not found or not active" },
          { status: 404 }
        );
      }
      traders = result.rows;
    } else {
      // All active traders
      const result = await pool.query<{ address: string; alias: string }>(
        "SELECT address, alias FROM tracked_traders WHERE is_active = TRUE"
      );
      traders = result.rows;
    }

    if (traders.length === 0) {
      return NextResponse.json(
        { error: "No active traders to snapshot" },
        { status: 400 }
      );
    }

    const results: Array<{
      address: string;
      alias: string;
      success: boolean;
      error?: string;
      snapshot?: {
        realizedPnl: number;
        unrealizedPnl: number;
        totalPnl: number;
        positionCount: number;
      };
      backfillCount?: number;
    }> = [];

    for (const trader of traders) {
      try {
        if (backfill) {
          // Backfill historical data
          const history = await fetchHistoricalPnL(trader.address, "all", "1h");

          let inserted = 0;
          for (const point of history) {
            const result = await pool.query(
              `INSERT INTO pnl_snapshots (trader_address, time, realized_pnl, unrealized_pnl, total_pnl)
               VALUES ($1, $2, $3, 0, $3)
               ON CONFLICT (trader_address, time) DO NOTHING`,
              [trader.address, point.time, point.pnl]
            );
            if (result.rowCount && result.rowCount > 0) {
              inserted++;
            }
          }

          results.push({
            address: trader.address,
            alias: trader.alias,
            success: true,
            backfillCount: inserted,
          });
        } else {
          // Take current snapshot
          const pnl = await fetchCurrentPnL(trader.address);

          await pool.query(
            `INSERT INTO pnl_snapshots (trader_address, time, realized_pnl, unrealized_pnl, total_pnl, position_count)
             VALUES ($1, NOW(), $2, $3, $4, $5)
             ON CONFLICT (trader_address, time) DO UPDATE SET
               realized_pnl = EXCLUDED.realized_pnl,
               unrealized_pnl = EXCLUDED.unrealized_pnl,
               total_pnl = EXCLUDED.total_pnl,
               position_count = EXCLUDED.position_count`,
            [
              trader.address,
              pnl.realizedPnl,
              pnl.unrealizedPnl,
              pnl.totalPnl,
              pnl.positionCount,
            ]
          );

          results.push({
            address: trader.address,
            alias: trader.alias,
            success: true,
            snapshot: pnl,
          });
        }
      } catch (error) {
        results.push({
          address: trader.address,
          alias: trader.alias,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      message: backfill
        ? `Backfilled ${successCount} traders (${failCount} failed)`
        : `Snapshotted ${successCount} traders (${failCount} failed)`,
      results,
    });
  } catch (error) {
    console.error("Error taking snapshots:", error);
    return NextResponse.json(
      { error: "Failed to take snapshots" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/snapshot
 *
 * Get latest snapshots for all traders
 */
export async function GET() {
  try {
    const result = await pool.query<{
      trader_address: string;
      alias: string;
      time: Date;
      realized_pnl: string;
      unrealized_pnl: string;
      total_pnl: string;
      position_count: number | null;
    }>(`
      SELECT
        s.trader_address,
        t.alias,
        s.time,
        s.realized_pnl,
        s.unrealized_pnl,
        s.total_pnl,
        s.position_count
      FROM pnl_snapshots s
      JOIN tracked_traders t ON s.trader_address = t.address
      WHERE (s.trader_address, s.time) IN (
        SELECT trader_address, MAX(time)
        FROM pnl_snapshots
        GROUP BY trader_address
      )
      ORDER BY s.total_pnl DESC
    `);

    return NextResponse.json({
      snapshots: result.rows.map((row) => ({
        traderAddress: row.trader_address,
        alias: row.alias,
        time: row.time,
        realizedPnl: parseFloat(row.realized_pnl),
        unrealizedPnl: parseFloat(row.unrealized_pnl),
        totalPnl: parseFloat(row.total_pnl),
        positionCount: row.position_count,
      })),
    });
  } catch (error) {
    console.error("Error fetching snapshots:", error);
    return NextResponse.json(
      { error: "Failed to fetch snapshots" },
      { status: 500 }
    );
  }
}
