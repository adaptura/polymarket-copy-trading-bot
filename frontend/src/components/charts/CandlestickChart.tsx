"use client";

import { useRef, useEffect } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
} from "lightweight-charts";
import type {
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  Time,
} from "lightweight-charts";
import { getChartColors } from "@/lib/chart-colors";
import { useTheme } from "@/components/providers/ThemeProvider";

export interface OHLCData {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface VolumeData {
  time: Time;
  value: number;
  color?: string;
}

interface CandlestickChartProps {
  data: OHLCData[];
  volumeData?: VolumeData[];
  height?: number;
  colors?: {
    upColor?: string;
    downColor?: string;
    wickUpColor?: string;
    wickDownColor?: string;
    volumeUp?: string;
    volumeDown?: string;
  };
}

const defaultCandleColors = {
  upColor: "#22c55e",
  downColor: "#ef4444",
  wickUpColor: "#22c55e",
  wickDownColor: "#ef4444",
  volumeUp: "rgba(34, 197, 94, 0.5)",
  volumeDown: "rgba(239, 68, 68, 0.5)",
};

export function CandlestickChart({
  data,
  volumeData,
  height = 400,
  colors = {},
}: CandlestickChartProps) {
  const { theme } = useTheme();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const candleColors = { ...defaultCandleColors, ...colors };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chartColors = getChartColors(theme === "dark");

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: chartColors.background },
        textColor: chartColors.textMuted,
        fontFamily: "var(--font-geist-mono)",
      },
      grid: {
        vertLines: { color: chartColors.gridLine },
        horzLines: { color: chartColors.gridLine },
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
      crosshair: {
        mode: 1,
        vertLine: {
          width: 1,
          color: chartColors.crosshair,
          style: 0,
          labelBackgroundColor: chartColors.labelBg,
        },
        horzLine: {
          width: 1,
          color: chartColors.crosshair,
          style: 0,
          labelBackgroundColor: chartColors.labelBg,
        },
      },
      timeScale: {
        borderColor: chartColors.border,
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: chartColors.border,
      },
    });

    chartRef.current = chart;

    // Add candlestick series (v5 API)
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: candleColors.upColor,
      downColor: candleColors.downColor,
      borderVisible: false,
      wickUpColor: candleColors.wickUpColor,
      wickDownColor: candleColors.wickDownColor,
    });

    candlestickSeriesRef.current = candlestickSeries;
    candlestickSeries.setData(data as CandlestickData<Time>[]);

    // Add volume series if provided
    if (volumeData && volumeData.length > 0) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: candleColors.volumeUp,
        priceFormat: {
          type: "volume",
        },
        priceScaleId: "",
      });

      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });

      const coloredVolumeData = volumeData.map((v, i) => ({
        ...v,
        color:
          i > 0 && data[i] && data[i - 1]
            ? data[i].close >= data[i - 1].close
              ? candleColors.volumeUp
              : candleColors.volumeDown
            : candleColors.volumeUp,
      }));

      volumeSeriesRef.current = volumeSeries;
      volumeSeries.setData(coloredVolumeData as HistogramData<Time>[]);
    }

    // Fit content
    chart.timeScale().fitContent();

    // Handle resize
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
  }, [data, volumeData, height, candleColors, theme]);

  return <div ref={chartContainerRef} className="w-full" />;
}
