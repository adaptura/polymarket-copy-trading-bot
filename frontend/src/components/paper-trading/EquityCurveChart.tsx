"use client";

import { useState, useEffect } from "react";
import { Loader2, LineChart as LineChartIcon } from "lucide-react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
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
    if (Math.abs(value) >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
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
      <div className="flex flex-col items-center justify-center h-[320px]">
        <div className="w-12 h-12 rounded-xl bg-surface-2 flex items-center justify-center mb-3">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Loading performance data...</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[320px] text-center">
        <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
          <LineChartIcon className="w-7 h-7 text-muted-foreground" />
        </div>
        <h4 className="font-medium mb-1">No Performance Data Yet</h4>
        <p className="text-sm text-muted-foreground max-w-sm">
          Equity snapshots will appear as the simulation executes trades.
        </p>
      </div>
    );
  }

  // Calculate min/max for Y axis with better padding
  const equities = data.map((d) => d.totalEquity);
  const minEquity = Math.min(...equities);
  const maxEquity = Math.max(...equities);
  const range = maxEquity - minEquity;
  const padding = range * 0.15 || startingCapital * 0.1;

  // Determine if portfolio is in profit overall
  const currentEquity = data[data.length - 1]?.totalEquity || startingCapital;
  const isProfit = currentEquity >= startingCapital;

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      const pnl = dataPoint.totalEquity - startingCapital;
      const pnlPercent = ((pnl / startingCapital) * 100).toFixed(2);
      const isProfitPoint = pnl >= 0;

      return (
        <div className="bg-card/95 backdrop-blur-sm border border-border/50 rounded-xl p-4 shadow-xl">
          <p className="text-xs text-muted-foreground mb-2">
            {formatTooltipDate(label)}
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-6">
              <span className="text-sm text-muted-foreground">Equity</span>
              <span className="font-mono font-semibold">
                {formatCurrency(dataPoint.totalEquity)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className="text-sm text-muted-foreground">P&L</span>
              <span
                className={`font-mono font-semibold ${
                  isProfitPoint ? "text-profit" : "text-loss"
                }`}
              >
                {isProfitPoint ? "+" : ""}
                {formatCurrency(pnl)} ({isProfitPoint ? "+" : ""}
                {pnlPercent}%)
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart
        data={data}
        margin={{ top: 20, right: 30, left: 10, bottom: 10 }}
      >
        <defs>
          <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={isProfit ? "hsl(var(--profit))" : "hsl(var(--loss))"}
              stopOpacity={0.3}
            />
            <stop
              offset="50%"
              stopColor={isProfit ? "hsl(var(--profit))" : "hsl(var(--loss))"}
              stopOpacity={0.1}
            />
            <stop
              offset="100%"
              stopColor={isProfit ? "hsl(var(--profit))" : "hsl(var(--loss))"}
              stopOpacity={0}
            />
          </linearGradient>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop
              offset="0%"
              stopColor="hsl(var(--cyan))"
              stopOpacity={1}
            />
            <stop
              offset="100%"
              stopColor={isProfit ? "hsl(var(--profit))" : "hsl(var(--loss))"}
              stopOpacity={1}
            />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(var(--border))"
          opacity={0.4}
          vertical={false}
        />

        <XAxis
          dataKey="time"
          tickFormatter={formatDate}
          stroke="hsl(var(--muted-foreground))"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          dy={10}
          tick={{ fill: "hsl(var(--muted-foreground))" }}
        />

        <YAxis
          tickFormatter={formatCurrency}
          stroke="hsl(var(--muted-foreground))"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          dx={-10}
          domain={[minEquity - padding, maxEquity + padding]}
          tick={{ fill: "hsl(var(--muted-foreground))" }}
        />

        <Tooltip content={<CustomTooltip />} />

        {startingCapital > 0 && (
          <ReferenceLine
            y={startingCapital}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="6 4"
            strokeOpacity={0.5}
            strokeWidth={1}
          />
        )}

        <Area
          type="monotone"
          dataKey="totalEquity"
          stroke="url(#lineGradient)"
          strokeWidth={2.5}
          fill="url(#equityGradient)"
          dot={false}
          activeDot={{
            r: 6,
            fill: isProfit ? "hsl(var(--profit))" : "hsl(var(--loss))",
            stroke: "hsl(var(--background))",
            strokeWidth: 3,
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
