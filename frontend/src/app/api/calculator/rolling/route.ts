import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import type { MetricDistribution, RollingAnalysisResult, RollingTimeSeries, TraderTimeline, IndividualTraderSeries } from "@/types";

interface AllocationInput {
  traderAddress: string;
  percentage: number;
}

interface PeriodReturn {
  periodEnd: Date;
  weighted_pnl: number;
}

interface TraderPeriodReturn {
  periodEnd: Date;
  traderId: string;
  traderName: string;
  color: string;
  pnl: number;
}

/**
 * POST /api/calculator/rolling
 *
 * Calculate rolling window analysis for portfolio allocations.
 * Returns distribution statistics for each metric across all rolling periods in history.
 * Supports both hourly (1h, 3h, 6h, 12h) and daily (1d, 2d, 3d, 7d, etc.) windows.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { allocations, window: windowSize, initialCapital = 100000 } = body as {
      allocations: AllocationInput[];
      window: string; // e.g., "1h", "6h", "7d", "30d"
      initialCapital?: number;
    };

    if (!allocations || allocations.length === 0) {
      return NextResponse.json(
        { error: "At least one allocation is required" },
        { status: 400 }
      );
    }

    if (!windowSize) {
      return NextResponse.json(
        { error: "Window size is required" },
        { status: 400 }
      );
    }

    // Parse window to get periods and interval type
    const windowConfig = parseWindow(windowSize);
    if (!windowConfig) {
      return NextResponse.json(
        { error: "Invalid window size" },
        { status: 400 }
      );
    }

    const { periods, intervalType, sqlInterval, periodsPerYear } = windowConfig;

    // Get weighted P&L data for the portfolio at the appropriate granularity
    const returnsQuery = await pool.query<{
      period_end: Date;
      weighted_pnl: string;
    }>(
      `
      WITH trader_periods AS (
        -- Get one value per period per trader (last value of the period)
        SELECT DISTINCT ON (trader_address, time_bucket($3::INTERVAL, time))
          time_bucket($3::INTERVAL, time) AS period_end,
          trader_address,
          total_pnl,
          LAG(total_pnl) OVER (PARTITION BY trader_address ORDER BY time_bucket($3::INTERVAL, time)) AS prev_pnl
        FROM pnl_snapshots
        WHERE trader_address = ANY($1::text[])
        ORDER BY trader_address, time_bucket($3::INTERVAL, time), time DESC
      ),
      trader_returns AS (
        -- Calculate period P&L change
        SELECT
          period_end,
          trader_address,
          COALESCE(total_pnl - prev_pnl, 0) AS period_pnl_change
        FROM trader_periods
        WHERE prev_pnl IS NOT NULL
      ),
      weighted_returns AS (
        -- Weight each trader's period P&L change by their allocation percentage
        SELECT
          t.period_end,
          SUM(t.period_pnl_change * (a.percentage / 100.0)) AS weighted_pnl
        FROM trader_returns t
        JOIN (
          SELECT unnest($1::text[]) AS address, unnest($2::float[]) AS percentage
        ) a ON t.trader_address = a.address
        GROUP BY t.period_end
        ORDER BY t.period_end
      )
      SELECT period_end, weighted_pnl
      FROM weighted_returns
      ORDER BY period_end
      `,
      [
        allocations.map((a) => a.traderAddress.toLowerCase()),
        allocations.map((a) => a.percentage),
        sqlInterval,
      ]
    );

    const periodReturns: PeriodReturn[] = returnsQuery.rows.map((r) => ({
      periodEnd: r.period_end,
      weighted_pnl: parseFloat(r.weighted_pnl),
    }));

    if (periodReturns.length < periods) {
      return NextResponse.json(
        { error: `Not enough data. Need at least ${periods} ${intervalType} periods, have ${periodReturns.length}` },
        { status: 400 }
      );
    }

    // Calculate metrics for each rolling window
    const rollingWindows: RollingTimeSeries[] = [];

    for (let i = periods - 1; i < periodReturns.length; i++) {
      const windowStart = i - periods + 1;
      const windowData = periodReturns.slice(windowStart, i + 1);

      // Build equity curve for this window
      const equityCurve: number[] = [initialCapital];
      let equity = initialCapital;

      for (const periodData of windowData) {
        const scaledPnL = periodData.weighted_pnl * (initialCapital / 1000000);
        equity += scaledPnL;
        equityCurve.push(equity);
      }

      // Calculate period percentage returns for ratio calculations
      const periodPctReturns: number[] = [];
      for (let j = 1; j < equityCurve.length; j++) {
        const pctReturn = (equityCurve[j] / equityCurve[j - 1] - 1) * 100;
        periodPctReturns.push(pctReturn);
      }

      // Calculate metrics
      const totalReturn = ((equity - initialCapital) / initialCapital) * 100;

      // Win rate
      const wins = periodPctReturns.filter((r) => r > 0);
      const losses = periodPctReturns.filter((r) => r < 0);
      const winRate = periodPctReturns.length > 0
        ? (wins.length / periodPctReturns.length) * 100
        : 0;

      // Max drawdown
      let maxDrawdown = 0;
      let peak = equityCurve[0];
      for (const value of equityCurve) {
        if (value > peak) peak = value;
        const drawdown = peak > 0 ? ((peak - value) / peak) * 100 : 0;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }

      // Sharpe ratio (annualized based on period type)
      const meanReturn = periodPctReturns.length > 0
        ? periodPctReturns.reduce((a, b) => a + b, 0) / periodPctReturns.length
        : 0;
      const variance = periodPctReturns.length > 0
        ? periodPctReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / periodPctReturns.length
        : 0;
      const stdDev = Math.sqrt(variance);
      const sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(periodsPerYear) : null;

      // Sortino ratio (annualized)
      const negativeReturns = periodPctReturns.filter((r) => r < 0);
      const downsideVariance = negativeReturns.length > 0
        ? negativeReturns.reduce((sum, r) => sum + r * r, 0) / negativeReturns.length
        : 0;
      const downsideDev = Math.sqrt(downsideVariance);
      const sortinoRatio = downsideDev > 0 ? (meanReturn / downsideDev) * Math.sqrt(periodsPerYear) : null;

      // CAGR calculation
      // Number of years in this window
      const yearsInWindow = periods / periodsPerYear;
      const endingValue = equity;
      const beginningValue = initialCapital;
      // CAGR = (Ending / Beginning)^(1/years) - 1
      let cagr = 0;
      if (endingValue > 0 && beginningValue > 0 && yearsInWindow > 0) {
        cagr = (Math.pow(endingValue / beginningValue, 1 / yearsInWindow) - 1) * 100;
      }

      // CAGR / Max DD ratio (only if drawdown is meaningful)
      const cagrMaxDdRatio = maxDrawdown > 0.1 ? cagr / maxDrawdown : null;

      // Format dates based on interval type
      const formatDate = (date: Date) => {
        if (intervalType === "hour") {
          return date.toISOString().slice(0, 16).replace("T", " ");
        }
        return date.toISOString().split("T")[0];
      };

      rollingWindows.push({
        startDate: formatDate(periodReturns[windowStart].periodEnd),
        endDate: formatDate(periodReturns[i].periodEnd),
        sharpe: sharpeRatio,
        drawdown: -maxDrawdown,
        returnPct: totalReturn,
        winRate,
        sortino: sortinoRatio,
        cagr,
        cagrMaxDdRatio,
      });
    }

    // Calculate distribution statistics for each metric
    const sharpeValues = rollingWindows.map((w) => w.sharpe).filter((v): v is number => v !== null);
    const drawdownValues = rollingWindows.map((w) => w.drawdown);
    const returnValues = rollingWindows.map((w) => w.returnPct);
    const winRateValues = rollingWindows.map((w) => w.winRate);
    const sortinoValues = rollingWindows.map((w) => w.sortino).filter((v): v is number => v !== null);
    const cagrValues = rollingWindows.map((w) => w.cagr);
    const cagrMaxDdValues = rollingWindows.map((w) => w.cagrMaxDdRatio).filter((v): v is number => v !== null);

    // Get individual trader P&L data for background lines
    const individualReturnsQuery = await pool.query<{
      period_end: Date;
      trader_address: string;
      trader_name: string;
      color: string | null;
      pnl_change: string;
    }>(
      `
      WITH trader_periods AS (
        SELECT DISTINCT ON (trader_address, time_bucket($2::INTERVAL, time))
          time_bucket($2::INTERVAL, time) AS period_end,
          trader_address,
          total_pnl,
          LAG(total_pnl) OVER (PARTITION BY trader_address ORDER BY time_bucket($2::INTERVAL, time)) AS prev_pnl
        FROM pnl_snapshots
        WHERE trader_address = ANY($1::text[])
        ORDER BY trader_address, time_bucket($2::INTERVAL, time), time DESC
      )
      SELECT
        tp.period_end,
        tp.trader_address,
        t.alias AS trader_name,
        t.color,
        COALESCE(tp.total_pnl - tp.prev_pnl, 0) AS pnl_change
      FROM trader_periods tp
      JOIN tracked_traders t ON tp.trader_address = t.address
      WHERE tp.prev_pnl IS NOT NULL
      ORDER BY tp.trader_address, tp.period_end
      `,
      [allocations.map((a) => a.traderAddress.toLowerCase()), sqlInterval]
    );

    // Color palette for fallback
    const COLORS = ["#00D9FF", "#22C55E", "#A855F7", "#F59E0B", "#FF6B6B", "#EC4899", "#3B82F6", "#14B8A6"];

    // Group individual trader returns by trader
    const traderReturnsMap = new Map<string, TraderPeriodReturn[]>();
    const traderInfoMap = new Map<string, { name: string; color: string }>();

    individualReturnsQuery.rows.forEach((row, idx) => {
      if (!traderReturnsMap.has(row.trader_address)) {
        traderReturnsMap.set(row.trader_address, []);
        traderInfoMap.set(row.trader_address, {
          name: row.trader_name,
          color: row.color || COLORS[traderInfoMap.size % COLORS.length],
        });
      }
      traderReturnsMap.get(row.trader_address)!.push({
        periodEnd: row.period_end,
        traderId: row.trader_address,
        traderName: row.trader_name,
        color: row.color || COLORS[idx % COLORS.length],
        pnl: parseFloat(row.pnl_change),
      });
    });

    // Calculate rolling metrics for each individual trader
    const individualTraderSeries: IndividualTraderSeries[] = [];

    for (const [traderId, traderReturns] of traderReturnsMap) {
      const traderInfo = traderInfoMap.get(traderId)!;

      if (traderReturns.length < periods) continue;

      const traderRollingWindows: RollingTimeSeries[] = [];

      for (let i = periods - 1; i < traderReturns.length; i++) {
        const windowStart = i - periods + 1;
        const windowData = traderReturns.slice(windowStart, i + 1);

        // Build equity curve for this trader's window
        const equityCurve: number[] = [initialCapital];
        let equity = initialCapital;

        for (const periodData of windowData) {
          const scaledPnL = periodData.pnl * (initialCapital / 1000000);
          equity += scaledPnL;
          equityCurve.push(equity);
        }

        // Calculate period percentage returns
        const periodPctReturns: number[] = [];
        for (let j = 1; j < equityCurve.length; j++) {
          const pctReturn = (equityCurve[j] / equityCurve[j - 1] - 1) * 100;
          periodPctReturns.push(pctReturn);
        }

        // Calculate metrics
        const totalReturn = ((equity - initialCapital) / initialCapital) * 100;

        // Win rate
        const wins = periodPctReturns.filter((r) => r > 0);
        const winRate = periodPctReturns.length > 0
          ? (wins.length / periodPctReturns.length) * 100
          : 0;

        // Max drawdown
        let maxDrawdown = 0;
        let peak = equityCurve[0];
        for (const value of equityCurve) {
          if (value > peak) peak = value;
          const drawdown = peak > 0 ? ((peak - value) / peak) * 100 : 0;
          if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }

        // Sharpe ratio
        const meanReturn = periodPctReturns.length > 0
          ? periodPctReturns.reduce((a, b) => a + b, 0) / periodPctReturns.length
          : 0;
        const variance = periodPctReturns.length > 0
          ? periodPctReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / periodPctReturns.length
          : 0;
        const stdDev = Math.sqrt(variance);
        const sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(periodsPerYear) : null;

        // Sortino ratio
        const negativeReturns = periodPctReturns.filter((r) => r < 0);
        const downsideVariance = negativeReturns.length > 0
          ? negativeReturns.reduce((sum, r) => sum + r * r, 0) / negativeReturns.length
          : 0;
        const downsideDev = Math.sqrt(downsideVariance);
        const sortinoRatio = downsideDev > 0 ? (meanReturn / downsideDev) * Math.sqrt(periodsPerYear) : null;

        // CAGR calculation
        const yearsInWindow = periods / periodsPerYear;
        const endingValue = equity;
        const beginningValue = initialCapital;
        let cagr = 0;
        if (endingValue > 0 && beginningValue > 0 && yearsInWindow > 0) {
          cagr = (Math.pow(endingValue / beginningValue, 1 / yearsInWindow) - 1) * 100;
        }

        // CAGR / Max DD ratio
        const cagrMaxDdRatio = maxDrawdown > 0.1 ? cagr / maxDrawdown : null;

        // Format dates
        const formatDate = (date: Date) => {
          if (intervalType === "hour") {
            return date.toISOString().slice(0, 16).replace("T", " ");
          }
          return date.toISOString().split("T")[0];
        };

        traderRollingWindows.push({
          startDate: formatDate(traderReturns[windowStart].periodEnd),
          endDate: formatDate(traderReturns[i].periodEnd),
          sharpe: sharpeRatio,
          drawdown: -maxDrawdown,
          returnPct: totalReturn,
          winRate,
          sortino: sortinoRatio,
          cagr,
          cagrMaxDdRatio,
        });
      }

      if (traderRollingWindows.length > 0) {
        individualTraderSeries.push({
          traderId,
          traderName: traderInfo.name,
          color: traderInfo.color,
          data: traderRollingWindows,
        });
      }
    }

    // Get trader timelines (first and last data dates for each trader)
    const timelinesQuery = await pool.query<{
      trader_address: string;
      trader_name: string;
      color: string | null;
      first_date: Date;
      last_date: Date;
    }>(
      `
      SELECT
        s.trader_address,
        t.alias AS trader_name,
        t.color,
        MIN(s.time) AS first_date,
        MAX(s.time) AS last_date
      FROM pnl_snapshots s
      JOIN tracked_traders t ON s.trader_address = t.address
      WHERE s.trader_address = ANY($1::text[])
      GROUP BY s.trader_address, t.alias, t.color
      ORDER BY MIN(s.time)
      `,
      [allocations.map((a) => a.traderAddress.toLowerCase())]
    );

    const traderTimelines: TraderTimeline[] = timelinesQuery.rows.map((row, index) => {
      const allocation = allocations.find((a) => a.traderAddress.toLowerCase() === row.trader_address);
      const formatDate = (date: Date) => {
        if (intervalType === "hour") {
          return date.toISOString().slice(0, 16).replace("T", " ");
        }
        return date.toISOString().split("T")[0];
      };

      return {
        traderId: row.trader_address,
        traderName: row.trader_name,
        color: row.color || COLORS[index % COLORS.length],
        firstDataDate: formatDate(row.first_date),
        lastDataDate: formatDate(row.last_date),
        percentage: allocation?.percentage ?? 0,
      };
    });

    const result: RollingAnalysisResult = {
      window: windowSize,
      sampleCount: rollingWindows.length,
      sharpeRatio: calculateDistribution(
        sharpeValues,
        rollingWindows,
        (w) => w.sharpe
      ),
      maxDrawdown: calculateDistribution(
        drawdownValues,
        rollingWindows,
        (w) => w.drawdown
      ),
      totalReturn: calculateDistribution(
        returnValues,
        rollingWindows,
        (w) => w.returnPct
      ),
      winRate: calculateDistribution(
        winRateValues,
        rollingWindows,
        (w) => w.winRate
      ),
      sortinoRatio: calculateDistribution(
        sortinoValues,
        rollingWindows,
        (w) => w.sortino
      ),
      cagr: calculateDistribution(
        cagrValues,
        rollingWindows,
        (w) => w.cagr
      ),
      cagrMaxDdRatio: calculateDistribution(
        cagrMaxDdValues,
        rollingWindows,
        (w) => w.cagrMaxDdRatio
      ),
      timeSeries: rollingWindows,
      traderTimelines,
      individualTraderSeries,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Rolling calculator error:", error);
    return NextResponse.json(
      { error: "Failed to calculate rolling metrics" },
      { status: 500 }
    );
  }
}

interface WindowConfig {
  periods: number;
  intervalType: "hour" | "day";
  sqlInterval: string;
  periodsPerYear: number;
}

function parseWindow(window: string): WindowConfig | null {
  const match = window.match(/^(\d+)([hdmy])$/);
  if (!match) return null;

  const [, num, unit] = match;
  const value = parseInt(num, 10);

  switch (unit) {
    case "h":
      return {
        periods: value,
        intervalType: "hour",
        sqlInterval: "1 hour",
        periodsPerYear: 24 * 365, // ~8760 hours per year
      };
    case "d":
      return {
        periods: value,
        intervalType: "day",
        sqlInterval: "1 day",
        periodsPerYear: 252, // Trading days per year
      };
    case "m":
      return {
        periods: value * 30,
        intervalType: "day",
        sqlInterval: "1 day",
        periodsPerYear: 252,
      };
    case "y":
      return {
        periods: value * 365,
        intervalType: "day",
        sqlInterval: "1 day",
        periodsPerYear: 252,
      };
    default:
      return null;
  }
}

function calculateDistribution(
  values: number[],
  windows: RollingTimeSeries[],
  getter: (w: RollingTimeSeries) => number | null
): MetricDistribution {
  if (values.length === 0) {
    return {
      best: 0,
      worst: 0,
      average: 0,
      median: 0,
      stdDev: 0,
      percentile10: 0,
      percentile25: 0,
      percentile75: 0,
      percentile90: 0,
      bestPeriodStart: "",
      bestPeriodEnd: "",
      worstPeriodStart: "",
      worstPeriodEnd: "",
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  const best = Math.max(...values);
  const worst = Math.min(...values);
  const average = values.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];

  const variance = values.reduce((sum, v) => sum + Math.pow(v - average, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  const percentile = (p: number) => {
    const idx = Math.floor(p * (n - 1));
    return sorted[idx];
  };

  // Find best and worst periods
  let bestWindow: RollingTimeSeries | null = null;
  let worstWindow: RollingTimeSeries | null = null;

  for (const w of windows) {
    const value = getter(w);
    if (value === null) continue;
    if (value === best && !bestWindow) bestWindow = w;
    if (value === worst && !worstWindow) worstWindow = w;
  }

  return {
    best,
    worst,
    average,
    median,
    stdDev,
    percentile10: percentile(0.1),
    percentile25: percentile(0.25),
    percentile75: percentile(0.75),
    percentile90: percentile(0.9),
    bestPeriodStart: bestWindow?.startDate ?? "",
    bestPeriodEnd: bestWindow?.endDate ?? "",
    worstPeriodStart: worstWindow?.startDate ?? "",
    worstPeriodEnd: worstWindow?.endDate ?? "",
  };
}
