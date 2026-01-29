"use client";

import { useRef, useEffect, useCallback } from "react";
import {
  createChart,
  ColorType,
  AreaSeries,
} from "lightweight-charts";
import type { IChartApi, AreaData, Time } from "lightweight-charts";
import type { Trade } from "@/types";
import { MOCK_TRADERS } from "@/lib/mock-data";
import { getChartColors, hexToRgba } from "@/lib/chart-colors";
import { useTheme } from "@/components/providers/ThemeProvider";

interface ExposureChartProps {
  trades: Trade[];
  height?: number;
}

export function ExposureChart({ trades, height = 200 }: ExposureChartProps) {
  const { theme } = useTheme();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const handleResize = useCallback(() => {
    if (chartContainerRef.current && chartRef.current) {
      chartRef.current.applyOptions({
        width: chartContainerRef.current.clientWidth,
      });
    }
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current || trades.length === 0) return;

    const colors = getChartColors(theme === "dark");

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.textMuted,
        fontFamily: "var(--font-geist-mono)",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: colors.gridLine },
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: colors.border,
      },
      handleScroll: false,
      handleScale: false,
    });

    chartRef.current = chart;

    // Calculate cumulative exposure per trader over time
    const sortedTrades = [...trades].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    // Group by date and trader
    const traderExposures: Map<string, Map<string, number>> = new Map();
    const uniqueTraderIds = new Set<string>();

    sortedTrades.forEach((trade) => {
      uniqueTraderIds.add(trade.traderId);
      const dateKey = trade.timestamp.toISOString().split("T")[0];

      if (!traderExposures.has(dateKey)) {
        traderExposures.set(dateKey, new Map());
      }

      const dateMap = traderExposures.get(dateKey)!;
      const current = dateMap.get(trade.traderId) || 0;
      const delta = trade.side === "BUY" ? trade.amount : -trade.amount;
      dateMap.set(trade.traderId, current + delta);
    });

    // Create series for each trader
    const traderIds = Array.from(uniqueTraderIds);

    traderIds.forEach((traderId, index) => {
      const trader = MOCK_TRADERS.find((t) => t.id === traderId);
      const color = trader?.color || `hsl(${index * 60}, 70%, 50%)`;

      const seriesData: AreaData<Time>[] = [];
      let cumulative = 0;

      Array.from(traderExposures.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([dateKey, traderMap]) => {
          cumulative += traderMap.get(traderId) || 0;
          seriesData.push({
            time: dateKey as unknown as Time,
            value: Math.max(0, cumulative),
          });
        });

      if (seriesData.length > 0) {
        const areaSeries = chart.addSeries(AreaSeries, {
          lineColor: color,
          topColor: hexToRgba(color, 0.25),
          bottomColor: hexToRgba(color, 0.02),
          lineWidth: 2,
        });
        areaSeries.setData(seriesData);
      }
    });

    chart.timeScale().fitContent();

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [trades, height, handleResize, theme]);

  if (trades.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground"
        style={{ height }}
      >
        No trade data available
      </div>
    );
  }

  return <div ref={chartContainerRef} className="w-full" />;
}
