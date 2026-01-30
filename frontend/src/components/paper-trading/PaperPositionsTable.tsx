"use client";

import { useState, useEffect } from "react";
import { Loader2, TrendingUp, TrendingDown } from "lucide-react";
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

  const formatPercent = (value: number | null) => {
    if (value === null) return "-";
    const prefix = value >= 0 ? "+" : "";
    return `${prefix}${value.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="glass-card rounded-xl p-8 text-center border border-border/50">
        <p className="text-muted-foreground">No open positions</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card rounded-lg p-3 border border-border/50">
          <p className="text-xs text-muted-foreground">Total Value</p>
          <p className="text-lg font-bold font-mono">
            {formatCurrency(summary.totalValue)}
          </p>
        </div>
        <div className="glass-card rounded-lg p-3 border border-border/50">
          <p className="text-xs text-muted-foreground">Total Cost</p>
          <p className="text-lg font-bold font-mono">
            {formatCurrency(summary.totalCost)}
          </p>
        </div>
        <div className="glass-card rounded-lg p-3 border border-border/50">
          <p className="text-xs text-muted-foreground">Unrealized P&L</p>
          <p
            className={cn(
              "text-lg font-bold font-mono",
              summary.totalUnrealizedPnl >= 0 ? "text-profit" : "text-loss"
            )}
          >
            {formatCurrency(summary.totalUnrealizedPnl)}
          </p>
        </div>
        <div className="glass-card rounded-lg p-3 border border-border/50">
          <p className="text-xs text-muted-foreground">Realized P&L</p>
          <p
            className={cn(
              "text-lg font-bold font-mono",
              summary.totalRealizedPnl >= 0 ? "text-profit" : "text-loss"
            )}
          >
            {formatCurrency(summary.totalRealizedPnl)}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Market</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead className="text-right">Avg Entry</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Unrealized P&L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => {
              const isPositive =
                position.unrealizedPnl !== null && position.unrealizedPnl >= 0;

              return (
                <TableRow key={position.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium truncate max-w-[200px]">
                        {position.marketTitle || position.asset.slice(0, 16)}
                      </p>
                      {position.outcome && (
                        <p className="text-xs text-muted-foreground">
                          {position.outcome}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {position.sizeTokens.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${position.avgEntryPrice.toFixed(4)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {position.currentPrice
                      ? `$${position.currentPrice.toFixed(4)}`
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(position.currentValue)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div
                      className={cn(
                        "flex items-center justify-end gap-1",
                        isPositive ? "text-profit" : "text-loss"
                      )}
                    >
                      {position.unrealizedPnl !== null && (
                        <>
                          {isPositive ? (
                            <TrendingUp className="w-3.5 h-3.5" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5" />
                          )}
                          <span className="font-mono">
                            {formatCurrency(position.unrealizedPnl)}
                          </span>
                          <span className="text-xs">
                            ({formatPercent(position.unrealizedPnlPercent)})
                          </span>
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
