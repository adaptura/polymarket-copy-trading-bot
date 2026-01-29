"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, TrendingUp, TrendingDown, Activity, DollarSign } from "lucide-react";
import { CandlestickChart } from "@/components/charts";
import { ExposureChart } from "@/components/charts/ExposureChart";
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
  getMarketById,
  generateTrades,
  generatePriceHistory,
  formatCurrency,
  formatRelativeTime,
  MOCK_TRADERS,
} from "@/lib/mock-data";
import type { OHLCData, VolumeData } from "@/components/charts";

export default function MarketDetailPage() {
  const params = useParams();
  const marketId = params.id as string;

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const market = getMarketById(marketId);
  const trades = useMemo(() => generateTrades(marketId, 50), [marketId]);
  const priceHistory = useMemo(() => generatePriceHistory(marketId, 30), [marketId]);

  // Generate volume data from price history
  const volumeData: VolumeData[] = useMemo(() => {
    let seed = marketId.charCodeAt(7) * 100;
    const seededRandom = (s: number) => {
      const x = Math.sin(s) * 10000;
      return x - Math.floor(x);
    };

    return priceHistory.map((d) => ({
      time: d.time,
      value: Math.floor(seededRandom(seed++) * 100000) + 10000,
    }));
  }, [priceHistory, marketId]);

  if (!market) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Market not found</h1>
          <Link href="/markets" className="text-primary hover:underline">
            Back to markets
          </Link>
        </div>
      </div>
    );
  }

  const priceChangePercent = ((market.currentPrice - 0.5) / 0.5) * 100;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4 mb-3">
            <Link
              href="/markets"
              className="p-2 rounded-lg hover:bg-secondary/50 transition-colors text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">{market.name}</h1>
              <p className="text-sm text-muted-foreground">Market Details</p>
            </div>
          </div>

          {/* Price banner */}
          <div className="flex items-center gap-6">
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  "text-4xl font-bold font-mono",
                  market.currentPrice >= 0.5 ? "text-profit" : "text-loss"
                )}
              >
                {(market.currentPrice * 100).toFixed(1)}¢
              </span>
              <div
                className={cn(
                  "flex items-center gap-1 text-sm",
                  priceChangePercent >= 0 ? "text-profit" : "text-loss"
                )}
              >
                {priceChangePercent >= 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                {priceChangePercent >= 0 ? "+" : ""}
                {priceChangePercent.toFixed(1)}%
              </div>
            </div>

            <div className="h-8 w-px bg-border" />

            <div className="text-sm">
              <span className="text-muted-foreground">Volume: </span>
              <span className="font-mono font-medium">
                {formatCurrency(market.totalVolume, true)}
              </span>
            </div>

            <div className="text-sm">
              <span className="text-muted-foreground">Trades: </span>
              <span className="font-mono font-medium">
                {market.tradeCount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            title="Current Price"
            value={`${(market.currentPrice * 100).toFixed(0)}¢`}
            change={priceChangePercent}
            icon={<DollarSign className="w-4 h-4" />}
          />
          <StatCard
            title="Total Volume"
            value={formatCurrency(market.totalVolume, true)}
            change={12.4}
          />
          <StatCard
            title="Trade Count"
            value={market.tradeCount.toLocaleString()}
            change={8.2}
            icon={<Activity className="w-4 h-4" />}
          />
          <StatCard
            title="Last Activity"
            value={formatRelativeTime(market.lastActivity)}
          />
        </div>

        {/* Price Chart */}
        <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50">
            <h2 className="font-semibold">Price History</h2>
            <p className="text-sm text-muted-foreground">30 day candlestick chart</p>
          </div>
          <div className="p-4">
            {mounted ? (
              <CandlestickChart
                data={priceHistory as OHLCData[]}
                volumeData={volumeData}
                height={350}
              />
            ) : (
              <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                Loading chart...
              </div>
            )}
          </div>
        </div>

        {/* Exposure Timeline */}
        <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50">
            <h2 className="font-semibold">Trader Exposure</h2>
            <p className="text-sm text-muted-foreground">
              Position sizes over time by trader
            </p>
          </div>
          <div className="p-4">
            {mounted ? (
              <ExposureChart trades={trades} height={200} />
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                Loading chart...
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="px-5 pb-4">
            <div className="flex flex-wrap gap-4">
              {Array.from(new Set(trades.map((t) => t.traderId))).map((traderId) => {
                const trader = MOCK_TRADERS.find((t) => t.id === traderId);
                if (!trader) return null;
                return (
                  <div key={traderId} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: trader.color,
                        boxShadow: `0 0 6px ${trader.color}`,
                      }}
                    />
                    <span className="text-sm text-muted-foreground">
                      {trader.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Trades Table */}
        <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50">
            <h2 className="font-semibold">Recent Trades</h2>
            <p className="text-sm text-muted-foreground">
              Latest {trades.length} transactions
            </p>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-medium">
                    Trader
                  </TableHead>
                  <TableHead className="text-muted-foreground font-medium">
                    Side
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground font-medium">
                    Amount
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground font-medium">
                    Price
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground font-medium">
                    Time
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.slice(0, 20).map((trade, index) => {
                  const trader = MOCK_TRADERS.find((t) => t.id === trade.traderId);

                  return (
                    <TableRow
                      key={trade.id}
                      className="border-border/50 table-row-hover animate-slide-up"
                      style={{ animationDelay: `${index * 20}ms` }}
                    >
                      <TableCell>
                        <Link
                          href={`/traders/${trade.traderId}`}
                          className="flex items-center gap-2 hover:text-primary transition-colors"
                        >
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{
                              backgroundColor: trader?.color || "#666",
                              boxShadow: trader
                                ? `0 0 6px ${trader.color}`
                                : "none",
                            }}
                          />
                          <span className="font-medium">
                            {trader?.name || "Unknown"}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={trade.side === "BUY" ? "default" : "destructive"}
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
                      <TableCell className="text-right font-mono">
                        {formatCurrency(trade.amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {(trade.price * 100).toFixed(1)}¢
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatRelativeTime(trade.timestamp)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
