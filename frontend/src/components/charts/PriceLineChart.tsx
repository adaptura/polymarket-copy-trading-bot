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
  colors?: {
    background?: string;
    textColor?: string;
  };
}

export function PriceLineChart({
  data,
  height = 300,
  lineColor = "#3b82f6",
  areaTopColor = "rgba(59, 130, 246, 0.4)",
  areaBottomColor = "rgba(59, 130, 246, 0.0)",
  showArea = true,
  colors = {},
}: PriceLineChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | ISeriesApi<"Line"> | null>(null);

  const backgroundColor = colors.background ?? "#0a0a0a";
  const textColor = colors.textColor ?? "#d1d5db";

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: backgroundColor },
        textColor: textColor,
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.1)" },
        horzLines: { color: "rgba(255, 255, 255, 0.1)" },
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
      crosshair: {
        mode: 1,
      },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.2)",
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.2)",
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
  }, [data, height, lineColor, areaTopColor, areaBottomColor, showArea, backgroundColor, textColor]);

  return <div ref={chartContainerRef} className="w-full" />;
}
