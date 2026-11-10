import "dotenv/config";
import fs from "node:fs";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run drizzle-kit");
}

const url = new URL(process.env.DATABASE_URL);

// Locate CA certificate if your project includes one; otherwise defaults to system trusted certs
const caPath = [
  "backend/certs/tidb-ca.pem",
  "backend/tidb-ca.pem",
  "certs/tidb-ca.pem",
].find(p => fs.existsSync(p));

export default defineConfig({
  schema: "./backend/drizzle/schema.ts",
  out: "./backend/drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: url.hostname,
    port: Number(url.port || 4000),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl: {
      rejectUnauthorized: true,
      ...(caPath ? { ca: fs.readFileSync(caPath, "utf8") } : {}),
    },
  },
});