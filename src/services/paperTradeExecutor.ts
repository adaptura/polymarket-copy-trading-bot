import { ClobClient } from '@polymarket/clob-client';
import { UserActivityInterface } from '../interfaces/User';
import {
    PaperTrade,
    PaperTradeSkipReason,
    PaperPortfolioAllocation,
} from '../interfaces/PaperTrading';
import { ENV } from '../config/env';
import { getUserActivityModel } from '../models/userHistory';
import { calculateOrderSize } from '../config/copyStrategy';
import Logger from '../utils/logger';
import paperTradingService from './paperTradingService';

const USER_ADDRESSES = ENV.USER_ADDRESSES;
const PAPER_EXECUTION_DELAY_MS = ENV.PAPER_EXECUTION_DELAY_MS;
const COPY_STRATEGY_CONFIG = ENV.COPY_STRATEGY_CONFIG;

// Polymarket minimum order size
const MIN_ORDER_SIZE_USD = 1.0;

// Create activity models for each user
const userActivityModels = USER_ADDRESSES.map((address) => ({
    address,
    model: getUserActivityModel(address),
}));

interface TradeWithUser extends UserActivityInterface {
    userAddress: string;
}

/**
 * Read pending trades from MongoDB (same as tradeExecutor)
 */
const readPendingTrades = async (): Promise<TradeWithUser[]> => {
    const allTrades: TradeWithUser[] = [];

    for (const { address, model } of userActivityModels) {
        const trades = await model
            .find({
                $and: [{ type: 'TRADE' }, { bot: false }, { botExcutedTime: 0 }],
            })
            .exec();

        const tradesWithUser = trades.map((trade) => ({
            ...(trade.toObject() as UserActivityInterface),
            userAddress: address,
        }));

        allTrades.push(...tradesWithUser);
    }

    return allTrades;
};

/**
 * Get best price from order book after delay
 */
const getSimulatedPrice = async (
    clobClient: ClobClient,
    asset: string,
    side: 'BUY' | 'SELL'
): Promise<{ price: number; available: boolean }> => {
    try {
        const orderBook = await clobClient.getOrderBook(asset);

        if (side === 'BUY') {
            if (!orderBook.asks || orderBook.asks.length === 0) {
                return { price: 0, available: false };
            }
            const bestAsk = orderBook.asks.reduce((min, ask) => {
                return parseFloat(ask.price) < parseFloat(min.price) ? ask : min;
            }, orderBook.asks[0]);
            return { price: parseFloat(bestAsk.price), available: true };
        } else {
            if (!orderBook.bids || orderBook.bids.length === 0) {
                return { price: 0, available: false };
            }
            const bestBid = orderBook.bids.reduce((max, bid) => {
                return parseFloat(bid.price) > parseFloat(max.price) ? bid : max;
            }, orderBook.bids[0]);
            return { price: parseFloat(bestBid.price), available: true };
        }
    } catch (error) {
        Logger.error(`Failed to fetch order book for ${asset}: ${error}`);
        return { price: 0, available: false };
    }
};

/**
 * Calculate slippage percentage
 */
const calculateSlippage = (
    originalPrice: number,
    simulatedPrice: number,
    side: 'BUY' | 'SELL'
): number => {
    if (originalPrice === 0) return 0;

    // For BUY: positive slippage means we paid more than the trader
    // For SELL: positive slippage means we received less than the trader
    if (side === 'BUY') {
        return ((simulatedPrice - originalPrice) / originalPrice) * 100;
    } else {
        return ((originalPrice - simulatedPrice) / originalPrice) * 100;
    }
};

/**
 * Simulate execution of a single trade for a portfolio
 */
const simulateTradeExecution = async (
    clobClient: ClobClient,
    trade: TradeWithUser,
    portfolioId: string,
    allocation: PaperPortfolioAllocation,
    currentBalance: number
): Promise<Omit<PaperTrade, 'id'> | null> => {
    const side = trade.side as 'BUY' | 'SELL';

    // Wait for execution delay
    await new Promise((resolve) => setTimeout(resolve, PAPER_EXECUTION_DELAY_MS));

    // Get simulated price from order book
    const { price: simulatedPrice, available } = await getSimulatedPrice(clobClient, trade.asset, side);

    if (!available) {
        // No liquidity - record as skipped
        return {
            portfolioId,
            time: new Date(),
            originalTraderAddress: trade.userAddress,
            originalTxHash: trade.transactionHash,
            originalTradeTime: new Date(trade.timestamp * 1000),
            originalPrice: trade.price,
            originalSizeUsd: trade.usdcSize,
            conditionId: trade.conditionId,
            asset: trade.asset,
            marketTitle: trade.title,
            marketSlug: trade.slug,
            outcome: trade.outcome,
            side,
            simulatedPrice: 0,
            simulatedSizeUsd: 0,
            simulatedSizeTokens: 0,
            delayMs: PAPER_EXECUTION_DELAY_MS,
            slippagePercent: 0,
            executionStatus: 'SKIPPED',
            skipReason: 'NO_LIQUIDITY',
            balanceBefore: currentBalance,
            balanceAfter: currentBalance,
        };
    }

    // Calculate slippage
    const slippagePercent = calculateSlippage(trade.price, simulatedPrice, side);

    // Determine order size based on allocation and strategy
    if (side === 'BUY') {
        // Get current position for position limit checks
        const position = await paperTradingService.getOrCreatePosition(
            portfolioId,
            trade.asset,
            trade.conditionId,
            trade.title,
            trade.slug,
            trade.outcome
        );
        const currentPositionValue = position.sizeTokens * position.avgEntryPrice;

        // Scale trader's order by allocation percentage
        const scaledTraderSize = trade.usdcSize * (allocation.allocationPercent / 100);

        // Use copy strategy to calculate final order size
        const orderCalc = calculateOrderSize(
            COPY_STRATEGY_CONFIG,
            scaledTraderSize,
            currentBalance,
            currentPositionValue
        );

        // Check if order should be executed
        if (orderCalc.finalAmount === 0 || orderCalc.finalAmount < MIN_ORDER_SIZE_USD) {
            let skipReason: PaperTradeSkipReason = 'BELOW_MIN_SIZE';
            if (orderCalc.reducedByBalance) {
                skipReason = 'INSUFFICIENT_BALANCE';
            } else if (orderCalc.reasoning.toLowerCase().includes('position')) {
                skipReason = 'ABOVE_MAX_POSITION';
            }

            return {
                portfolioId,
                time: new Date(),
                originalTraderAddress: trade.userAddress,
                originalTxHash: trade.transactionHash,
                originalTradeTime: new Date(trade.timestamp * 1000),
                originalPrice: trade.price,
                originalSizeUsd: trade.usdcSize,
                conditionId: trade.conditionId,
                asset: trade.asset,
                marketTitle: trade.title,
                marketSlug: trade.slug,
                outcome: trade.outcome,
                side,
                simulatedPrice,
                simulatedSizeUsd: 0,
                simulatedSizeTokens: 0,
                delayMs: PAPER_EXECUTION_DELAY_MS,
                slippagePercent,
                executionStatus: 'SKIPPED',
                skipReason,
                balanceBefore: currentBalance,
                balanceAfter: currentBalance,
            };
        }

        // Calculate tokens bought
        const simulatedSizeUsd = orderCalc.finalAmount;
        const simulatedSizeTokens = simulatedSizeUsd / simulatedPrice;
        const newBalance = currentBalance - simulatedSizeUsd;

        // Update position
        await paperTradingService.updatePositionOnBuy(
            portfolioId,
            trade.asset,
            simulatedSizeTokens,
            simulatedPrice,
            simulatedSizeUsd
        );

        // Update portfolio balance
        await paperTradingService.updatePortfolioBalance(portfolioId, newBalance);

        return {
            portfolioId,
            time: new Date(),
            originalTraderAddress: trade.userAddress,
            originalTxHash: trade.transactionHash,
            originalTradeTime: new Date(trade.timestamp * 1000),
            originalPrice: trade.price,
            originalSizeUsd: trade.usdcSize,
            conditionId: trade.conditionId,
            asset: trade.asset,
            marketTitle: trade.title,
            marketSlug: trade.slug,
            outcome: trade.outcome,
            side,
            simulatedPrice,
            simulatedSizeUsd,
            simulatedSizeTokens,
            delayMs: PAPER_EXECUTION_DELAY_MS,
            slippagePercent,
            executionStatus: 'FILLED',
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
        };
    } else {
        // SELL side
        const position = await paperTradingService.getOrCreatePosition(
            portfolioId,
            trade.asset,
            trade.conditionId,
            trade.title,
            trade.slug,
            trade.outcome
        );

        if (position.sizeTokens <= 0) {
            // No position to sell
            return {
                portfolioId,
                time: new Date(),
                originalTraderAddress: trade.userAddress,
                originalTxHash: trade.transactionHash,
                originalTradeTime: new Date(trade.timestamp * 1000),
                originalPrice: trade.price,
                originalSizeUsd: trade.usdcSize,
                conditionId: trade.conditionId,
                asset: trade.asset,
                marketTitle: trade.title,
                marketSlug: trade.slug,
                outcome: trade.outcome,
                side,
                simulatedPrice,
                simulatedSizeUsd: 0,
                simulatedSizeTokens: 0,
                delayMs: PAPER_EXECUTION_DELAY_MS,
                slippagePercent,
                executionStatus: 'SKIPPED',
                skipReason: 'BELOW_MIN_SIZE',
                balanceBefore: currentBalance,
                balanceAfter: currentBalance,
            };
        }

        // Calculate how much to sell based on trader's sell percentage
        // Similar logic to the real executor
        const traderSellPercent = trade.size / (trade.size + (trade.usdcSize / trade.price));
        let tokensToSell = position.sizeTokens * traderSellPercent * (allocation.allocationPercent / 100);

        // Cap to available position
        tokensToSell = Math.min(tokensToSell, position.sizeTokens);

        if (tokensToSell < 1.0) {
            // Below minimum
            return {
                portfolioId,
                time: new Date(),
                originalTraderAddress: trade.userAddress,
                originalTxHash: trade.transactionHash,
                originalTradeTime: new Date(trade.timestamp * 1000),
                originalPrice: trade.price,
                originalSizeUsd: trade.usdcSize,
                conditionId: trade.conditionId,
                asset: trade.asset,
                marketTitle: trade.title,
                marketSlug: trade.slug,
                outcome: trade.outcome,
                side,
                simulatedPrice,
                simulatedSizeUsd: 0,
                simulatedSizeTokens: 0,
                delayMs: PAPER_EXECUTION_DELAY_MS,
                slippagePercent,
                executionStatus: 'SKIPPED',
                skipReason: 'BELOW_MIN_SIZE',
                balanceBefore: currentBalance,
                balanceAfter: currentBalance,
            };
        }

        const simulatedSizeUsd = tokensToSell * simulatedPrice;
        const newBalance = currentBalance + simulatedSizeUsd;

        // Update position
        await paperTradingService.updatePositionOnSell(
            portfolioId,
            trade.asset,
            tokensToSell,
            simulatedPrice,
            simulatedSizeUsd
        );

        // Update portfolio balance
        await paperTradingService.updatePortfolioBalance(portfolioId, newBalance);

        return {
            portfolioId,
            time: new Date(),
            originalTraderAddress: trade.userAddress,
            originalTxHash: trade.transactionHash,
            originalTradeTime: new Date(trade.timestamp * 1000),
            originalPrice: trade.price,
            originalSizeUsd: trade.usdcSize,
            conditionId: trade.conditionId,
            asset: trade.asset,
            marketTitle: trade.title,
            marketSlug: trade.slug,
            outcome: trade.outcome,
            side,
            simulatedPrice,
            simulatedSizeUsd,
            simulatedSizeTokens: tokensToSell,
            delayMs: PAPER_EXECUTION_DELAY_MS,
            slippagePercent,
            executionStatus: 'FILLED',
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
        };
    }
};

/**
 * Process a single trade across all active portfolios
 */
const processTradeForPortfolios = async (
    clobClient: ClobClient,
    trade: TradeWithUser,
    portfolios: Array<{ id: string; currentBalance: number }>,
    allocationsByPortfolio: Map<string, PaperPortfolioAllocation[]>
) => {
    for (const portfolio of portfolios) {
        const allocations = allocationsByPortfolio.get(portfolio.id) || [];
        const allocation = allocations.find(
            (a) => a.traderAddress.toLowerCase() === trade.userAddress.toLowerCase()
        );

        if (!allocation || !allocation.isActive) {
            continue; // This trader is not being copied in this portfolio
        }

        try {
            const paperTrade = await simulateTradeExecution(
                clobClient,
                trade,
                portfolio.id,
                allocation,
                portfolio.currentBalance
            );

            if (paperTrade) {
                await paperTradingService.recordTrade(paperTrade);

                const statusIcon =
                    paperTrade.executionStatus === 'FILLED'
                        ? '✓'
                        : paperTrade.executionStatus === 'SKIPPED'
                          ? '⊘'
                          : '◐';
                const slippageStr =
                    paperTrade.slippagePercent >= 0
                        ? `+${paperTrade.slippagePercent.toFixed(2)}%`
                        : `${paperTrade.slippagePercent.toFixed(2)}%`;

                Logger.info(
                    `  ${statusIcon} Portfolio "${portfolio.id.slice(0, 8)}": ${paperTrade.side} $${paperTrade.simulatedSizeUsd.toFixed(2)} @ $${paperTrade.simulatedPrice.toFixed(4)} (slip: ${slippageStr})${paperTrade.skipReason ? ` [${paperTrade.skipReason}]` : ''}`
                );

                // Update portfolio balance in our local cache
                portfolio.currentBalance = paperTrade.balanceAfter;
            }
        } catch (error) {
            Logger.error(`Failed to simulate trade for portfolio ${portfolio.id}: ${error}`);
        }
    }
};

// Track if executor should continue running
let isRunning = true;

/**
 * Stop the paper trade executor gracefully
 */
export const stopPaperTradeExecutor = () => {
    isRunning = false;
    Logger.info('Paper trade executor shutdown requested...');
};

/**
 * Main paper trade executor loop
 */
const paperTradeExecutor = async (clobClient: ClobClient) => {
    // Verify paper trading service is connected
    if (!paperTradingService.isReady()) {
        if (!ENV.TIMESCALE_URL) {
            Logger.error('TIMESCALE_URL not configured - paper trading requires TimescaleDB');
            return;
        }
        await paperTradingService.connect(ENV.TIMESCALE_URL);
    }

    // Get active portfolios
    let portfolios = await paperTradingService.getActivePortfolios();

    // Filter by configured portfolio IDs if specified
    if (ENV.PAPER_PORTFOLIO_IDS.length > 0) {
        portfolios = portfolios.filter((p) => ENV.PAPER_PORTFOLIO_IDS.includes(p.id));
    }

    if (portfolios.length === 0) {
        Logger.warning('No active paper portfolios found. Create one via the API first.');
        Logger.info('Paper trade executor waiting for portfolios...');

        // Wait and check periodically for new portfolios
        while (isRunning && portfolios.length === 0) {
            await new Promise((resolve) => setTimeout(resolve, 10000));
            portfolios = await paperTradingService.getActivePortfolios();
            if (ENV.PAPER_PORTFOLIO_IDS.length > 0) {
                portfolios = portfolios.filter((p) => ENV.PAPER_PORTFOLIO_IDS.includes(p.id));
            }
        }
    }

    Logger.success(`Paper trade executor ready for ${portfolios.length} portfolio(s)`);
    for (const p of portfolios) {
        Logger.info(`  • ${p.name}: $${p.currentBalance.toFixed(2)} balance`);
    }

    // Load allocations for all portfolios
    const allocationsByPortfolio = new Map<string, PaperPortfolioAllocation[]>();
    for (const portfolio of portfolios) {
        const allocations = await paperTradingService.getPortfolioAllocations(portfolio.id);
        allocationsByPortfolio.set(portfolio.id, allocations);
        Logger.info(`  Portfolio "${portfolio.name}": tracking ${allocations.length} trader(s)`);
    }

    let lastCheck = Date.now();

    while (isRunning) {
        const trades = await readPendingTrades();

        if (trades.length > 0) {
            Logger.clearLine();
            Logger.header(`📝 PAPER TRADING: ${trades.length} trade(s) to simulate`);

            // Get fresh portfolio balances
            const portfolioBalances = await Promise.all(
                portfolios.map(async (p) => {
                    const fresh = await paperTradingService.getPortfolio(p.id);
                    return {
                        id: p.id,
                        currentBalance: fresh?.currentBalance || p.currentBalance,
                    };
                })
            );

            for (const trade of trades) {
                // Mark trade as being processed
                const UserActivity = getUserActivityModel(trade.userAddress);
                await UserActivity.updateOne({ _id: trade._id }, { $set: { botExcutedTime: 1 } });

                Logger.info(
                    `\n🔄 Simulating ${trade.side} trade from ${trade.userAddress.slice(0, 6)}...${trade.userAddress.slice(-4)}`
                );
                Logger.info(
                    `   Market: ${trade.slug || trade.title || trade.asset.slice(0, 16)}`
                );
                Logger.info(`   Original: $${trade.usdcSize.toFixed(2)} @ $${trade.price.toFixed(4)}`);

                await processTradeForPortfolios(
                    clobClient,
                    trade,
                    portfolioBalances,
                    allocationsByPortfolio
                );

                // Mark as processed
                await UserActivity.updateOne({ _id: trade._id }, { $set: { bot: true } });
            }

            lastCheck = Date.now();
            Logger.separator();
        } else {
            // Update waiting message periodically
            if (Date.now() - lastCheck > 5000) {
                Logger.waiting(USER_ADDRESSES.length, `Paper trading ${portfolios.length} portfolio(s)`);
                lastCheck = Date.now();
            }
        }

        if (!isRunning) break;
        await new Promise((resolve) => setTimeout(resolve, 300));
    }

    Logger.info('Paper trade executor stopped');
};

export default paperTradeExecutor;
