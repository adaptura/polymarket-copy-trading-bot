import { useState, useEffect, useCallback } from "react";
import type { Time } from "lightweight-charts";
import type { TraderPnLSeries, RollingAnalysisResult } from "@/types";

// ============================================================================
// TYPES
// ============================================================================

export interface Trader {
  address: string;
  alias: string;
  color: string;
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  positionCount: number;
  lastUpdated: string | null;
  isActive: boolean;
}

export interface TraderAnalytics {
  trader: Trader;
  drawdown: {
    maxDrawdownPct: number;
    maxDrawdownAmount: number;
    currentDrawdownPct: number;
    currentDrawdownAmount: number;
    peakPnl: number;
    troughPnl: number;
    peakDate: string | null;
    troughDate: string | null;
  };
  rollingReturns: {
    pnl7d: number | null;
    pnl30d: number | null;
    pnl90d: number | null;
    pnlYtd: number | null;
    pnlAllTime: number | null;
  };
  volatility: {
    dailyVolatility: number;
    avgDailyChange: number;
    sharpeRatio: number | null;
    sortinoRatio: number | null;
    positiveDays: number;
    negativeDays: number;
    winRate: number;
    maxWinStreak: number;
    maxLossStreak: number;
  };
  pnlHistory: Array<{
    time: string;
    totalPnl: number;
    realizedPnl: number;
    unrealizedPnl: number;
  }>;
}

// API response types (raw from server)
interface ApiPnLSeriesPoint {
  time: number;
  value: number;
}

interface ApiTraderPnLSeries {
  traderId: string;
  traderName: string;
  color: string;
  data: ApiPnLSeriesPoint[];
}

// Re-export the UI types
export type { TraderPnLSeries };
export type TraderVolumeSeries = TraderPnLSeries;

// ============================================================================
// GENERIC FETCH HOOK
// ============================================================================

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

function useApi<T>(url: string | null, initialData: T | null = null): UseApiResult<T> {
  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!url) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const json = await response.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ============================================================================
// TRADER HOOKS
// ============================================================================

export function useTraders() {
  const { data, loading, error, refetch } = useApi<{ traders: Trader[] }>("/api/traders");
  return {
    traders: data?.traders ?? [],
    loading,
    error,
    refetch,
  };
}

export function useTrader(address: string | null) {
  const url = address ? `/api/traders/${address}` : null;
  const { data, loading, error, refetch } = useApi<Trader>(url);
  return { trader: data, loading, error, refetch };
}

export function useTraderAnalytics(address: string | null) {
  const url = address ? `/api/traders/${address}/analytics` : null;
  const { data, loading, error, refetch } = useApi<TraderAnalytics>(url);
  return { analytics: data, loading, error, refetch };
}

export function useTraderPnL(
  address: string | null,
  startDate: Date,
  endDate: Date,
  resolution: string = "1D"
) {
  const url = address
    ? `/api/traders/${address}/pnl?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&resolution=${resolution}`
    : null;
  const { data, loading, error, refetch } = useApi<{ series: ApiPnLSeriesPoint[] }>(url);
  return { series: data?.series ?? [], loading, error, refetch };
}

// ============================================================================
// MULTI-TRADER HOOKS (for dashboard)
// ============================================================================

export function useMultiTraderPnL(
  addresses: string[],
  startDate: Date,
  endDate: Date,
  resolution: string = "1D"
) {
  const tradersParam = addresses.join(",");
  const url =
    addresses.length > 0
      ? `/api/pnl?traders=${tradersParam}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&resolution=${resolution}`
      : null;

  const { data, loading, error, refetch } = useApi<{ series: ApiTraderPnLSeries[] }>(url);

  // Convert API response to chart-compatible format
  const series: TraderPnLSeries[] = (data?.series ?? []).map((s) => ({
    traderId: s.traderId,
    traderName: s.traderName,
    color: s.color,
    data: s.data.map((d) => ({
      time: d.time as Time,
      value: d.value,
    })),
  }));

  return { series, loading, error, refetch };
}

export function useMultiTraderVolume(
  _addresses: string[],
  _startDate: Date,
  _endDate: Date,
  _resolution: string = "1D"
) {
  // Volume data not available in snapshot-based system
  // Return empty series
  return {
    series: [] as TraderVolumeSeries[],
    loading: false,
    error: null,
    refetch: () => {},
  };
}

// ============================================================================
// SNAPSHOT HOOKS
// ============================================================================

export function useSnapshots() {
  const { data, loading, error, refetch } = useApi<{
    snapshots: Array<{
      traderAddress: string;
      alias: string;
      time: string;
      realizedPnl: number;
      unrealizedPnl: number;
      totalPnl: number;
      positionCount: number | null;
    }>;
  }>("/api/snapshot");

  return {
    snapshots: data?.snapshots ?? [],
    loading,
    error,
    refetch,
  };
}

export function useTakeSnapshot() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const takeSnapshot = useCallback(async (address?: string, backfill?: boolean) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, backfill }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { takeSnapshot, loading, error };
}

// ============================================================================
// ROLLING ANALYSIS HOOK
// ============================================================================

interface RollingAnalysisParams {
  allocations: { traderAddress: string; percentage: number }[];
  window: string;
  initialCapital?: number;
}

// ============================================================================
// TRADER UPDATE HOOK
// ============================================================================

interface UpdateTraderParams {
  alias?: string;
  color?: string;
  notes?: string;
}

export function useUpdateTrader() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateTrader = useCallback(async (address: string, params: UpdateTraderParams) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/traders/${address}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { updateTrader, loading, error };
}

export function useRollingAnalysis() {
  const [data, setData] = useState<RollingAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchRollingAnalysis = useCallback(async (params: RollingAnalysisParams) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/calculator/rolling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const result = await response.json();
      setData(result);
      return result as RollingAnalysisResult;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, loading, error, fetchRollingAnalysis, reset };
}

// ============================================================================
// HELPER: Parse date from API (handles both ISO strings and Unix timestamps)
// ============================================================================

// Fixed epoch timestamp for fallback (avoids impure Date.now() calls during render)
const FALLBACK_DATE = new Date("2024-01-01T00:00:00.000Z");

function parseApiDate(value: string | number | null): Date {
  if (!value) return FALLBACK_DATE;

  // If it's a number, check if it's seconds or milliseconds
  if (typeof value === "number") {
    // If value is less than year 2000 in milliseconds, it's probably seconds
    if (value < 946684800000) {
      return new Date(value * 1000); // Convert seconds to milliseconds
    }
    return new Date(value);
  }

  // If it's a string, try parsing as ISO or as a number
  const parsed = Date.parse(value);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }

  // Try as numeric string (Unix timestamp)
  const numValue = parseInt(value, 10);
  if (!isNaN(numValue)) {
    if (numValue < 946684800000) {
      return new Date(numValue * 1000);
    }
    return new Date(numValue);
  }

  return FALLBACK_DATE;
}

// ============================================================================
// HELPER: Convert API traders to UI format
// ============================================================================

export function toUITrader(trader: Trader) {
  return {
    id: trader.address,
    name: trader.alias,
    color: trader.color,
    totalPnL: trader.totalPnl,
    realizedPnL: trader.realizedPnl,
    unrealizedPnL: trader.unrealizedPnl,
    positionCount: trader.positionCount,
    lastUpdated: trader.lastUpdated ? parseApiDate(trader.lastUpdated) : null,
    // Backwards compatibility fields
    marketsTraded: trader.positionCount,
    activeSince: trader.lastUpdated ? parseApiDate(trader.lastUpdated) : FALLBACK_DATE,
  };
}
