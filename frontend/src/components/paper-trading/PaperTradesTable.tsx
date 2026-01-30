"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  XCircle,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Activity,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Trade {
  id: string;
  time: string;
  originalTraderAddress: string;
  traderAlias: string | null;
  marketTitle: string | null;
  outcome: string | null;
  side: "BUY" | "SELL";
  originalPrice: number;
  originalSizeUsd: number;
  simulatedPrice: number;
  simulatedSizeUsd: number;
  slippagePercent: number;
  executionStatus: "FILLED" | "SKIPPED" | "PARTIAL";
  skipReason: string | null;
}

interface PaperTradesTableProps {
  portfolioId: string;
}

export function PaperTradesTable({ portfolioId }: PaperTradesTableProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false,
  });

  const fetchTrades = async (offset = 0) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/paper-trading/portfolios/${portfolioId}/trades?limit=20&offset=${offset}`
      );
      if (!response.ok) throw new Error("Failed to fetch trades");
      const data = await response.json();
      setTrades(data.trades);
      setPagination(data.pagination);
    } catch (error) {
      console.error("Error fetching trades:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades(0);
  }, [portfolioId]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatRelativeTime = (timeStr: string) => {
    const date = new Date(timeStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (loading && trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-12 h-12 rounded-xl bg-surface-2 flex items-center justify-center mb-3">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Loading trade history...</p>
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="relative rounded-2xl overflow-hidden border border-border/50 border-dashed">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-primary/5" />
        <div className="relative p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 mb-4 border border-amber-500/20">
            <Activity className="w-7 h-7 text-amber-500" />
          </div>
          <h3 className="text-lg font-semibold mb-1">No Trades Yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Trades will appear here when the paper trading simulation executes orders from tracked traders.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative rounded-2xl overflow-hidden border border-border/50 bg-card">
        {/* Header accent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500/50 via-primary/30 to-transparent" />

        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Time
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Trader
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Market
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Side
              </TableHead>
              <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Original
              </TableHead>
              <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Simulated
              </TableHead>
              <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Slippage
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trades.map((trade, index) => {
              const isBuy = trade.side === "BUY";
              const slippageColor =
                trade.slippagePercent > 0.5
                  ? "text-loss"
                  : trade.slippagePercent > 0.1
                    ? "text-amber-500"
                    : "text-profit";
              const slippageBg =
                trade.slippagePercent > 0.5
                  ? "bg-loss/10"
                  : trade.slippagePercent > 0.1
                    ? "bg-amber-500/10"
                    : "bg-profit/10";

              return (
                <TableRow
                  key={trade.id}
                  className={cn(
                    "border-border/30 transition-colors hover:bg-surface-2/50 animate-slide-up"
                  )}
                  style={{ animationDelay: `${index * 20}ms` }}
                >
                  <TableCell className="py-3.5">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      <div>
                        <span className="text-sm">{formatTime(trade.time)}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {formatRelativeTime(trade.time)}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-surface-2 flex items-center justify-center">
                        <User className="w-3 h-3 text-muted-foreground" />
                      </div>
                      <span className="text-sm font-medium">
                        {trade.traderAlias ||
                          `${trade.originalTraderAddress.slice(0, 6)}...`}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="py-3.5">
                    <div className="max-w-[180px]">
                      <p className="text-sm truncate font-medium">
                        {trade.marketTitle || "Unknown Market"}
                      </p>
                      {trade.outcome && (
                        <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                          <ChevronRight className="w-3 h-3" />
                          {trade.outcome}
                        </p>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="py-3.5">
                    <div
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-semibold",
                        isBuy
                          ? "bg-profit/10 text-profit"
                          : "bg-loss/10 text-loss"
                      )}
                    >
                      {isBuy ? (
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5" />
                      )}
                      {trade.side}
                    </div>
                  </TableCell>

                  <TableCell className="text-right py-3.5">
                    <div>
                      <p className="font-mono font-medium text-sm">
                        {formatCurrency(trade.originalSizeUsd)}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        @ ${trade.originalPrice.toFixed(4)}
                      </p>
                    </div>
                  </TableCell>

                  <TableCell className="text-right py-3.5">
                    <div>
                      <p className="font-mono font-medium text-sm">
                        {formatCurrency(trade.simulatedSizeUsd)}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        @ ${trade.simulatedPrice.toFixed(4)}
                      </p>
                    </div>
                  </TableCell>

                  <TableCell className="text-right py-3.5">
                    <span
                      className={cn(
                        "inline-flex px-2 py-1 rounded-md font-mono text-sm font-medium",
                        slippageBg,
                        slippageColor
                      )}
                    >
                      {trade.slippagePercent >= 0 ? "+" : ""}
                      {trade.slippagePercent.toFixed(2)}%
                    </span>
                  </TableCell>

                  <TableCell className="py-3.5">
                    {trade.executionStatus === "FILLED" ? (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-profit/10 text-profit text-sm font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Filled
                      </div>
                    ) : trade.executionStatus === "SKIPPED" ? (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-loss/10 text-loss text-sm font-medium">
                        <XCircle className="w-3.5 h-3.5" />
                        {trade.skipReason || "Skipped"}
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-500 text-sm font-medium">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Partial
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {(pagination.hasMore || pagination.offset > 0) && (
        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-muted-foreground">
            Showing{" "}
            <span className="font-medium text-foreground">
              {pagination.offset + 1}-
              {Math.min(pagination.offset + trades.length, pagination.total)}
            </span>{" "}
            of{" "}
            <span className="font-medium text-foreground">
              {pagination.total}
            </span>{" "}
            trades
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.offset === 0 || loading}
              onClick={() => fetchTrades(pagination.offset - pagination.limit)}
              className="h-8 px-3 gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasMore || loading}
              onClick={() => fetchTrades(pagination.offset + pagination.limit)}
              className="h-8 px-3 gap-1"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
