"use client";

import { useState, useEffect, useMemo } from "react";
import { Maximize2, Activity, DollarSign, TrendingUp, Users } from "lucide-react";
import { MultiLineChart } from "@/components/charts";
import { TraderSelector } from "@/components/dashboard/TraderSelector";
import { TimeRangeSelector } from "@/components/dashboard/TimeRangeSelector";
import { ResolutionSelector } from "@/components/dashboard/ResolutionSelector";
import { StatCard } from "@/components/dashboard/StatCard";
import {
  MOCK_TRADERS,
  generateTraderPnLSeries,
  generateTraderVolumeData,
  formatCurrency,
} from "@/lib/mock-data";
import type { TimeRange, Resolution } from "@/types";

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  const [selectedTraders, setSelectedTraders] = useState<string[]>(
    MOCK_TRADERS.slice(0, 3).map((t) => t.id)
  );
  const [timeRange, setTimeRange] = useState<TimeRange>("30D");
  const [resolution, setResolution] = useState<Resolution>("1D");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Generate data based on time range
  const days = useMemo(() => {
    switch (timeRange) {
      case "1D":
        return 1;
      case "7D":
        return 7;
      case "30D":
        return 30;
      case "90D":
        return 90;
      case "1Y":
        return 365;
      case "All":
        return 365;
      default:
        return 30;
    }
  }, [timeRange]);

  const allPnLSeries = useMemo(
    () => generateTraderPnLSeries(MOCK_TRADERS, days),
    [days]
  );

  const filteredPnLSeries = useMemo(
    () => allPnLSeries.filter((s) => selectedTraders.includes(s.traderId)),
    [allPnLSeries, selectedTraders]
  );

  const allVolumeData = useMemo(
    () => generateTraderVolumeData(MOCK_TRADERS, days),
    [days]
  );

  const filteredVolumeData = useMemo(
    () => allVolumeData.filter((v) => selectedTraders.includes(v.traderId)),
    [allVolumeData, selectedTraders]
  );

  // Calculate total volume for stats
  const totalVolume = useMemo(() => {
    return filteredVolumeData.reduce(
      (sum, trader) => sum + trader.data.reduce((s, d) => s + d.value, 0),
      0
    );
  }, [filteredVolumeData]);

  // Calculate aggregate stats from selected traders
  const stats = useMemo(() => {
    const selected = MOCK_TRADERS.filter((t) => selectedTraders.includes(t.id));
    const totalPnL = selected.reduce((sum, t) => sum + t.totalPnL, 0);
    const totalMarkets = new Set(selected.flatMap((t) => t.marketsTraded)).size;
    const avgWinRate = 67.3; // Mock

    return {
      totalPnL,
      totalMarkets,
      avgWinRate,
      totalVolume,
      pnlChange: 12.4,
      marketsChange: 8,
      winRateChange: 2.1,
      volumeChange: 23,
    };
  }, [selectedTraders, totalVolume]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Multi-trader P&L comparison
            </p>
          </div>
          <div className="flex items-center gap-3">
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total P&L"
            value={formatCurrency(stats.totalPnL)}
            change={stats.pnlChange}
            changeLabel="vs last period"
            icon={<DollarSign className="w-4 h-4" />}
          />
          <StatCard
            title="Active Traders"
            value={selectedTraders.length.toString()}
            change={stats.marketsChange}
            icon={<Users className="w-4 h-4" />}
          />
          <StatCard
            title="Win Rate"
            value={`${stats.avgWinRate}%`}
            change={stats.winRateChange}
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <StatCard
            title="Total Volume"
            value={formatCurrency(stats.totalVolume, true)}
            change={stats.volumeChange}
            icon={<Activity className="w-4 h-4" />}
          />
        </div>

        {/* Trader Selector */}
        <div className="glass-card rounded-xl p-4 border border-border/50">
          <TraderSelector
            traders={MOCK_TRADERS}
            selectedIds={selectedTraders}
            onSelectionChange={setSelectedTraders}
          />
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
            {mounted && filteredPnLSeries.length > 0 ? (
              <MultiLineChart
                series={filteredPnLSeries}
                volumeSeries={filteredVolumeData}
                height={450}
              />
            ) : mounted && filteredPnLSeries.length === 0 ? (
              <div className="h-[450px] flex items-center justify-center text-muted-foreground">
                Select at least one trader to view the chart
              </div>
            ) : (
              <div className="h-[450px] flex items-center justify-center text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  Loading chart...
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top Performers */}
        <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50">
            <h2 className="font-semibold">Top Performers</h2>
            <p className="text-sm text-muted-foreground">
              Ranked by total P&L
            </p>
          </div>

          <div className="divide-y divide-border/50">
            {MOCK_TRADERS.sort((a, b) => b.totalPnL - a.totalPnL)
              .slice(0, 5)
              .map((trader, index) => (
                <div
                  key={trader.id}
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
                        {trader.marketsTraded} markets
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
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
