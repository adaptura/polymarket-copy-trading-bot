"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import {
  createChart,
  ColorType,
  LineSeries,
  AreaSeries,
  CrosshairMode,
} from "lightweight-charts";
import type { IChartApi, Time } from "lightweight-charts";
import { getChartColors, hexToRgba } from "@/lib/chart-colors";
import { useTheme } from "@/components/providers/ThemeProvider";
import { cn } from "@/lib/utils";
import type { RollingAnalysisResult, RollingTimeSeries, TraderTimeline } from "@/types";

interface RollingMetricsChartProps {
  result: RollingAnalysisResult | null;
  height?: number;
}

type MetricKey = "sharpe" | "drawdown" | "returnPct" | "winRate" | "sortino";

// All metrics use red for the combined portfolio line
const PORTFOLIO_COLOR = "#FF6B6B";

const METRIC_CONFIG: Record<MetricKey, { label: string; color: string; format: (v: number) => string }> = {
  sharpe: { label: "Sharpe Ratio", color: PORTFOLIO_COLOR, format: (v) => v.toFixed(2) },
  drawdown: { label: "Max Drawdown", color: PORTFOLIO_COLOR, format: (v) => `${v.toFixed(1)}%` },
  returnPct: { label: "Return", color: PORTFOLIO_COLOR, format: (v) => `${v.toFixed(1)}%` },
  winRate: { label: "Win Rate", color: PORTFOLIO_COLOR, format: (v) => `${v.toFixed(1)}%` },
  sortino: { label: "Sortino Ratio", color: PORTFOLIO_COLOR, format: (v) => v.toFixed(2) },
};

export function RollingMetricsChart({ result, height = 350 }: RollingMetricsChartProps) {
  const { theme } = useTheme();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("sharpe");

  const handleResize = useCallback(() => {
    if (chartContainerRef.current && chartRef.current) {
      chartRef.current.applyOptions({
        width: chartContainerRef.current.clientWidth,
      });
    }
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current || !result || result.timeSeries.length === 0) return;

    const colors = getChartColors(theme === "dark");
    const metricConfig = METRIC_CONFIG[selectedMetric];

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.textMuted,
        fontFamily: "var(--font-geist-mono)",
      },
      grid: {
        vertLines: { color: colors.gridLine },
        horzLines: { color: colors.gridLine },
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          width: 1,
          color: colors.crosshair,
          style: 2,
          labelBackgroundColor: colors.labelBg,
        },
        horzLine: {
          width: 1,
          color: colors.crosshair,
          style: 2,
          labelBackgroundColor: colors.labelBg,
        },
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 6,
        minBarSpacing: 3,
      },
      rightPriceScale: {
        borderColor: colors.border,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
    });

    chartRef.current = chart;

    // Convert time series data to chart format
    const toUnixSeconds = (dateStr: string): number => {
      return Math.floor(new Date(dateStr).getTime() / 1000);
    };

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

    // Helper to deduplicate data by timestamp (keep last value for each timestamp)
    const deduplicateByTime = <T extends { time: Time }>(data: T[]): T[] => {
      const map = new Map<number, T>();
      for (const item of data) {
        map.set(item.time as number, item);
      }
      return Array.from(map.values()).sort((a, b) => (a.time as number) - (b.time as number));
    };

    // Calculate percentile bands
    const values = result.timeSeries.map(getValue).filter((v): v is number => v !== null);
    const sorted = [...values].sort((a, b) => a - b);
    const p10 = sorted[Math.floor(sorted.length * 0.1)] ?? 0;
    const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
    const median = sorted[Math.floor(sorted.length * 0.5)] ?? 0;

    // Add percentile band (10th-90th) - deduplicated
    const bandData = deduplicateByTime(
      result.timeSeries
        .filter((item) => getValue(item) !== null)
        .map((item) => ({
          time: toUnixSeconds(item.endDate) as Time,
          value: p90,
        }))
    );

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: "transparent",
      topColor: hexToRgba(metricConfig.color, 0.1),
      bottomColor: hexToRgba(metricConfig.color, 0.02),
      priceLineVisible: false,
      lastValueVisible: false,
    });
    areaSeries.setData(bandData);

    // Add lower band - deduplicated
    const lowerBandData = deduplicateByTime(
      result.timeSeries
        .filter((item) => getValue(item) !== null)
        .map((item) => ({
          time: toUnixSeconds(item.endDate) as Time,
          value: p10,
        }))
    );

    const lowerAreaSeries = chart.addSeries(AreaSeries, {
      lineColor: "transparent",
      topColor: hexToRgba(metricConfig.color, 0.02),
      bottomColor: "transparent",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    lowerAreaSeries.setData(lowerBandData);

    // Add median line (dashed) - deduplicated
    const medianData = deduplicateByTime(
      result.timeSeries
        .filter((item) => getValue(item) !== null)
        .map((item) => ({
          time: toUnixSeconds(item.endDate) as Time,
          value: median,
        }))
    );

    const medianSeries = chart.addSeries(LineSeries, {
      color: hexToRgba(metricConfig.color, 0.4),
      lineWidth: 1,
      lineStyle: 2, // Dashed
      priceLineVisible: false,
      lastValueVisible: false,
    });
    medianSeries.setData(medianData);

    // Add individual trader lines in the background (50% opacity)
    if (result.individualTraderSeries && result.individualTraderSeries.length > 0) {
      for (const traderSeries of result.individualTraderSeries) {
        const traderData = deduplicateByTime(
          traderSeries.data
            .filter((item) => getValue(item) !== null)
            .map((item) => ({
              time: toUnixSeconds(item.endDate) as Time,
              value: getValue(item)!,
            }))
        );

        if (traderData.length > 0) {
          const traderLineSeries = chart.addSeries(LineSeries, {
            color: hexToRgba(traderSeries.color, 0.5),
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          traderLineSeries.setData(traderData);
        }
      }
    }

    // Add main metric line - deduplicated
    const mainData = deduplicateByTime(
      result.timeSeries
        .filter((item) => getValue(item) !== null)
        .map((item) => ({
          time: toUnixSeconds(item.endDate) as Time,
          value: getValue(item)!,
        }))
    );

    const mainSeries = chart.addSeries(LineSeries, {
      color: metricConfig.color,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: metricConfig.color,
      crosshairMarkerBackgroundColor: colors.cardBg,
    });
    mainSeries.setData(mainData);

    chart.timeScale().fitContent();

    // Crosshair move handler for custom tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!tooltipRef.current) return;

      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.y < 0
      ) {
        tooltipRef.current.style.display = "none";
        return;
      }

      const data = param.seriesData.get(mainSeries);
      if (!data || !("value" in data)) {
        tooltipRef.current.style.display = "none";
        return;
      }

      // Find the corresponding time series entry
      const date = new Date((param.time as number) * 1000);
      const entry = result.timeSeries.find(
        (e) => e.endDate === date.toISOString().split("T")[0]
      );

      tooltipRef.current.style.display = "block";

      // Position tooltip
      const containerRect = chartContainerRef.current?.getBoundingClientRect();
      if (containerRect) {
        let left = param.point.x + 15;
        if (left > containerRect.width - 200) {
          left = param.point.x - 200;
        }
        tooltipRef.current.style.left = `${left}px`;
        tooltipRef.current.style.top = `${param.point.y}px`;
      }

      // Build tooltip content
      tooltipRef.current.innerHTML = `
        <div class="text-xs text-muted-foreground mb-2">
          ${entry ? `${entry.startDate} → ${entry.endDate}` : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </div>
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full" style="background-color: ${metricConfig.color}; box-shadow: 0 0 6px ${metricConfig.color}"></div>
          <span class="text-muted-foreground">${metricConfig.label}:</span>
          <span class="font-mono font-medium">${metricConfig.format(data.value as number)}</span>
        </div>
        ${entry ? `
        <div class="mt-2 pt-2 border-t border-border/50 text-xs space-y-1">
          <div class="flex justify-between"><span class="text-muted-foreground">Return:</span><span class="font-mono ${entry.returnPct >= 0 ? "text-profit" : "text-loss"}">${entry.returnPct.toFixed(1)}%</span></div>
          <div class="flex justify-between"><span class="text-muted-foreground">Drawdown:</span><span class="font-mono ${entry.drawdown > -10 ? "text-foreground" : "text-loss"}">${entry.drawdown.toFixed(1)}%</span></div>
          <div class="flex justify-between"><span class="text-muted-foreground">Win Rate:</span><span class="font-mono">${entry.winRate.toFixed(1)}%</span></div>
        </div>
        ` : ""}
      `;
    });

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [result, height, handleResize, theme, selectedMetric]);

  if (!result || result.timeSeries.length === 0) {
    return (
      <div className="flex items-center justify-center h-[350px] text-muted-foreground">
        No time series data available
      </div>
    );
  }

  // Calculate timeline positions
  const getTimelinePositions = () => {
    if (!result || result.timeSeries.length === 0 || !result.traderTimelines) {
      return [];
    }

    // Get the full date range from the time series
    const dates = result.timeSeries.map((t) => new Date(t.endDate).getTime());
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const totalRange = maxDate - minDate;

    if (totalRange === 0) return [];

    return result.traderTimelines.map((trader) => {
      const startTime = new Date(trader.firstDataDate).getTime();
      const endTime = new Date(trader.lastDataDate).getTime();

      // Calculate position as percentage
      const startPct = Math.max(0, ((startTime - minDate) / totalRange) * 100);
      const endPct = Math.min(100, ((endTime - minDate) / totalRange) * 100);
      const widthPct = endPct - startPct;

      return {
        ...trader,
        startPct,
        widthPct,
      };
    });
  };

  const timelinePositions = getTimelinePositions();

  return (
    <div className="space-y-4">
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

      {/* Trader Timeline Bars */}
      {timelinePositions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Trader Data Coverage</p>
          <div className="relative bg-secondary/30 rounded-lg p-2 space-y-1">
            {timelinePositions.map((trader) => (
              <div key={trader.traderId} className="flex items-center gap-2">
                <div className="w-20 truncate text-xs text-muted-foreground" title={trader.traderName}>
                  {trader.traderName}
                </div>
                <div className="flex-1 h-4 bg-secondary/50 rounded relative">
                  <div
                    className="absolute h-full rounded transition-all"
                    style={{
                      left: `${trader.startPct}%`,
                      width: `${Math.max(trader.widthPct, 0.5)}%`,
                      backgroundColor: trader.color,
                      boxShadow: `0 0 4px ${trader.color}50`,
                    }}
                    title={`${trader.firstDataDate} → ${trader.lastDataDate} (${trader.percentage}%)`}
                  />
                  {/* Start marker */}
                  <div
                    className="absolute top-0 w-0.5 h-full bg-white/50"
                    style={{ left: `${trader.startPct}%` }}
                  />
                </div>
                <div className="w-10 text-right text-xs text-muted-foreground font-mono">
                  {trader.percentage}%
                </div>
              </div>
            ))}
            {/* Date labels */}
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1 px-[88px]">
              <span>{result.timeSeries[0]?.endDate?.split(" ")[0]}</span>
              <span>{result.timeSeries[result.timeSeries.length - 1]?.endDate?.split(" ")[0]}</span>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="relative">
        <div ref={chartContainerRef} className="w-full" />
        <div
          ref={tooltipRef}
          className="absolute z-50 hidden pointer-events-none glass-card rounded-lg px-3 py-2 min-w-[180px]"
          style={{ transform: "translateY(-50%)" }}
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-muted-foreground flex-wrap">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-0.5"
            style={{ backgroundColor: METRIC_CONFIG[selectedMetric].color }}
          />
          <span>Portfolio {METRIC_CONFIG[selectedMetric].label}</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-0.5 opacity-40"
            style={{ backgroundColor: METRIC_CONFIG[selectedMetric].color, borderStyle: "dashed" }}
          />
          <span>Median</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded opacity-20"
            style={{ backgroundColor: METRIC_CONFIG[selectedMetric].color }}
          />
          <span>10th-90th Percentile</span>
        </div>
        {result.individualTraderSeries && result.individualTraderSeries.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1">
              {result.individualTraderSeries.slice(0, 3).map((trader) => (
                <div
                  key={trader.traderId}
                  className="w-3 h-0.5 opacity-50"
                  style={{ backgroundColor: trader.color }}
                />
              ))}
            </div>
            <span>Individual Traders (50% opacity)</span>
          </div>
        )}
      </div>
    </div>
  );
}
