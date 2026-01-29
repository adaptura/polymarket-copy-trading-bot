"use client";

import { useState, useCallback, useEffect } from "react";
import { Calculator, Play, RotateCcw, Loader2, Users, BarChart3, TrendingUp, Save, FolderOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AllocationSliders } from "@/components/calculator/AllocationSliders";
import { WindowSelector } from "@/components/calculator/WindowSelector";
import { MetricsTable } from "@/components/calculator/MetricsTable";
import { RollingDistributionTable } from "@/components/calculator/RollingDistributionTable";
import { RollingMetricsChart } from "@/components/calculator/RollingMetricsChart";
import { StatCard } from "@/components/dashboard/StatCard";
import { useTraders, useRollingAnalysis } from "@/lib/hooks/use-api";
import { formatPercent } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import type { TraderAllocation, RollingWindow, CalculatorMetrics } from "@/types";

// Saved allocation type
interface SavedAllocation {
  name: string;
  allocations: { traderId: string; percentage: number }[];
  initialCapital: number;
  savedAt: string;
}

const STORAGE_KEY = "polymarket-portfolio-allocations";

const DEFAULT_WINDOWS: RollingWindow[] = ["7d", "30d", "90d", "1y"];

type AnalysisMode = "simple" | "rolling";

export default function CalculatorPage() {
  const { traders, loading: tradersLoading } = useTraders();
  const { data: rollingData, loading: rollingLoading, error: rollingError, fetchRollingAnalysis, reset: resetRolling } = useRollingAnalysis();

  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("simple");
  const [allocations, setAllocations] = useState<TraderAllocation[]>([]);
  const [selectedWindows, setSelectedWindows] =
    useState<RollingWindow[]>(DEFAULT_WINDOWS);
  const [selectedRollingWindow, setSelectedRollingWindow] = useState<RollingWindow>("7d");
  const [initialCapital, setInitialCapital] = useState(100000);
  const [metrics, setMetrics] = useState<CalculatorMetrics[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Saved allocations state
  const [savedAllocations, setSavedAllocations] = useState<SavedAllocation[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [newAllocationName, setNewAllocationName] = useState("");

  // Load saved allocations from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSavedAllocations(JSON.parse(stored));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Save allocations to localStorage
  const saveAllocation = useCallback(() => {
    if (!newAllocationName.trim()) return;

    const newSaved: SavedAllocation = {
      name: newAllocationName.trim(),
      allocations: allocations.map((a) => ({
        traderId: a.traderId,
        percentage: a.percentage,
      })),
      initialCapital,
      savedAt: new Date().toISOString(),
    };

    const updated = [...savedAllocations.filter((s) => s.name !== newSaved.name), newSaved];
    setSavedAllocations(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setNewAllocationName("");
    setSaveDialogOpen(false);
  }, [newAllocationName, allocations, initialCapital, savedAllocations]);

  // Load a saved allocation
  const loadAllocation = useCallback((saved: SavedAllocation) => {
    setInitialCapital(saved.initialCapital);
    setAllocations((prev) =>
      prev.map((a) => {
        const savedA = saved.allocations.find((s) => s.traderId === a.traderId);
        return savedA ? { ...a, percentage: savedA.percentage } : { ...a, percentage: 0 };
      })
    );
  }, []);

  // Delete a saved allocation
  const deleteAllocation = useCallback((name: string) => {
    const updated = savedAllocations.filter((s) => s.name !== name);
    setSavedAllocations(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, [savedAllocations]);

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
    if (!isValidAllocation) return;

    setError(null);

    const activeAllocations = allocations
      .filter((a) => a.percentage > 0)
      .map((a) => ({
        traderAddress: a.traderId,
        percentage: a.percentage,
      }));

    if (analysisMode === "simple") {
      if (selectedWindows.length === 0) return;

      setIsCalculating(true);

      try {
        const response = await fetch("/api/calculator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            allocations: activeAllocations,
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
    } else {
      // Rolling analysis mode
      try {
        await fetchRollingAnalysis({
          allocations: activeAllocations,
          window: selectedRollingWindow,
          initialCapital,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Rolling analysis failed");
      }
    }
  }, [allocations, selectedWindows, selectedRollingWindow, isValidAllocation, initialCapital, analysisMode, fetchRollingAnalysis]);

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
    setSelectedRollingWindow("7d");
    setInitialCapital(100000);
    setMetrics([]);
    resetRolling();
    setError(null);
  };

  const isLoading = isCalculating || rollingLoading;
  const displayError = error || (rollingError ? rollingError.message : null);

  // Calculate summary stats from results
  const simpleSummary =
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

  const rollingSummary = rollingData
    ? {
        avgSharpe: rollingData.sharpeRatio.average,
        medianSharpe: rollingData.sharpeRatio.median,
        bestReturn: rollingData.totalReturn.best,
        worstDrawdown: rollingData.maxDrawdown.worst,
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
                {analysisMode === "simple" ? "Point-in-time backtesting" : "True rolling window analysis"}
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
                (analysisMode === "simple" && selectedWindows.length === 0) ||
                isLoading ||
                allocations.filter((a) => a.percentage > 0).length === 0
              }
              className="gap-2"
            >
              {isLoading ? (
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
        {/* Mode Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setAnalysisMode("simple")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              analysisMode === "simple"
                ? "bg-primary/10 text-primary border border-primary/30"
                : "bg-secondary/50 text-muted-foreground hover:bg-secondary/80 border border-transparent"
            )}
          >
            <BarChart3 className="w-4 h-4" />
            Simple Mode
          </button>
          <button
            onClick={() => setAnalysisMode("rolling")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              analysisMode === "rolling"
                ? "bg-primary/10 text-primary border border-primary/30"
                : "bg-secondary/50 text-muted-foreground hover:bg-secondary/80 border border-transparent"
            )}
          >
            <TrendingUp className="w-4 h-4" />
            Rolling Analysis
          </button>
        </div>

        {/* Error Message */}
        {displayError && (
          <div className="p-4 rounded-lg bg-loss/10 border border-loss/30 text-loss">
            {displayError}
          </div>
        )}

        {/* Summary Cards - Simple Mode */}
        {analysisMode === "simple" && simpleSummary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Best CAGR"
              value={formatPercent(simpleSummary.maxCagr)}
              className={simpleSummary.maxCagr > 50 ? "border-profit/30" : ""}
            />
            <StatCard
              title="Avg Sharpe Ratio"
              value={simpleSummary.avgSharpe?.toFixed(2) ?? "N/A"}
              className={
                simpleSummary.avgSharpe && simpleSummary.avgSharpe > 2
                  ? "border-profit/30"
                  : ""
              }
            />
            <StatCard
              title="Avg Win Rate"
              value={`${simpleSummary.avgWinRate.toFixed(1)}%`}
              className={simpleSummary.avgWinRate > 55 ? "border-profit/30" : ""}
            />
            <StatCard
              title="Max Drawdown"
              value={formatPercent(simpleSummary.minDrawdown)}
              className={simpleSummary.minDrawdown < -10 ? "border-loss/30" : ""}
            />
          </div>
        )}

        {/* Summary Cards - Rolling Mode */}
        {analysisMode === "rolling" && rollingSummary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Avg Sharpe"
              value={rollingSummary.avgSharpe.toFixed(2)}
              className={rollingSummary.avgSharpe > 1.5 ? "border-profit/30" : ""}
            />
            <StatCard
              title="Median Sharpe"
              value={rollingSummary.medianSharpe.toFixed(2)}
              className={rollingSummary.medianSharpe > 1 ? "border-profit/30" : ""}
            />
            <StatCard
              title="Best Period Return"
              value={formatPercent(rollingSummary.bestReturn)}
              className={rollingSummary.bestReturn > 20 ? "border-profit/30" : ""}
            />
            <StatCard
              title="Worst Drawdown"
              value={formatPercent(rollingSummary.worstDrawdown)}
              className={rollingSummary.worstDrawdown < -20 ? "border-loss/30" : ""}
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
            {analysisMode === "simple" ? (
              <div className="glass-card rounded-xl p-5 border border-border/50">
                <WindowSelector
                  selected={selectedWindows}
                  onChange={setSelectedWindows}
                />
              </div>
            ) : (
              <div className="glass-card rounded-xl p-5 border border-border/50">
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium">Rolling Window Size</h3>
                    <p className="text-sm text-muted-foreground">
                      Select the window size for rolling analysis
                    </p>
                  </div>

                  {/* Hourly windows */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Hourly</p>
                    <div className="flex flex-wrap gap-2">
                      {(["1h", "3h", "6h", "12h"] as RollingWindow[]).map((window) => (
                        <button
                          key={window}
                          onClick={() => setSelectedRollingWindow(window)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                            selectedRollingWindow === window
                              ? "bg-primary/10 text-primary border border-primary/30"
                              : "bg-secondary/50 text-muted-foreground hover:bg-secondary/80 border border-transparent"
                          )}
                        >
                          {window}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Daily windows */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Daily</p>
                    <div className="flex flex-wrap gap-2">
                      {(["1d", "2d", "3d", "7d", "14d", "30d", "60d", "90d", "180d", "1y"] as RollingWindow[]).map((window) => (
                        <button
                          key={window}
                          onClick={() => setSelectedRollingWindow(window)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                            selectedRollingWindow === window
                              ? "bg-primary/10 text-primary border border-primary/30"
                              : "bg-secondary/50 text-muted-foreground hover:bg-secondary/80 border border-transparent"
                          )}
                        >
                          {window}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

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

            {/* Save/Load Allocations */}
            <div className="glass-card rounded-xl p-5 border border-border/50">
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium">Portfolio Presets</h3>
                  <p className="text-sm text-muted-foreground">
                    Save and load allocation configurations
                  </p>
                </div>

                {/* Save new allocation */}
                {saveDialogOpen ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Preset name..."
                      value={newAllocationName}
                      onChange={(e) => setNewAllocationName(e.target.value)}
                      className="bg-secondary/50 border-border flex-1"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveAllocation();
                        if (e.key === "Escape") setSaveDialogOpen(false);
                      }}
                    />
                    <Button size="sm" onClick={saveAllocation} disabled={!newAllocationName.trim()}>
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSaveDialogOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSaveDialogOpen(true)}
                    className="gap-2"
                    disabled={!isValidAllocation}
                  >
                    <Save className="w-4 h-4" />
                    Save Current Allocation
                  </Button>
                )}

                {/* Saved allocations list */}
                {savedAllocations.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Saved Presets</p>
                    <div className="space-y-1">
                      {savedAllocations.map((saved) => (
                        <div
                          key={saved.name}
                          className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors group"
                        >
                          <button
                            onClick={() => loadAllocation(saved)}
                            className="flex-1 text-left flex items-center gap-2"
                          >
                            <FolderOpen className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{saved.name}</span>
                            <span className="text-xs text-muted-foreground">
                              ${saved.initialCapital.toLocaleString()}
                            </span>
                          </button>
                          <button
                            onClick={() => deleteAllocation(saved.name)}
                            className="p-1 rounded hover:bg-loss/20 text-muted-foreground hover:text-loss transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete preset"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Results - Simple Mode */}
        {analysisMode === "simple" && (
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
        )}

        {/* Results - Rolling Mode */}
        {analysisMode === "rolling" && (
          <>
            {/* Rolling Metrics Chart */}
            <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-border/50">
                <h2 className="font-semibold">Rolling Metrics Over Time</h2>
                <p className="text-sm text-muted-foreground">
                  {rollingData
                    ? `${rollingData.sampleCount} rolling ${rollingData.window} periods`
                    : "Select a window and click Calculate"}
                </p>
              </div>
              <div className="p-4">
                <RollingMetricsChart result={rollingData} />
              </div>
            </div>

            {/* Rolling Distribution Table */}
            <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-border/50">
                <h2 className="font-semibold">Distribution Statistics</h2>
                <p className="text-sm text-muted-foreground">
                  Metric distribution across all rolling periods
                </p>
              </div>
              <div className="p-4">
                <RollingDistributionTable result={rollingData} />
              </div>
            </div>
          </>
        )}

        {/* Metrics Legend */}
        {((analysisMode === "simple" && metrics.length > 0) || (analysisMode === "rolling" && rollingData)) && (
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
