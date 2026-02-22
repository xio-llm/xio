import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import type { Database } from "better-sqlite3";
import type { Keypair } from "@solana/web3.js";
import type { XioConfig } from "./utils/config";
import { workspaceRouter } from "./routes/workspace";
import { documentRouter } from "./routes/document";
import { chatRouter } from "./routes/chat";
import { walletRouter } from "./routes/wallet";
import { healthRouter } from "./routes/health";
import { logger } from "./utils/logger";

export function createApp(
  config: XioConfig,
  db: Database,
  wallet: Keypair | null
) {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true }));

  // request logging
  app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  // inject context
  app.use((req, _res, next) => {
    (req as any).db = db;
    (req as any).config = config;
    (req as any).wallet = wallet;
    next();
  });

  // api routes
  app.use("/api/v1/workspaces", workspaceRouter);
  app.use("/api/v1/documents", documentRouter);
  app.use("/api/v1/chat", chatRouter);
  app.use("/api/v1/wallet", walletRouter);
  app.use("/health", healthRouter);

  // serve web ui
  const uiDir = path.resolve(__dirname, "../ui");
  app.use("/assets", express.static(path.join(uiDir, "assets")));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(uiDir, "index.html"));
  });

  // fallback
  app.get("*", (_req, res) => {
    res.sendFile(path.join(uiDir, "index.html"));
  });

  return app;
}
