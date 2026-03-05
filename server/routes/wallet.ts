import { Router, Request, Response } from "express";
import type { Keypair } from "@solana/web3.js";
import type { Database } from "better-sqlite3";
import type { XioConfig } from "../utils/config";
import {
  getWalletBalance,
  sendSOL,
  sendSPLToken,
  getRecentTransactions,
} from "../wallet/agent";
import {
  getCreditBalance,
  addCredits,
  getCreditHistory,
  calculateCreditsFromSOL,
} from "../wallet/credits";
import { logger } from "../utils/logger";

export const walletRouter = Router();

walletRouter.get("/info", async (req: Request, res: Response) => {
  const wallet = (req as any).wallet as Keypair | null;
  const config = (req as any).config as XioConfig;

  if (!wallet) {
    return res.status(404).json({ error: "no wallet configured" });
  }

  try {
    const balance = await getWalletBalance(config, wallet);
    res.json({
      address: wallet.publicKey.toBase58(),
      balance,
    });
  } catch (err) {
    logger.error("wallet info error", { error: err });
    res.status(500).json({ error: "failed to fetch wallet info" });
  }
});

walletRouter.get("/transactions", async (req: Request, res: Response) => {
  const wallet = (req as any).wallet as Keypair | null;
  const config = (req as any).config as XioConfig;

  if (!wallet) {
    return res.status(404).json({ error: "no wallet configured" });
  }

  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const transactions = await getRecentTransactions(config, wallet, limit);
    res.json({ transactions });
  } catch (err) {
    logger.error("wallet transactions error", { error: err });
    res.status(500).json({ error: "failed to fetch transactions" });
  }
});

walletRouter.post("/send", async (req: Request, res: Response) => {
  const wallet = (req as any).wallet as Keypair | null;
  const config = (req as any).config as XioConfig;

  if (!wallet) {
    return res.status(404).json({ error: "no wallet configured" });
  }

  const { to, amount, mint, decimals } = req.body;

  if (!to || !amount) {
    return res.status(400).json({ error: "to and amount are required" });
  }

  try {
    let signature: string;

    if (mint) {
      signature = await sendSPLToken(
        config,
        wallet,
        to,
        mint,
        parseFloat(amount),
        parseInt(decimals) || 9
      );
    } else {
      signature = await sendSOL(config, wallet, to, parseFloat(amount));
    }

    res.json({ signature, status: "confirmed" });
  } catch (err) {
    logger.error("wallet send error", { error: err });
    res.status(500).json({ error: "transaction failed" });
  }
});

// credits endpoints
walletRouter.get("/credits", (req: Request, res: Response) => {
  const db = (req as any).db as Database;
  const balance = getCreditBalance(db);
  res.json(balance);
});

walletRouter.get("/credits/history", (req: Request, res: Response) => {
  const db = (req as any).db as Database;
  const limit = parseInt(req.query.limit as string) || 50;
  const history = getCreditHistory(db, limit);
  res.json({ history });
});

walletRouter.post("/credits/deposit", async (req: Request, res: Response) => {
  const db = (req as any).db as Database;
  const config = (req as any).config as XioConfig;
  const { solAmount, txSignature } = req.body;

  if (!solAmount) {
    return res.status(400).json({ error: "solAmount is required" });
  }

  try {
    const credits = calculateCreditsFromSOL(parseFloat(solAmount), config);
    const balance = addCredits(db, credits, txSignature);
    res.json({ creditsAdded: credits, balance });
  } catch (err) {
    logger.error("credit deposit error", { error: err });
    res.status(500).json({ error: "deposit failed" });
  }
});
