"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CalculatorMetrics } from "@/types";
import { formatCurrency, formatPercent } from "@/lib/mock-data";

const METRIC_TOOLTIPS = {
  maxDD: (
    <div className="space-y-1">
      <div className="font-medium">Maximum Drawdown</div>
      <div className="text-muted-foreground text-xs">
        Largest peak-to-trough decline in portfolio value.
      </div>
      <div className="font-mono text-xs mt-1">
        = (Peak - Trough) / Peak × 100
      </div>
    </div>
  ),
  cagr: (
    <div className="space-y-1">
      <div className="font-medium">CAGR (Compound Annual Growth Rate)</div>
      <div className="text-muted-foreground text-xs">
        Annualized return assuming profits are reinvested.
      </div>
      <div className="font-mono text-xs mt-1">
        = (Ending / Beginning)^(365/days) - 1
      </div>
    </div>
  ),
  totalPnL: (
    <div className="space-y-1">
      <div className="font-medium">Total P&L</div>
      <div className="text-muted-foreground text-xs">
        Total profit/loss scaled to your initial capital. Based on additive P&L from traders.
      </div>
      <div className="font-mono text-xs mt-1">
        = Σ(Daily P&L) × (Your Capital / $1M)
      </div>
    </div>
  ),
  sharpe: (
    <div className="space-y-1">
      <div className="font-medium">Sharpe Ratio</div>
      <div className="text-muted-foreground text-xs">
        Risk-adjusted return. Higher is better. &gt;2 is excellent, &lt;1 is poor.
      </div>
      <div className="font-mono text-xs mt-1">
        = (Mean Return / Std Dev) × √252
      </div>
    </div>
  ),
  sortino: (
    <div className="space-y-1">
      <div className="font-medium">Sortino Ratio</div>
      <div className="text-muted-foreground text-xs">
        Like Sharpe but only penalizes downside volatility. Better for asymmetric returns.
      </div>
      <div className="font-mono text-xs mt-1">
        = (Mean Return / Downside Dev) × √252
      </div>
    </div>
  ),
  winRate: (
    <div className="space-y-1">
      <div className="font-medium">Win Rate</div>
      <div className="text-muted-foreground text-xs">
        Percentage of days with positive returns.
      </div>
      <div className="font-mono text-xs mt-1">
        = Winning Days / Total Days × 100
      </div>
    </div>
  ),
  profitFactor: (
    <div className="space-y-1">
      <div className="font-medium">Profit Factor</div>
      <div className="text-muted-foreground text-xs">
        Ratio of gross profits to gross losses. &gt;2 is good, &lt;1 means net loser.
      </div>
      <div className="font-mono text-xs mt-1">
        = Gross Profits / |Gross Losses|
      </div>
    </div>
  ),
};

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
    <TooltipProvider delayDuration={200}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-muted-foreground font-medium">
                Window
              </TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help border-b border-dotted border-muted-foreground/50">Max DD</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    {METRIC_TOOLTIPS.maxDD}
                  </TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help border-b border-dotted border-muted-foreground/50">CAGR</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    {METRIC_TOOLTIPS.cagr}
                  </TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help border-b border-dotted border-muted-foreground/50">Total P&L</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    {METRIC_TOOLTIPS.totalPnL}
                  </TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help border-b border-dotted border-muted-foreground/50">Sharpe</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    {METRIC_TOOLTIPS.sharpe}
                  </TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help border-b border-dotted border-muted-foreground/50">Sortino</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    {METRIC_TOOLTIPS.sortino}
                  </TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help border-b border-dotted border-muted-foreground/50">Win Rate</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    {METRIC_TOOLTIPS.winRate}
                  </TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help border-b border-dotted border-muted-foreground/50">Profit Factor</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    {METRIC_TOOLTIPS.profitFactor}
                  </TooltipContent>
                </Tooltip>
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
    </TooltipProvider>
  );
}
