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
import { formatPercent } from "@/lib/mock-data";
import type { RollingAnalysisResult, MetricDistribution } from "@/types";

interface RollingDistributionTableProps {
  result: RollingAnalysisResult | null;
}

interface MetricRowData {
  name: string;
  distribution: MetricDistribution;
  format: (v: number) => string;
  colorFn: (v: number) => string;
  higherIsBetter: boolean;
}

export function RollingDistributionTable({ result }: RollingDistributionTableProps) {
  if (!result) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground">
        Select a window and click Calculate to see rolling analysis
      </div>
    );
  }

  const formatNumber = (v: number, decimals = 2) => v.toFixed(decimals);
  const formatPct = (v: number) => formatPercent(v);

  const getColorClass = (value: number, thresholdGood: number, thresholdBad: number, higherIsBetter: boolean) => {
    if (higherIsBetter) {
      if (value >= thresholdGood) return "text-profit";
      if (value <= thresholdBad) return "text-loss";
    } else {
      if (value <= thresholdGood) return "text-profit";
      if (value >= thresholdBad) return "text-loss";
    }
    return "text-foreground";
  };

  const metrics: MetricRowData[] = [
    {
      name: "Sharpe Ratio",
      distribution: result.sharpeRatio,
      format: (v) => formatNumber(v),
      colorFn: (v) => getColorClass(v, 2, 0.5, true),
      higherIsBetter: true,
    },
    {
      name: "Sortino Ratio",
      distribution: result.sortinoRatio,
      format: (v) => formatNumber(v),
      colorFn: (v) => getColorClass(v, 2.5, 1, true),
      higherIsBetter: true,
    },
    {
      name: "Max Drawdown",
      distribution: result.maxDrawdown,
      format: formatPct,
      colorFn: (v) => getColorClass(v, -5, -20, false),
      higherIsBetter: false,
    },
    {
      name: "Return",
      distribution: result.totalReturn,
      format: formatPct,
      colorFn: (v) => getColorClass(v, 10, -5, true),
      higherIsBetter: true,
    },
    {
      name: "Win Rate",
      distribution: result.winRate,
      format: (v) => `${formatNumber(v, 1)}%`,
      colorFn: (v) => getColorClass(v, 60, 45, true),
      higherIsBetter: true,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Rolling {result.window} Analysis</h3>
          <p className="text-sm text-muted-foreground">
            {result.sampleCount} rolling periods analyzed
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-muted-foreground font-medium">Metric</TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">Best</TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">90th %ile</TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">Average</TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">Median</TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">10th %ile</TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">Worst</TableHead>
              <TableHead className="text-right text-muted-foreground font-medium">Std Dev</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.map((metric, index) => (
              <TableRow
                key={metric.name}
                className="border-border/50 table-row-hover animate-slide-up"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <TableCell className="font-medium">{metric.name}</TableCell>
                <TableCell className={cn("text-right font-mono", metric.colorFn(metric.distribution.best))}>
                  {metric.format(metric.distribution.best)}
                </TableCell>
                <TableCell className={cn("text-right font-mono", metric.colorFn(metric.distribution.percentile90))}>
                  {metric.format(metric.higherIsBetter ? metric.distribution.percentile90 : metric.distribution.percentile10)}
                </TableCell>
                <TableCell className={cn("text-right font-mono", metric.colorFn(metric.distribution.average))}>
                  {metric.format(metric.distribution.average)}
                </TableCell>
                <TableCell className={cn("text-right font-mono", metric.colorFn(metric.distribution.median))}>
                  {metric.format(metric.distribution.median)}
                </TableCell>
                <TableCell className={cn("text-right font-mono", metric.colorFn(metric.higherIsBetter ? metric.distribution.percentile10 : metric.distribution.percentile90))}>
                  {metric.format(metric.higherIsBetter ? metric.distribution.percentile10 : metric.distribution.percentile90)}
                </TableCell>
                <TableCell className={cn("text-right font-mono", metric.colorFn(metric.distribution.worst))}>
                  {metric.format(metric.distribution.worst)}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {metric.format(metric.distribution.stdDev)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Best/Worst Period Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="p-4 rounded-lg bg-profit/5 border border-profit/20">
          <h4 className="text-sm font-medium text-profit mb-2">Best Sharpe Period</h4>
          <p className="text-2xl font-mono font-bold text-profit">
            {result.sharpeRatio.best.toFixed(2)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {result.sharpeRatio.bestPeriodStart} → {result.sharpeRatio.bestPeriodEnd}
          </p>
        </div>
        <div className="p-4 rounded-lg bg-loss/5 border border-loss/20">
          <h4 className="text-sm font-medium text-loss mb-2">Worst Sharpe Period</h4>
          <p className="text-2xl font-mono font-bold text-loss">
            {result.sharpeRatio.worst.toFixed(2)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {result.sharpeRatio.worstPeriodStart} → {result.sharpeRatio.worstPeriodEnd}
          </p>
        </div>
      </div>
    </div>
  );
}
