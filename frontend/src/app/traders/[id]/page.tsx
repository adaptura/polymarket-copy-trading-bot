"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertTriangle,
  BarChart3,
  Percent,
  Loader2,
} from "lucide-react";
import { PriceLineChart } from "@/components/charts";
import { StatCard } from "@/components/dashboard/StatCard";
import { TimeRangeSelector } from "@/components/dashboard/TimeRangeSelector";
import { cn } from "@/lib/utils";
import { useTraderAnalytics, useTakeSnapshot } from "@/lib/hooks/use-api";
import { formatCurrency } from "@/lib/mock-data";
import type { PriceData } from "@/components/charts";
import type { TimeRange } from "@/types";

export default function TraderProfilePage() {
  const params = useParams();
  const traderId = params.id as string;

  const [mounted, setMounted] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>("90D");
  const nowRef = useRef(Date.now());

  const { analytics, loading, error, refetch } = useTraderAnalytics(traderId);
  const { takeSnapshot, loading: snapshotLoading } = useTakeSnapshot();

  useEffect(() => {
    setMounted(true);
    nowRef.current = Date.now();
  }, []);

  // Filter P&L history based on time range
  const filteredHistory = useMemo(() => {
    if (!analytics?.pnlHistory) return [];

    const now = Date.now();
    let cutoff: number;

    switch (timeRange) {
      case "1D":
        cutoff = now - 24 * 60 * 60 * 1000;
        break;
      case "7D":
        cutoff = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case "30D":
        cutoff = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case "90D":
        cutoff = now - 90 * 24 * 60 * 60 * 1000;
        break;
      case "1Y":
        cutoff = now - 365 * 24 * 60 * 60 * 1000;
        break;
      case "All":
      default:
        cutoff = 0;
    }

    return analytics.pnlHistory.filter(
      (point) => new Date(point.time).getTime() >= cutoff
    );
  }, [analytics?.pnlHistory, timeRange]);

  // Convert to chart format
  const chartData: PriceData[] = useMemo(() => {
    return filteredHistory.map((point) => ({
      time: Math.floor(new Date(point.time).getTime() / 1000) as any,
      value: point.totalPnl,
    }));
  }, [filteredHistory]);

  const handleRefresh = async () => {
    try {
      await takeSnapshot(traderId);
      refetch();
    } catch (err) {
      console.error("Failed to refresh:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Trader not found</h1>
          <p className="text-muted-foreground mb-4">
            {error?.message || "Could not load trader data"}
          </p>
          <Link href="/traders" className="text-primary hover:underline">
            Back to traders
          </Link>
        </div>
      </div>
    );
  }

  const { trader, drawdown, rollingReturns, volatility } = analytics;
  const traderColor = trader.color || "#10b981";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
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
                  backgroundColor: `${traderColor}20`,
                  color: traderColor,
                  boxShadow: `0 0 20px ${traderColor}30`,
                }}
              >
                {trader.alias.charAt(0)}
              </div>
              <div>
                <h1 className="text-xl font-semibold">{trader.alias}</h1>
                <p className="text-sm text-muted-foreground font-mono">
                  {trader.address.slice(0, 6)}...{trader.address.slice(-4)}
                </p>
              </div>
            </div>

            <button
              onClick={handleRefresh}
              disabled={snapshotLoading}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${snapshotLoading ? "animate-spin" : ""}`} />
              {snapshotLoading ? "Updating..." : "Update"}
            </button>

            <div
              className={cn(
                "px-4 py-2 rounded-lg font-mono font-bold text-lg",
                trader.totalPnl >= 0
                  ? "bg-profit/10 text-profit"
                  : "bg-loss/10 text-loss"
              )}
            >
              {trader.totalPnl >= 0 ? "+" : ""}
              {formatCurrency(trader.totalPnl)}
            </div>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            title="Total P&L"
            value={formatCurrency(trader.totalPnl)}
            change={trader.totalPnl > 0 ? 1 : -1}
            icon={
              trader.totalPnl >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )
            }
          />
          <StatCard
            title="Max Drawdown"
            value={`${drawdown.maxDrawdownPct.toFixed(1)}%`}
            change={drawdown.maxDrawdownPct > 20 ? -1 : 0}
            icon={<AlertTriangle className="w-4 h-4" />}
          />
          <StatCard
            title="Win Rate"
            value={`${volatility.winRate.toFixed(1)}%`}
            change={volatility.winRate > 50 ? 1 : -1}
            icon={<Percent className="w-4 h-4" />}
          />
          <StatCard
            title="Open Positions"
            value={trader.positionCount.toString()}
            change={0}
            icon={<BarChart3 className="w-4 h-4" />}
          />
        </div>

        {/* P&L Chart */}
        <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
            <div>
              <h2 className="font-semibold">P&L Performance</h2>
              <p className="text-sm text-muted-foreground">
                Historical P&L from Polymarket
              </p>
            </div>
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          </div>
          <div className="p-4">
            {!mounted || chartData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                {chartData.length === 0
                  ? "No P&L data available. Run backfill to import historical data."
                  : "Loading chart..."}
              </div>
            ) : (
              <PriceLineChart
                data={chartData}
                height={300}
                lineColor={traderColor}
                areaTopColor={`${traderColor}40`}
                areaBottomColor={`${traderColor}05`}
              />
            )}
          </div>
        </div>

        {/* Analytics Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Rolling Returns */}
          <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50">
              <h2 className="font-semibold">Rolling Returns</h2>
              <p className="text-sm text-muted-foreground">P&L by period</p>
            </div>
            <div className="divide-y divide-border/50">
              {[
                { label: "7 Days", value: rollingReturns.pnl7d },
                { label: "30 Days", value: rollingReturns.pnl30d },
                { label: "90 Days", value: rollingReturns.pnl90d },
                { label: "Year to Date", value: rollingReturns.pnlYtd },
                { label: "All Time", value: rollingReturns.pnlAllTime },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <span className="text-muted-foreground">{item.label}</span>
                  <span
                    className={cn(
                      "font-mono font-medium",
                      item.value === null
                        ? "text-muted-foreground"
                        : item.value >= 0
                        ? "text-profit"
                        : "text-loss"
                    )}
                  >
                    {item.value === null
                      ? "N/A"
                      : `${item.value >= 0 ? "+" : ""}${formatCurrency(item.value)}`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Drawdown Metrics */}
          <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50">
              <h2 className="font-semibold">Drawdown Analysis</h2>
              <p className="text-sm text-muted-foreground">Risk metrics</p>
            </div>
            <div className="divide-y divide-border/50">
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-muted-foreground">Max Drawdown</span>
                <span className="font-mono font-medium text-loss">
                  -{drawdown.maxDrawdownPct.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-muted-foreground">Current Drawdown</span>
                <span
                  className={cn(
                    "font-mono font-medium",
                    drawdown.currentDrawdownPct > 0 ? "text-loss" : "text-profit"
                  )}
                >
                  {drawdown.currentDrawdownPct > 0 ? "-" : ""}
                  {drawdown.currentDrawdownPct.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-muted-foreground">Peak P&L</span>
                <span className="font-mono font-medium text-profit">
                  {formatCurrency(drawdown.peakPnl)}
                </span>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-muted-foreground">Trough P&L</span>
                <span className="font-mono font-medium text-loss">
                  {formatCurrency(drawdown.troughPnl)}
                </span>
              </div>
            </div>
          </div>

          {/* Volatility Metrics */}
          <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50">
              <h2 className="font-semibold">Volatility & Consistency</h2>
              <p className="text-sm text-muted-foreground">Performance stats</p>
            </div>
            <div className="divide-y divide-border/50">
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-muted-foreground">Daily Volatility</span>
                <span className="font-mono font-medium">
                  {formatCurrency(volatility.dailyVolatility)}
                </span>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-muted-foreground">Avg Daily Change</span>
                <span
                  className={cn(
                    "font-mono font-medium",
                    volatility.avgDailyChange >= 0 ? "text-profit" : "text-loss"
                  )}
                >
                  {volatility.avgDailyChange >= 0 ? "+" : ""}
                  {formatCurrency(volatility.avgDailyChange)}
                </span>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-muted-foreground">Win Rate</span>
                <span className="font-mono font-medium">
                  {volatility.winRate.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-muted-foreground">Sharpe Ratio</span>
                <span className="font-mono font-medium">
                  {volatility.sharpeRatio !== null
                    ? volatility.sharpeRatio.toFixed(2)
                    : "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-muted-foreground">Winning Days</span>
                <span className="font-mono font-medium">
                  {volatility.positiveDays} / {volatility.positiveDays + volatility.negativeDays}
                </span>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-muted-foreground">Max Win Streak</span>
                <span className="font-mono font-medium text-profit">
                  {volatility.maxWinStreak} days
                </span>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-muted-foreground">Max Loss Streak</span>
                <span className="font-mono font-medium text-loss">
                  {volatility.maxLossStreak} days
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Polymarket Link */}
        <div className="glass-card rounded-xl border border-border/50 p-5">
          <p className="text-sm text-muted-foreground">
            View on Polymarket:{" "}
            <a
              href={`https://polymarket.com/profile/${trader.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-mono"
            >
              polymarket.com/profile/{trader.address.slice(0, 6)}...
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
