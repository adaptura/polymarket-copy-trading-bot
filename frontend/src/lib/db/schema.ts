import {
  pgTable,
  text,
  timestamp,
  decimal,
  boolean,
  integer,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================================
// TRACKED TRADERS (simplified from trader_aliases)
// ============================================================================

export const trackedTraders = pgTable("tracked_traders", {
  address: text("address").primaryKey(),
  alias: text("alias").notNull(),
  color: text("color").default("#10b981"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================================================
// PNL SNAPSHOTS (TimescaleDB hypertable)
// Core analytics data - P&L fetched directly from Polymarket
// ============================================================================

export const pnlSnapshots = pgTable(
  "pnl_snapshots",
  {
    traderAddress: text("trader_address")
      .notNull()
      .references(() => trackedTraders.address, { onDelete: "cascade" }),
    time: timestamp("time", { withTimezone: true }).notNull(),
    realizedPnl: decimal("realized_pnl", { precision: 18, scale: 2 }).notNull(),
    unrealizedPnl: decimal("unrealized_pnl", { precision: 18, scale: 2 }).notNull(),
    totalPnl: decimal("total_pnl", { precision: 18, scale: 2 }).notNull(),
    positionCount: integer("position_count"),
  },
  (table) => [primaryKey({ columns: [table.traderAddress, table.time] })]
);

// ============================================================================
// RELATIONS
// ============================================================================

export const trackedTradersRelations = relations(trackedTraders, ({ many }) => ({
  pnlSnapshots: many(pnlSnapshots),
}));

export const pnlSnapshotsRelations = relations(pnlSnapshots, ({ one }) => ({
  trader: one(trackedTraders, {
    fields: [pnlSnapshots.traderAddress],
    references: [trackedTraders.address],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type TrackedTrader = typeof trackedTraders.$inferSelect;
export type NewTrackedTrader = typeof trackedTraders.$inferInsert;

export type PnlSnapshot = typeof pnlSnapshots.$inferSelect;
export type NewPnlSnapshot = typeof pnlSnapshots.$inferInsert;

// ============================================================================
// BACKWARDS COMPATIBILITY (deprecated - will be removed)
// These types exist to prevent import errors during migration
// ============================================================================

/** @deprecated Use TrackedTrader instead */
export type TraderAlias = TrackedTrader;
/** @deprecated Use NewTrackedTrader instead */
export type NewTraderAlias = NewTrackedTrader;

// Re-export trackedTraders as traderAliases for backwards compatibility
/** @deprecated Use trackedTraders instead */
export const traderAliases = trackedTraders;
