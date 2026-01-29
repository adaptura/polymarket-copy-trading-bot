"use client";

import { useState, useCallback } from "react";
import { Calculator, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AllocationSliders } from "@/components/calculator/AllocationSliders";
import { WindowSelector } from "@/components/calculator/WindowSelector";
import { MetricsTable } from "@/components/calculator/MetricsTable";
import { StatCard } from "@/components/dashboard/StatCard";
import {
  MOCK_TRADERS,
  generateCalculatorMetrics,
  formatCurrency,
  formatPercent,
} from "@/lib/mock-data";
import type { TraderAllocation, RollingWindow, CalculatorMetrics } from "@/types";

const DEFAULT_ALLOCATIONS: TraderAllocation[] = MOCK_TRADERS.slice(0, 3).map(
  (trader, i) => ({
    traderId: trader.id,
    traderName: trader.name,
    color: trader.color,
    percentage: i === 0 ? 50 : i === 1 ? 30 : 20,
  })
);

const DEFAULT_WINDOWS: RollingWindow[] = ["10m", "30m", "1h", "24h", "7d"];

export default function CalculatorPage() {
  const [allocations, setAllocations] =
    useState<TraderAllocation[]>(DEFAULT_ALLOCATIONS);
  const [selectedWindows, setSelectedWindows] =
    useState<RollingWindow[]>(DEFAULT_WINDOWS);
  const [delay, setDelay] = useState(1);
  const [metrics, setMetrics] = useState<CalculatorMetrics[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);

  const totalAllocation = allocations.reduce((sum, a) => sum + a.percentage, 0);
  const isValidAllocation = Math.abs(totalAllocation - 100) < 0.1;

  const handleCalculate = useCallback(() => {
    if (!isValidAllocation || selectedWindows.length === 0) return;

    setIsCalculating(true);

    // Simulate calculation delay
    setTimeout(() => {
      const results = generateCalculatorMetrics(
        selectedWindows,
        allocations.map((a) => ({ traderId: a.traderId, percentage: a.percentage }))
      );
      setMetrics(results);
      setIsCalculating(false);
    }, 500);
  }, [allocations, selectedWindows, isValidAllocation]);

  const handleReset = () => {
    setAllocations(DEFAULT_ALLOCATIONS);
    setSelectedWindows(DEFAULT_WINDOWS);
    setDelay(1);
    setMetrics([]);
  };

  // Calculate summary stats from results
  const summary = metrics.length > 0
    ? {
        avgSharpe:
          metrics.reduce((sum, m) => sum + m.sharpeRatio, 0) / metrics.length,
        avgWinRate:
          metrics.reduce((sum, m) => sum + m.winRate, 0) / metrics.length,
        maxCagr: Math.max(...metrics.map((m) => m.cagr)),
        minDrawdown: Math.min(...metrics.map((m) => m.maxDrawdown)),
      }
    : null;

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
              disabled={!isValidAllocation || selectedWindows.length === 0 || isCalculating}
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
              value={summary.avgSharpe.toFixed(2)}
              className={summary.avgSharpe > 2 ? "border-profit/30" : ""}
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
            />
          </div>

          {/* Window Selector + Delay */}
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
                    <Label htmlFor="delay" className="text-sm text-muted-foreground">
                      Simulated Delay (seconds)
                    </Label>
                    <Input
                      id="delay"
                      type="number"
                      min={0}
                      max={60}
                      value={delay}
                      onChange={(e) => setDelay(Number(e.target.value))}
                      className="bg-secondary/50 border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Initial Capital
                    </Label>
                    <div className="h-9 px-3 flex items-center rounded-md bg-secondary/30 border border-border text-muted-foreground font-mono">
                      {formatCurrency(100000)}
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
