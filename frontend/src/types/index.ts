import type { Time } from "lightweight-charts";

export interface Trader {
  id: string;
  name: string;
  color: string;
  totalPnL: number;
  activeSince: Date;
  marketsTraded: number;
}

export interface Trade {
  id: string;
  traderId: string;
  marketId: string;
  side: "BUY" | "SELL";
  amount: number;
  price: number;
  timestamp: Date;
}

export interface Market {
  id: string;
  name: string;
  currentPrice: number;
  tradeCount: number;
  totalVolume: number;
  lastActivity: Date;
}

export interface PnLDataPoint {
  time: Time;
  traderId: string;
  value: number;
}

export interface TraderPnLSeries {
  traderId: string;
  traderName: string;
  color: string;
  data: { time: Time; value: number }[];
}

export interface VolumeDataPoint {
  time: Time;
  value: number;
}

export interface CalculatorMetrics {
  window: string;
  maxDrawdown: number;
  cagr: number;
  totalPnL: number;
  sharpeRatio: number;
  sortinoRatio: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
}

export interface TraderAllocation {
  traderId: string;
  traderName: string;
  color: string;
  percentage: number;
}

export type TimeRange = "1D" | "7D" | "30D" | "90D" | "1Y" | "All";

export type Resolution = "1m" | "5m" | "15m" | "1h" | "4h" | "1D";

export type RollingWindow =
  | "10m"
  | "30m"
  | "1h"
  | "6h"
  | "24h"
  | "2d"
  | "3d"
  | "5d"
  | "7d"
  | "14d"
  | "21d"
  | "28d";

export interface ActivityDataPoint {
  dayOfWeek: number; // 0-6 (Sun-Sat)
  hour: number; // 0-23
  tradeCount: number;
}
