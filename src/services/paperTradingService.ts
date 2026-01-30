import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import Logger from '../utils/logger';
import {
    PaperPortfolio,
    PaperPortfolioAllocation,
    PaperPosition,
    PaperPortfolioSnapshot,
    PaperTrade,
    PaperTradeSkipReason,
    PaperPortfolioStats,
    SlippageStats,
    CreatePaperPortfolioInput,
    CreateAllocationInput,
} from '../interfaces/PaperTrading';

/**
 * Paper Trading Service
 *
 * Manages paper portfolios, allocations, positions, and snapshots.
 * Uses the same TimescaleDB connection as the analytics service.
 */
class PaperTradingService {
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
            Logger.success('PaperTradingService connected to TimescaleDB');
        } catch (error) {
            Logger.error(`PaperTradingService failed to connect: ${error}`);
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
    private async query<T extends QueryResultRow>(
        sql: string,
        params?: unknown[]
    ): Promise<QueryResult<T>> {
        if (!this.pool) {
            throw new Error('PaperTradingService not connected');
        }

        try {
            return await this.pool.query<T>(sql, params);
        } catch (error) {
            Logger.error(`PaperTradingService query error: ${error}`);
            throw error;
        }
    }

    // ========================================================================
    // PORTFOLIO MANAGEMENT
    // ========================================================================

    /**
     * Create a new paper portfolio
     */
    async createPortfolio(input: CreatePaperPortfolioInput): Promise<PaperPortfolio> {
        const sql = `
            INSERT INTO paper_portfolios (name, starting_capital, current_balance)
            VALUES ($1, $2, $2)
            RETURNING id, name, starting_capital, current_balance, is_active, created_at, updated_at
        `;

        const result = await this.query<{
            id: string;
            name: string;
            starting_capital: string;
            current_balance: string;
            is_active: boolean;
            created_at: Date;
            updated_at: Date;
        }>(sql, [input.name, input.startingCapital]);

        const row = result.rows[0];
        return {
            id: row.id,
            name: row.name,
            startingCapital: parseFloat(row.starting_capital),
            currentBalance: parseFloat(row.current_balance),
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    /**
     * Get a portfolio by ID
     */
    async getPortfolio(portfolioId: string): Promise<PaperPortfolio | null> {
        const sql = `
            SELECT id, name, starting_capital, current_balance, is_active, created_at, updated_at
            FROM paper_portfolios
            WHERE id = $1
        `;

        const result = await this.query<{
            id: string;
            name: string;
            starting_capital: string;
            current_balance: string;
            is_active: boolean;
            created_at: Date;
            updated_at: Date;
        }>(sql, [portfolioId]);

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            id: row.id,
            name: row.name,
            startingCapital: parseFloat(row.starting_capital),
            currentBalance: parseFloat(row.current_balance),
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    /**
     * Get all active portfolios
     */
    async getActivePortfolios(): Promise<PaperPortfolio[]> {
        const sql = `
            SELECT id, name, starting_capital, current_balance, is_active, created_at, updated_at
            FROM paper_portfolios
            WHERE is_active = TRUE
            ORDER BY created_at DESC
        `;

        const result = await this.query<{
            id: string;
            name: string;
            starting_capital: string;
            current_balance: string;
            is_active: boolean;
            created_at: Date;
            updated_at: Date;
        }>(sql);

        return result.rows.map((row) => ({
            id: row.id,
            name: row.name,
            startingCapital: parseFloat(row.starting_capital),
            currentBalance: parseFloat(row.current_balance),
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }

    /**
     * Get all portfolios with stats (uses the view)
     */
    async getPortfoliosWithStats(): Promise<PaperPortfolioStats[]> {
        const sql = `
            SELECT
                id, name, starting_capital, current_balance, is_active, created_at,
                total_equity, total_pnl, total_pnl_percent, open_positions, trade_count,
                last_updated, tracked_traders_count
            FROM paper_portfolio_summary
            ORDER BY created_at DESC
        `;

        const result = await this.query<{
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
        }>(sql);

        return result.rows.map((row) => ({
            portfolioId: row.id,
            portfolioName: row.name,
            startingCapital: parseFloat(row.starting_capital),
            currentEquity: parseFloat(row.total_equity),
            totalPnl: parseFloat(row.total_pnl),
            totalPnlPercent: parseFloat(row.total_pnl_percent),
            openPositions: parseInt(row.open_positions, 10),
            tradeCount: parseInt(row.trade_count, 10),
            trackedTradersCount: parseInt(row.tracked_traders_count, 10),
            lastUpdated: row.last_updated || undefined,
        }));
    }

    /**
     * Update portfolio balance
     */
    async updatePortfolioBalance(portfolioId: string, newBalance: number): Promise<void> {
        const sql = `
            UPDATE paper_portfolios
            SET current_balance = $2, updated_at = NOW()
            WHERE id = $1
        `;
        await this.query(sql, [portfolioId, newBalance]);
    }

    /**
     * Deactivate a portfolio
     */
    async deactivatePortfolio(portfolioId: string): Promise<void> {
        const sql = `
            UPDATE paper_portfolios
            SET is_active = FALSE, updated_at = NOW()
            WHERE id = $1
        `;
        await this.query(sql, [portfolioId]);
    }

    /**
     * Delete a portfolio and all associated data
     */
    async deletePortfolio(portfolioId: string): Promise<void> {
        const sql = `DELETE FROM paper_portfolios WHERE id = $1`;
        await this.query(sql, [portfolioId]);
    }

    // ========================================================================
    // ALLOCATION MANAGEMENT
    // ========================================================================

    /**
     * Set or update allocation for a trader in a portfolio
     */
    async setAllocation(input: CreateAllocationInput): Promise<PaperPortfolioAllocation> {
        const sql = `
            INSERT INTO paper_portfolio_allocations (portfolio_id, trader_address, allocation_percent, max_position_usd)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (portfolio_id, trader_address)
            DO UPDATE SET
                allocation_percent = EXCLUDED.allocation_percent,
                max_position_usd = EXCLUDED.max_position_usd,
                is_active = TRUE
            RETURNING id, portfolio_id, trader_address, allocation_percent, max_position_usd, is_active, created_at
        `;

        const result = await this.query<{
            id: string;
            portfolio_id: string;
            trader_address: string;
            allocation_percent: string;
            max_position_usd: string | null;
            is_active: boolean;
            created_at: Date;
        }>(sql, [
            input.portfolioId,
            input.traderAddress.toLowerCase(),
            input.allocationPercent,
            input.maxPositionUsd || null,
        ]);

        const row = result.rows[0];
        return {
            id: row.id,
            portfolioId: row.portfolio_id,
            traderAddress: row.trader_address,
            allocationPercent: parseFloat(row.allocation_percent),
            maxPositionUsd: row.max_position_usd ? parseFloat(row.max_position_usd) : undefined,
            isActive: row.is_active,
            createdAt: row.created_at,
        };
    }

    /**
     * Get all allocations for a portfolio
     */
    async getPortfolioAllocations(portfolioId: string): Promise<PaperPortfolioAllocation[]> {
        const sql = `
            SELECT a.id, a.portfolio_id, a.trader_address, a.allocation_percent,
                   a.max_position_usd, a.is_active, a.created_at
            FROM paper_portfolio_allocations a
            WHERE a.portfolio_id = $1 AND a.is_active = TRUE
            ORDER BY a.created_at DESC
        `;

        const result = await this.query<{
            id: string;
            portfolio_id: string;
            trader_address: string;
            allocation_percent: string;
            max_position_usd: string | null;
            is_active: boolean;
            created_at: Date;
        }>(sql, [portfolioId]);

        return result.rows.map((row) => ({
            id: row.id,
            portfolioId: row.portfolio_id,
            traderAddress: row.trader_address,
            allocationPercent: parseFloat(row.allocation_percent),
            maxPositionUsd: row.max_position_usd ? parseFloat(row.max_position_usd) : undefined,
            isActive: row.is_active,
            createdAt: row.created_at,
        }));
    }

    /**
     * Get allocation for a specific trader in a portfolio
     */
    async getAllocation(
        portfolioId: string,
        traderAddress: string
    ): Promise<PaperPortfolioAllocation | null> {
        const sql = `
            SELECT id, portfolio_id, trader_address, allocation_percent, max_position_usd, is_active, created_at
            FROM paper_portfolio_allocations
            WHERE portfolio_id = $1 AND trader_address = $2 AND is_active = TRUE
        `;

        const result = await this.query<{
            id: string;
            portfolio_id: string;
            trader_address: string;
            allocation_percent: string;
            max_position_usd: string | null;
            is_active: boolean;
            created_at: Date;
        }>(sql, [portfolioId, traderAddress.toLowerCase()]);

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            id: row.id,
            portfolioId: row.portfolio_id,
            traderAddress: row.trader_address,
            allocationPercent: parseFloat(row.allocation_percent),
            maxPositionUsd: row.max_position_usd ? parseFloat(row.max_position_usd) : undefined,
            isActive: row.is_active,
            createdAt: row.created_at,
        };
    }

    /**
     * Deactivate an allocation
     */
    async deactivateAllocation(portfolioId: string, traderAddress: string): Promise<void> {
        const sql = `
            UPDATE paper_portfolio_allocations
            SET is_active = FALSE
            WHERE portfolio_id = $1 AND trader_address = $2
        `;
        await this.query(sql, [portfolioId, traderAddress.toLowerCase()]);
    }

    // ========================================================================
    // POSITION MANAGEMENT
    // ========================================================================

    /**
     * Get or create a position for an asset in a portfolio
     */
    async getOrCreatePosition(
        portfolioId: string,
        asset: string,
        conditionId: string,
        marketTitle?: string,
        marketSlug?: string,
        outcome?: string
    ): Promise<PaperPosition> {
        // Try to get existing position
        const existingSql = `
            SELECT id, portfolio_id, condition_id, asset, market_title, market_slug, outcome,
                   size_tokens, avg_entry_price, total_cost_usd, current_price,
                   unrealized_pnl, realized_pnl, opened_at, updated_at
            FROM paper_positions
            WHERE portfolio_id = $1 AND asset = $2
        `;

        const existing = await this.query<{
            id: string;
            portfolio_id: string;
            condition_id: string;
            asset: string;
            market_title: string | null;
            market_slug: string | null;
            outcome: string | null;
            size_tokens: string;
            avg_entry_price: string;
            total_cost_usd: string;
            current_price: string | null;
            unrealized_pnl: string;
            realized_pnl: string;
            opened_at: Date;
            updated_at: Date;
        }>(existingSql, [portfolioId, asset]);

        if (existing.rows.length > 0) {
            const row = existing.rows[0];
            return {
                id: row.id,
                portfolioId: row.portfolio_id,
                conditionId: row.condition_id,
                asset: row.asset,
                marketTitle: row.market_title || undefined,
                marketSlug: row.market_slug || undefined,
                outcome: row.outcome || undefined,
                sizeTokens: parseFloat(row.size_tokens),
                avgEntryPrice: parseFloat(row.avg_entry_price),
                totalCostUsd: parseFloat(row.total_cost_usd),
                currentPrice: row.current_price ? parseFloat(row.current_price) : undefined,
                unrealizedPnl: parseFloat(row.unrealized_pnl),
                realizedPnl: parseFloat(row.realized_pnl),
                openedAt: row.opened_at,
                updatedAt: row.updated_at,
            };
        }

        // Create new position with zero values
        const insertSql = `
            INSERT INTO paper_positions (portfolio_id, condition_id, asset, market_title, market_slug, outcome, size_tokens, avg_entry_price, total_cost_usd)
            VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0)
            RETURNING id, portfolio_id, condition_id, asset, market_title, market_slug, outcome,
                      size_tokens, avg_entry_price, total_cost_usd, current_price,
                      unrealized_pnl, realized_pnl, opened_at, updated_at
        `;

        const result = await this.query<{
            id: string;
            portfolio_id: string;
            condition_id: string;
            asset: string;
            market_title: string | null;
            market_slug: string | null;
            outcome: string | null;
            size_tokens: string;
            avg_entry_price: string;
            total_cost_usd: string;
            current_price: string | null;
            unrealized_pnl: string;
            realized_pnl: string;
            opened_at: Date;
            updated_at: Date;
        }>(insertSql, [portfolioId, conditionId, asset, marketTitle || null, marketSlug || null, outcome || null]);

        const row = result.rows[0];
        return {
            id: row.id,
            portfolioId: row.portfolio_id,
            conditionId: row.condition_id,
            asset: row.asset,
            marketTitle: row.market_title || undefined,
            marketSlug: row.market_slug || undefined,
            outcome: row.outcome || undefined,
            sizeTokens: parseFloat(row.size_tokens),
            avgEntryPrice: parseFloat(row.avg_entry_price),
            totalCostUsd: parseFloat(row.total_cost_usd),
            currentPrice: row.current_price ? parseFloat(row.current_price) : undefined,
            unrealizedPnl: parseFloat(row.unrealized_pnl),
            realizedPnl: parseFloat(row.realized_pnl),
            openedAt: row.opened_at,
            updatedAt: row.updated_at,
        };
    }

    /**
     * Update position after a BUY trade
     */
    async updatePositionOnBuy(
        portfolioId: string,
        asset: string,
        tokensBought: number,
        pricePerToken: number,
        usdSpent: number
    ): Promise<void> {
        const sql = `
            UPDATE paper_positions
            SET
                size_tokens = size_tokens + $3,
                total_cost_usd = total_cost_usd + $5,
                avg_entry_price = CASE
                    WHEN size_tokens + $3 > 0
                    THEN (total_cost_usd + $5) / (size_tokens + $3)
                    ELSE $4
                END,
                updated_at = NOW()
            WHERE portfolio_id = $1 AND asset = $2
        `;
        await this.query(sql, [portfolioId, asset, tokensBought, pricePerToken, usdSpent]);
    }

    /**
     * Update position after a SELL trade
     */
    async updatePositionOnSell(
        portfolioId: string,
        asset: string,
        tokensSold: number,
        pricePerToken: number,
        usdReceived: number
    ): Promise<void> {
        // First get current position to calculate realized P&L
        const positionSql = `
            SELECT size_tokens, avg_entry_price, total_cost_usd
            FROM paper_positions
            WHERE portfolio_id = $1 AND asset = $2
        `;
        const positionResult = await this.query<{
            size_tokens: string;
            avg_entry_price: string;
            total_cost_usd: string;
        }>(positionSql, [portfolioId, asset]);

        if (positionResult.rows.length === 0) return;

        const position = positionResult.rows[0];
        const currentSize = parseFloat(position.size_tokens);
        const avgEntry = parseFloat(position.avg_entry_price);

        // Calculate realized P&L for this sale
        const costBasis = tokensSold * avgEntry;
        const realizedPnl = usdReceived - costBasis;

        // Update position
        const updateSql = `
            UPDATE paper_positions
            SET
                size_tokens = size_tokens - $3,
                total_cost_usd = CASE
                    WHEN size_tokens - $3 > 0
                    THEN total_cost_usd * ((size_tokens - $3) / size_tokens)
                    ELSE 0
                END,
                realized_pnl = realized_pnl + $5,
                updated_at = NOW()
            WHERE portfolio_id = $1 AND asset = $2
        `;
        await this.query(updateSql, [portfolioId, asset, tokensSold, pricePerToken, realizedPnl]);
    }

    /**
     * Get all positions for a portfolio
     */
    async getPortfolioPositions(portfolioId: string): Promise<PaperPosition[]> {
        const sql = `
            SELECT id, portfolio_id, condition_id, asset, market_title, market_slug, outcome,
                   size_tokens, avg_entry_price, total_cost_usd, current_price,
                   unrealized_pnl, realized_pnl, opened_at, updated_at
            FROM paper_positions
            WHERE portfolio_id = $1 AND size_tokens > 0
            ORDER BY updated_at DESC
        `;

        const result = await this.query<{
            id: string;
            portfolio_id: string;
            condition_id: string;
            asset: string;
            market_title: string | null;
            market_slug: string | null;
            outcome: string | null;
            size_tokens: string;
            avg_entry_price: string;
            total_cost_usd: string;
            current_price: string | null;
            unrealized_pnl: string;
            realized_pnl: string;
            opened_at: Date;
            updated_at: Date;
        }>(sql, [portfolioId]);

        return result.rows.map((row) => ({
            id: row.id,
            portfolioId: row.portfolio_id,
            conditionId: row.condition_id,
            asset: row.asset,
            marketTitle: row.market_title || undefined,
            marketSlug: row.market_slug || undefined,
            outcome: row.outcome || undefined,
            sizeTokens: parseFloat(row.size_tokens),
            avgEntryPrice: parseFloat(row.avg_entry_price),
            totalCostUsd: parseFloat(row.total_cost_usd),
            currentPrice: row.current_price ? parseFloat(row.current_price) : undefined,
            unrealizedPnl: parseFloat(row.unrealized_pnl),
            realizedPnl: parseFloat(row.realized_pnl),
            openedAt: row.opened_at,
            updatedAt: row.updated_at,
        }));
    }

    /**
     * Update current prices for all positions in a portfolio
     */
    async updatePositionPrices(
        portfolioId: string,
        priceUpdates: Array<{ asset: string; currentPrice: number }>
    ): Promise<void> {
        const client = await this.pool!.connect();
        try {
            await client.query('BEGIN');

            for (const update of priceUpdates) {
                const sql = `
                    UPDATE paper_positions
                    SET
                        current_price = $3,
                        unrealized_pnl = (size_tokens * $3) - total_cost_usd,
                        updated_at = NOW()
                    WHERE portfolio_id = $1 AND asset = $2 AND size_tokens > 0
                `;
                await client.query(sql, [portfolioId, update.asset, update.currentPrice]);
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // ========================================================================
    // TRADE RECORDING
    // ========================================================================

    /**
     * Record a paper trade
     */
    async recordTrade(trade: Omit<PaperTrade, 'id'>): Promise<string> {
        const sql = `
            INSERT INTO paper_trades (
                portfolio_id, time, original_trader_address, original_tx_hash,
                original_trade_time, original_price, original_size_usd,
                condition_id, asset, market_title, market_slug, outcome, side,
                simulated_price, simulated_size_usd, simulated_size_tokens,
                delay_ms, slippage_percent, execution_status, skip_reason,
                balance_before, balance_after
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                $14, $15, $16, $17, $18, $19, $20, $21, $22
            )
            RETURNING id
        `;

        const result = await this.query<{ id: string }>(sql, [
            trade.portfolioId,
            trade.time,
            trade.originalTraderAddress.toLowerCase(),
            trade.originalTxHash,
            trade.originalTradeTime,
            trade.originalPrice,
            trade.originalSizeUsd,
            trade.conditionId,
            trade.asset,
            trade.marketTitle || null,
            trade.marketSlug || null,
            trade.outcome || null,
            trade.side,
            trade.simulatedPrice,
            trade.simulatedSizeUsd,
            trade.simulatedSizeTokens,
            trade.delayMs,
            trade.slippagePercent,
            trade.executionStatus,
            trade.skipReason || null,
            trade.balanceBefore,
            trade.balanceAfter,
        ]);

        return result.rows[0].id;
    }

    /**
     * Get trades for a portfolio with pagination
     */
    async getPortfolioTrades(
        portfolioId: string,
        options: { limit?: number; offset?: number; startDate?: Date; endDate?: Date } = {}
    ): Promise<{ trades: PaperTrade[]; totalCount: number }> {
        const { limit = 50, offset = 0, startDate, endDate } = options;

        const conditions = ['portfolio_id = $1'];
        const params: unknown[] = [portfolioId];
        let paramIndex = 2;

        if (startDate) {
            conditions.push(`time >= $${paramIndex++}`);
            params.push(startDate);
        }
        if (endDate) {
            conditions.push(`time <= $${paramIndex++}`);
            params.push(endDate);
        }

        const whereClause = conditions.join(' AND ');

        // Get total count
        const countSql = `SELECT COUNT(*) as count FROM paper_trades WHERE ${whereClause}`;
        const countResult = await this.query<{ count: string }>(countSql, params);
        const totalCount = parseInt(countResult.rows[0].count, 10);

        // Get trades
        const sql = `
            SELECT id, portfolio_id, time, original_trader_address, original_tx_hash,
                   original_trade_time, original_price, original_size_usd,
                   condition_id, asset, market_title, market_slug, outcome, side,
                   simulated_price, simulated_size_usd, simulated_size_tokens,
                   delay_ms, slippage_percent, execution_status, skip_reason,
                   balance_before, balance_after
            FROM paper_trades
            WHERE ${whereClause}
            ORDER BY time DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex}
        `;

        params.push(limit, offset);

        const result = await this.query<{
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
        }>(sql, params);

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
            marketTitle: row.market_title || undefined,
            marketSlug: row.market_slug || undefined,
            outcome: row.outcome || undefined,
            side: row.side as 'BUY' | 'SELL',
            simulatedPrice: parseFloat(row.simulated_price),
            simulatedSizeUsd: parseFloat(row.simulated_size_usd),
            simulatedSizeTokens: parseFloat(row.simulated_size_tokens),
            delayMs: row.delay_ms,
            slippagePercent: parseFloat(row.slippage_percent),
            executionStatus: row.execution_status as 'FILLED' | 'PARTIAL' | 'SKIPPED',
            skipReason: (row.skip_reason as PaperTradeSkipReason) || undefined,
            balanceBefore: parseFloat(row.balance_before),
            balanceAfter: parseFloat(row.balance_after),
        }));

        return { trades, totalCount };
    }

    // ========================================================================
    // SNAPSHOTS
    // ========================================================================

    /**
     * Record a portfolio snapshot
     */
    async recordSnapshot(snapshot: PaperPortfolioSnapshot): Promise<void> {
        const sql = `
            INSERT INTO paper_portfolio_snapshots (
                portfolio_id, time, cash_balance, positions_value,
                total_equity, total_pnl, total_pnl_percent, open_positions, trade_count
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (portfolio_id, time) DO UPDATE SET
                cash_balance = EXCLUDED.cash_balance,
                positions_value = EXCLUDED.positions_value,
                total_equity = EXCLUDED.total_equity,
                total_pnl = EXCLUDED.total_pnl,
                total_pnl_percent = EXCLUDED.total_pnl_percent,
                open_positions = EXCLUDED.open_positions,
                trade_count = EXCLUDED.trade_count
        `;

        await this.query(sql, [
            snapshot.portfolioId,
            snapshot.time,
            snapshot.cashBalance,
            snapshot.positionsValue,
            snapshot.totalEquity,
            snapshot.totalPnl,
            snapshot.totalPnlPercent,
            snapshot.openPositions,
            snapshot.tradeCount,
        ]);
    }

    /**
     * Get equity curve for a portfolio
     */
    async getEquityCurve(
        portfolioId: string,
        options: { startDate?: Date; endDate?: Date; limit?: number } = {}
    ): Promise<PaperPortfolioSnapshot[]> {
        const { startDate, endDate, limit = 1000 } = options;

        const conditions = ['portfolio_id = $1'];
        const params: unknown[] = [portfolioId];
        let paramIndex = 2;

        if (startDate) {
            conditions.push(`time >= $${paramIndex++}`);
            params.push(startDate);
        }
        if (endDate) {
            conditions.push(`time <= $${paramIndex++}`);
            params.push(endDate);
        }

        params.push(limit);

        const sql = `
            SELECT portfolio_id, time, cash_balance, positions_value,
                   total_equity, total_pnl, total_pnl_percent, open_positions, trade_count
            FROM paper_portfolio_snapshots
            WHERE ${conditions.join(' AND ')}
            ORDER BY time ASC
            LIMIT $${paramIndex}
        `;

        const result = await this.query<{
            portfolio_id: string;
            time: Date;
            cash_balance: string;
            positions_value: string;
            total_equity: string;
            total_pnl: string;
            total_pnl_percent: string;
            open_positions: number;
            trade_count: number;
        }>(sql, params);

        return result.rows.map((row) => ({
            portfolioId: row.portfolio_id,
            time: row.time,
            cashBalance: parseFloat(row.cash_balance),
            positionsValue: parseFloat(row.positions_value),
            totalEquity: parseFloat(row.total_equity),
            totalPnl: parseFloat(row.total_pnl),
            totalPnlPercent: parseFloat(row.total_pnl_percent),
            openPositions: row.open_positions,
            tradeCount: row.trade_count,
        }));
    }

    // ========================================================================
    // SLIPPAGE ANALYTICS
    // ========================================================================

    /**
     * Get slippage statistics for a portfolio
     */
    async getSlippageStats(portfolioId: string): Promise<SlippageStats | null> {
        const sql = `
            SELECT
                portfolio_id,
                total_trades,
                filled_trades,
                skipped_trades,
                avg_slippage_percent,
                median_slippage_percent,
                p95_slippage_percent,
                min_slippage_percent,
                max_slippage_percent,
                total_slippage_cost_usd
            FROM paper_slippage_stats
            WHERE portfolio_id = $1
        `;

        const result = await this.query<{
            portfolio_id: string;
            total_trades: string;
            filled_trades: string;
            skipped_trades: string;
            avg_slippage_percent: string;
            median_slippage_percent: string;
            p95_slippage_percent: string;
            min_slippage_percent: string;
            max_slippage_percent: string;
            total_slippage_cost_usd: string;
        }>(sql, [portfolioId]);

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        const totalTrades = parseInt(row.total_trades, 10);
        const filledTrades = parseInt(row.filled_trades, 10);

        return {
            portfolioId: row.portfolio_id,
            totalTrades,
            filledTrades,
            skippedTrades: parseInt(row.skipped_trades, 10),
            fillRate: totalTrades > 0 ? filledTrades / totalTrades : 0,
            avgSlippagePercent: parseFloat(row.avg_slippage_percent) || 0,
            medianSlippagePercent: parseFloat(row.median_slippage_percent) || 0,
            p95SlippagePercent: parseFloat(row.p95_slippage_percent) || 0,
            minSlippagePercent: parseFloat(row.min_slippage_percent) || 0,
            maxSlippagePercent: parseFloat(row.max_slippage_percent) || 0,
            totalSlippageCostUsd: parseFloat(row.total_slippage_cost_usd) || 0,
        };
    }
}

// Export singleton instance
const paperTradingService = new PaperTradingService();
export default paperTradingService;
