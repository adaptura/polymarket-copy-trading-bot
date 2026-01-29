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
    background?: string;
    textColor?: string;
    upColor?: string;
    downColor?: string;
    wickUpColor?: string;
    wickDownColor?: string;
    volumeUp?: string;
    volumeDown?: string;
  };
}

const defaultColors = {
  background: "#0a0a0a",
  textColor: "#d1d5db",
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
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const mergedColors = { ...defaultColors, ...colors };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: mergedColors.background },
        textColor: mergedColors.textColor,
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.1)" },
        horzLines: { color: "rgba(255, 255, 255, 0.1)" },
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
      crosshair: {
        mode: 1,
        vertLine: {
          width: 1,
          color: "rgba(255, 255, 255, 0.4)",
          style: 0,
        },
        horzLine: {
          width: 1,
          color: "rgba(255, 255, 255, 0.4)",
          style: 0,
        },
      },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.2)",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.2)",
      },
    });

    chartRef.current = chart;

    // Add candlestick series (v5 API)
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: mergedColors.upColor,
      downColor: mergedColors.downColor,
      borderVisible: false,
      wickUpColor: mergedColors.wickUpColor,
      wickDownColor: mergedColors.wickDownColor,
    });

    candlestickSeriesRef.current = candlestickSeries;
    candlestickSeries.setData(data as CandlestickData<Time>[]);

    // Add volume series if provided
    if (volumeData && volumeData.length > 0) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: mergedColors.volumeUp,
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
              ? mergedColors.volumeUp
              : mergedColors.volumeDown
            : mergedColors.volumeUp,
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
  }, [data, volumeData, height, mergedColors]);

  return <div ref={chartContainerRef} className="w-full" />;
}
