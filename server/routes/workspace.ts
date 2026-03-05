import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import type { Database } from "better-sqlite3";

export const workspaceRouter = Router();

workspaceRouter.get("/", (req: Request, res: Response) => {
  const db = (req as any).db as Database;
  const workspaces = db
    .prepare("SELECT * FROM workspaces ORDER BY updated_at DESC")
    .all();
  res.json({ workspaces });
});

workspaceRouter.post("/", (req: Request, res: Response) => {
  const db = (req as any).db as Database;
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  const id = uuid();
  db.prepare(
    "INSERT INTO workspaces (id, name, description) VALUES (?, ?, ?)"
  ).run(id, name, description || "");

  const workspace = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id);
  res.status(201).json({ workspace });
});

workspaceRouter.get("/:id", (req: Request, res: Response) => {
  const db = (req as any).db as Database;
  const workspace = db
    .prepare("SELECT * FROM workspaces WHERE id = ?")
    .get(req.params.id);

  if (!workspace) {
    return res.status(404).json({ error: "workspace not found" });
  }

  const documents = db
    .prepare("SELECT * FROM documents WHERE workspace_id = ? ORDER BY created_at DESC")
    .all(req.params.id);

  const conversations = db
    .prepare("SELECT * FROM conversations WHERE workspace_id = ? ORDER BY updated_at DESC")
    .all(req.params.id);

  res.json({ workspace, documents, conversations });
});

workspaceRouter.put("/:id", (req: Request, res: Response) => {
  const db = (req as any).db as Database;
  const { name, description } = req.body;

  const existing = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "workspace not found" });
  }

  db.prepare(
    "UPDATE workspaces SET name = COALESCE(?, name), description = COALESCE(?, description), updated_at = datetime('now') WHERE id = ?"
  ).run(name, description, req.params.id);

  const workspace = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(req.params.id);
  res.json({ workspace });
});

workspaceRouter.delete("/:id", (req: Request, res: Response) => {
  const db = (req as any).db as Database;

  const existing = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "workspace not found" });
  }

  db.prepare("DELETE FROM workspaces WHERE id = ?").run(req.params.id);
  res.json({ deleted: true });
});
