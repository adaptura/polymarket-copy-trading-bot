/**
 * Paper Trading System Interfaces
 *
 * Types for simulating copy trading execution without real funds.
 * Supports multiple portfolios with independent configurations.
 */

// ============================================================================
// PAPER PORTFOLIO
// ============================================================================

export interface PaperPortfolio {
  id: string;
  name: string;
  startingCapital: number;
  currentBalance: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaperPortfolioInput {
  name: string;
  startingCapital: number;
}

export interface UpdatePaperPortfolioInput {
  name?: string;
  isActive?: boolean;
}

// ============================================================================
// PORTFOLIO ALLOCATIONS
// ============================================================================

export interface PaperPortfolioAllocation {
  id: string;
  portfolioId: string;
  traderAddress: string;
  allocationPercent: number; // 0-100, percentage of trader's position to copy
  maxPositionUsd?: number; // Optional per-trader position limit
  isActive: boolean;
  createdAt: Date;
}

export interface CreateAllocationInput {
  portfolioId: string;
  traderAddress: string;
  allocationPercent: number;
  maxPositionUsd?: number;
}

export interface UpdateAllocationInput {
  allocationPercent?: number;
  maxPositionUsd?: number;
  isActive?: boolean;
}

// ============================================================================
// PAPER TRADES
// ============================================================================

export type PaperTradeExecutionStatus = "FILLED" | "PARTIAL" | "SKIPPED";

export type PaperTradeSkipReason =
  | "INSUFFICIENT_BALANCE"
  | "BELOW_MIN_SIZE"
  | "ABOVE_MAX_POSITION"
  | "NO_LIQUIDITY"
  | "TRADER_NOT_TRACKED"
  | "ALLOCATION_INACTIVE";

export interface PaperTrade {
  id: string;
  portfolioId: string;
  time: Date;

  // Original trade info (from copied trader)
  originalTraderAddress: string;
  originalTxHash: string;
  originalTradeTime: Date;
  originalPrice: number;
  originalSizeUsd: number;

  // Market info
  conditionId: string;
  asset: string;
  marketTitle?: string;
  marketSlug?: string;
  outcome?: string;
  side: "BUY" | "SELL";

  // Simulated execution (after delay)
  simulatedPrice: number; // Best ask/bid at execution time
  simulatedSizeUsd: number; // Amount "bought/sold" in USD
  simulatedSizeTokens: number; // Tokens acquired/sold

  // Execution quality metrics
  delayMs: number;
  slippagePercent: number; // (simulated - original) / original * 100
  executionStatus: PaperTradeExecutionStatus;
  skipReason?: PaperTradeSkipReason;

  // Balance tracking
  balanceBefore: number;
  balanceAfter: number;
}

// ============================================================================
// PAPER POSITIONS
// ============================================================================

export interface PaperPosition {
  id: string;
  portfolioId: string;
  conditionId: string;
  asset: string;
  marketTitle?: string;
  marketSlug?: string;
  outcome?: string;

  sizeTokens: number;
  avgEntryPrice: number;
  totalCostUsd: number;
  currentPrice?: number;
  unrealizedPnl: number;
  realizedPnl: number;

  openedAt: Date;
  updatedAt: Date;
}

// ============================================================================
// PORTFOLIO SNAPSHOTS
// ============================================================================

export interface PaperPortfolioSnapshot {
  portfolioId: string;
  time: Date;

  cashBalance: number; // Virtual USDC remaining
  positionsValue: number; // Sum of position values at current prices
  totalEquity: number; // cash + positions
  totalPnl: number; // total_equity - starting_capital
  totalPnlPercent: number; // (total_pnl / starting_capital) * 100
  openPositions: number; // Count of positions with size > 0
  tradeCount: number; // Total trades executed so far
}

// ============================================================================
// EXECUTION SIMULATION
// ============================================================================

export interface ExecutionSimulationConfig {
  delayMs: number; // Default 300ms
  maxSlippagePercent?: number; // Skip if slippage exceeds this
}

export interface ExecutionSimulationResult {
  success: boolean;
  simulatedPrice: number;
  slippagePercent: number;
  sizeUsd: number;
  sizeTokens: number;
  skipReason?: PaperTradeSkipReason;
}

export interface OrderBookSnapshot {
  asset: string;
  timestamp: Date;
  bestBid: number;
  bestAsk: number;
  bidDepth: number; // Total USD available at best bid
  askDepth: number; // Total USD available at best ask
}

// ============================================================================
// ANALYTICS & STATISTICS
// ============================================================================

export interface PaperPortfolioStats {
  portfolioId: string;
  portfolioName: string;
  startingCapital: number;
  currentEquity: number;
  totalPnl: number;
  totalPnlPercent: number;
  openPositions: number;
  tradeCount: number;
  trackedTradersCount: number;
  lastUpdated?: Date;
}

export interface SlippageStats {
  portfolioId: string;
  totalTrades: number;
  filledTrades: number;
  skippedTrades: number;
  fillRate: number;
  avgSlippagePercent: number;
  medianSlippagePercent: number;
  p95SlippagePercent: number;
  minSlippagePercent: number;
  maxSlippagePercent: number;
  totalSlippageCostUsd: number;
}

export interface SlippageByTrader {
  portfolioId: string;
  traderAddress: string;
  traderName: string;
  tradeCount: number;
  avgSlippagePercent: number;
  totalVolumeUsd: number;
}

export interface SlippageBySizeBucket {
  bucket: string; // "<$10", "$10-50", "$50-100", ">$100"
  tradeCount: number;
  avgSlippagePercent: number;
}

// ============================================================================
// API RESPONSES
// ============================================================================

export interface PaperPortfolioWithStats extends PaperPortfolio {
  totalEquity: number;
  totalPnl: number;
  totalPnlPercent: number;
  openPositions: number;
  tradeCount: number;
  trackedTradersCount: number;
  lastUpdated?: Date;
}

export interface PaperTradesResponse {
  trades: PaperTrade[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface EquityCurvePoint {
  time: Date;
  equity: number;
  pnl: number;
  pnlPercent: number;
}

export interface PortfolioAnalytics {
  equityCurve: EquityCurvePoint[];
  slippageStats: SlippageStats;
  slippageByTrader: SlippageByTrader[];
  dailyReturns: { date: string; returnPercent: number }[];
}
