import * as crypto from 'crypto';
import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import Logger from '../utils/logger';

/**
 * Generate a deterministic fill_id for deduplication
 * Combines tx_hash:asset:size:price to create unique identifier per fill
 */
function generateFillId(txHash: string, asset: string | undefined, size: number | undefined, price: number | undefined): string {
    const data = `${txHash}:${asset || ''}:${size || 0}:${price || 0}`;
    return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * Trade data structure for TimescaleDB
 */
export interface TradeRecord {
    time: Date;
    transactionHash: string;
    traderAddress: string;
    conditionId: string;
    asset?: string; // Token ID - needed for multi-fill dedup
    type?: 'TRADE' | 'REDEEM' | 'SPLIT' | 'MERGE' | 'REWARD' | 'MAKER_REBATE'; // Activity type
    marketTitle?: string;
    marketSlug?: string;
    marketLink?: string;
    outcome?: string;
    side: 'BUY' | 'SELL' | 'REDEEM' | 'SPLIT' | 'MERGE' | 'REWARD' | 'MAKER_REBATE';
    size?: number;
    usdcSize?: number;
    price?: number;
    simulatedCopySize?: number;
    simulatedCopyPrice?: number;
    simulatedSlippage?: number;
    simulatedPnl?: number;
}

/**
 * Trader performance metrics from continuous aggregates
 */
export interface TraderPerformance {
    traderAddress: string;
    totalTrades: number;
    buyVolume: number;
    sellVolume: number;
    totalVolume: number;
    uniqueMarkets: number;
    avgTradeSize: number;
    winRate?: number;
    realizedPnl?: number;
}

/**
 * Daily P&L record
 */
export interface DailyPnL {
    date: Date;
    traderAddress: string;
    conditionId: string;
    marketTitle: string;
    realizedPnl: number;
    buyVolume: number;
    sellVolume: number;
    tradeCount: number;
}

/**
 * TimescaleDB service for analytics storage
 */
class TimescaleService {
    private pool: Pool | null = null;
    private isConnected: boolean = false;
    private connectionUrl: string | null = null;
    private tradesTableExists: boolean = false;
    private tableCheckDone: boolean = false;

    /**
     * Initialize connection pool
     */
    async connect(connectionUrl: string): Promise<void> {
        if (this.isConnected && this.pool) {
            return;
        }

        this.connectionUrl = connectionUrl;

        const poolConfig: PoolConfig = {
            connectionString: connectionUrl,
            max: 10, // Maximum connections in pool
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
        };

        try {
            this.pool = new Pool(poolConfig);

            // Test connection
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');

            // Check if trades table exists
            const tableCheck = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public'
                    AND table_name = 'trades'
                ) as exists
            `);
            this.tradesTableExists = tableCheck.rows[0]?.exists === true;
            this.tableCheckDone = true;

            client.release();

            this.isConnected = true;
            Logger.success('Connected to TimescaleDB');

            if (!this.tradesTableExists) {
                Logger.warning('TimescaleDB: "trades" table not found - trade syncing disabled. Run migrations to enable.');
            }
        } catch (error) {
            Logger.error(`Failed to connect to TimescaleDB: ${error}`);
            throw error;
        }
    }

    /**
     * Close connection pool gracefully
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
     * Check if trade syncing is available (connected + trades table exists)
     */
    canSyncTrades(): boolean {
        return this.isConnected && this.pool !== null && this.tradesTableExists;
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

    /**
     * Insert a single trade record
     */
    async insertTrade(trade: TradeRecord): Promise<void> {
        const fillId = generateFillId(
            trade.transactionHash.toLowerCase(),
            trade.asset,
            trade.size,
            trade.price
        );

        const sql = `
            INSERT INTO trades (
                time, transaction_hash, trader_address, condition_id,
                asset, fill_id, type, market_title, market_slug, market_link, outcome,
                side, size, usdc_size, price,
                simulated_copy_size, simulated_copy_price, simulated_slippage, simulated_pnl
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            ON CONFLICT (time, fill_id) DO NOTHING
        `;

        const params = [
            trade.time,
            trade.transactionHash.toLowerCase(),
            trade.traderAddress.toLowerCase(),
            trade.conditionId,
            trade.asset || null,
            fillId,
            trade.type || 'TRADE',
            trade.marketTitle || null,
            trade.marketSlug || null,
            trade.marketLink || null,
            trade.outcome || null,
            trade.side,
            trade.size || null,
            trade.usdcSize || null,
            trade.price || null,
            trade.simulatedCopySize || null,
            trade.simulatedCopyPrice || null,
            trade.simulatedSlippage || null,
            trade.simulatedPnl || null,
        ];

        await this.query(sql, params);
    }

    /**
     * Insert multiple trades in a batch
     */
    async insertTrades(trades: TradeRecord[]): Promise<number> {
        if (trades.length === 0) return 0;

        const client = await this.pool!.connect();
        let inserted = 0;

        try {
            await client.query('BEGIN');

            for (const trade of trades) {
                const fillId = generateFillId(
                    trade.transactionHash.toLowerCase(),
                    trade.asset,
                    trade.size,
                    trade.price
                );

                const sql = `
                    INSERT INTO trades (
                        time, transaction_hash, trader_address, condition_id,
                        asset, fill_id, type, market_title, market_slug, market_link, outcome,
                        side, size, usdc_size, price,
                        simulated_copy_size, simulated_copy_price, simulated_slippage, simulated_pnl
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
                    ON CONFLICT (time, fill_id) DO NOTHING
                `;

                const result = await client.query(sql, [
                    trade.time,
                    trade.transactionHash.toLowerCase(),
                    trade.traderAddress.toLowerCase(),
                    trade.conditionId,
                    trade.asset || null,
                    fillId,
                    trade.type || 'TRADE',
                    trade.marketTitle || null,
                    trade.marketSlug || null,
                    trade.marketLink || null,
                    trade.outcome || null,
                    trade.side,
                    trade.size || null,
                    trade.usdcSize || null,
                    trade.price || null,
                    trade.simulatedCopySize || null,
                    trade.simulatedCopyPrice || null,
                    trade.simulatedSlippage || null,
                    trade.simulatedPnl || null,
                ]);

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
     * Get trader performance from continuous aggregates
     */
    async getTraderPerformance(
        traderAddress: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<TraderPerformance | null> {
        const sql = `
            SELECT
                trader_address,
                SUM(total_trades) as total_trades,
                SUM(total_volume) as total_volume,
                SUM(buy_count) as buy_count,
                SUM(sell_count) as sell_count,
                AVG(avg_trade_size) as avg_trade_size,
                SUM(unique_markets) as unique_markets
            FROM trader_daily_summary
            WHERE trader_address = $1
            ${startDate ? 'AND bucket >= $2' : ''}
            ${endDate ? `AND bucket <= $${startDate ? 3 : 2}` : ''}
            GROUP BY trader_address
        `;

        const params: unknown[] = [traderAddress.toLowerCase()];
        if (startDate) params.push(startDate);
        if (endDate) params.push(endDate);

        const result = await this.query<{
            trader_address: string;
            total_trades: string;
            total_volume: string;
            buy_count: string;
            sell_count: string;
            avg_trade_size: string;
            unique_markets: string;
        }>(sql, params);

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            traderAddress: row.trader_address,
            totalTrades: parseInt(row.total_trades, 10),
            buyVolume: parseFloat(row.buy_count),
            sellVolume: parseFloat(row.sell_count),
            totalVolume: parseFloat(row.total_volume),
            uniqueMarkets: parseInt(row.unique_markets, 10),
            avgTradeSize: parseFloat(row.avg_trade_size),
        };
    }

    /**
     * Get daily P&L for a trader
     */
    async getDailyPnL(
        traderAddress: string,
        startDate?: Date,
        endDate?: Date,
        limit: number = 30
    ): Promise<DailyPnL[]> {
        const params: unknown[] = [traderAddress.toLowerCase()];
        let paramIndex = 2;

        let dateConditions = '';
        if (startDate) {
            dateConditions += ` AND bucket >= $${paramIndex++}`;
            params.push(startDate);
        }
        if (endDate) {
            dateConditions += ` AND bucket <= $${paramIndex++}`;
            params.push(endDate);
        }
        params.push(limit);

        const sql = `
            SELECT
                bucket as date,
                trader_address,
                condition_id,
                market_title,
                realized_pnl,
                buy_volume,
                sell_volume,
                trade_count
            FROM trader_daily_pnl
            WHERE trader_address = $1
            ${dateConditions}
            ORDER BY bucket DESC
            LIMIT $${paramIndex}
        `;

        const result = await this.query<{
            date: Date;
            trader_address: string;
            condition_id: string;
            market_title: string;
            realized_pnl: string;
            buy_volume: string;
            sell_volume: string;
            trade_count: string;
        }>(sql, params);

        return result.rows.map((row) => ({
            date: row.date,
            traderAddress: row.trader_address,
            conditionId: row.condition_id,
            marketTitle: row.market_title,
            realizedPnl: parseFloat(row.realized_pnl),
            buyVolume: parseFloat(row.buy_volume),
            sellVolume: parseFloat(row.sell_volume),
            tradeCount: parseInt(row.trade_count, 10),
        }));
    }

    /**
     * Get trade history with pagination
     */
    async getTradeHistory(
        options: {
            traderAddress?: string;
            conditionId?: string;
            side?: 'BUY' | 'SELL';
            startDate?: Date;
            endDate?: Date;
            limit?: number;
            offset?: number;
        } = {}
    ): Promise<TradeRecord[]> {
        const { traderAddress, conditionId, side, startDate, endDate, limit = 100, offset = 0 } = options;

        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIndex = 1;

        if (traderAddress) {
            conditions.push(`trader_address = $${paramIndex++}`);
            params.push(traderAddress.toLowerCase());
        }
        if (conditionId) {
            conditions.push(`condition_id = $${paramIndex++}`);
            params.push(conditionId);
        }
        if (side) {
            conditions.push(`side = $${paramIndex++}`);
            params.push(side);
        }
        if (startDate) {
            conditions.push(`time >= $${paramIndex++}`);
            params.push(startDate);
        }
        if (endDate) {
            conditions.push(`time <= $${paramIndex++}`);
            params.push(endDate);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const sql = `
            SELECT
                time, transaction_hash, trader_address, condition_id,
                market_title, market_slug, market_link, outcome,
                side, size, usdc_size, price,
                simulated_copy_size, simulated_copy_price, simulated_slippage, simulated_pnl
            FROM trades
            ${whereClause}
            ORDER BY time DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex}
        `;

        params.push(limit, offset);

        const result = await this.query<{
            time: Date;
            transaction_hash: string;
            trader_address: string;
            condition_id: string;
            market_title: string | null;
            market_slug: string | null;
            market_link: string | null;
            outcome: string | null;
            side: 'BUY' | 'SELL';
            size: string | null;
            usdc_size: string | null;
            price: string | null;
            simulated_copy_size: string | null;
            simulated_copy_price: string | null;
            simulated_slippage: string | null;
            simulated_pnl: string | null;
        }>(sql, params);

        return result.rows.map((row) => ({
            time: row.time,
            transactionHash: row.transaction_hash,
            traderAddress: row.trader_address,
            conditionId: row.condition_id,
            marketTitle: row.market_title || undefined,
            marketSlug: row.market_slug || undefined,
            marketLink: row.market_link || undefined,
            outcome: row.outcome || undefined,
            side: row.side,
            size: row.size ? parseFloat(row.size) : undefined,
            usdcSize: row.usdc_size ? parseFloat(row.usdc_size) : undefined,
            price: row.price ? parseFloat(row.price) : undefined,
            simulatedCopySize: row.simulated_copy_size ? parseFloat(row.simulated_copy_size) : undefined,
            simulatedCopyPrice: row.simulated_copy_price ? parseFloat(row.simulated_copy_price) : undefined,
            simulatedSlippage: row.simulated_slippage ? parseFloat(row.simulated_slippage) : undefined,
            simulatedPnl: row.simulated_pnl ? parseFloat(row.simulated_pnl) : undefined,
        }));
    }

    /**
     * Get total trade count
     */
    async getTradeCount(traderAddress?: string): Promise<number> {
        const sql = traderAddress
            ? 'SELECT COUNT(*) as count FROM trades WHERE trader_address = $1'
            : 'SELECT COUNT(*) as count FROM trades';

        const params = traderAddress ? [traderAddress.toLowerCase()] : [];
        const result = await this.query<{ count: string }>(sql, params);

        return parseInt(result.rows[0].count, 10);
    }

    /**
     * Get hourly trading stats
     */
    async getHourlyStats(
        traderAddress: string,
        hours: number = 24
    ): Promise<
        Array<{
            bucket: Date;
            tradeCount: number;
            buyVolume: number;
            sellVolume: number;
            totalVolume: number;
        }>
    > {
        const sql = `
            SELECT
                bucket,
                trade_count,
                buy_volume,
                sell_volume,
                total_volume
            FROM trader_hourly_stats
            WHERE trader_address = $1
            AND bucket >= NOW() - INTERVAL '${hours} hours'
            ORDER BY bucket DESC
        `;

        const result = await this.query<{
            bucket: Date;
            trade_count: string;
            buy_volume: string;
            sell_volume: string;
            total_volume: string;
        }>(sql, [traderAddress.toLowerCase()]);

        return result.rows.map((row) => ({
            bucket: row.bucket,
            tradeCount: parseInt(row.trade_count, 10),
            buyVolume: parseFloat(row.buy_volume),
            sellVolume: parseFloat(row.sell_volume),
            totalVolume: parseFloat(row.total_volume),
        }));
    }

    /**
     * Get all unique traders in the database
     */
    async getUniqueTraders(): Promise<string[]> {
        const sql = 'SELECT DISTINCT trader_address FROM trades ORDER BY trader_address';
        const result = await this.query<{ trader_address: string }>(sql);
        return result.rows.map((row) => row.trader_address);
    }

    /**
     * Run raw SQL query (for migrations or custom queries)
     */
    async runRawQuery(sql: string, params?: unknown[]): Promise<QueryResult> {
        return this.query(sql, params);
    }

    /**
     * Insert a duplicate trade record for debugging
     */
    async insertDuplicateTrade(
        trade: {
            time: Date;
            transactionHash: string;
            traderAddress: string;
            conditionId: string;
            asset?: string;
            side?: string;
            size?: number;
            usdcSize?: number;
            price?: number;
        },
        duplicateKey: string,
        source: 'backfill' | 'live' = 'backfill',
        batchOffset?: number
    ): Promise<void> {
        const sql = `
            INSERT INTO duplicate_trades (
                original_time, transaction_hash, trader_address, condition_id,
                asset, side, size, usdc_size, price, duplicate_key, source, batch_offset
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `;

        await this.query(sql, [
            trade.time,
            trade.transactionHash,
            trade.traderAddress.toLowerCase(),
            trade.conditionId,
            trade.asset || null,
            trade.side || null,
            trade.size || null,
            trade.usdcSize || null,
            trade.price || null,
            duplicateKey,
            source,
            batchOffset || null,
        ]);
    }

    /**
     * Get duplicate trade count
     */
    async getDuplicateCount(traderAddress?: string): Promise<number> {
        const sql = traderAddress
            ? 'SELECT COUNT(*) as count FROM duplicate_trades WHERE trader_address = $1'
            : 'SELECT COUNT(*) as count FROM duplicate_trades';

        const params = traderAddress ? [traderAddress.toLowerCase()] : [];
        const result = await this.query<{ count: string }>(sql, params);

        return parseInt(result.rows[0].count, 10);
    }

    /**
     * Clear duplicate trades table
     */
    async clearDuplicates(): Promise<void> {
        await this.query('TRUNCATE TABLE duplicate_trades');
    }

    /**
     * Record backfill metadata (what time ranges have been fetched)
     */
    async recordBackfillMetadata(
        traderAddress: string,
        activityType: string,
        fetchStart: Date,
        fetchEnd: Date,
        tradesFetched: number,
        tradesInserted: number
    ): Promise<void> {
        const sql = `
            INSERT INTO backfill_metadata (
                trader_address, activity_type, fetch_start, fetch_end,
                trades_fetched, trades_inserted
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (trader_address, activity_type, fetch_start, fetch_end)
            DO UPDATE SET
                trades_fetched = EXCLUDED.trades_fetched,
                trades_inserted = EXCLUDED.trades_inserted,
                fetched_at = NOW()
        `;

        await this.query(sql, [
            traderAddress.toLowerCase(),
            activityType,
            fetchStart,
            fetchEnd,
            tradesFetched,
            tradesInserted,
        ]);
    }

    /**
     * Get backfill metadata for a trader
     */
    async getBackfillMetadata(traderAddress?: string): Promise<Array<{
        traderAddress: string;
        activityType: string;
        fetchStart: Date;
        fetchEnd: Date;
        tradesFetched: number;
        tradesInserted: number;
        fetchedAt: Date;
    }>> {
        const sql = traderAddress
            ? `SELECT trader_address, activity_type, fetch_start, fetch_end,
                      trades_fetched, trades_inserted, fetched_at
               FROM backfill_metadata
               WHERE trader_address = $1
               ORDER BY fetch_start DESC`
            : `SELECT trader_address, activity_type, fetch_start, fetch_end,
                      trades_fetched, trades_inserted, fetched_at
               FROM backfill_metadata
               ORDER BY trader_address, fetch_start DESC`;

        const params = traderAddress ? [traderAddress.toLowerCase()] : [];
        const result = await this.query<{
            trader_address: string;
            activity_type: string;
            fetch_start: Date;
            fetch_end: Date;
            trades_fetched: string;
            trades_inserted: string;
            fetched_at: Date;
        }>(sql, params);

        return result.rows.map(row => ({
            traderAddress: row.trader_address,
            activityType: row.activity_type,
            fetchStart: row.fetch_start,
            fetchEnd: row.fetch_end,
            tradesFetched: parseInt(row.trades_fetched, 10),
            tradesInserted: parseInt(row.trades_inserted, 10),
            fetchedAt: row.fetched_at,
        }));
    }
}

// Export singleton instance
const timescaleService = new TimescaleService();
export default timescaleService;
