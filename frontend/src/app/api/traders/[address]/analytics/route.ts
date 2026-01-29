import { NextRequest, NextResponse } from "next/server";
import {
  getTraderAnalytics,
  getDrawdownMetrics,
  getRollingReturns,
  getVolatilityMetrics,
  getPnLHistory,
} from "@/lib/queries/analytics";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const searchParams = request.nextUrl.searchParams;

    // Check for specific analytics type
    const type = searchParams.get("type");

    if (type === "drawdown") {
      const metrics = await getDrawdownMetrics(address);
      if (!metrics) {
        return NextResponse.json(
          { error: "No data found for trader" },
          { status: 404 }
        );
      }
      return NextResponse.json(metrics);
    }

    if (type === "rolling") {
      const returns = await getRollingReturns(address);
      if (!returns) {
        return NextResponse.json(
          { error: "No data found for trader" },
          { status: 404 }
        );
      }
      return NextResponse.json(returns);
    }

    if (type === "volatility") {
      const metrics = await getVolatilityMetrics(address);
      if (!metrics) {
        return NextResponse.json(
          { error: "No data found for trader" },
          { status: 404 }
        );
      }
      return NextResponse.json(metrics);
    }

    if (type === "history") {
      const limit = parseInt(searchParams.get("limit") || "365", 10);
      const startDateParam = searchParams.get("startDate");
      const endDateParam = searchParams.get("endDate");

      const options: { startDate?: Date; endDate?: Date; limit?: number } = {};
      if (startDateParam) options.startDate = new Date(startDateParam);
      if (endDateParam) options.endDate = new Date(endDateParam);
      if (limit) options.limit = limit;

      const history = await getPnLHistory(address, options);
      return NextResponse.json({ history });
    }

    // Default: return full analytics
    const analytics = await getTraderAnalytics(address);
    if (!analytics) {
      return NextResponse.json(
        { error: "Trader not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(analytics);
  } catch (error) {
    console.error("Error fetching trader analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch trader analytics" },
      { status: 500 }
    );
  }
}
