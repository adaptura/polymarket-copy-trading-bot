import { NextRequest, NextResponse } from "next/server";
import {
  getTrader,
  getTraderAlias,
  upsertTraderAlias,
  deleteTraderAlias,
} from "@/lib/queries/traders";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const searchParams = request.nextUrl.searchParams;
    const aliasOnly = searchParams.get("alias") === "true";

    if (aliasOnly) {
      const alias = await getTraderAlias(address);
      return NextResponse.json({ alias });
    }

    const trader = await getTrader(address);
    if (!trader) {
      return NextResponse.json({ error: "Trader not found" }, { status: 404 });
    }

    return NextResponse.json(trader);
  } catch (error) {
    console.error("Error fetching trader:", error);
    return NextResponse.json(
      { error: "Failed to fetch trader" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const body = await request.json();

    const result = await upsertTraderAlias(
      address,
      body.alias,
      body.color,
      body.notes
    );

    return NextResponse.json({ alias: result });
  } catch (error) {
    console.error("Error updating trader alias:", error);
    return NextResponse.json(
      { error: "Failed to update trader alias" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    await deleteTraderAlias(address);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting trader alias:", error);
    return NextResponse.json(
      { error: "Failed to delete trader alias" },
      { status: 500 }
    );
  }
}
