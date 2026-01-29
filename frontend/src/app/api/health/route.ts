import { NextResponse } from "next/server";
import { checkConnection } from "@/lib/db";

export async function GET() {
  try {
    const dbConnected = await checkConnection();

    return NextResponse.json({
      status: dbConnected ? "healthy" : "degraded",
      database: dbConnected ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check error:", error);
    return NextResponse.json(
      {
        status: "unhealthy",
        database: "error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
