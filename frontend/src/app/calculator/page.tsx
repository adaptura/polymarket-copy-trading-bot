"use client";

import { useState, useCallback, useEffect } from "react";
import { Calculator, Play, RotateCcw, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AllocationSliders } from "@/components/calculator/AllocationSliders";
import { WindowSelector } from "@/components/calculator/WindowSelector";
import { MetricsTable } from "@/components/calculator/MetricsTable";
import { StatCard } from "@/components/dashboard/StatCard";
import { useTraders } from "@/lib/hooks/use-api";
import { formatCurrency, formatPercent } from "@/lib/mock-data";
import type { TraderAllocation, RollingWindow, CalculatorMetrics } from "@/types";

const DEFAULT_WINDOWS: RollingWindow[] = ["7d", "30d", "90d", "1y"];

export default function CalculatorPage() {
  const { traders, loading: tradersLoading } = useTraders();

  const [allocations, setAllocations] = useState<TraderAllocation[]>([]);
  const [selectedWindows, setSelectedWindows] =
    useState<RollingWindow[]>(DEFAULT_WINDOWS);
  const [initialCapital, setInitialCapital] = useState(100000);
  const [metrics, setMetrics] = useState<CalculatorMetrics[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize allocations when traders load
  useEffect(() => {
    if (traders.length > 0 && allocations.length === 0) {
      const equalShare = Math.floor(100 / traders.length);
      const remainder = 100 - equalShare * traders.length;

      setAllocations(
        traders.map((trader, i) => ({
          traderId: trader.address,
          traderName: trader.alias,
          color: trader.color,
          percentage: equalShare + (i === 0 ? remainder : 0),
          totalPnl: trader.totalPnl,
        }))
      );
    }
  }, [traders, allocations.length]);

  const totalAllocation = allocations.reduce((sum, a) => sum + a.percentage, 0);
  const isValidAllocation = Math.abs(totalAllocation - 100) < 0.1;

  const handleCalculate = useCallback(async () => {
    if (!isValidAllocation || selectedWindows.length === 0) return;

    setIsCalculating(true);
    setError(null);

    try {
      const response = await fetch("/api/calculator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allocations: allocations
            .filter((a) => a.percentage > 0)
            .map((a) => ({
              traderAddress: a.traderId,
              percentage: a.percentage,
            })),
          windows: selectedWindows,
          initialCapital,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to calculate");
      }

      const data = await response.json();
      setMetrics(data.metrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calculation failed");
      setMetrics([]);
    } finally {
      setIsCalculating(false);
    }
  }, [allocations, selectedWindows, isValidAllocation, initialCapital]);

  const handleReset = () => {
    if (traders.length > 0) {
      const equalShare = Math.floor(100 / traders.length);
      const remainder = 100 - equalShare * traders.length;

      setAllocations(
        traders.map((trader, i) => ({
          traderId: trader.address,
          traderName: trader.alias,
          color: trader.color,
          percentage: equalShare + (i === 0 ? remainder : 0),
          totalPnl: trader.totalPnl,
        }))
      );
    }
    setSelectedWindows(DEFAULT_WINDOWS);
    setInitialCapital(100000);
    setMetrics([]);
    setError(null);
  };

  // Calculate summary stats from results
  const summary =
    metrics.length > 0
      ? {
          avgSharpe:
            metrics.filter((m) => m.sharpeRatio != null).length > 0
              ? metrics
                  .filter((m) => m.sharpeRatio != null)
                  .reduce((sum, m) => sum + (m.sharpeRatio ?? 0), 0) /
                metrics.filter((m) => m.sharpeRatio != null).length
              : null,
          avgWinRate:
            metrics.reduce((sum, m) => sum + m.winRate, 0) / metrics.length,
          maxCagr: Math.max(...metrics.map((m) => m.cagr)),
          minDrawdown: Math.min(...metrics.map((m) => m.maxDrawdown)),
        }
      : null;

  if (tradersLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (traders.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-6 py-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Portfolio Calculator</h1>
              <p className="text-sm text-muted-foreground">
                Rolling window analysis & backtesting
              </p>
            </div>
          </div>
        </header>

        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Users className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Traders Found</h2>
          <p className="text-muted-foreground max-w-md">
            Add some traders in the Import page first, then come back here to
            calculate portfolio metrics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Portfolio Calculator</h1>
              <p className="text-sm text-muted-foreground">
                Rolling window analysis & backtesting
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleCalculate}
              disabled={
                !isValidAllocation ||
                selectedWindows.length === 0 ||
                isCalculating ||
                allocations.filter((a) => a.percentage > 0).length === 0
              }
              className="gap-2"
            >
              {isCalculating ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Calculate
            </Button>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Error Message */}
        {error && (
          <div className="p-4 rounded-lg bg-loss/10 border border-loss/30 text-loss">
            {error}
          </div>
        )}

        {/* Summary Cards (show only when results exist) */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Best CAGR"
              value={formatPercent(summary.maxCagr)}
              className={summary.maxCagr > 50 ? "border-profit/30" : ""}
            />
            <StatCard
              title="Avg Sharpe Ratio"
              value={summary.avgSharpe?.toFixed(2) ?? "N/A"}
              className={
                summary.avgSharpe && summary.avgSharpe > 2
                  ? "border-profit/30"
                  : ""
              }
            />
            <StatCard
              title="Avg Win Rate"
              value={`${summary.avgWinRate.toFixed(1)}%`}
              className={summary.avgWinRate > 55 ? "border-profit/30" : ""}
            />
            <StatCard
              title="Max Drawdown"
              value={formatPercent(summary.minDrawdown)}
              className={summary.minDrawdown < -10 ? "border-loss/30" : ""}
            />
          </div>
        )}

        {/* Configuration Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Allocation Sliders */}
          <div className="glass-card rounded-xl p-5 border border-border/50">
            <AllocationSliders
              allocations={allocations}
              onChange={setAllocations}
              totalCapital={initialCapital}
            />
          </div>

          {/* Window Selector + Settings */}
          <div className="space-y-6">
            <div className="glass-card rounded-xl p-5 border border-border/50">
              <WindowSelector
                selected={selectedWindows}
                onChange={setSelectedWindows}
              />
            </div>

            <div className="glass-card rounded-xl p-5 border border-border/50">
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium">Simulation Settings</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure backtesting parameters
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="capital"
                      className="text-sm text-muted-foreground"
                    >
                      Initial Capital ($)
                    </Label>
                    <Input
                      id="capital"
                      type="number"
                      min={1000}
                      max={10000000}
                      step={1000}
                      value={initialCapital}
                      onChange={(e) => setInitialCapital(Number(e.target.value))}
                      className="bg-secondary/50 border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Active Traders
                    </Label>
                    <div className="h-9 px-3 flex items-center rounded-md bg-secondary/30 border border-border text-muted-foreground font-mono">
                      {allocations.filter((a) => a.percentage > 0).length} of{" "}
                      {allocations.length}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Results Table */}
        <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50">
            <h2 className="font-semibold">Analysis Results</h2>
            <p className="text-sm text-muted-foreground">
              {metrics.length > 0
                ? `${metrics.length} window configurations analyzed`
                : "Configure parameters and click Calculate"}
            </p>
          </div>

          <div className="p-4">
            <MetricsTable metrics={metrics} />
          </div>
        </div>

        {/* Metrics Legend */}
        {metrics.length > 0 && (
          <div className="glass-card rounded-xl p-5 border border-border/50">
            <h3 className="font-medium mb-3">Metrics Guide</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Max DD</span>
                <p className="text-xs text-muted-foreground/70">
                  Maximum peak-to-trough decline
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">CAGR</span>
                <p className="text-xs text-muted-foreground/70">
                  Compound annual growth rate
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Sharpe</span>
                <p className="text-xs text-muted-foreground/70">
                  Risk-adjusted return (&gt;2 is excellent)
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Sortino</span>
                <p className="text-xs text-muted-foreground/70">
                  Downside risk-adjusted return
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
