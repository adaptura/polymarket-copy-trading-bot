import { NextRequest, NextResponse } from "next/server";
import { getTraderActivityHeatmap } from "@/lib/queries/traders";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const searchParams = request.nextUrl.searchParams;

    const days = parseInt(searchParams.get("days") || "90", 10);

    const heatmap = await getTraderActivityHeatmap(address, days);

    return NextResponse.json({ heatmap });
  } catch (error) {
    console.error("Error fetching trader activity:", error);
    return NextResponse.json(
      { error: "Failed to fetch trader activity" },
      { status: 500 }
    );
  }
}
