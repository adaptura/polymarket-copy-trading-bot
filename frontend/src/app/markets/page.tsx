"use client";

import { useState } from "react";
import { Search, Grid3X3, Activity } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MarketsTable } from "@/components/markets/MarketsTable";
import { StatCard } from "@/components/dashboard/StatCard";
import { MOCK_MARKETS, formatCurrency } from "@/lib/mock-data";

export default function MarketsPage() {
  const [searchQuery, setSearchQuery] = useState("");

  // Calculate aggregate stats
  const totalVolume = MOCK_MARKETS.reduce((sum, m) => sum + m.totalVolume, 0);
  const totalTrades = MOCK_MARKETS.reduce((sum, m) => sum + m.tradeCount, 0);
  const activeMarkets = MOCK_MARKETS.filter(
    (m) => m.lastActivity.getTime() > Date.now() - 24 * 60 * 60 * 1000
  ).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Grid3X3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Markets</h1>
              <p className="text-sm text-muted-foreground">
                Browse all prediction markets
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search markets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-secondary/50 border-border"
            />
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            title="Total Markets"
            value={MOCK_MARKETS.length.toString()}
            icon={<Grid3X3 className="w-4 h-4" />}
          />
          <StatCard
            title="Active (24h)"
            value={activeMarkets.toString()}
            change={((activeMarkets / MOCK_MARKETS.length) * 100) - 50}
            icon={<Activity className="w-4 h-4" />}
          />
          <StatCard
            title="Total Volume"
            value={formatCurrency(totalVolume, true)}
            change={15.3}
            changeLabel="this week"
          />
        </div>

        {/* Markets Table */}
        <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">All Markets</h2>
              <p className="text-sm text-muted-foreground">
                {MOCK_MARKETS.length} markets · {totalTrades.toLocaleString()}{" "}
                total trades
              </p>
            </div>
          </div>

          <MarketsTable markets={MOCK_MARKETS} searchQuery={searchQuery} />
        </div>
      </div>
    </div>
  );
}
