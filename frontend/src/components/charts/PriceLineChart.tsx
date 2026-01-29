"use client";

import { useRef, useEffect } from "react";
import {
  createChart,
  ColorType,
  AreaSeries,
  LineSeries,
} from "lightweight-charts";
import type {
  IChartApi,
  ISeriesApi,
  LineData,
  Time,
} from "lightweight-charts";
import { getChartColors } from "@/lib/chart-colors";
import { useTheme } from "@/components/providers/ThemeProvider";

export interface PriceData {
  time: Time;
  value: number;
}

interface PriceLineChartProps {
  data: PriceData[];
  height?: number;
  lineColor?: string;
  areaTopColor?: string;
  areaBottomColor?: string;
  showArea?: boolean;
}

export function PriceLineChart({
  data,
  height = 300,
  lineColor = "#3b82f6",
  areaTopColor = "rgba(59, 130, 246, 0.4)",
  areaBottomColor = "rgba(59, 130, 246, 0.0)",
  showArea = true,
}: PriceLineChartProps) {
  const { theme } = useTheme();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | ISeriesApi<"Line"> | null>(null);

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
        mode: 1,
        vertLine: {
          width: 1,
          color: colors.crosshair,
          style: 0,
          labelBackgroundColor: colors.labelBg,
        },
        horzLine: {
          width: 1,
          color: colors.crosshair,
          style: 0,
          labelBackgroundColor: colors.labelBg,
        },
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: colors.border,
      },
    });

    chartRef.current = chart;

    if (showArea) {
      const areaSeries = chart.addSeries(AreaSeries, {
        lineColor: lineColor,
        topColor: areaTopColor,
        bottomColor: areaBottomColor,
        lineWidth: 2,
      });
      seriesRef.current = areaSeries;
      areaSeries.setData(data as LineData<Time>[]);
    } else {
      const lineSeries = chart.addSeries(LineSeries, {
        color: lineColor,
        lineWidth: 2,
      });
      seriesRef.current = lineSeries;
      lineSeries.setData(data as LineData<Time>[]);
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data, height, lineColor, areaTopColor, areaBottomColor, showArea, theme]);

  return <div ref={chartContainerRef} className="w-full" />;
}
