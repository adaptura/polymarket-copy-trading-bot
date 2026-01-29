"use client";

import { useRef, useEffect, useCallback } from "react";
import {
  createChart,
  ColorType,
  LineSeries,
  HistogramSeries,
  CrosshairMode,
} from "lightweight-charts";
import type { IChartApi, ISeriesApi, LineData, HistogramData, Time } from "lightweight-charts";
import type { TraderPnLSeries } from "@/types";
import type { TraderVolumeData } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/mock-data";
import { getChartColors, hexToRgba } from "@/lib/chart-colors";
import { useTheme } from "@/components/providers/ThemeProvider";

interface MultiLineChartProps {
  series: TraderPnLSeries[];
  volumeSeries?: TraderVolumeData[];
  height?: number;
}

export function MultiLineChart({ series, volumeSeries, height = 400 }: MultiLineChartProps) {
  const { theme } = useTheme();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const volumeSeriesRefs = useRef<Map<string, ISeriesApi<"Histogram">>>(new Map());
  const tooltipRef = useRef<HTMLDivElement>(null);

  const handleResize = useCallback(() => {
    if (chartContainerRef.current && chartRef.current) {
      chartRef.current.applyOptions({
        width: chartContainerRef.current.clientWidth,
      });
    }
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const colors = getChartColors(theme === "dark");

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
        barSpacing: 12,
        minBarSpacing: 5,
      },
      rightPriceScale: {
        borderColor: colors.border,
        scaleMargins: {
          top: 0.05,
          bottom: volumeSeries && volumeSeries.length > 0 ? 0.25 : 0.1,
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    chartRef.current = chart;

    // Helper to convert time to Unix timestamp in seconds
    const toUnixSeconds = (time: Time): number => {
      if (typeof time === "number") {
        // Already a Unix timestamp - check if seconds or milliseconds
        if (time > 1e12) {
          return Math.floor(time / 1000); // Convert milliseconds to seconds
        }
        return time; // Already in seconds
      }
      if (typeof time === "string") {
        const date = new Date(time);
        return Math.floor(date.getTime() / 1000);
      }
      // BusinessDay object
      const bd = time as { year: number; month: number; day: number };
      return Math.floor(new Date(bd.year, bd.month - 1, bd.day).getTime() / 1000);
    };

    // Add volume series first (so they appear behind the lines)
    // Create grouped bars by offsetting each trader's data slightly
    if (volumeSeries && volumeSeries.length > 0) {
      const numTraders = volumeSeries.length;
      // Calculate offset in seconds for each trader (spread across ~16 hours of a day)
      const totalSpread = 16 * 60 * 60; // 16 hours in seconds
      const barWidth = totalSpread / numTraders;

      volumeSeries.forEach((traderVolume, traderIndex) => {
        const histogramSeries = chart.addSeries(HistogramSeries, {
          color: hexToRgba(traderVolume.color, 0.7),
          priceFormat: {
            type: "volume",
          },
          priceScaleId: "volume",
        });

        histogramSeries.priceScale().applyOptions({
          scaleMargins: {
            top: 0.82,
            bottom: 0,
          },
        });

        // Offset each trader's data to create side-by-side grouped bars
        const offsetSeconds = (traderIndex - (numTraders - 1) / 2) * barWidth;
        const offsetData = traderVolume.data.map((d) => {
          const baseTime = toUnixSeconds(d.time);
          return {
            time: (baseTime + offsetSeconds) as Time,
            value: d.value,
          };
        });

        histogramSeries.setData(offsetData as HistogramData<Time>[]);
        volumeSeriesRefs.current.set(traderVolume.traderId, histogramSeries);
      });
    }

    // Add each trader's P&L line series
    series.forEach((traderSeries) => {
      const lineSeries = chart.addSeries(LineSeries, {
        color: traderSeries.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: traderSeries.color,
        crosshairMarkerBackgroundColor: colors.cardBg,
      });

      // Convert to unix timestamps (handles both string dates and numeric timestamps)
      const timestampData = traderSeries.data.map((d) => ({
        time: toUnixSeconds(d.time) as Time,
        value: d.value,
      }));

      lineSeries.setData(timestampData as LineData<Time>[]);
      seriesRefs.current.set(traderSeries.traderId, lineSeries);
    });

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

      const values: { name: string; color: string; pnl: number; volume?: number }[] = [];

      seriesRefs.current.forEach((lineSeries, traderId) => {
        const data = param.seriesData.get(lineSeries);
        if (data && "value" in data) {
          const traderInfo = series.find((s) => s.traderId === traderId);
          if (traderInfo) {
            // Get volume for this trader if available
            let volume: number | undefined;
            const volumeHistogram = volumeSeriesRefs.current.get(traderId);
            if (volumeHistogram) {
              const volumeData = param.seriesData.get(volumeHistogram);
              if (volumeData && "value" in volumeData) {
                volume = volumeData.value as number;
              }
            }
            values.push({
              name: traderInfo.traderName,
              color: traderInfo.color,
              pnl: data.value as number,
              volume,
            });
          }
        }
      });

      if (values.length === 0) {
        tooltipRef.current.style.display = "none";
        return;
      }

      tooltipRef.current.style.display = "block";

      // Position tooltip
      const containerRect = chartContainerRef.current?.getBoundingClientRect();
      if (containerRect) {
        let left = param.point.x + 15;
        if (left > containerRect.width - 220) {
          left = param.point.x - 220;
        }
        tooltipRef.current.style.left = `${left}px`;
        tooltipRef.current.style.top = `${param.point.y}px`;
      }

      // Format volume
      const formatVolume = (v: number) => {
        if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
        if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
        return `$${v.toFixed(0)}`;
      };

      // Build tooltip content (param.time is now unix timestamp in seconds)
      const date = new Date((param.time as number) * 1000);
      tooltipRef.current.innerHTML = `
        <div class="text-xs text-muted-foreground mb-2">${date.toLocaleDateString(
          "en-US",
          { month: "short", day: "numeric", year: "numeric" }
        )}</div>
        ${values
          .sort((a, b) => b.pnl - a.pnl)
          .map(
            (v) => `
          <div class="flex items-center justify-between gap-4 text-sm mb-1">
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full" style="background-color: ${v.color}; box-shadow: 0 0 6px ${v.color}"></div>
              <span class="text-muted-foreground">${v.name}</span>
            </div>
            <div class="text-right">
              <span class="font-mono font-medium ${v.pnl >= 0 ? "text-profit" : "text-loss"}">${formatCurrency(v.pnl)}</span>
              ${v.volume !== undefined ? `<span class="text-xs text-muted-foreground ml-2">${formatVolume(v.volume)}</span>` : ""}
            </div>
          </div>
        `
          )
          .join("")}
      `;
    });

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      seriesRefs.current.clear();
      volumeSeriesRefs.current.clear();
    };
  }, [series, volumeSeries, height, handleResize, theme]);

  return (
    <div className="relative">
      <div ref={chartContainerRef} className="w-full" />
      <div
        ref={tooltipRef}
        className="absolute z-50 hidden pointer-events-none glass-card rounded-lg px-3 py-2 min-w-[160px]"
        style={{ transform: "translateY(-50%)" }}
      />
    </div>
  );
}
