import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../server/db/sqlite";
import {
  getCreditBalance,
  addCredits,
  deductCredits,
  getCreditHistory,
} from "../server/wallet/credits";

describe("credits", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    // run migrations inline
    db.exec(`
      CREATE TABLE credits (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        amount INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        tx_signature TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  });

  it("should start with zero balance", () => {
    const balance = getCreditBalance(db);
    expect(balance.balance).toBe(0);
    expect(balance.totalSpent).toBe(0);
    expect(balance.totalAdded).toBe(0);
  });

  it("should add credits", () => {
    const result = addCredits(db, 100, "test-signature");
    expect(result.balance).toBe(100);
    expect(result.totalAdded).toBe(100);
  });

  it("should deduct credits", () => {
    addCredits(db, 100);
    const ok = deductCredits(db, "chat_query", 10);
    expect(ok).toBe(true);

    const balance = getCreditBalance(db);
    expect(balance.balance).toBe(90);
  });

  it("should reject deduction when insufficient", () => {
    const ok = deductCredits(db, "chat_query", 10);
    expect(ok).toBe(false);
  });

  it("should track history", () => {
    addCredits(db, 100);
    deductCredits(db, "chat_query", 5);
    deductCredits(db, "upload", 10);

    const history = getCreditHistory(db);
    expect(history).toHaveLength(3);
    expect(history[0].action).toBe("upload");
    expect(history[0].amount).toBe(-10);
  });
});
