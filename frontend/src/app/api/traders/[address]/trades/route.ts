import { NextRequest, NextResponse } from "next/server";
import { getTraderRecentTrades } from "@/lib/queries/traders";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const searchParams = request.nextUrl.searchParams;

    const limit = parseInt(searchParams.get("limit") || "100", 10);

    const trades = await getTraderRecentTrades(address, limit);

    return NextResponse.json({ trades });
  } catch (error) {
    console.error("Error fetching trader trades:", error);
    return NextResponse.json(
      { error: "Failed to fetch trader trades" },
      { status: 500 }
    );
  }
}
