import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Re-export schema types and tables
export * from "./schema";

// Create connection pool
export const pool = new Pool({
  connectionString:
    process.env.TIMESCALE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/polymarket_analytics",
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Handle pool errors
pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err);
});

// Create Drizzle instance with schema
export const db = drizzle(pool, { schema });

/**
 * Resolution to PostgreSQL interval mapping
 */
export const RESOLUTION_TO_INTERVAL: Record<string, string> = {
  "1m": "1 minute",
  "5m": "5 minutes",
  "15m": "15 minutes",
  "1h": "1 hour",
  "4h": "4 hours",
  "1D": "1 day",
};

/**
 * Validate resolution parameter
 */
export function isValidResolution(resolution: string): boolean {
  return resolution in RESOLUTION_TO_INTERVAL;
}

/**
 * Check database connection
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    return true;
  } catch {
    return false;
  }
}

/**
 * Close the database pool (for cleanup)
 */
export async function closePool(): Promise<void> {
  await pool.end();
}
