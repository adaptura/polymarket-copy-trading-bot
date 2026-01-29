"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { CalculatorMetrics } from "@/types";
import { formatCurrency, formatPercent } from "@/lib/mock-data";

interface MetricsTableProps {
  metrics: CalculatorMetrics[];
}

export function MetricsTable({ metrics }: MetricsTableProps) {
  if (metrics.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground">
        Select windows and click Calculate to see results
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border/50 hover:bg-transparent">
            <TableHead className="text-muted-foreground font-medium">
              Window
            </TableHead>
            <TableHead className="text-right text-muted-foreground font-medium">
              Max DD
            </TableHead>
            <TableHead className="text-right text-muted-foreground font-medium">
              CAGR
            </TableHead>
            <TableHead className="text-right text-muted-foreground font-medium">
              Total P&L
            </TableHead>
            <TableHead className="text-right text-muted-foreground font-medium">
              Sharpe
            </TableHead>
            <TableHead className="text-right text-muted-foreground font-medium">
              Sortino
            </TableHead>
            <TableHead className="text-right text-muted-foreground font-medium">
              Win Rate
            </TableHead>
            <TableHead className="text-right text-muted-foreground font-medium">
              Profit Factor
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {metrics.map((metric, index) => (
            <TableRow
              key={metric.window}
              className="border-border/50 table-row-hover animate-slide-up"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <TableCell className="font-mono font-medium">
                {metric.window}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-mono",
                  metric.maxDrawdown < -10 ? "text-loss" : "text-muted-foreground"
                )}
              >
                {formatPercent(metric.maxDrawdown)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-mono",
                  metric.cagr > 50 ? "text-profit" : "text-foreground"
                )}
              >
                {formatPercent(metric.cagr)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-mono font-medium",
                  metric.totalPnL >= 0 ? "text-profit" : "text-loss"
                )}
              >
                {formatCurrency(metric.totalPnL)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-mono",
                  metric.sharpeRatio != null && metric.sharpeRatio > 2
                    ? "text-profit"
                    : metric.sharpeRatio != null && metric.sharpeRatio < 1
                    ? "text-loss"
                    : "text-foreground"
                )}
              >
                {metric.sharpeRatio != null ? metric.sharpeRatio.toFixed(2) : "N/A"}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-mono",
                  metric.sortinoRatio != null && metric.sortinoRatio > 2.5
                    ? "text-profit"
                    : metric.sortinoRatio != null && metric.sortinoRatio < 1.5
                    ? "text-loss"
                    : "text-foreground"
                )}
              >
                {metric.sortinoRatio != null ? metric.sortinoRatio.toFixed(2) : "N/A"}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-mono",
                  metric.winRate > 60
                    ? "text-profit"
                    : metric.winRate < 45
                    ? "text-loss"
                    : "text-foreground"
                )}
              >
                {metric.winRate.toFixed(1)}%
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-mono",
                  metric.profitFactor != null && metric.profitFactor > 2
                    ? "text-profit"
                    : metric.profitFactor != null && metric.profitFactor < 1.2
                    ? "text-loss"
                    : "text-foreground"
                )}
              >
                {metric.profitFactor != null ? metric.profitFactor.toFixed(2) : "N/A"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
