import {
  pgTable,
  text,
  timestamp,
  decimal,
  boolean,
  integer,
  uuid,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { trackedTraders } from "./schema";

// ============================================================================
// PAPER PORTFOLIOS
// ============================================================================

export const paperPortfolios = pgTable("paper_portfolios", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  startingCapital: decimal("starting_capital", {
    precision: 18,
    scale: 2,
  }).notNull(),
  currentBalance: decimal("current_balance", {
    precision: 18,
    scale: 2,
  }).notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================================================
// PORTFOLIO ALLOCATIONS
// ============================================================================

export const paperPortfolioAllocations = pgTable(
  "paper_portfolio_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => paperPortfolios.id, { onDelete: "cascade" }),
    traderAddress: text("trader_address")
      .notNull()
      .references(() => trackedTraders.address, { onDelete: "cascade" }),
    allocationPercent: decimal("allocation_percent", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("100.0"),
    maxPositionUsd: decimal("max_position_usd", { precision: 18, scale: 2 }),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  }
);

// ============================================================================
// PAPER TRADES (TimescaleDB Hypertable)
// ============================================================================

export const paperTrades = pgTable(
  "paper_trades",
  {
    id: uuid("id").defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => paperPortfolios.id, { onDelete: "cascade" }),
    time: timestamp("time", { withTimezone: true }).notNull(),

    // Original trader's trade info
    originalTraderAddress: text("original_trader_address").notNull(),
    originalTxHash: text("original_tx_hash").notNull(),
    originalTradeTime: timestamp("original_trade_time", {
      withTimezone: true,
    }).notNull(),
    originalPrice: decimal("original_price", {
      precision: 10,
      scale: 6,
    }).notNull(),
    originalSizeUsd: decimal("original_size_usd", {
      precision: 18,
      scale: 2,
    }).notNull(),

    // Market info
    conditionId: text("condition_id").notNull(),
    asset: text("asset").notNull(),
    marketTitle: text("market_title"),
    marketSlug: text("market_slug"),
    outcome: text("outcome"),
    side: text("side").notNull(), // 'BUY' or 'SELL'

    // Simulated execution
    simulatedPrice: decimal("simulated_price", {
      precision: 10,
      scale: 6,
    }).notNull(),
    simulatedSizeUsd: decimal("simulated_size_usd", {
      precision: 18,
      scale: 2,
    }).notNull(),
    simulatedSizeTokens: decimal("simulated_size_tokens", {
      precision: 18,
      scale: 6,
    }).notNull(),

    // Execution metrics
    delayMs: integer("delay_ms").notNull().default(300),
    slippagePercent: decimal("slippage_percent", {
      precision: 8,
      scale: 4,
    }).notNull(),
    executionStatus: text("execution_status").notNull().default("FILLED"),
    skipReason: text("skip_reason"),

    // Balance tracking
    balanceBefore: decimal("balance_before", {
      precision: 18,
      scale: 2,
    }).notNull(),
    balanceAfter: decimal("balance_after", {
      precision: 18,
      scale: 2,
    }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.time, table.id] })]
);

// ============================================================================
// PAPER POSITIONS
// ============================================================================

export const paperPositions = pgTable("paper_positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  portfolioId: uuid("portfolio_id")
    .notNull()
    .references(() => paperPortfolios.id, { onDelete: "cascade" }),
  conditionId: text("condition_id").notNull(),
  asset: text("asset").notNull(),
  marketTitle: text("market_title"),
  marketSlug: text("market_slug"),
  outcome: text("outcome"),

  sizeTokens: decimal("size_tokens", { precision: 18, scale: 6 })
    .notNull()
    .default("0"),
  avgEntryPrice: decimal("avg_entry_price", {
    precision: 10,
    scale: 6,
  }).notNull(),
  totalCostUsd: decimal("total_cost_usd", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  currentPrice: decimal("current_price", { precision: 10, scale: 6 }),
  unrealizedPnl: decimal("unrealized_pnl", { precision: 18, scale: 2 }).default(
    "0"
  ),
  realizedPnl: decimal("realized_pnl", { precision: 18, scale: 2 }).default(
    "0"
  ),

  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================================================
// PAPER PORTFOLIO SNAPSHOTS (TimescaleDB Hypertable)
// ============================================================================

export const paperPortfolioSnapshots = pgTable(
  "paper_portfolio_snapshots",
  {
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => paperPortfolios.id, { onDelete: "cascade" }),
    time: timestamp("time", { withTimezone: true }).notNull(),

    cashBalance: decimal("cash_balance", {
      precision: 18,
      scale: 2,
    }).notNull(),
    positionsValue: decimal("positions_value", {
      precision: 18,
      scale: 2,
    }).notNull(),
    totalEquity: decimal("total_equity", {
      precision: 18,
      scale: 2,
    }).notNull(),
    totalPnl: decimal("total_pnl", { precision: 18, scale: 2 }).notNull(),
    totalPnlPercent: decimal("total_pnl_percent", {
      precision: 8,
      scale: 4,
    }).notNull(),
    openPositions: integer("open_positions").notNull(),
    tradeCount: integer("trade_count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.portfolioId, table.time] })]
);

// ============================================================================
// RELATIONS
// ============================================================================

export const paperPortfoliosRelations = relations(
  paperPortfolios,
  ({ many }) => ({
    allocations: many(paperPortfolioAllocations),
    trades: many(paperTrades),
    positions: many(paperPositions),
    snapshots: many(paperPortfolioSnapshots),
  })
);

export const paperPortfolioAllocationsRelations = relations(
  paperPortfolioAllocations,
  ({ one }) => ({
    portfolio: one(paperPortfolios, {
      fields: [paperPortfolioAllocations.portfolioId],
      references: [paperPortfolios.id],
    }),
    trader: one(trackedTraders, {
      fields: [paperPortfolioAllocations.traderAddress],
      references: [trackedTraders.address],
    }),
  })
);

export const paperTradesRelations = relations(paperTrades, ({ one }) => ({
  portfolio: one(paperPortfolios, {
    fields: [paperTrades.portfolioId],
    references: [paperPortfolios.id],
  }),
}));

export const paperPositionsRelations = relations(paperPositions, ({ one }) => ({
  portfolio: one(paperPortfolios, {
    fields: [paperPositions.portfolioId],
    references: [paperPortfolios.id],
  }),
}));

export const paperPortfolioSnapshotsRelations = relations(
  paperPortfolioSnapshots,
  ({ one }) => ({
    portfolio: one(paperPortfolios, {
      fields: [paperPortfolioSnapshots.portfolioId],
      references: [paperPortfolios.id],
    }),
  })
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type PaperPortfolio = typeof paperPortfolios.$inferSelect;
export type NewPaperPortfolio = typeof paperPortfolios.$inferInsert;

export type PaperPortfolioAllocation =
  typeof paperPortfolioAllocations.$inferSelect;
export type NewPaperPortfolioAllocation =
  typeof paperPortfolioAllocations.$inferInsert;

export type PaperTrade = typeof paperTrades.$inferSelect;
export type NewPaperTrade = typeof paperTrades.$inferInsert;

export type PaperPosition = typeof paperPositions.$inferSelect;
export type NewPaperPosition = typeof paperPositions.$inferInsert;

export type PaperPortfolioSnapshot =
  typeof paperPortfolioSnapshots.$inferSelect;
export type NewPaperPortfolioSnapshot =
  typeof paperPortfolioSnapshots.$inferInsert;
