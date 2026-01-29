"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Calendar,
  Target,
  Activity,
} from "lucide-react";
import { PriceLineChart } from "@/components/charts";
import { ActivityHeatmap } from "@/components/charts/ActivityHeatmap";
import { StatCard } from "@/components/dashboard/StatCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getTraderById,
  generateActivityHeatmap,
  generateTraderPnLSeries,
  formatCurrency,
  formatRelativeTime,
  MOCK_MARKETS,
  MOCK_TRADERS,
} from "@/lib/mock-data";
import type { PriceData } from "@/components/charts";

// Generate mock trades for this trader
function generateTraderTrades(traderId: string, count: number = 30) {
  const trades: {
    id: string;
    marketId: string;
    marketName: string;
    side: "BUY" | "SELL";
    amount: number;
    price: number;
    timestamp: Date;
    pnl: number;
  }[] = [];

  let seed = traderId.charCodeAt(7) * 1000;
  const seededRandom = () => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };

  for (let i = 0; i < count; i++) {
    const market = MOCK_MARKETS[Math.floor(seededRandom() * MOCK_MARKETS.length)];
    const hoursAgo = Math.floor(seededRandom() * 168); // Up to 7 days
    const amount = Math.floor(seededRandom() * 5000) + 500;
    const pnlPercent = (seededRandom() - 0.4) * 0.3; // Slight positive bias

    trades.push({
      id: `trade-${traderId}-${i}`,
      marketId: market.id,
      marketName: market.name,
      side: seededRandom() > 0.5 ? "BUY" : "SELL",
      amount,
      price: 0.3 + seededRandom() * 0.5,
      timestamp: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
      pnl: amount * pnlPercent,
    });
  }

  return trades.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

// Generate market stats for this trader
function generateTraderMarketStats(traderId: string) {
  let seed = traderId.charCodeAt(7) * 500;
  const seededRandom = () => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };

  return MOCK_MARKETS.slice(0, 5).map((market) => ({
    market,
    tradeCount: Math.floor(seededRandom() * 200) + 20,
    totalVolume: Math.floor(seededRandom() * 50000) + 5000,
    pnl: (seededRandom() - 0.3) * 10000,
    winRate: 40 + seededRandom() * 40,
  }));
}

export default function TraderProfilePage() {
  const params = useParams();
  const traderId = params.id as string;

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const trader = getTraderById(traderId);
  const activityData = useMemo(() => generateActivityHeatmap(traderId), [traderId]);
  const recentTrades = useMemo(() => generateTraderTrades(traderId), [traderId]);
  const marketStats = useMemo(() => generateTraderMarketStats(traderId), [traderId]);

  // Generate P&L curve for this trader
  const pnlSeries = useMemo(() => {
    if (!trader) return [];
    const series = generateTraderPnLSeries([trader], 90);
    return series[0]?.data || [];
  }, [trader]);

  if (!trader) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Trader not found</h1>
          <Link href="/traders" className="text-primary hover:underline">
            Back to traders
          </Link>
        </div>
      </div>
    );
  }

  const daysSinceActive = Math.floor(
    (Date.now() - trader.activeSince.getTime()) / (1000 * 60 * 60 * 24)
  );
  const avgDailyPnL = trader.totalPnL / daysSinceActive;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4 mb-3">
            <Link
              href="/traders"
              className="p-2 rounded-lg hover:bg-secondary/50 transition-colors text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-3 flex-1">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold"
                style={{
                  backgroundColor: `${trader.color}20`,
                  color: trader.color,
                  boxShadow: `0 0 20px ${trader.color}30`,
                }}
              >
                {trader.name.charAt(0)}
              </div>
              <div>
                <h1 className="text-xl font-semibold">{trader.name}</h1>
                <p className="text-sm text-muted-foreground">
                  Active since{" "}
                  {trader.activeSince.toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>

            {/* Performance badge */}
            <div
              className={cn(
                "px-4 py-2 rounded-lg font-mono font-bold text-lg",
                trader.totalPnL >= 0
                  ? "bg-profit/10 text-profit"
                  : "bg-loss/10 text-loss"
              )}
            >
              {trader.totalPnL >= 0 ? "+" : ""}
              {formatCurrency(trader.totalPnL)}
            </div>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            title="Total P&L"
            value={formatCurrency(trader.totalPnL)}
            change={trader.totalPnL > 50000 ? 24.5 : trader.totalPnL > 0 ? 12.3 : -8.4}
            icon={
              trader.totalPnL >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )
            }
          />
          <StatCard
            title="Markets Traded"
            value={trader.marketsTraded.toString()}
            icon={<Target className="w-4 h-4" />}
          />
          <StatCard
            title="Days Active"
            value={daysSinceActive.toString()}
            icon={<Calendar className="w-4 h-4" />}
          />
          <StatCard
            title="Avg Daily P&L"
            value={formatCurrency(avgDailyPnL)}
            change={avgDailyPnL > 0 ? 5.2 : -3.1}
            icon={<Activity className="w-4 h-4" />}
          />
        </div>

        {/* P&L Chart */}
        <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50">
            <h2 className="font-semibold">P&L Performance</h2>
            <p className="text-sm text-muted-foreground">
              90 day cumulative returns
            </p>
          </div>
          <div className="p-4">
            {mounted && pnlSeries.length > 0 ? (
              <PriceLineChart
                data={pnlSeries as PriceData[]}
                height={300}
                lineColor={trader.color}
                areaTopColor={`${trader.color}40`}
                areaBottomColor={`${trader.color}05`}
              />
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Loading chart...
              </div>
            )}
          </div>
        </div>

        {/* Activity Heatmap */}
        <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50">
            <h2 className="font-semibold">Trading Activity</h2>
            <p className="text-sm text-muted-foreground">
              Trade frequency by day and hour (UTC)
            </p>
          </div>
          <div className="p-5">
            <ActivityHeatmap data={activityData} color={trader.color} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Markets */}
          <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50">
              <h2 className="font-semibold">Top Markets</h2>
              <p className="text-sm text-muted-foreground">
                Best performing markets
              </p>
            </div>
            <div className="divide-y divide-border/50">
              {marketStats
                .sort((a, b) => b.pnl - a.pnl)
                .map((stat, index) => (
                  <Link
                    key={stat.market.id}
                    href={`/markets/${stat.market.id}`}
                    className="flex items-center gap-4 px-5 py-3 table-row-hover animate-slide-up"
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate hover:text-primary transition-colors">
                        {stat.market.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {stat.tradeCount} trades · {stat.winRate.toFixed(0)}% win
                        rate
                      </div>
                    </div>
                    <div
                      className={cn(
                        "font-mono font-medium",
                        stat.pnl >= 0 ? "text-profit" : "text-loss"
                      )}
                    >
                      {stat.pnl >= 0 ? "+" : ""}
                      {formatCurrency(stat.pnl)}
                    </div>
                  </Link>
                ))}
            </div>
          </div>

          {/* Recent Trades */}
          <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50">
              <h2 className="font-semibold">Recent Trades</h2>
              <p className="text-sm text-muted-foreground">
                Latest transactions
              </p>
            </div>
            <div className="overflow-x-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="text-muted-foreground font-medium sticky top-0 bg-card">
                      Market
                    </TableHead>
                    <TableHead className="text-muted-foreground font-medium sticky top-0 bg-card">
                      Side
                    </TableHead>
                    <TableHead className="text-right text-muted-foreground font-medium sticky top-0 bg-card">
                      P&L
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTrades.slice(0, 10).map((trade, index) => (
                    <TableRow
                      key={trade.id}
                      className="border-border/50 table-row-hover animate-slide-up"
                      style={{ animationDelay: `${index * 20}ms` }}
                    >
                      <TableCell className="max-w-[200px]">
                        <Link
                          href={`/markets/${trade.marketId}`}
                          className="block truncate hover:text-primary transition-colors"
                        >
                          {trade.marketName}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(trade.timestamp)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            "font-mono text-xs",
                            trade.side === "BUY"
                              ? "bg-profit/20 text-profit border-profit/30"
                              : "bg-loss/20 text-loss border-loss/30"
                          )}
                        >
                          {trade.side}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono",
                          trade.pnl >= 0 ? "text-profit" : "text-loss"
                        )}
                      >
                        {trade.pnl >= 0 ? "+" : ""}
                        {formatCurrency(trade.pnl)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
