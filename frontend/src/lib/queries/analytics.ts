import { db } from "../db";
import { trackedTraders, pnlSnapshots } from "../db/schema";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";

// ============================================================================
// TYPES
// ============================================================================

export interface TraderWithLatestPnL {
  address: string;
  alias: string;
  color: string | null;
  notes: string | null;
  isActive: boolean;
  latestPnl: number | null;
  realizedPnl: number | null;
  unrealizedPnl: number | null;
  positionCount: number | null;
  lastUpdated: Date | null;
}

export interface PnLDataPoint {
  time: Date;
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

export interface DrawdownMetrics {
  maxDrawdownPct: number;
  maxDrawdownAmount: number;
  currentDrawdownPct: number;
  currentDrawdownAmount: number;
  peakPnl: number;
  troughPnl: number;
  peakDate: Date | null;
  troughDate: Date | null;
}

export interface RollingReturns {
  pnl7d: number | null;
  pnl30d: number | null;
  pnl90d: number | null;
  pnlYtd: number | null;
  pnlAllTime: number | null;
}

export interface VolatilityMetrics {
  dailyVolatility: number;
  avgDailyChange: number;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  positiveDays: number;
  negativeDays: number;
  winRate: number;
  maxWinStreak: number;
  maxLossStreak: number;
}

export interface TraderAnalytics {
  trader: TraderWithLatestPnL;
  drawdown: DrawdownMetrics;
  rollingReturns: RollingReturns;
  volatility: VolatilityMetrics;
  pnlHistory: PnLDataPoint[];
}

// ============================================================================
// RAW SQL QUERIES (for complex analytics)
// ============================================================================

/**
 * Get drawdown metrics for a trader
 */
export async function getDrawdownMetrics(traderAddress: string): Promise<DrawdownMetrics | null> {
  const result = await db.execute<{
    max_drawdown_pct: string;
    max_drawdown_amount: string;
    current_drawdown_pct: string;
    current_drawdown_amount: string;
    peak_pnl: string;
    trough_pnl: string;
    peak_date: Date | null;
    trough_date: Date | null;
  }>(sql`
    WITH pnl_with_peak AS (
      SELECT
        time,
        total_pnl,
        MAX(total_pnl) OVER (ORDER BY time ROWS UNBOUNDED PRECEDING) AS peak_pnl
      FROM pnl_snapshots
      WHERE trader_address = ${traderAddress.toLowerCase()}
    ),
    drawdowns AS (
      SELECT
        time,
        total_pnl,
        peak_pnl,
        (peak_pnl - total_pnl) AS drawdown_amount,
        CASE WHEN peak_pnl > 0
          THEN (peak_pnl - total_pnl) / peak_pnl * 100
          ELSE 0
        END AS drawdown_pct
      FROM pnl_with_peak
    ),
    max_drawdown AS (
      SELECT
        MAX(drawdown_pct) AS max_drawdown_pct,
        MAX(drawdown_amount) AS max_drawdown_amount
      FROM drawdowns
    ),
    current AS (
      SELECT drawdown_pct, drawdown_amount
      FROM drawdowns
      ORDER BY time DESC
      LIMIT 1
    ),
    peaks AS (
      SELECT MAX(total_pnl) AS peak_pnl, MIN(total_pnl) AS trough_pnl
      FROM pnl_snapshots
      WHERE trader_address = ${traderAddress.toLowerCase()}
    ),
    peak_date AS (
      SELECT time AS peak_date
      FROM pnl_snapshots
      WHERE trader_address = ${traderAddress.toLowerCase()}
      ORDER BY total_pnl DESC
      LIMIT 1
    ),
    trough_date AS (
      SELECT time AS trough_date
      FROM pnl_snapshots
      WHERE trader_address = ${traderAddress.toLowerCase()}
      ORDER BY total_pnl ASC
      LIMIT 1
    )
    SELECT
      COALESCE(md.max_drawdown_pct, 0) AS max_drawdown_pct,
      COALESCE(md.max_drawdown_amount, 0) AS max_drawdown_amount,
      COALESCE(c.drawdown_pct, 0) AS current_drawdown_pct,
      COALESCE(c.drawdown_amount, 0) AS current_drawdown_amount,
      COALESCE(p.peak_pnl, 0) AS peak_pnl,
      COALESCE(p.trough_pnl, 0) AS trough_pnl,
      pd.peak_date,
      td.trough_date
    FROM max_drawdown md
    CROSS JOIN current c
    CROSS JOIN peaks p
    CROSS JOIN peak_date pd
    CROSS JOIN trough_date td
  `);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    maxDrawdownPct: parseFloat(row.max_drawdown_pct) || 0,
    maxDrawdownAmount: parseFloat(row.max_drawdown_amount) || 0,
    currentDrawdownPct: parseFloat(row.current_drawdown_pct) || 0,
    currentDrawdownAmount: parseFloat(row.current_drawdown_amount) || 0,
    peakPnl: parseFloat(row.peak_pnl) || 0,
    troughPnl: parseFloat(row.trough_pnl) || 0,
    peakDate: row.peak_date,
    troughDate: row.trough_date,
  };
}

/**
 * Get rolling returns for a trader
 */
export async function getRollingReturns(traderAddress: string): Promise<RollingReturns | null> {
  const result = await db.execute<{
    current_pnl: string;
    pnl_7d_ago: string | null;
    pnl_30d_ago: string | null;
    pnl_90d_ago: string | null;
    pnl_ytd: string | null;
    pnl_first: string | null;
  }>(sql`
    WITH current AS (
      SELECT total_pnl AS current_pnl
      FROM pnl_snapshots
      WHERE trader_address = ${traderAddress.toLowerCase()}
      ORDER BY time DESC
      LIMIT 1
    ),
    historical AS (
      SELECT
        (SELECT total_pnl FROM pnl_snapshots
         WHERE trader_address = ${traderAddress.toLowerCase()}
           AND time <= NOW() - INTERVAL '7 days'
         ORDER BY time DESC LIMIT 1) AS pnl_7d_ago,
        (SELECT total_pnl FROM pnl_snapshots
         WHERE trader_address = ${traderAddress.toLowerCase()}
           AND time <= NOW() - INTERVAL '30 days'
         ORDER BY time DESC LIMIT 1) AS pnl_30d_ago,
        (SELECT total_pnl FROM pnl_snapshots
         WHERE trader_address = ${traderAddress.toLowerCase()}
           AND time <= NOW() - INTERVAL '90 days'
         ORDER BY time DESC LIMIT 1) AS pnl_90d_ago,
        (SELECT total_pnl FROM pnl_snapshots
         WHERE trader_address = ${traderAddress.toLowerCase()}
           AND time <= DATE_TRUNC('year', NOW())
         ORDER BY time DESC LIMIT 1) AS pnl_ytd,
        (SELECT total_pnl FROM pnl_snapshots
         WHERE trader_address = ${traderAddress.toLowerCase()}
         ORDER BY time ASC LIMIT 1) AS pnl_first
    )
    SELECT
      c.current_pnl,
      h.pnl_7d_ago,
      h.pnl_30d_ago,
      h.pnl_90d_ago,
      h.pnl_ytd,
      h.pnl_first
    FROM current c
    CROSS JOIN historical h
  `);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const currentPnl = parseFloat(row.current_pnl) || 0;

  return {
    pnl7d: row.pnl_7d_ago ? currentPnl - parseFloat(row.pnl_7d_ago) : null,
    pnl30d: row.pnl_30d_ago ? currentPnl - parseFloat(row.pnl_30d_ago) : null,
    pnl90d: row.pnl_90d_ago ? currentPnl - parseFloat(row.pnl_90d_ago) : null,
    pnlYtd: row.pnl_ytd ? currentPnl - parseFloat(row.pnl_ytd) : null,
    pnlAllTime: row.pnl_first ? currentPnl - parseFloat(row.pnl_first) : currentPnl,
  };
}

/**
 * Get volatility metrics for a trader
 */
export async function getVolatilityMetrics(traderAddress: string): Promise<VolatilityMetrics | null> {
  const result = await db.execute<{
    daily_volatility: string | null;
    avg_daily_change: string | null;
    positive_days: string;
    negative_days: string;
    max_win_streak: string;
    max_loss_streak: string;
  }>(sql`
    WITH daily_changes AS (
      SELECT
        time,
        total_pnl,
        total_pnl - LAG(total_pnl) OVER (ORDER BY time) AS daily_change
      FROM pnl_snapshots
      WHERE trader_address = ${traderAddress.toLowerCase()}
    ),
    stats AS (
      SELECT
        STDDEV(daily_change) AS daily_volatility,
        AVG(daily_change) AS avg_daily_change,
        COUNT(*) FILTER (WHERE daily_change > 0) AS positive_days,
        COUNT(*) FILTER (WHERE daily_change <= 0) AS negative_days
      FROM daily_changes
      WHERE daily_change IS NOT NULL
    ),
    streaks AS (
      SELECT
        daily_change > 0 AS is_win,
        SUM(CASE WHEN daily_change > 0 THEN 0 ELSE 1 END) OVER (ORDER BY time) AS loss_group,
        SUM(CASE WHEN daily_change <= 0 THEN 0 ELSE 1 END) OVER (ORDER BY time) AS win_group
      FROM daily_changes
      WHERE daily_change IS NOT NULL
    ),
    streak_lengths AS (
      SELECT
        COALESCE(MAX(cnt) FILTER (WHERE is_win), 0) AS max_win_streak,
        COALESCE(MAX(cnt) FILTER (WHERE NOT is_win), 0) AS max_loss_streak
      FROM (
        SELECT is_win, COUNT(*) AS cnt
        FROM streaks
        GROUP BY is_win, CASE WHEN is_win THEN win_group ELSE loss_group END
      ) s
    )
    SELECT
      s.daily_volatility,
      s.avg_daily_change,
      s.positive_days,
      s.negative_days,
      sl.max_win_streak,
      sl.max_loss_streak
    FROM stats s
    CROSS JOIN streak_lengths sl
  `);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const dailyVolatility = row.daily_volatility ? parseFloat(row.daily_volatility) : 0;
  const avgDailyChange = row.avg_daily_change ? parseFloat(row.avg_daily_change) : 0;
  const positiveDays = parseInt(row.positive_days) || 0;
  const negativeDays = parseInt(row.negative_days) || 0;
  const totalDays = positiveDays + negativeDays;

  // Sharpe ratio (simplified: avg return / volatility)
  const sharpeRatio = dailyVolatility > 0 ? avgDailyChange / dailyVolatility : null;

  return {
    dailyVolatility,
    avgDailyChange,
    sharpeRatio,
    sortinoRatio: null, // Would need downside deviation calculation
    positiveDays,
    negativeDays,
    winRate: totalDays > 0 ? (positiveDays / totalDays) * 100 : 0,
    maxWinStreak: parseInt(row.max_win_streak) || 0,
    maxLossStreak: parseInt(row.max_loss_streak) || 0,
  };
}

// ============================================================================
// DRIZZLE QUERIES
// ============================================================================

/**
 * Get all tracked traders with their latest P&L
 */
export async function getTradersWithLatestPnL(): Promise<TraderWithLatestPnL[]> {
  const result = await db.execute<{
    address: string;
    alias: string;
    color: string | null;
    notes: string | null;
    is_active: boolean;
    total_pnl: string | null;
    realized_pnl: string | null;
    unrealized_pnl: string | null;
    position_count: number | null;
    snapshot_time: Date | null;
  }>(sql`
    SELECT
      t.address,
      t.alias,
      t.color,
      t.notes,
      t.is_active,
      lp.total_pnl,
      lp.realized_pnl,
      lp.unrealized_pnl,
      lp.position_count,
      lp.time AS snapshot_time
    FROM tracked_traders t
    LEFT JOIN LATERAL (
      SELECT total_pnl, realized_pnl, unrealized_pnl, position_count, time
      FROM pnl_snapshots
      WHERE trader_address = t.address
      ORDER BY time DESC
      LIMIT 1
    ) lp ON TRUE
    WHERE t.is_active = TRUE
    ORDER BY t.alias
  `);

  return result.rows.map((row) => ({
    address: row.address,
    alias: row.alias,
    color: row.color,
    notes: row.notes,
    isActive: row.is_active,
    latestPnl: row.total_pnl ? parseFloat(row.total_pnl) : null,
    realizedPnl: row.realized_pnl ? parseFloat(row.realized_pnl) : null,
    unrealizedPnl: row.unrealized_pnl ? parseFloat(row.unrealized_pnl) : null,
    positionCount: row.position_count,
    lastUpdated: row.snapshot_time,
  }));
}

/**
 * Get a single trader by address
 */
export async function getTrader(address: string): Promise<TraderWithLatestPnL | null> {
  const traders = await db
    .select()
    .from(trackedTraders)
    .where(eq(trackedTraders.address, address.toLowerCase()));

  if (traders.length === 0) return null;

  const trader = traders[0];

  // Get latest snapshot
  const snapshots = await db
    .select()
    .from(pnlSnapshots)
    .where(eq(pnlSnapshots.traderAddress, address.toLowerCase()))
    .orderBy(desc(pnlSnapshots.time))
    .limit(1);

  const snapshot = snapshots[0];

  return {
    address: trader.address,
    alias: trader.alias,
    color: trader.color,
    notes: trader.notes,
    isActive: trader.isActive ?? true,
    latestPnl: snapshot ? parseFloat(snapshot.totalPnl) : null,
    realizedPnl: snapshot ? parseFloat(snapshot.realizedPnl) : null,
    unrealizedPnl: snapshot ? parseFloat(snapshot.unrealizedPnl) : null,
    positionCount: snapshot?.positionCount ?? null,
    lastUpdated: snapshot?.time ?? null,
  };
}

/**
 * Get P&L history for a trader
 */
export async function getPnLHistory(
  traderAddress: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  } = {}
): Promise<PnLDataPoint[]> {
  let query = db
    .select({
      time: pnlSnapshots.time,
      totalPnl: pnlSnapshots.totalPnl,
      realizedPnl: pnlSnapshots.realizedPnl,
      unrealizedPnl: pnlSnapshots.unrealizedPnl,
    })
    .from(pnlSnapshots)
    .where(eq(pnlSnapshots.traderAddress, traderAddress.toLowerCase()))
    .orderBy(desc(pnlSnapshots.time))
    .$dynamic();

  if (options.startDate) {
    query = query.where(gte(pnlSnapshots.time, options.startDate));
  }
  if (options.endDate) {
    query = query.where(lte(pnlSnapshots.time, options.endDate));
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const snapshots = await query;

  return snapshots.map((s) => ({
    time: s.time,
    totalPnl: parseFloat(s.totalPnl),
    realizedPnl: parseFloat(s.realizedPnl),
    unrealizedPnl: parseFloat(s.unrealizedPnl),
  }));
}

/**
 * Get P&L history for multiple traders (for comparison charts)
 */
export async function getMultiTraderPnLHistory(
  traderAddresses: string[],
  options: {
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<Map<string, PnLDataPoint[]>> {
  const result = new Map<string, PnLDataPoint[]>();

  for (const address of traderAddresses) {
    const history = await getPnLHistory(address, options);
    result.set(address, history);
  }

  return result;
}

/**
 * Get full analytics for a trader
 */
export async function getTraderAnalytics(traderAddress: string): Promise<TraderAnalytics | null> {
  const trader = await getTrader(traderAddress);
  if (!trader) return null;

  const [drawdown, rollingReturns, volatility, pnlHistory] = await Promise.all([
    getDrawdownMetrics(traderAddress),
    getRollingReturns(traderAddress),
    getVolatilityMetrics(traderAddress),
    getPnLHistory(traderAddress, { limit: 365 }), // Last year of data
  ]);

  return {
    trader,
    drawdown: drawdown ?? {
      maxDrawdownPct: 0,
      maxDrawdownAmount: 0,
      currentDrawdownPct: 0,
      currentDrawdownAmount: 0,
      peakPnl: 0,
      troughPnl: 0,
      peakDate: null,
      troughDate: null,
    },
    rollingReturns: rollingReturns ?? {
      pnl7d: null,
      pnl30d: null,
      pnl90d: null,
      pnlYtd: null,
      pnlAllTime: null,
    },
    volatility: volatility ?? {
      dailyVolatility: 0,
      avgDailyChange: 0,
      sharpeRatio: null,
      sortinoRatio: null,
      positiveDays: 0,
      negativeDays: 0,
      winRate: 0,
      maxWinStreak: 0,
      maxLossStreak: 0,
    },
    pnlHistory: pnlHistory.reverse(), // Chronological order for charts
  };
}

// ============================================================================
// TRADER MANAGEMENT
// ============================================================================

/**
 * Add a new trader
 */
export async function addTrader(
  address: string,
  alias: string,
  color?: string,
  notes?: string
): Promise<void> {
  await db
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
        isActive: true,
        updatedAt: new Date(),
      },
    });
}

/**
 * Update trader details
 */
export async function updateTrader(
  address: string,
  updates: { alias?: string; color?: string; notes?: string; isActive?: boolean }
): Promise<void> {
  const setClause: Record<string, unknown> = { updatedAt: new Date() };

  if (updates.alias !== undefined) setClause.alias = updates.alias;
  if (updates.color !== undefined) setClause.color = updates.color;
  if (updates.notes !== undefined) setClause.notes = updates.notes;
  if (updates.isActive !== undefined) setClause.isActive = updates.isActive;

  await db
    .update(trackedTraders)
    .set(setClause)
    .where(eq(trackedTraders.address, address.toLowerCase()));
}

/**
 * Remove a trader (soft delete)
 */
export async function removeTrader(address: string): Promise<void> {
  await db
    .update(trackedTraders)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(trackedTraders.address, address.toLowerCase()));
}
