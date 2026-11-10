import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./backend/drizzle/schema.ts",
  out: "./backend/drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/portfoliopilot",
  },
});
