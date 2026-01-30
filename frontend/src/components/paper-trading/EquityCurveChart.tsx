"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface EquityPoint {
  time: string;
  totalEquity: number;
  totalPnl: number;
  totalPnlPercent: number;
}

interface EquityCurveChartProps {
  portfolioId: string;
}

export function EquityCurveChart({ portfolioId }: EquityCurveChartProps) {
  const [data, setData] = useState<EquityPoint[]>([]);
  const [startingCapital, setStartingCapital] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/paper-trading/portfolios/${portfolioId}/analytics`
        );
        if (!response.ok) throw new Error("Failed to fetch analytics");
        const result = await response.json();
        setData(result.equityCurve || []);
        setStartingCapital(result.portfolio?.startingCapital || 0);
      } catch (error) {
        console.error("Error fetching equity curve:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [portfolioId]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (timeStr: string) => {
    const date = new Date(timeStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  const formatTooltipDate = (timeStr: string) => {
    const date = new Date(timeStr);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No equity data yet. Snapshots will appear as trades are executed.
      </div>
    );
  }

  // Calculate min/max for Y axis
  const equities = data.map((d) => d.totalEquity);
  const minEquity = Math.min(...equities);
  const maxEquity = Math.max(...equities);
  const padding = (maxEquity - minEquity) * 0.1 || startingCapital * 0.1;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={data}
        margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(var(--border))"
          opacity={0.3}
        />
        <XAxis
          dataKey="time"
          tickFormatter={formatDate}
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={formatCurrency}
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          domain={[minEquity - padding, maxEquity + padding]}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            padding: "12px",
          }}
          labelFormatter={formatTooltipDate}
          formatter={(value: number, name: string) => {
            if (name === "totalEquity") {
              return [formatCurrency(value), "Equity"];
            }
            return [value, name];
          }}
        />
        {startingCapital > 0 && (
          <ReferenceLine
            y={startingCapital}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="5 5"
            strokeOpacity={0.5}
          />
        )}
        <Line
          type="monotone"
          dataKey="totalEquity"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
          activeDot={{
            r: 4,
            fill: "hsl(var(--primary))",
            stroke: "hsl(var(--background))",
            strokeWidth: 2,
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
