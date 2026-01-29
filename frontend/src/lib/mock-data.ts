import type { Time } from "lightweight-charts";
import type {
  Trader,
  Trade,
  Market,
  TraderPnLSeries,
  CalculatorMetrics,
  ActivityDataPoint,
} from "@/types";

// Seeded random for consistent data
function seededRandom(seed: number) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

// Trader color palette - vibrant, distinguishable colors
export const TRADER_COLORS = [
  "#00D9FF", // Cyan
  "#22C55E", // Emerald
  "#A855F7", // Violet
  "#F59E0B", // Amber
  "#FF6B6B", // Coral
  "#EC4899", // Pink
  "#3B82F6", // Blue
  "#14B8A6", // Teal
];

export const MOCK_TRADERS: Trader[] = [
  {
    id: "trader-1",
    name: "Whale Alpha",
    color: TRADER_COLORS[0],
    totalPnL: 127450.32,
    activeSince: new Date("2023-06-15"),
    marketsTraded: 47,
  },
  {
    id: "trader-2",
    name: "DegenKing",
    color: TRADER_COLORS[1],
    totalPnL: 89234.12,
    activeSince: new Date("2023-08-22"),
    marketsTraded: 123,
  },
  {
    id: "trader-3",
    name: "PredictorPro",
    color: TRADER_COLORS[2],
    totalPnL: 54892.78,
    activeSince: new Date("2023-11-01"),
    marketsTraded: 34,
  },
  {
    id: "trader-4",
    name: "MarketMaven",
    color: TRADER_COLORS[3],
    totalPnL: 41230.56,
    activeSince: new Date("2024-01-10"),
    marketsTraded: 28,
  },
  {
    id: "trader-5",
    name: "RiskTaker",
    color: TRADER_COLORS[4],
    totalPnL: -12450.89,
    activeSince: new Date("2024-03-05"),
    marketsTraded: 89,
  },
];

export const MOCK_MARKETS: Market[] = [
  {
    id: "market-1",
    name: "Trump Wins 2024 Election",
    currentPrice: 0.67,
    tradeCount: 2847,
    totalVolume: 4520000,
    lastActivity: new Date(Date.now() - 2 * 60 * 1000),
  },
  {
    id: "market-2",
    name: "BTC Above $100k by EOY",
    currentPrice: 0.42,
    tradeCount: 1523,
    totalVolume: 2890000,
    lastActivity: new Date(Date.now() - 15 * 60 * 1000),
  },
  {
    id: "market-3",
    name: "Fed Rate Cut in March",
    currentPrice: 0.23,
    tradeCount: 892,
    totalVolume: 1450000,
    lastActivity: new Date(Date.now() - 45 * 60 * 1000),
  },
  {
    id: "market-4",
    name: "ETH Flips BTC Market Cap",
    currentPrice: 0.08,
    tradeCount: 456,
    totalVolume: 890000,
    lastActivity: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: "market-5",
    name: "Apple Stock Above $200",
    currentPrice: 0.71,
    tradeCount: 1234,
    totalVolume: 2100000,
    lastActivity: new Date(Date.now() - 30 * 60 * 1000),
  },
  {
    id: "market-6",
    name: "US Recession in 2024",
    currentPrice: 0.15,
    tradeCount: 678,
    totalVolume: 980000,
    lastActivity: new Date(Date.now() - 4 * 60 * 60 * 1000),
  },
  {
    id: "market-7",
    name: "OpenAI IPO Before 2025",
    currentPrice: 0.34,
    tradeCount: 1089,
    totalVolume: 1780000,
    lastActivity: new Date(Date.now() - 1 * 60 * 60 * 1000),
  },
  {
    id: "market-8",
    name: "Taylor Swift Endorses Candidate",
    currentPrice: 0.56,
    tradeCount: 2341,
    totalVolume: 3200000,
    lastActivity: new Date(Date.now() - 5 * 60 * 1000),
  },
];

export function generateTraderPnLSeries(
  traders: Trader[],
  days: number = 90
): TraderPnLSeries[] {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return traders.map((trader, traderIndex) => {
    const data: { time: Time; value: number }[] = [];
    let pnl = 0;
    let seed = 12345 + traderIndex * 1000;

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);

      // Each trader has different volatility and trend
      const volatility = 500 + traderIndex * 200;
      const trend = (trader.totalPnL / days) * (0.8 + seededRandom(seed++) * 0.4);
      pnl += trend + (seededRandom(seed++) - 0.5) * volatility;

      data.push({
        time: date.toISOString().split("T")[0] as unknown as Time,
        value: parseFloat(pnl.toFixed(2)),
      });
    }

    return {
      traderId: trader.id,
      traderName: trader.name,
      color: trader.color,
      data,
    };
  });
}

export function generateVolumeData(days: number = 90): { time: Time; value: number }[] {
  const data: { time: Time; value: number }[] = [];
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  let seed = 54321;

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    // Volume with weekly pattern (higher on weekdays)
    const dayOfWeek = date.getDay();
    const weekdayMultiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 0.6 : 1;

    data.push({
      time: date.toISOString().split("T")[0] as unknown as Time,
      value: Math.floor((seededRandom(seed++) * 500000 + 100000) * weekdayMultiplier),
    });
  }

  return data;
}

export interface TraderVolumeData {
  traderId: string;
  traderName: string;
  color: string;
  data: { time: Time; value: number }[];
}

export function generateTraderVolumeData(
  traders: Trader[],
  days: number = 90
): TraderVolumeData[] {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return traders.map((trader, traderIndex) => {
    const data: { time: Time; value: number }[] = [];
    let seed = 54321 + traderIndex * 777;

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);

      // Volume with weekly pattern and trader-specific variation
      const dayOfWeek = date.getDay();
      const weekdayMultiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 0.6 : 1;
      // Each trader has different activity levels
      const traderActivityMultiplier = 0.5 + (traderIndex % 3) * 0.3;

      data.push({
        time: date.toISOString().split("T")[0] as unknown as Time,
        value: Math.floor(
          (seededRandom(seed++) * 150000 + 30000) *
            weekdayMultiplier *
            traderActivityMultiplier
        ),
      });
    }

    return {
      traderId: trader.id,
      traderName: trader.name,
      color: trader.color,
      data,
    };
  });
}

export function generateTrades(
  marketId: string,
  count: number = 50
): Trade[] {
  const trades: Trade[] = [];
  let seed = 98765 + marketId.charCodeAt(7) * 100;

  for (let i = 0; i < count; i++) {
    const traderId = MOCK_TRADERS[Math.floor(seededRandom(seed++) * MOCK_TRADERS.length)].id;
    const hoursAgo = Math.floor(seededRandom(seed++) * 72);

    trades.push({
      id: `trade-${marketId}-${i}`,
      traderId,
      marketId,
      side: seededRandom(seed++) > 0.5 ? "BUY" : "SELL",
      amount: Math.floor(seededRandom(seed++) * 10000) + 100,
      price: 0.3 + seededRandom(seed++) * 0.5,
      timestamp: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
    });
  }

  return trades.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export function generateCalculatorMetrics(
  windows: string[],
  allocations: { traderId: string; percentage: number }[]
): CalculatorMetrics[] {
  let seed = 11111;

  return windows.map((window) => {
    // Shorter windows generally have higher Sharpe but lower total returns
    const windowMultiplier = window.includes("m")
      ? 0.7
      : window.includes("h")
      ? 0.85
      : window.includes("d")
      ? 1
      : 1.2;

    const totalAllocation = allocations.reduce((sum, a) => sum + a.percentage, 0);
    const allocationFactor = totalAllocation / 100;

    return {
      window,
      maxDrawdown: -(seededRandom(seed++) * 15 + 2) * windowMultiplier,
      cagr: (seededRandom(seed++) * 80 + 20) * windowMultiplier * allocationFactor,
      totalPnL: (seededRandom(seed++) * 50000 + 5000) * allocationFactor,
      sharpeRatio: (seededRandom(seed++) * 2 + 0.5) / windowMultiplier,
      sortinoRatio: (seededRandom(seed++) * 3 + 1) / windowMultiplier,
      winRate: seededRandom(seed++) * 30 + 50,
      avgWin: seededRandom(seed++) * 500 + 100,
      avgLoss: -(seededRandom(seed++) * 300 + 50),
      profitFactor: seededRandom(seed++) * 2 + 1,
    };
  });
}

export function generateActivityHeatmap(traderId: string): ActivityDataPoint[] {
  const data: ActivityDataPoint[] = [];
  let seed = traderId.charCodeAt(7) * 1000;

  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      // More activity during market hours (9-17 UTC)
      const marketHoursMultiplier = hour >= 9 && hour <= 17 ? 2 : 0.5;
      // Less activity on weekends
      const weekendMultiplier = day === 0 || day === 6 ? 0.3 : 1;

      data.push({
        dayOfWeek: day,
        hour,
        tradeCount: Math.floor(
          seededRandom(seed++) * 20 * marketHoursMultiplier * weekendMultiplier
        ),
      });
    }
  }

  return data;
}

export function generatePriceHistory(
  marketId: string,
  days: number = 30
): { time: Time; open: number; high: number; low: number; close: number }[] {
  const data: { time: Time; open: number; high: number; low: number; close: number }[] = [];
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  let seed = marketId.charCodeAt(7) * 500;
  let price = 0.3 + seededRandom(seed++) * 0.4;

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    const volatility = 0.05;
    const open = price;
    const change = (seededRandom(seed++) - 0.5) * volatility;
    const close = Math.max(0.01, Math.min(0.99, open + change));
    const high = Math.min(0.99, Math.max(open, close) + seededRandom(seed++) * 0.02);
    const low = Math.max(0.01, Math.min(open, close) - seededRandom(seed++) * 0.02);

    data.push({
      time: date.toISOString().split("T")[0] as unknown as Time,
      open: parseFloat(open.toFixed(4)),
      high: parseFloat(high.toFixed(4)),
      low: parseFloat(low.toFixed(4)),
      close: parseFloat(close.toFixed(4)),
    });

    price = close;
  }

  return data;
}

export function formatCurrency(value: number, compact: boolean = false): string {
  if (compact && Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (compact && Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function getTraderById(id: string): Trader | undefined {
  return MOCK_TRADERS.find((t) => t.id === id);
}

export function getMarketById(id: string): Market | undefined {
  return MOCK_MARKETS.find((m) => m.id === id);
}
