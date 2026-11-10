import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { serveStatic, setupVite } from "./vite";
import { createPortfolioAppRouter } from "../app-api";

async function startServer() {
  const app = express();
  const server = createServer(app);
  // APIs accept bounded JSON/form requests; account state has its own tighter runtime limit.
  app.use(express.json({ limit: "1mb" }));
  app.use(
    express.urlencoded({ limit: "256kb", extended: true, parameterLimit: 1000 })
  );
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/app", createPortfolioAppRouter());

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");
  server.on("error", error => {
    console.error("Server failed:", error.message);
    process.exit(1);
  });
  server.listen(port, "0.0.0.0", () =>
    console.log(`Server listening on port ${port}`)
  );
}

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});