"use client";

import { useState, useEffect } from "react";
import { Loader2, ArrowUpRight, ArrowDownRight, XCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  if (loading && trades.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="glass-card rounded-xl p-8 text-center border border-border/50">
        <p className="text-muted-foreground">No trades yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Trades will appear here when the paper trading bot executes simulated
          trades
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Trader</TableHead>
              <TableHead>Market</TableHead>
              <TableHead>Side</TableHead>
              <TableHead className="text-right">Original</TableHead>
              <TableHead className="text-right">Simulated</TableHead>
              <TableHead className="text-right">Slippage</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trades.map((trade) => {
              const isBuy = trade.side === "BUY";
              const slippageColor =
                trade.slippagePercent > 0.5
                  ? "text-loss"
                  : trade.slippagePercent > 0.1
                    ? "text-warning"
                    : "text-profit";

              return (
                <TableRow key={trade.id}>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatTime(trade.time)}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium">
                      {trade.traderAlias ||
                        `${trade.originalTraderAddress.slice(0, 6)}...`}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[150px]">
                      <p className="text-sm truncate">
                        {trade.marketTitle || "Unknown Market"}
                      </p>
                      {trade.outcome && (
                        <p className="text-xs text-muted-foreground truncate">
                          {trade.outcome}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div
                      className={cn(
                        "flex items-center gap-1",
                        isBuy ? "text-profit" : "text-loss"
                      )}
                    >
                      {isBuy ? (
                        <ArrowUpRight className="w-4 h-4" />
                      ) : (
                        <ArrowDownRight className="w-4 h-4" />
                      )}
                      <span className="font-medium">{trade.side}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="text-sm">
                      <p className="font-mono">
                        {formatCurrency(trade.originalSizeUsd)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        @ ${trade.originalPrice.toFixed(4)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="text-sm">
                      <p className="font-mono">
                        {formatCurrency(trade.simulatedSizeUsd)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        @ ${trade.simulatedPrice.toFixed(4)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={cn("font-mono text-sm", slippageColor)}>
                      {trade.slippagePercent >= 0 ? "+" : ""}
                      {trade.slippagePercent.toFixed(2)}%
                    </span>
                  </TableCell>
                  <TableCell>
                    {trade.executionStatus === "FILLED" ? (
                      <Badge
                        variant="outline"
                        className="bg-profit/10 text-profit border-profit/30"
                      >
                        Filled
                      </Badge>
                    ) : trade.executionStatus === "SKIPPED" ? (
                      <Badge
                        variant="outline"
                        className="bg-loss/10 text-loss border-loss/30"
                      >
                        <XCircle className="w-3 h-3 mr-1" />
                        {trade.skipReason || "Skipped"}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Partial</Badge>
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
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {pagination.offset + 1}-
            {Math.min(pagination.offset + trades.length, pagination.total)} of{" "}
            {pagination.total} trades
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.offset === 0 || loading}
              onClick={() => fetchTrades(pagination.offset - pagination.limit)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasMore || loading}
              onClick={() => fetchTrades(pagination.offset + pagination.limit)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
