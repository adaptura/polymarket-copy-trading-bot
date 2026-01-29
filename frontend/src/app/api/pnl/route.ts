import { NextRequest, NextResponse } from "next/server";
import { getMultiTraderPnLSeries } from "@/lib/queries/traders";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const tradersParam = searchParams.get("traders");
    if (!tradersParam) {
      return NextResponse.json(
        { error: "traders parameter is required" },
        { status: 400 }
      );
    }

    const traderAddresses = tradersParam.split(",").filter(Boolean);
    if (traderAddresses.length === 0) {
      return NextResponse.json(
        { error: "At least one trader address is required" },
        { status: 400 }
      );
    }

    const startDate = searchParams.get("startDate")
      ? new Date(searchParams.get("startDate")!)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: 30 days ago

    const endDate = searchParams.get("endDate")
      ? new Date(searchParams.get("endDate")!)
      : new Date();

    const resolution = searchParams.get("resolution") || "1D";

    const series = await getMultiTraderPnLSeries(
      traderAddresses,
      startDate,
      endDate,
      resolution
    );

    return NextResponse.json({ series });
  } catch (error) {
    console.error("Error fetching multi-trader P&L:", error);
    return NextResponse.json(
      { error: "Failed to fetch P&L data" },
      { status: 500 }
    );
  }
}
