"use client";

import { useRef, useEffect, useCallback } from "react";
import {
  createChart,
  ColorType,
  HistogramSeries,
} from "lightweight-charts";
import type { IChartApi, HistogramData, Time } from "lightweight-charts";
import { getChartColors } from "@/lib/chart-colors";
import { useTheme } from "@/components/providers/ThemeProvider";

interface VolumeChartProps {
  data: { time: Time; value: number }[];
  height?: number;
  color?: string;
}

export function VolumeChart({
  data,
  height = 100,
  color = "#00D9FF",
}: VolumeChartProps) {
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
    if (!chartContainerRef.current) return;

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
        visible: false,
      },
      rightPriceScale: {
        borderColor: colors.border,
        scaleMargins: {
          top: 0.1,
          bottom: 0,
        },
      },
      handleScroll: false,
      handleScale: false,
    });

    chartRef.current = chart;

    const histogramSeries = chart.addSeries(HistogramSeries, {
      color: color,
      priceFormat: {
        type: "volume",
      },
    });

    // Add gradient effect by varying opacity based on value
    const maxValue = Math.max(...data.map((d) => d.value));
    const coloredData = data.map((d) => {
      const intensity = 0.3 + (d.value / maxValue) * 0.7;
      // Use theme-appropriate cyan color
      const baseColor = theme === "dark" ? "0, 217, 255" : "0, 150, 200";
      return {
        ...d,
        color: `rgba(${baseColor}, ${intensity})`,
      };
    });

    histogramSeries.setData(coloredData as HistogramData<Time>[]);
    chart.timeScale().fitContent();

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data, height, color, handleResize, theme]);

  return <div ref={chartContainerRef} className="w-full" />;
}
