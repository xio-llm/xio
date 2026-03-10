import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";

describe("workspace db operations", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
  });

  it("should create a workspace", () => {
    db.prepare(
      "INSERT INTO workspaces (id, name, description) VALUES (?, ?, ?)"
    ).run("test-1", "My Workspace", "test workspace");

    const ws = db.prepare("SELECT * FROM workspaces WHERE id = ?").get("test-1") as any;
    expect(ws).toBeTruthy();
    expect(ws.name).toBe("My Workspace");
  });

  it("should list workspaces", () => {
    db.prepare("INSERT INTO workspaces (id, name) VALUES (?, ?)").run("ws-1", "First");
    db.prepare("INSERT INTO workspaces (id, name) VALUES (?, ?)").run("ws-2", "Second");

    const all = db.prepare("SELECT * FROM workspaces ORDER BY name").all();
    expect(all).toHaveLength(2);
  });

  it("should update a workspace", () => {
    db.prepare("INSERT INTO workspaces (id, name) VALUES (?, ?)").run("ws-1", "Original");
    db.prepare("UPDATE workspaces SET name = ? WHERE id = ?").run("Updated", "ws-1");

    const ws = db.prepare("SELECT * FROM workspaces WHERE id = ?").get("ws-1") as any;
    expect(ws.name).toBe("Updated");
  });

  it("should delete a workspace", () => {
    db.prepare("INSERT INTO workspaces (id, name) VALUES (?, ?)").run("ws-1", "ToDelete");
    db.prepare("DELETE FROM workspaces WHERE id = ?").run("ws-1");

    const ws = db.prepare("SELECT * FROM workspaces WHERE id = ?").get("ws-1");
    expect(ws).toBeUndefined();
  });
});
