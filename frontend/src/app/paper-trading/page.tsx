"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FlaskConical,
  Plus,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Wallet,
  BarChart3,
  Activity,
  Beaker,
  Sparkles,
  ChevronRight,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PortfolioSelector } from "@/components/paper-trading/PortfolioSelector";
import { CreatePortfolioDialog } from "@/components/paper-trading/CreatePortfolioDialog";
import { PaperPositionsTable } from "@/components/paper-trading/PaperPositionsTable";
import { PaperTradesTable } from "@/components/paper-trading/PaperTradesTable";
import { AllocationEditor } from "@/components/paper-trading/AllocationEditor";
import { EquityCurveChart } from "@/components/paper-trading/EquityCurveChart";
import { cn } from "@/lib/utils";

interface Portfolio {
  id: string;
  name: string;
  startingCapital: number;
  currentBalance: number;
  isActive: boolean;
  totalEquity: number;
  totalPnl: number;
  totalPnlPercent: number;
  openPositions: number;
  tradeCount: number;
  trackedTradersCount: number;
  lastUpdated?: string;
}

export default function PaperTradingPage() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("positions");

  const selectedPortfolio = portfolios.find((p) => p.id === selectedPortfolioId);

  // Fetch portfolios
  const fetchPortfolios = useCallback(async () => {
    try {
      const response = await fetch("/api/paper-trading/portfolios");
      if (!response.ok) throw new Error("Failed to fetch portfolios");
      const data = await response.json();
      setPortfolios(data.portfolios);

      // Select first portfolio if none selected
      if (!selectedPortfolioId && data.portfolios.length > 0) {
        setSelectedPortfolioId(data.portfolios[0].id);
      }
    } catch (error) {
      console.error("Error fetching portfolios:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedPortfolioId]);

  useEffect(() => {
    fetchPortfolios();
  }, [fetchPortfolios]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchPortfolios();
    setRefreshing(false);
  };

  const handlePortfolioCreated = (portfolio: Portfolio) => {
    setPortfolios((prev) => [portfolio, ...prev]);
    setSelectedPortfolioId(portfolio.id);
    setCreateDialogOpen(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatCompactCurrency = (value: number) => {
    if (Math.abs(value) >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    }
    if (Math.abs(value) >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return formatCurrency(value);
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan/20 to-primary/20 flex items-center justify-center">
              <Beaker className="w-8 h-8 text-primary animate-pulse" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-cyan/30 animate-ping" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-muted-foreground">
              Initializing simulation environment...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <div className="relative overflow-hidden border-b border-border/50">
        {/* Background gradient mesh */}
        <div className="absolute inset-0 bg-gradient-to-br from-cyan/5 via-transparent to-primary/5" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-radial from-cyan/10 to-transparent blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-radial from-primary/10 to-transparent blur-3xl" />

        {/* Fine grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `
              linear-gradient(var(--foreground) 1px, transparent 1px),
              linear-gradient(90deg, var(--foreground) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px'
          }}
        />

        <div className="relative px-6 py-8">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-5">
              {/* Icon cluster */}
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan/20 via-primary/15 to-cyan/10 flex items-center justify-center border border-cyan/20 shadow-lg shadow-cyan/5">
                  <FlaskConical className="w-7 h-7 text-cyan" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <Sparkles className="w-2.5 h-2.5 text-white" />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight">
                    Paper Trading Lab
                  </h1>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-cyan/10 text-cyan border border-cyan/20">
                    Simulation
                  </span>
                </div>
                <p className="text-muted-foreground max-w-md">
                  Backtest strategies with real order book data. Zero risk, full insights.
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="h-9 px-4 border-border/60 hover:border-border hover:bg-surface-2"
              >
                <RefreshCw
                  className={cn("w-4 h-4 mr-2", refreshing && "animate-spin")}
                />
                Sync
              </Button>
              <Button
                size="sm"
                onClick={() => setCreateDialogOpen(true)}
                className="h-9 px-4 bg-gradient-to-r from-cyan to-primary hover:from-cyan/90 hover:to-primary/90 shadow-lg shadow-cyan/20"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Portfolio
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">
        {portfolios.length > 0 ? (
          <>
            {/* Portfolio Selector */}
            <PortfolioSelector
              portfolios={portfolios}
              selectedId={selectedPortfolioId}
              onSelect={setSelectedPortfolioId}
            />

            {selectedPortfolio && (
              <>
                {/* Stats Dashboard */}
                <div className="grid grid-cols-12 gap-4">
                  {/* Main equity card - larger */}
                  <div className="col-span-12 lg:col-span-5">
                    <div
                      className="relative h-full rounded-2xl overflow-hidden border border-border/50"
                      style={{
                        background: 'linear-gradient(135deg, var(--card) 0%, var(--surface-2) 100%)'
                      }}
                    >
                      {/* Decorative elements */}
                      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-radial from-cyan/10 to-transparent" />
                      <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-radial from-primary/10 to-transparent" />

                      <div className="relative p-6">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-muted-foreground font-medium">
                            Portfolio Value
                          </span>
                          <div className="w-9 h-9 rounded-xl bg-cyan/10 flex items-center justify-center">
                            <Wallet className="w-4.5 h-4.5 text-cyan" />
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="text-4xl font-bold font-mono tracking-tight">
                            {formatCurrency(selectedPortfolio.totalEquity)}
                          </div>

                          <div className="flex items-center gap-4">
                            <div
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                                selectedPortfolio.totalPnl >= 0
                                  ? "bg-profit/10 text-profit"
                                  : "bg-loss/10 text-loss"
                              )}
                            >
                              {selectedPortfolio.totalPnl >= 0 ? (
                                <TrendingUp className="w-4 h-4" />
                              ) : (
                                <TrendingDown className="w-4 h-4" />
                              )}
                              <span className="font-mono font-semibold">
                                {selectedPortfolio.totalPnl >= 0 ? "+" : ""}
                                {selectedPortfolio.totalPnlPercent.toFixed(2)}%
                              </span>
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {formatCurrency(selectedPortfolio.totalPnl)} P&L
                            </span>
                          </div>

                          {/* Mini progress bar showing equity vs starting capital */}
                          <div className="pt-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                              <span>Starting: {formatCompactCurrency(selectedPortfolio.startingCapital)}</span>
                              <span>Current: {formatCompactCurrency(selectedPortfolio.totalEquity)}</span>
                            </div>
                            <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-500",
                                  selectedPortfolio.totalPnl >= 0
                                    ? "bg-gradient-to-r from-cyan to-profit"
                                    : "bg-gradient-to-r from-cyan to-loss"
                                )}
                                style={{
                                  width: `${Math.min(100, Math.max(0, (selectedPortfolio.totalEquity / selectedPortfolio.startingCapital) * 100))}%`
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stat cards - smaller grid */}
                  <div className="col-span-12 lg:col-span-7 grid grid-cols-2 md:grid-cols-3 gap-4">
                    {/* P&L Card */}
                    <div className="glass-card rounded-xl p-5 border border-border/50 group hover:border-border/80 transition-all duration-200">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Total P&L
                        </span>
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                          selectedPortfolio.totalPnl >= 0
                            ? "bg-profit/10 text-profit"
                            : "bg-loss/10 text-loss"
                        )}>
                          {selectedPortfolio.totalPnl >= 0 ? (
                            <TrendingUp className="w-4 h-4" />
                          ) : (
                            <TrendingDown className="w-4 h-4" />
                          )}
                        </div>
                      </div>
                      <div className={cn(
                        "text-2xl font-bold font-mono",
                        selectedPortfolio.totalPnl >= 0 ? "text-profit" : "text-loss"
                      )}>
                        {selectedPortfolio.totalPnl >= 0 ? "+" : ""}
                        {formatCurrency(selectedPortfolio.totalPnl)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {selectedPortfolio.totalPnlPercent >= 0 ? "+" : ""}
                        {selectedPortfolio.totalPnlPercent.toFixed(2)}% return
                      </div>
                    </div>

                    {/* Positions Card */}
                    <div className="glass-card rounded-xl p-5 border border-border/50 group hover:border-border/80 transition-all duration-200">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Positions
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                          <BarChart3 className="w-4 h-4 text-violet-500" />
                        </div>
                      </div>
                      <div className="text-2xl font-bold font-mono">
                        {selectedPortfolio.openPositions}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Open markets
                      </div>
                    </div>

                    {/* Trades Card */}
                    <div className="glass-card rounded-xl p-5 border border-border/50 group hover:border-border/80 transition-all duration-200">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Trades
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                          <Activity className="w-4 h-4 text-amber-500" />
                        </div>
                      </div>
                      <div className="text-2xl font-bold font-mono">
                        {selectedPortfolio.tradeCount}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Executed simulations
                      </div>
                    </div>

                    {/* Traders Card */}
                    <div className="glass-card rounded-xl p-5 border border-border/50 group hover:border-border/80 transition-all duration-200">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Tracked
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Zap className="w-4 h-4 text-primary" />
                        </div>
                      </div>
                      <div className="text-2xl font-bold font-mono">
                        {selectedPortfolio.trackedTradersCount}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Traders copying
                      </div>
                    </div>

                    {/* Starting Capital Card */}
                    <div className="glass-card rounded-xl p-5 border border-border/50 group hover:border-border/80 transition-all duration-200">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Starting
                        </span>
                        <div className="w-8 h-8 rounded-lg bg-surface-3 flex items-center justify-center">
                          <Wallet className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="text-2xl font-bold font-mono">
                        {formatCompactCurrency(selectedPortfolio.startingCapital)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Initial capital
                      </div>
                    </div>

                    {/* Status Card */}
                    <div className="glass-card rounded-xl p-5 border border-border/50 group hover:border-border/80 transition-all duration-200">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Status
                        </span>
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          selectedPortfolio.isActive ? "bg-profit animate-pulse" : "bg-muted-foreground"
                        )} />
                      </div>
                      <div className="text-2xl font-bold font-mono">
                        {selectedPortfolio.isActive ? "Active" : "Paused"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Simulation state
                      </div>
                    </div>
                  </div>
                </div>

                {/* Equity Curve Chart */}
                <div className="relative rounded-2xl overflow-hidden border border-border/50 bg-gradient-to-b from-card to-surface-1">
                  {/* Chart header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                    <div>
                      <h3 className="text-lg font-semibold">Performance Curve</h3>
                      <p className="text-sm text-muted-foreground">
                        Portfolio equity over time
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-2 border border-border/50">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        <span className="text-xs font-medium text-muted-foreground">Equity</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-2 border border-border/50">
                        <div className="w-2 h-2 rounded-full border border-muted-foreground border-dashed" />
                        <span className="text-xs font-medium text-muted-foreground">Baseline</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <EquityCurveChart portfolioId={selectedPortfolio.id} />
                  </div>
                </div>

                {/* Data Tabs */}
                <Tabs
                  value={activeTab}
                  onValueChange={setActiveTab}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <TabsList className="bg-surface-2/80 p-1 rounded-xl border border-border/50">
                      <TabsTrigger
                        value="positions"
                        className="rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm"
                      >
                        <BarChart3 className="w-4 h-4 mr-2" />
                        Positions
                      </TabsTrigger>
                      <TabsTrigger
                        value="trades"
                        className="rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm"
                      >
                        <Activity className="w-4 h-4 mr-2" />
                        Trades
                      </TabsTrigger>
                      <TabsTrigger
                        value="allocations"
                        className="rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm"
                      >
                        <Zap className="w-4 h-4 mr-2" />
                        Allocations
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="positions" className="mt-4">
                    <PaperPositionsTable portfolioId={selectedPortfolio.id} />
                  </TabsContent>

                  <TabsContent value="trades" className="mt-4">
                    <PaperTradesTable portfolioId={selectedPortfolio.id} />
                  </TabsContent>

                  <TabsContent value="allocations" className="mt-4">
                    <AllocationEditor
                      portfolioId={selectedPortfolio.id}
                      onUpdate={fetchPortfolios}
                    />
                  </TabsContent>
                </Tabs>
              </>
            )}
          </>
        ) : (
          /* Empty State */
          <div className="relative rounded-2xl overflow-hidden border border-border/50 border-dashed">
            {/* Background atmosphere */}
            <div className="absolute inset-0 bg-gradient-to-br from-cyan/5 via-transparent to-primary/5" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-radial from-cyan/10 to-transparent blur-3xl" />

            <div className="relative p-16 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan/20 to-primary/10 mb-6 border border-cyan/20">
                <Beaker className="w-10 h-10 text-cyan" />
              </div>

              <h3 className="text-xl font-semibold mb-2">
                Start Your First Experiment
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto mb-8">
                Create a paper trading portfolio to simulate copy-trading strategies
                with real market data and zero financial risk.
              </p>

              <Button
                onClick={() => setCreateDialogOpen(true)}
                className="h-11 px-6 bg-gradient-to-r from-cyan to-primary hover:from-cyan/90 hover:to-primary/90 shadow-lg shadow-cyan/20"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Portfolio
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>

              {/* Feature hints */}
              <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto">
                <div className="text-left p-4 rounded-xl bg-card/50 border border-border/50">
                  <div className="w-8 h-8 rounded-lg bg-cyan/10 flex items-center justify-center mb-3">
                    <Activity className="w-4 h-4 text-cyan" />
                  </div>
                  <h4 className="font-medium text-sm mb-1">Real Data</h4>
                  <p className="text-xs text-muted-foreground">
                    Simulations use actual order book data
                  </p>
                </div>
                <div className="text-left p-4 rounded-xl bg-card/50 border border-border/50">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                    <TrendingUp className="w-4 h-4 text-primary" />
                  </div>
                  <h4 className="font-medium text-sm mb-1">Track P&L</h4>
                  <p className="text-xs text-muted-foreground">
                    Monitor performance with detailed analytics
                  </p>
                </div>
                <div className="text-left p-4 rounded-xl bg-card/50 border border-border/50">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center mb-3">
                    <Zap className="w-4 h-4 text-amber-500" />
                  </div>
                  <h4 className="font-medium text-sm mb-1">Copy Traders</h4>
                  <p className="text-xs text-muted-foreground">
                    Allocate to multiple trader strategies
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <CreatePortfolioDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handlePortfolioCreated}
      />
    </div>
  );
}
