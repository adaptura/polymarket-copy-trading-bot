import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import Logger from '../utils/logger';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Raw P&L data point from Polymarket user-pnl API
 */
interface RawPnLPoint {
  t: number; // Unix timestamp in seconds
  p: number; // P&L value (raw)
}

/**
 * Processed P&L data point
 */
export interface PnLDataPoint {
  time: Date;
  pnl: number;
}

/**
 * Position data from Polymarket positions API
 */
export interface Position {
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

/**
 * Aggregated P&L from positions
 */
export interface AggregatedPnL {
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  positionCount: number;
}

/**
 * Tracked trader from database
 */
export interface TrackedTrader {
  address: string;
  alias: string;
  color: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * P&L snapshot record
 */
export interface PnLSnapshot {
  traderAddress: string;
  time: Date;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  positionCount: number | null;
}

// ============================================================================
// PNL SNAPSHOT SERVICE
// ============================================================================

class PnLSnapshotService {
  private pool: Pool | null = null;
  private isConnected: boolean = false;

  /**
   * Initialize connection pool
   */
  async connect(connectionUrl: string): Promise<void> {
    if (this.isConnected && this.pool) {
      return;
    }

    const poolConfig: PoolConfig = {
      connectionString: connectionUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };

    try {
      this.pool = new Pool(poolConfig);
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      this.isConnected = true;
      Logger.success('Connected to TimescaleDB (P&L Snapshots)');
    } catch (error) {
      Logger.error(`Failed to connect to TimescaleDB: ${error}`);
      throw error;
    }
  }

  /**
   * Close connection pool
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
      Logger.info('Disconnected from TimescaleDB');
    }
  }

  /**
   * Check if connected
   */
  isReady(): boolean {
    return this.isConnected && this.pool !== null;
  }

  /**
   * Execute a query with error handling
   */
  private async query<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('TimescaleDB not connected');
    }
    try {
      return await this.pool.query<T>(sql, params);
    } catch (error) {
      Logger.error(`TimescaleDB query error: ${error}`);
      throw error;
    }
  }

  // ==========================================================================
  // POLYMARKET API METHODS
  // ==========================================================================

  /**
   * Fetch historical P&L from Polymarket's user-pnl API
   * This is the core backfill method - gets complete P&L history in one call
   */
  async fetchHistoricalPnL(
    address: string,
    interval: 'all' | '1m' = 'all',
    fidelity: '1d' | '1h' = '1h'
  ): Promise<PnLDataPoint[]> {
    const url = `https://user-pnl-api.polymarket.com/user-pnl?user_address=${address}&interval=${interval}&fidelity=${fidelity}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: RawPnLPoint[] = await response.json();

      if (!Array.isArray(data)) {
        Logger.warn(`Unexpected response format for ${address}`);
        return [];
      }

      return data.map((point) => ({
        time: new Date(point.t * 1000),
        pnl: point.p, // Already in dollars
      }));
    } catch (error) {
      Logger.error(`Failed to fetch historical P&L for ${address}: ${error}`);
      throw error;
    }
  }

  /**
   * Fetch current positions and calculate aggregated P&L
   * Use this for real-time snapshots
   */
  async fetchCurrentPnL(address: string): Promise<AggregatedPnL> {
    const url = `https://data-api.polymarket.com/positions?user=${address}`;

    try {
      const response = await fetch(url);
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
    } catch (error) {
      Logger.error(`Failed to fetch current P&L for ${address}: ${error}`);
      throw error;
    }
  }

  // ==========================================================================
  // DATABASE METHODS - TRADERS
  // ==========================================================================

  /**
   * Get all tracked traders
   */
  async getTrackedTraders(activeOnly: boolean = true): Promise<TrackedTrader[]> {
    const sql = activeOnly
      ? `SELECT address, alias, color, notes, is_active, created_at, updated_at
         FROM tracked_traders WHERE is_active = TRUE ORDER BY alias`
      : `SELECT address, alias, color, notes, is_active, created_at, updated_at
         FROM tracked_traders ORDER BY alias`;

    const result = await this.query<{
      address: string;
      alias: string;
      color: string | null;
      notes: string | null;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
    }>(sql);

    return result.rows.map((row) => ({
      address: row.address,
      alias: row.alias,
      color: row.color,
      notes: row.notes,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Get a single trader by address
   */
  async getTrader(address: string): Promise<TrackedTrader | null> {
    const sql = `SELECT address, alias, color, notes, is_active, created_at, updated_at
                 FROM tracked_traders WHERE address = $1`;
    const result = await this.query<{
      address: string;
      alias: string;
      color: string | null;
      notes: string | null;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
    }>(sql, [address.toLowerCase()]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      address: row.address,
      alias: row.alias,
      color: row.color,
      notes: row.notes,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Add a new trader to track
   */
  async addTrader(
    address: string,
    alias: string,
    color?: string,
    notes?: string
  ): Promise<TrackedTrader> {
    const sql = `
      INSERT INTO tracked_traders (address, alias, color, notes)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (address) DO UPDATE SET
        alias = EXCLUDED.alias,
        color = COALESCE(EXCLUDED.color, tracked_traders.color),
        notes = COALESCE(EXCLUDED.notes, tracked_traders.notes),
        is_active = TRUE,
        updated_at = NOW()
      RETURNING address, alias, color, notes, is_active, created_at, updated_at
    `;

    const result = await this.query<{
      address: string;
      alias: string;
      color: string | null;
      notes: string | null;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
    }>(sql, [address.toLowerCase(), alias, color || null, notes || null]);

    const row = result.rows[0];
    return {
      address: row.address,
      alias: row.alias,
      color: row.color,
      notes: row.notes,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Update trader details
   */
  async updateTrader(
    address: string,
    updates: { alias?: string; color?: string; notes?: string; isActive?: boolean }
  ): Promise<TrackedTrader | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (updates.alias !== undefined) {
      setClauses.push(`alias = $${paramIndex++}`);
      params.push(updates.alias);
    }
    if (updates.color !== undefined) {
      setClauses.push(`color = $${paramIndex++}`);
      params.push(updates.color);
    }
    if (updates.notes !== undefined) {
      setClauses.push(`notes = $${paramIndex++}`);
      params.push(updates.notes);
    }
    if (updates.isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      params.push(updates.isActive);
    }

    if (setClauses.length === 0) return this.getTrader(address);

    params.push(address.toLowerCase());

    const sql = `
      UPDATE tracked_traders
      SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE address = $${paramIndex}
      RETURNING address, alias, color, notes, is_active, created_at, updated_at
    `;

    const result = await this.query<{
      address: string;
      alias: string;
      color: string | null;
      notes: string | null;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
    }>(sql, params);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      address: row.address,
      alias: row.alias,
      color: row.color,
      notes: row.notes,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Remove a trader (soft delete by setting is_active = false)
   */
  async removeTrader(address: string): Promise<void> {
    await this.query(
      `UPDATE tracked_traders SET is_active = FALSE, updated_at = NOW() WHERE address = $1`,
      [address.toLowerCase()]
    );
  }

  // ==========================================================================
  // DATABASE METHODS - SNAPSHOTS
  // ==========================================================================

  /**
   * Insert P&L snapshots (from historical backfill)
   */
  async insertSnapshots(traderAddress: string, dataPoints: PnLDataPoint[]): Promise<number> {
    if (dataPoints.length === 0) return 0;

    const client = await this.pool!.connect();
    let inserted = 0;

    try {
      await client.query('BEGIN');

      for (const point of dataPoints) {
        const result = await client.query(
          `INSERT INTO pnl_snapshots (trader_address, time, realized_pnl, unrealized_pnl, total_pnl)
           VALUES ($1, $2, $3, 0, $3)
           ON CONFLICT (trader_address, time) DO NOTHING`,
          [traderAddress.toLowerCase(), point.time, point.pnl]
        );
        if (result.rowCount && result.rowCount > 0) {
          inserted++;
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return inserted;
  }

  /**
   * Insert a single snapshot with full details (for real-time updates)
   */
  async insertSnapshot(snapshot: Omit<PnLSnapshot, 'time'> & { time?: Date }): Promise<void> {
    const sql = `
      INSERT INTO pnl_snapshots (trader_address, time, realized_pnl, unrealized_pnl, total_pnl, position_count)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (trader_address, time) DO UPDATE SET
        realized_pnl = EXCLUDED.realized_pnl,
        unrealized_pnl = EXCLUDED.unrealized_pnl,
        total_pnl = EXCLUDED.total_pnl,
        position_count = EXCLUDED.position_count
    `;

    await this.query(sql, [
      snapshot.traderAddress.toLowerCase(),
      snapshot.time || new Date(),
      snapshot.realizedPnl,
      snapshot.unrealizedPnl,
      snapshot.totalPnl,
      snapshot.positionCount,
    ]);
  }

  /**
   * Get snapshots for a trader
   */
  async getSnapshots(
    traderAddress: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    } = {}
  ): Promise<PnLSnapshot[]> {
    const conditions: string[] = ['trader_address = $1'];
    const params: unknown[] = [traderAddress.toLowerCase()];
    let paramIndex = 2;

    if (options.startDate) {
      conditions.push(`time >= $${paramIndex++}`);
      params.push(options.startDate);
    }
    if (options.endDate) {
      conditions.push(`time <= $${paramIndex++}`);
      params.push(options.endDate);
    }

    let sql = `
      SELECT trader_address, time, realized_pnl, unrealized_pnl, total_pnl, position_count
      FROM pnl_snapshots
      WHERE ${conditions.join(' AND ')}
      ORDER BY time DESC
    `;

    if (options.limit) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
    }

    const result = await this.query<{
      trader_address: string;
      time: Date;
      realized_pnl: string;
      unrealized_pnl: string;
      total_pnl: string;
      position_count: number | null;
    }>(sql, params);

    return result.rows.map((row) => ({
      traderAddress: row.trader_address,
      time: row.time,
      realizedPnl: parseFloat(row.realized_pnl),
      unrealizedPnl: parseFloat(row.unrealized_pnl),
      totalPnl: parseFloat(row.total_pnl),
      positionCount: row.position_count,
    }));
  }

  /**
   * Get latest snapshot for a trader
   */
  async getLatestSnapshot(traderAddress: string): Promise<PnLSnapshot | null> {
    const snapshots = await this.getSnapshots(traderAddress, { limit: 1 });
    return snapshots.length > 0 ? snapshots[0] : null;
  }

  /**
   * Clear snapshots (all or for specific trader)
   */
  async clearSnapshots(traderAddress?: string): Promise<number> {
    let sql: string;
    let params: string[];

    if (traderAddress) {
      sql = 'DELETE FROM pnl_snapshots WHERE trader_address = $1';
      params = [traderAddress.toLowerCase()];
    } else {
      sql = 'DELETE FROM pnl_snapshots';
      params = [];
    }

    const result = await this.query(sql, params);
    return result.rowCount ?? 0;
  }

  /**
   * Get latest snapshots for all traders
   */
  async getAllLatestSnapshots(): Promise<PnLSnapshot[]> {
    const sql = `
      SELECT DISTINCT ON (trader_address)
        trader_address, time, realized_pnl, unrealized_pnl, total_pnl, position_count
      FROM pnl_snapshots
      ORDER BY trader_address, time DESC
    `;

    const result = await this.query<{
      trader_address: string;
      time: Date;
      realized_pnl: string;
      unrealized_pnl: string;
      total_pnl: string;
      position_count: number | null;
    }>(sql);

    return result.rows.map((row) => ({
      traderAddress: row.trader_address,
      time: row.time,
      realizedPnl: parseFloat(row.realized_pnl),
      unrealizedPnl: parseFloat(row.unrealized_pnl),
      totalPnl: parseFloat(row.total_pnl),
      positionCount: row.position_count,
    }));
  }

  // ==========================================================================
  // HIGH-LEVEL OPERATIONS
  // ==========================================================================

  /**
   * Backfill historical P&L for a trader
   * Fetches complete history from Polymarket and stores in database
   */
  async backfillTrader(address: string): Promise<{ fetched: number; inserted: number }> {
    Logger.info(`Backfilling P&L history for ${address}...`);

    const history = await this.fetchHistoricalPnL(address, 'all', '1h');
    Logger.info(`  Fetched ${history.length} data points from Polymarket`);

    const inserted = await this.insertSnapshots(address, history);
    Logger.info(`  Inserted ${inserted} new snapshots`);

    return { fetched: history.length, inserted };
  }

  /**
   * Backfill all active traders
   */
  async backfillAllTraders(): Promise<Map<string, { fetched: number; inserted: number }>> {
    const traders = await this.getTrackedTraders(true);
    const results = new Map<string, { fetched: number; inserted: number }>();

    for (const trader of traders) {
      try {
        const result = await this.backfillTrader(trader.address);
        results.set(trader.address, result);
        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        Logger.error(`Failed to backfill ${trader.alias}: ${error}`);
        results.set(trader.address, { fetched: 0, inserted: 0 });
      }
    }

    return results;
  }

  /**
   * Take a current P&L snapshot for a trader
   */
  async snapshotTrader(address: string): Promise<PnLSnapshot> {
    const pnl = await this.fetchCurrentPnL(address);
    const snapshot: PnLSnapshot = {
      traderAddress: address.toLowerCase(),
      time: new Date(),
      ...pnl,
    };

    await this.insertSnapshot(snapshot);
    return snapshot;
  }

  /**
   * Take snapshots for all active traders
   */
  async snapshotAllTraders(): Promise<PnLSnapshot[]> {
    const traders = await this.getTrackedTraders(true);
    const snapshots: PnLSnapshot[] = [];

    for (const trader of traders) {
      try {
        const snapshot = await this.snapshotTrader(trader.address);
        snapshots.push(snapshot);
      } catch (error) {
        Logger.error(`Failed to snapshot ${trader.alias}: ${error}`);
      }
    }

    return snapshots;
  }
}

// Export singleton instance
const pnlSnapshotService = new PnLSnapshotService();
export default pnlSnapshotService;
