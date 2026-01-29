import { NextRequest, NextResponse } from "next/server";
import { getTraderPnLSeries } from "@/lib/queries/traders";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const searchParams = request.nextUrl.searchParams;

    const startDate = searchParams.get("startDate")
      ? new Date(searchParams.get("startDate")!)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: 30 days ago

    const endDate = searchParams.get("endDate")
      ? new Date(searchParams.get("endDate")!)
      : new Date();

    const resolution = searchParams.get("resolution") || "1D";

    const series = await getTraderPnLSeries(
      address,
      startDate,
      endDate,
      resolution
    );

    return NextResponse.json({ series });
  } catch (error) {
    console.error("Error fetching trader P&L:", error);
    return NextResponse.json(
      { error: "Failed to fetch trader P&L" },
      { status: 500 }
    );
  }
}
