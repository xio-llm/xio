import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "xio",
    version: "2.1.0",
    uptime: process.uptime(),
  });
});
