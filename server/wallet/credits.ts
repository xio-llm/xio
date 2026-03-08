import type { Database } from "better-sqlite3";
import { v4 as uuid } from "uuid";
import { logger } from "../utils/logger";
import type { XioConfig } from "../utils/config";

export interface CreditBalance {
  balance: number;
  totalSpent: number;
  totalAdded: number;
}

export interface CreditTransaction {
  id: string;
  action: string;
  amount: number;
  balanceAfter: number;
  txSignature: string | null;
  createdAt: string;
}

export function getCreditBalance(db: Database): CreditBalance {
  const lastRow = db
    .prepare("SELECT balance_after FROM credits ORDER BY created_at DESC LIMIT 1")
    .get() as { balance_after: number } | undefined;

  const spent = db
    .prepare("SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM credits WHERE amount < 0")
    .get() as { total: number };

  const added = db
    .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM credits WHERE amount > 0")
    .get() as { total: number };

  return {
    balance: lastRow?.balance_after || 0,
    totalSpent: spent.total,
    totalAdded: added.total,
  };
}

export function deductCredits(
  db: Database,
  action: string,
  amount: number
): boolean {
  const current = getCreditBalance(db);
  if (current.balance < amount) {
    logger.warn(`insufficient credits: ${current.balance} < ${amount}`);
    return false;
  }

  const newBalance = current.balance - amount;
  db.prepare(
    "INSERT INTO credits (id, action, amount, balance_after) VALUES (?, ?, ?, ?)"
  ).run(uuid(), action, -amount, newBalance);

  return true;
}

export function addCredits(
  db: Database,
  amount: number,
  txSignature?: string
): CreditBalance {
  const current = getCreditBalance(db);
  const newBalance = current.balance + amount;

  db.prepare(
    "INSERT INTO credits (id, action, amount, balance_after, tx_signature) VALUES (?, ?, ?, ?, ?)"
  ).run(uuid(), "deposit", amount, newBalance, txSignature || null);

  logger.info(`added ${amount} credits (new balance: ${newBalance})`);
  return getCreditBalance(db);
}

export function getCreditHistory(
  db: Database,
  limit = 50
): CreditTransaction[] {
  const rows = db
    .prepare(
      "SELECT id, action, amount, balance_after, tx_signature, created_at FROM credits ORDER BY created_at DESC LIMIT ?"
    )
    .all(limit) as any[];

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    amount: r.amount,
    balanceAfter: r.balance_after,
    txSignature: r.tx_signature,
    createdAt: r.created_at,
  }));
}

export function calculateCreditsFromSOL(
  solAmount: number,
  config: XioConfig
): number {
  return Math.floor(solAmount / config.solPricePerCredit);
}
