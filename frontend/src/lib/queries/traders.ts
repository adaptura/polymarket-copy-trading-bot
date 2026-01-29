/**
 * Trader Queries - Simplified P&L Snapshot Based Analytics
 *
 * This module provides trader data from pnl_snapshots table.
 * P&L is fetched directly from Polymarket's API and stored as snapshots.
 */

import { eq, sql, desc } from "drizzle-orm";
import { db, pool, trackedTraders, pnlSnapshots, RESOLUTION_TO_INTERVAL } from "../db";

// ============================================================================
// TYPES
// ============================================================================

export interface TraderSummary {
  address: string;
  alias: string;
  color: string;
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  positionCount: number;
  lastUpdated: Date | null;
  isActive: boolean;
}

export interface TraderAliasData {
  traderAddress: string;
  alias: string;
  color: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PnLDataPoint {
  time: number; // Unix timestamp
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  cumulativeRealized: number;
  cumulativeTotal: number;
}

export interface TraderPnLSeries {
  traderId: string;
  traderName: string;
  color: string;
  data: { time: number; value: number }[];
}

// ============================================================================
// TRADER ALIAS QUERIES (using Drizzle)
// ============================================================================

/**
 * Get all trader aliases
 */
export async function getAllTraderAliases(): Promise<TraderAliasData[]> {
  const rows = await db
    .select()
    .from(trackedTraders)
    .orderBy(desc(trackedTraders.updatedAt));

  return rows.map((row) => ({
    traderAddress: row.address,
    alias: row.alias,
    color: row.color,
    notes: row.notes,
    isActive: row.isActive ?? true,
    createdAt: row.createdAt ?? new Date(),
    updatedAt: row.updatedAt ?? new Date(),
  }));
}

/**
 * Get a single trader alias
 */
export async function getTraderAlias(
  address: string
): Promise<TraderAliasData | null> {
  const rows = await db
    .select()
    .from(trackedTraders)
    .where(eq(trackedTraders.address, address.toLowerCase()))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    traderAddress: row.address,
    alias: row.alias,
    color: row.color,
    notes: row.notes,
    isActive: row.isActive ?? true,
    createdAt: row.createdAt ?? new Date(),
    updatedAt: row.updatedAt ?? new Date(),
  };
}

/**
 * Update or create trader alias
 */
export async function upsertTraderAlias(
  address: string,
  alias: string,
  color?: string,
  notes?: string
): Promise<TraderAliasData> {
  const rows = await db
    .insert(trackedTraders)
    .values({
      address: address.toLowerCase(),
      alias,
      color: color ?? null,
      notes: notes ?? null,
    })
    .onConflictDoUpdate({
      target: trackedTraders.address,
      set: {
        alias,
        color: color ?? sql`${trackedTraders.color}`,
        notes: notes ?? sql`${trackedTraders.notes}`,
        updatedAt: new Date(),
      },
    })
    .returning();

  const row = rows[0];
  return {
    traderAddress: row.address,
    alias: row.alias,
    color: row.color,
    notes: row.notes,
    isActive: row.isActive ?? true,
    createdAt: row.createdAt ?? new Date(),
    updatedAt: row.updatedAt ?? new Date(),
  };
}

/**
 * Delete trader alias (soft delete)
 */
export async function deleteTraderAlias(address: string): Promise<boolean> {
  const result = await db
    .update(trackedTraders)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(trackedTraders.address, address.toLowerCase()))
    .returning();

  return result.length > 0;
}

// ============================================================================
// TRADER QUERIES (using P&L snapshots)
// ============================================================================

// Trader color palette - must match TRADER_COLORS in mock-data.ts
const TRADER_COLOR_PALETTE = [
  "#00D9FF", // Cyan
  "#22C55E", // Emerald
  "#A855F7", // Violet
  "#F59E0B", // Amber
  "#FF6B6B", // Coral
  "#EC4899", // Pink
  "#3B82F6", // Blue
  "#14B8A6", // Teal
];

/**
 * Get all traders with summary statistics from P&L snapshots
 */
export async function getAllTraders(): Promise<TraderSummary[]> {
  const result = await pool.query<{
    address: string;
    alias: string;
    color: string | null;
    total_pnl: string | null;
    realized_pnl: string | null;
    unrealized_pnl: string | null;
    position_count: number | null;
    last_updated: Date | null;
    is_active: boolean;
    row_num: string;
  }>(`
    SELECT
      t.address,
      t.alias,
      t.color,
      lp.total_pnl,
      lp.realized_pnl,
      lp.unrealized_pnl,
      lp.position_count,
      lp.time AS last_updated,
      t.is_active,
      ROW_NUMBER() OVER (ORDER BY t.created_at) AS row_num
    FROM tracked_traders t
    LEFT JOIN LATERAL (
      SELECT total_pnl, realized_pnl, unrealized_pnl, position_count, time
      FROM pnl_snapshots
      WHERE trader_address = t.address
      ORDER BY time DESC
      LIMIT 1
    ) lp ON TRUE
    WHERE t.is_active = TRUE
    ORDER BY COALESCE(lp.total_pnl, 0) DESC
  `);

  return result.rows.map((row) => {
    // Use stored color or assign from palette based on row number
    const rowIndex = parseInt(row.row_num, 10) - 1;
    const defaultColor = TRADER_COLOR_PALETTE[rowIndex % TRADER_COLOR_PALETTE.length];

    return {
      address: row.address,
      alias: row.alias,
      color: row.color || defaultColor,
      totalPnl: Number.parseFloat(row.total_pnl ?? "0") || 0,
      realizedPnl: Number.parseFloat(row.realized_pnl ?? "0") || 0,
      unrealizedPnl: Number.parseFloat(row.unrealized_pnl ?? "0") || 0,
      positionCount: row.position_count ?? 0,
      lastUpdated: row.last_updated,
      isActive: row.is_active,
    };
  });
}

/**
 * Get a single trader's details
 */
export async function getTrader(address: string): Promise<TraderSummary | null> {
  const result = await pool.query<{
    address: string;
    alias: string;
    color: string | null;
    total_pnl: string | null;
    realized_pnl: string | null;
    unrealized_pnl: string | null;
    position_count: number | null;
    last_updated: Date | null;
    is_active: boolean;
    row_num: string;
  }>(
    `
    WITH numbered_traders AS (
      SELECT address, ROW_NUMBER() OVER (ORDER BY created_at) AS row_num
      FROM tracked_traders
    )
    SELECT
      t.address,
      t.alias,
      t.color,
      lp.total_pnl,
      lp.realized_pnl,
      lp.unrealized_pnl,
      lp.position_count,
      lp.time AS last_updated,
      t.is_active,
      nt.row_num
    FROM tracked_traders t
    JOIN numbered_traders nt ON t.address = nt.address
    LEFT JOIN LATERAL (
      SELECT total_pnl, realized_pnl, unrealized_pnl, position_count, time
      FROM pnl_snapshots
      WHERE trader_address = t.address
      ORDER BY time DESC
      LIMIT 1
    ) lp ON TRUE
    WHERE t.address = $1
  `,
    [address.toLowerCase()]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  // Use stored color or assign from palette based on row number
  const rowIndex = parseInt(row.row_num, 10) - 1;
  const defaultColor = TRADER_COLOR_PALETTE[rowIndex % TRADER_COLOR_PALETTE.length];

  return {
    address: row.address,
    alias: row.alias,
    color: row.color || defaultColor,
    totalPnl: Number.parseFloat(row.total_pnl ?? "0") || 0,
    realizedPnl: Number.parseFloat(row.realized_pnl ?? "0") || 0,
    unrealizedPnl: Number.parseFloat(row.unrealized_pnl ?? "0") || 0,
    positionCount: row.position_count ?? 0,
    lastUpdated: row.last_updated,
    isActive: row.is_active,
  };
}

// ============================================================================
// P&L QUERIES (using P&L snapshots)
// ============================================================================

/**
 * Get P&L series for a trader from snapshots
 */
export async function getTraderPnLSeries(
  address: string,
  startDate: Date,
  endDate: Date,
  resolution: string = "1D"
): Promise<PnLDataPoint[]> {
  const interval = RESOLUTION_TO_INTERVAL[resolution] || "1 day";

  const result = await pool.query<{
    time: string;
    realized_pnl: string;
    unrealized_pnl: string;
    total_pnl: string;
  }>(
    `
    SELECT
      EXTRACT(EPOCH FROM time_bucket($4::INTERVAL, time))::bigint AS time,
      last(realized_pnl, time) AS realized_pnl,
      last(unrealized_pnl, time) AS unrealized_pnl,
      last(total_pnl, time) AS total_pnl
    FROM pnl_snapshots
    WHERE trader_address = $1
      AND time >= $2
      AND time <= $3
    GROUP BY time_bucket($4::INTERVAL, time)
    ORDER BY time_bucket($4::INTERVAL, time)
  `,
    [address.toLowerCase(), startDate, endDate, interval]
  );

  return result.rows.map((row) => ({
    time: Number.parseInt(row.time, 10),
    realizedPnl: Number.parseFloat(row.realized_pnl) || 0,
    unrealizedPnl: Number.parseFloat(row.unrealized_pnl) || 0,
    totalPnl: Number.parseFloat(row.total_pnl) || 0,
    cumulativeRealized: Number.parseFloat(row.realized_pnl) || 0,
    cumulativeTotal: Number.parseFloat(row.total_pnl) || 0,
  }));
}

/**
 * Get P&L series for multiple traders at once
 */
export async function getMultiTraderPnLSeries(
  addresses: string[],
  startDate: Date,
  endDate: Date,
  resolution: string = "1D"
): Promise<TraderPnLSeries[]> {
  if (addresses.length === 0) return [];

  const interval = RESOLUTION_TO_INTERVAL[resolution] || "1 day";

  const result = await pool.query<{
    trader_address: string;
    trader_name: string;
    color: string | null;
    row_num: string;
    time: string;
    total_pnl: string;
  }>(
    `
    WITH numbered_traders AS (
      SELECT address, ROW_NUMBER() OVER (ORDER BY created_at) AS row_num
      FROM tracked_traders
    ),
    bucketed AS (
      SELECT
        s.trader_address,
        time_bucket($4::INTERVAL, s.time) AS bucket,
        last(s.total_pnl, s.time) AS total_pnl
      FROM pnl_snapshots s
      WHERE s.trader_address = ANY($1)
        AND s.time >= $2
        AND s.time <= $3
      GROUP BY s.trader_address, time_bucket($4::INTERVAL, s.time)
    )
    SELECT
      b.trader_address,
      t.alias AS trader_name,
      t.color,
      nt.row_num,
      EXTRACT(EPOCH FROM b.bucket)::bigint AS time,
      b.total_pnl
    FROM bucketed b
    JOIN tracked_traders t ON b.trader_address = t.address
    JOIN numbered_traders nt ON t.address = nt.address
    ORDER BY b.trader_address, b.bucket
  `,
    [addresses.map((a) => a.toLowerCase()), startDate, endDate, interval]
  );

  // Group by trader
  const seriesMap = new Map<string, TraderPnLSeries>();

  for (const row of result.rows) {
    if (!seriesMap.has(row.trader_address)) {
      // Use stored color or assign from palette based on row number
      const rowIndex = parseInt(row.row_num, 10) - 1;
      const defaultColor = TRADER_COLOR_PALETTE[rowIndex % TRADER_COLOR_PALETTE.length];

      seriesMap.set(row.trader_address, {
        traderId: row.trader_address,
        traderName: row.trader_name,
        color: row.color || defaultColor,
        data: [],
      });
    }
    seriesMap.get(row.trader_address)!.data.push({
      time: Number.parseInt(row.time, 10),
      value: Number.parseFloat(row.total_pnl) || 0,
    });
  }

  return Array.from(seriesMap.values());
}

/**
 * Get volume series - Not available in snapshot-based system
 * Returns empty data since we don't track volume anymore
 */
export async function getMultiTraderVolumeSeries(
  _addresses: string[],
  _startDate: Date,
  _endDate: Date,
  _resolution: string = "1D"
): Promise<TraderPnLSeries[]> {
  // Volume data not available in snapshot-based system
  return [];
}
