import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.TIMESCALE_URL ||
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/polymarket_analytics",
  },
  verbose: true,
  strict: true,
});
