"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { RollingAnalysisResult, RollingTimeSeries } from "@/types";

interface DistributionHistogramProps {
  result: RollingAnalysisResult | null;
}

type MetricKey = "sharpe" | "drawdown" | "returnPct" | "winRate" | "sortino";

const METRIC_CONFIG: Record<MetricKey, {
  label: string;
  color: string;
  format: (v: number) => string;
  unit: string;
}> = {
  sharpe: { label: "Sharpe Ratio", color: "#00D9FF", format: (v) => v.toFixed(2), unit: "" },
  sortino: { label: "Sortino Ratio", color: "#F59E0B", format: (v) => v.toFixed(2), unit: "" },
  drawdown: { label: "Max Drawdown", color: "#FF6B6B", format: (v) => `${v.toFixed(1)}%`, unit: "%" },
  returnPct: { label: "Return", color: "#22C55E", format: (v) => `${v.toFixed(1)}%`, unit: "%" },
  winRate: { label: "Win Rate", color: "#A855F7", format: (v) => `${v.toFixed(1)}%`, unit: "%" },
};

function calculateHistogramBins(values: number[], binCount: number = 20) {
  if (values.length === 0) return { bins: [], min: 0, max: 0 };

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  // Handle edge case where all values are the same
  if (range === 0) {
    return {
      bins: [{ start: min - 0.5, end: max + 0.5, count: values.length, frequency: 1 }],
      min: min - 0.5,
      max: max + 0.5,
    };
  }

  const binWidth = range / binCount;
  const bins: { start: number; end: number; count: number; frequency: number }[] = [];

  // Initialize bins
  for (let i = 0; i < binCount; i++) {
    bins.push({
      start: min + i * binWidth,
      end: min + (i + 1) * binWidth,
      count: 0,
      frequency: 0,
    });
  }

  // Count values in each bin
  for (const value of values) {
    const binIndex = Math.min(Math.floor((value - min) / binWidth), binCount - 1);
    bins[binIndex].count++;
  }

  // Calculate frequencies
  const maxCount = Math.max(...bins.map((b) => b.count));
  for (const bin of bins) {
    bin.frequency = maxCount > 0 ? bin.count / maxCount : 0;
  }

  return { bins, min, max };
}

function calculateNormalCurve(
  values: number[],
  bins: { start: number; end: number }[]
): number[] {
  if (values.length === 0 || bins.length === 0) return [];

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return bins.map(() => 0);

  // Calculate normal distribution PDF at bin centers
  const curvePoints = bins.map((bin) => {
    const x = (bin.start + bin.end) / 2;
    const z = (x - mean) / stdDev;
    return Math.exp(-0.5 * z * z);
  });

  // Normalize to match histogram scale
  const maxCurve = Math.max(...curvePoints);
  return curvePoints.map((p) => (maxCurve > 0 ? p / maxCurve : 0));
}

export function DistributionHistogram({ result }: DistributionHistogramProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("sharpe");

  const { bins, normalCurve, stats, values } = useMemo(() => {
    if (!result || result.timeSeries.length === 0) {
      return { bins: [], normalCurve: [], stats: null, values: [] };
    }

    const getValue = (item: RollingTimeSeries): number | null => {
      switch (selectedMetric) {
        case "sharpe": return item.sharpe;
        case "drawdown": return item.drawdown;
        case "returnPct": return item.returnPct;
        case "winRate": return item.winRate;
        case "sortino": return item.sortino;
        default: return null;
      }
    };

    const values = result.timeSeries
      .map(getValue)
      .filter((v): v is number => v !== null);

    if (values.length === 0) {
      return { bins: [], normalCurve: [], stats: null, values: [] };
    }

    const { bins } = calculateHistogramBins(values, 25);
    const normalCurve = calculateNormalCurve(values, bins);

    // Calculate statistics
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const median = sorted[Math.floor(sorted.length / 2)];
    const skewness = values.reduce((sum, v) => sum + Math.pow((v - mean) / stdDev, 3), 0) / values.length;

    return {
      bins,
      normalCurve,
      values,
      stats: { mean, stdDev, median, skewness, min: sorted[0], max: sorted[sorted.length - 1] },
    };
  }, [result, selectedMetric]);

  if (!result || result.timeSeries.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No data available for distribution chart
      </div>
    );
  }

  const config = METRIC_CONFIG[selectedMetric];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Distribution Analysis</h3>
          <p className="text-sm text-muted-foreground">
            Frequency distribution of {config.label.toLowerCase()} across {values.length} rolling periods
          </p>
        </div>
      </div>

      {/* Metric Selector */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(METRIC_CONFIG) as MetricKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setSelectedMetric(key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              selectedMetric === key
                ? "bg-primary/10 text-primary border border-primary/30"
                : "bg-secondary/50 text-muted-foreground hover:bg-secondary/80 border border-transparent"
            )}
          >
            {METRIC_CONFIG[key].label}
          </button>
        ))}
      </div>

      {/* Histogram Chart */}
      <div className="relative h-[250px] bg-secondary/20 rounded-lg p-4">
        {bins.length > 0 && (
          <>
            {/* Y-axis label */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-xs text-muted-foreground">
              Frequency
            </div>

            {/* Chart area */}
            <div className="ml-6 h-full flex items-end gap-[1px]">
              {bins.map((bin, index) => (
                <div
                  key={index}
                  className="flex-1 flex flex-col items-center justify-end relative group"
                  style={{ height: "100%" }}
                >
                  {/* Normal curve point */}
                  {normalCurve[index] > 0 && (
                    <div
                      className="absolute w-2 h-2 rounded-full bg-white/60 z-10"
                      style={{
                        bottom: `${normalCurve[index] * 85}%`,
                        left: "50%",
                        transform: "translateX(-50%)",
                      }}
                    />
                  )}

                  {/* Histogram bar */}
                  <div
                    className="w-full rounded-t transition-all duration-200 hover:opacity-80"
                    style={{
                      height: `${bin.frequency * 85}%`,
                      backgroundColor: config.color,
                      opacity: 0.7,
                      minHeight: bin.count > 0 ? "2px" : "0",
                    }}
                  />

                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-20">
                    <div className="glass-card rounded-lg px-3 py-2 text-xs whitespace-nowrap">
                      <div className="font-mono">
                        {config.format(bin.start)} - {config.format(bin.end)}
                      </div>
                      <div className="text-muted-foreground">
                        Count: {bin.count} ({((bin.count / values.length) * 100).toFixed(1)}%)
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* X-axis labels */}
            <div className="ml-6 flex justify-between text-xs text-muted-foreground mt-2">
              <span>{config.format(bins[0]?.start ?? 0)}</span>
              <span>{config.format(bins[Math.floor(bins.length / 2)]?.start ?? 0)}</span>
              <span>{config.format(bins[bins.length - 1]?.end ?? 0)}</span>
            </div>
          </>
        )}
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="p-3 rounded-lg bg-secondary/30">
            <div className="text-xs text-muted-foreground">Mean</div>
            <div className="font-mono font-medium" style={{ color: config.color }}>
              {config.format(stats.mean)}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-secondary/30">
            <div className="text-xs text-muted-foreground">Median</div>
            <div className="font-mono font-medium">
              {config.format(stats.median)}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-secondary/30">
            <div className="text-xs text-muted-foreground">Std Dev</div>
            <div className="font-mono font-medium">
              {config.format(stats.stdDev)}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-secondary/30">
            <div className="text-xs text-muted-foreground">Min</div>
            <div className="font-mono font-medium text-loss">
              {config.format(stats.min)}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-secondary/30">
            <div className="text-xs text-muted-foreground">Max</div>
            <div className="font-mono font-medium text-profit">
              {config.format(stats.max)}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-secondary/30">
            <div className="text-xs text-muted-foreground">Skewness</div>
            <div className={cn(
              "font-mono font-medium",
              stats.skewness > 0.5 ? "text-profit" : stats.skewness < -0.5 ? "text-loss" : "text-foreground"
            )}>
              {stats.skewness.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded opacity-70"
            style={{ backgroundColor: config.color }}
          />
          <span>Frequency</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-white/60" />
          <span>Normal Distribution Fit</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-profit">Positive skew</span>
          <span>/</span>
          <span className="text-loss">Negative skew</span>
          <span className="text-muted-foreground">= tail direction</span>
        </div>
      </div>
    </div>
  );
}
