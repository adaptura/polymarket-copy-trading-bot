"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  BarChart3,
  DollarSign,
  Target,
  Coins,
  ChevronRight,
  Package,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface Position {
  id: string;
  asset: string;
  marketTitle: string | null;
  outcome: string | null;
  sizeTokens: number;
  avgEntryPrice: number;
  totalCostUsd: number;
  currentPrice: number | null;
  currentValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPercent: number | null;
  realizedPnl: number;
}

interface PaperPositionsTableProps {
  portfolioId: string;
}

export function PaperPositionsTable({ portfolioId }: PaperPositionsTableProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [summary, setSummary] = useState({
    totalPositions: 0,
    totalValue: 0,
    totalCost: 0,
    totalUnrealizedPnl: 0,
    totalRealizedPnl: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPositions = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/paper-trading/portfolios/${portfolioId}/positions`
        );
        if (!response.ok) throw new Error("Failed to fetch positions");
        const data = await response.json();
        setPositions(data.positions);
        setSummary(data.summary);
      } catch (error) {
        console.error("Error fetching positions:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPositions();
  }, [portfolioId]);

  const formatCurrency = (value: number | null) => {
    if (value === null) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatCompactCurrency = (value: number | null) => {
    if (value === null) return "-";
    if (Math.abs(value) >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    }
    if (Math.abs(value) >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return formatCurrency(value);
  };

  const formatPercent = (value: number | null) => {
    if (value === null) return "-";
    const prefix = value >= 0 ? "+" : "";
    return `${prefix}${value.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-12 h-12 rounded-xl bg-surface-2 flex items-center justify-center mb-3">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Loading positions...</p>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="relative rounded-2xl overflow-hidden border border-border/50 border-dashed">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-cyan/5" />
        <div className="relative p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 mb-4 border border-violet-500/20">
            <Package className="w-7 h-7 text-violet-500" />
          </div>
          <h3 className="text-lg font-semibold mb-1">No Open Positions</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Positions will appear here when the simulation executes trades from tracked traders.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="relative rounded-xl overflow-hidden border border-border/50 bg-card p-4">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-radial from-cyan/10 to-transparent" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-cyan" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total Value
              </span>
            </div>
            <p className="text-xl font-bold font-mono">
              {formatCompactCurrency(summary.totalValue)}
            </p>
          </div>
        </div>

        <div className="relative rounded-xl overflow-hidden border border-border/50 bg-card p-4">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-radial from-primary/10 to-transparent" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <Coins className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total Cost
              </span>
            </div>
            <p className="text-xl font-bold font-mono">
              {formatCompactCurrency(summary.totalCost)}
            </p>
          </div>
        </div>

        <div className="relative rounded-xl overflow-hidden border border-border/50 bg-card p-4">
          <div
            className={cn(
              "absolute top-0 right-0 w-16 h-16 bg-gradient-radial to-transparent",
              summary.totalUnrealizedPnl >= 0 ? "from-profit/10" : "from-loss/10"
            )}
          />
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              {summary.totalUnrealizedPnl >= 0 ? (
                <TrendingUp className="w-4 h-4 text-profit" />
              ) : (
                <TrendingDown className="w-4 h-4 text-loss" />
              )}
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Unrealized
              </span>
            </div>
            <p
              className={cn(
                "text-xl font-bold font-mono",
                summary.totalUnrealizedPnl >= 0 ? "text-profit" : "text-loss"
              )}
            >
              {summary.totalUnrealizedPnl >= 0 ? "+" : ""}
              {formatCompactCurrency(summary.totalUnrealizedPnl)}
            </p>
          </div>
        </div>

        <div className="relative rounded-xl overflow-hidden border border-border/50 bg-card p-4">
          <div
            className={cn(
              "absolute top-0 right-0 w-16 h-16 bg-gradient-radial to-transparent",
              summary.totalRealizedPnl >= 0 ? "from-profit/10" : "from-loss/10"
            )}
          />
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Realized
              </span>
            </div>
            <p
              className={cn(
                "text-xl font-bold font-mono",
                summary.totalRealizedPnl >= 0 ? "text-profit" : "text-loss"
              )}
            >
              {summary.totalRealizedPnl >= 0 ? "+" : ""}
              {formatCompactCurrency(summary.totalRealizedPnl)}
            </p>
          </div>
        </div>
      </div>

      {/* Positions Table */}
      <div className="relative rounded-2xl overflow-hidden border border-border/50 bg-card">
        {/* Header accent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan/50 via-primary/30 to-transparent" />

        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Market
              </TableHead>
              <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Size
              </TableHead>
              <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Entry
              </TableHead>
              <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Current
              </TableHead>
              <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Value
              </TableHead>
              <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                P&L
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position, index) => {
              const isPositive =
                position.unrealizedPnl !== null && position.unrealizedPnl >= 0;

              return (
                <TableRow
                  key={position.id}
                  className={cn(
                    "border-border/30 transition-colors hover:bg-surface-2/50 animate-slide-up"
                  )}
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center">
                        <BarChart3 className="w-4 h-4 text-violet-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate max-w-[220px]">
                          {position.marketTitle || position.asset.slice(0, 16)}
                        </p>
                        {position.outcome && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <ChevronRight className="w-3 h-3" />
                            {position.outcome}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="text-right py-4">
                    <span className="font-mono font-medium">
                      {position.sizeTokens.toFixed(2)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">
                      tokens
                    </span>
                  </TableCell>

                  <TableCell className="text-right py-4">
                    <span className="font-mono text-muted-foreground">
                      ${position.avgEntryPrice.toFixed(4)}
                    </span>
                  </TableCell>

                  <TableCell className="text-right py-4">
                    <span className="font-mono">
                      {position.currentPrice
                        ? `$${position.currentPrice.toFixed(4)}`
                        : "-"}
                    </span>
                  </TableCell>

                  <TableCell className="text-right py-4">
                    <span className="font-mono font-medium">
                      {formatCurrency(position.currentValue)}
                    </span>
                  </TableCell>

                  <TableCell className="text-right py-4">
                    <div
                      className={cn(
                        "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg",
                        isPositive
                          ? "bg-profit/10 text-profit"
                          : "bg-loss/10 text-loss"
                      )}
                    >
                      {position.unrealizedPnl !== null && (
                        <>
                          {isPositive ? (
                            <TrendingUp className="w-3.5 h-3.5" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5" />
                          )}
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-mono font-semibold">
                              {formatCurrency(position.unrealizedPnl)}
                            </span>
                            <span className="text-xs opacity-75">
                              {formatPercent(position.unrealizedPnlPercent)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
