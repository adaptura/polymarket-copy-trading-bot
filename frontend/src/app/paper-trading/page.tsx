"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FlaskConical,
  Plus,
  RefreshCw,
  Loader2,
  TrendingUp,
  Wallet,
  BarChart3,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/dashboard/StatCard";
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Paper Trading</h1>
            <p className="text-sm text-muted-foreground">
              Simulate trades with real order book data
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={cn("w-4 h-4 mr-2", refreshing && "animate-spin")}
            />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Portfolio
          </Button>
        </div>
      </div>

      {/* Portfolio Selector */}
      {portfolios.length > 0 ? (
        <>
          <PortfolioSelector
            portfolios={portfolios}
            selectedId={selectedPortfolioId}
            onSelect={setSelectedPortfolioId}
          />

          {selectedPortfolio && (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  title="Total Equity"
                  value={formatCurrency(selectedPortfolio.totalEquity)}
                  change={selectedPortfolio.totalPnlPercent}
                  icon={<Wallet className="w-4 h-4" />}
                />
                <StatCard
                  title="Total P&L"
                  value={formatCurrency(selectedPortfolio.totalPnl)}
                  change={selectedPortfolio.totalPnlPercent}
                  icon={<TrendingUp className="w-4 h-4" />}
                />
                <StatCard
                  title="Open Positions"
                  value={selectedPortfolio.openPositions.toString()}
                  icon={<BarChart3 className="w-4 h-4" />}
                />
                <StatCard
                  title="Total Trades"
                  value={selectedPortfolio.tradeCount.toString()}
                  icon={<Activity className="w-4 h-4" />}
                />
              </div>

              {/* Equity Curve Chart */}
              <div className="glass-card rounded-xl p-4 border border-border/50">
                <h3 className="text-lg font-semibold mb-4">Equity Curve</h3>
                <EquityCurveChart portfolioId={selectedPortfolio.id} />
              </div>

              {/* Tabs */}
              <Tabs defaultValue="positions" className="space-y-4">
                <TabsList className="bg-surface-2">
                  <TabsTrigger value="positions">Positions</TabsTrigger>
                  <TabsTrigger value="trades">Trades</TabsTrigger>
                  <TabsTrigger value="allocations">Allocations</TabsTrigger>
                </TabsList>

                <TabsContent value="positions">
                  <PaperPositionsTable portfolioId={selectedPortfolio.id} />
                </TabsContent>

                <TabsContent value="trades">
                  <PaperTradesTable portfolioId={selectedPortfolio.id} />
                </TabsContent>

                <TabsContent value="allocations">
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
        <div className="glass-card rounded-xl p-12 text-center border border-border/50">
          <FlaskConical className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No Portfolios Yet</h3>
          <p className="text-muted-foreground mb-4">
            Create a paper trading portfolio to start simulating trades
          </p>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Your First Portfolio
          </Button>
        </div>
      )}

      {/* Create Dialog */}
      <CreatePortfolioDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handlePortfolioCreated}
      />
    </div>
  );
}
