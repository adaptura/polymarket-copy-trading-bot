"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Maximize2, DollarSign, TrendingUp, TrendingDown, Users, Loader2, RefreshCw, Plus } from "lucide-react";
import { MultiLineChart } from "@/components/charts";
import { TraderSelector } from "@/components/dashboard/TraderSelector";
import { TimeRangeSelector } from "@/components/dashboard/TimeRangeSelector";
import { ResolutionSelector } from "@/components/dashboard/ResolutionSelector";
import { StatCard } from "@/components/dashboard/StatCard";
import {
  useTraders,
  useMultiTraderPnL,
  useTakeSnapshot,
  toUITrader,
} from "@/lib/hooks/use-api";
import { formatCurrency } from "@/lib/mock-data";
import type { TimeRange, Resolution } from "@/types";
import Link from "next/link";

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  const [selectedTraders, setSelectedTraders] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>("30D");
  const [resolution, setResolution] = useState<Resolution>("1D");

  // Store current time in a ref to avoid impure Date calls during render
  const nowRef = useRef(Date.now());

  // Fetch traders
  const { traders, loading: tradersLoading, refetch: refetchTraders } = useTraders();
  const uiTraders = useMemo(() => traders.map(toUITrader), [traders]);

  // Snapshot hook
  const { takeSnapshot, loading: snapshotLoading } = useTakeSnapshot();

  // Auto-select first 3 traders when loaded
  useEffect(() => {
    if (traders.length > 0 && selectedTraders.length === 0) {
      setSelectedTraders(traders.slice(0, 3).map((t) => t.address));
    }
  }, [traders, selectedTraders.length]);

  useEffect(() => {
    setMounted(true);
    nowRef.current = Date.now();
  }, []);

  useEffect(() => {
    nowRef.current = Date.now();
  }, [timeRange]);

  // Calculate date range based on time range selection
  const { startDate, endDate } = useMemo(() => {
    const now = nowRef.current;
    const end = new Date(now);
    const start = new Date(now);
    switch (timeRange) {
      case "1D":
        start.setDate(end.getDate() - 1);
        break;
      case "7D":
        start.setDate(end.getDate() - 7);
        break;
      case "30D":
        start.setDate(end.getDate() - 30);
        break;
      case "90D":
        start.setDate(end.getDate() - 90);
        break;
      case "1Y":
        start.setFullYear(end.getFullYear() - 1);
        break;
      case "All":
        start.setFullYear(end.getFullYear() - 2);
        break;
    }
    return { startDate: start, endDate: end };
  }, [timeRange]);

  // Fetch P&L data
  const { series: pnlSeries, loading: pnlLoading } = useMultiTraderPnL(
    selectedTraders,
    startDate,
    endDate,
    resolution
  );

  const isLoading = tradersLoading || pnlLoading;

  // Calculate aggregate stats from selected traders
  const stats = useMemo(() => {
    const selected = traders.filter((t) => selectedTraders.includes(t.address));
    const totalPnL = selected.reduce((sum, t) => sum + t.totalPnl, 0);
    const realizedPnL = selected.reduce((sum, t) => sum + t.realizedPnl, 0);
    const unrealizedPnL = selected.reduce((sum, t) => sum + t.unrealizedPnl, 0);
    const totalPositions = selected.reduce((sum, t) => sum + t.positionCount, 0);

    return {
      totalPnL,
      realizedPnL,
      unrealizedPnL,
      totalPositions,
    };
  }, [traders, selectedTraders]);

  // Get top performers
  const topPerformers = useMemo(() => {
    return [...uiTraders].sort((a, b) => b.totalPnL - a.totalPnL).slice(0, 5);
  }, [uiTraders]);

  // Handle snapshot refresh
  const handleRefresh = async () => {
    try {
      await takeSnapshot();
      refetchTraders();
    } catch (error) {
      console.error("Failed to take snapshot:", error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Trader P&L Analytics
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={snapshotLoading}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${snapshotLoading ? "animate-spin" : ""}`} />
              {snapshotLoading ? "Updating..." : "Update P&L"}
            </button>
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="stat-card glass-card relative overflow-hidden rounded-xl p-5 border border-border/50">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-muted-foreground">Total P&L</span>
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="space-y-1">
                <div className={`text-2xl font-bold font-mono tracking-tight ${stats.totalPnL >= 0 ? "text-profit" : "text-loss"}`}>
                  {isLoading ? "..." : formatCurrency(stats.totalPnL)}
                </div>
                {!isLoading && (
                  <div className="flex items-center gap-3 text-xs">
                    <span className={stats.realizedPnL >= 0 ? "text-profit" : "text-loss"}>
                      Realized: {formatCurrency(stats.realizedPnL)}
                    </span>
                    <span className={stats.unrealizedPnL >= 0 ? "text-profit" : "text-loss"}>
                      Unrealized: {formatCurrency(stats.unrealizedPnL)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <StatCard
            title="Active Traders"
            value={isLoading ? "..." : selectedTraders.length.toString()}
            change={0}
            icon={<Users className="w-4 h-4" />}
          />
          <StatCard
            title="Open Positions"
            value={isLoading ? "..." : stats.totalPositions.toString()}
            change={0}
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <StatCard
            title="Unrealized P&L"
            value={isLoading ? "..." : formatCurrency(stats.unrealizedPnL)}
            change={stats.unrealizedPnL >= 0 ? 1 : -1}
            icon={stats.unrealizedPnL >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          />
        </div>

        {/* Trader Selector */}
        <div className="glass-card rounded-xl p-4 border border-border/50">
          {tradersLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading traders...</span>
            </div>
          ) : traders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Users className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Traders Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add traders to start tracking their P&L performance
              </p>
              <Link
                href="/traders"
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Trader
              </Link>
            </div>
          ) : (
            <TraderSelector
              traders={uiTraders}
              selectedIds={selectedTraders}
              onSelectionChange={setSelectedTraders}
            />
          )}
        </div>

        {/* Main Chart */}
        <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
            <div>
              <h2 className="font-semibold">P&L Performance</h2>
              <p className="text-sm text-muted-foreground">
                {selectedTraders.length} trader
                {selectedTraders.length !== 1 ? "s" : ""} selected
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ResolutionSelector value={resolution} onChange={setResolution} />
              <button className="p-2 rounded-lg hover:bg-secondary/50 transition-colors text-muted-foreground hover:text-foreground">
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-4">
            {!mounted ? (
              <div className="h-[450px] flex items-center justify-center text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  Loading chart...
                </div>
              </div>
            ) : isLoading ? (
              <div className="h-[450px] flex items-center justify-center text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : pnlSeries.length === 0 ? (
              <div className="h-[450px] flex items-center justify-center text-muted-foreground">
                {selectedTraders.length === 0
                  ? "Select at least one trader to view the chart"
                  : "No P&L data available. Run backfill to import historical data."}
              </div>
            ) : (
              <MultiLineChart
                series={pnlSeries}
                volumeSeries={[]}
                height={450}
              />
            )}
          </div>
        </div>

        {/* Top Performers */}
        <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50">
            <h2 className="font-semibold">Top Performers</h2>
            <p className="text-sm text-muted-foreground">Ranked by total P&L</p>
          </div>

          {tradersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : topPerformers.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              No traders found
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {topPerformers.map((trader, index) => (
                <Link
                  key={trader.id}
                  href={`/traders/${trader.id}`}
                  className="flex items-center gap-4 px-5 py-3 table-row-hover"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {/* Rank badge */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                    style={{
                      backgroundColor:
                        index === 0
                          ? "oklch(0.8 0.15 80 / 0.2)"
                          : index === 1
                          ? "oklch(0.7 0.05 260 / 0.2)"
                          : index === 2
                          ? "oklch(0.6 0.1 50 / 0.2)"
                          : "oklch(0.2 0 0)",
                      color:
                        index === 0
                          ? "oklch(0.8 0.15 80)"
                          : index === 1
                          ? "oklch(0.7 0.05 260)"
                          : index === 2
                          ? "oklch(0.6 0.1 50)"
                          : "oklch(0.5 0 0)",
                    }}
                  >
                    {index + 1}
                  </div>

                  {/* Trader info */}
                  <div className="flex items-center gap-3 flex-1">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: trader.color,
                        boxShadow: `0 0 8px ${trader.color}`,
                      }}
                    />
                    <div>
                      <div className="font-medium">{trader.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {trader.positionCount} positions
                      </div>
                    </div>
                  </div>

                  {/* P&L */}
                  <div
                    className={`text-right font-mono font-medium ${
                      trader.totalPnL >= 0 ? "text-profit" : "text-loss"
                    }`}
                  >
                    {formatCurrency(trader.totalPnL)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
