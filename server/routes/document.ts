import { Router, Request, Response } from "express";
import multer from "multer";
import { v4 as uuid } from "uuid";
import type { Database } from "better-sqlite3";
import { parseDocument, scrapeWebpage, detectFileType } from "../documents/parser";
import { createLLMProvider } from "../llm/provider";
import { createVectorDB } from "../vectordb/provider";
import { logger } from "../utils/logger";
import type { XioConfig } from "../utils/config";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

export const documentRouter = Router();

documentRouter.post(
  "/upload/:workspaceId",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const db = (req as any).db as Database;
    const config = (req as any).config as XioConfig;

    try {
      const workspace = db
        .prepare("SELECT * FROM workspaces WHERE id = ?")
        .get(req.params.workspaceId);

      if (!workspace) {
        return res.status(404).json({ error: "workspace not found" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "no file provided" });
      }

      const docId = uuid();
      const filename = req.file.originalname;
      const type = detectFileType(filename);

      // insert document record
      db.prepare(
        "INSERT INTO documents (id, workspace_id, filename, type, size, status) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(docId, req.params.workspaceId, filename, type, req.file.size, "processing");

      // parse in background
      processDocument(docId, req.file.buffer, filename, req.params.workspaceId, db, config).catch(
        (err) => {
          logger.error(`document processing failed: ${docId}`, { error: err });
          db.prepare("UPDATE documents SET status = ? WHERE id = ?").run("error", docId);
        }
      );

      res.status(202).json({
        document: { id: docId, filename, type, status: "processing" },
      });
    } catch (err) {
      logger.error("upload error", { error: err });
      res.status(500).json({ error: "upload failed" });
    }
  }
);

documentRouter.post("/scrape/:workspaceId", async (req: Request, res: Response) => {
  const db = (req as any).db as Database;
  const config = (req as any).config as XioConfig;
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "url is required" });
  }

  try {
    const docId = uuid();

    db.prepare(
      "INSERT INTO documents (id, workspace_id, filename, type, status) VALUES (?, ?, ?, ?, ?)"
    ).run(docId, req.params.workspaceId, url, "web", "processing");

    // scrape and embed
    const parsed = await scrapeWebpage(url);
    const llm = createLLMProvider(config);
    const vectorDb = createVectorDB(config);

    const collectionName = `ws_${req.params.workspaceId}`;
    await vectorDb.createCollection(collectionName);

    const embeddings = await llm.embedBatch(parsed.chunks);
    const vectors = parsed.chunks.map((chunk, i) => ({
      id: `${docId}_${i}`,
      content: chunk,
      embedding: embeddings[i],
      metadata: { documentId: docId, chunkIndex: i, source: url },
    }));

    await vectorDb.upsert(collectionName, vectors);

    db.prepare(
      "UPDATE documents SET status = ?, chunk_count = ?, metadata = ? WHERE id = ?"
    ).run("ready", parsed.chunks.length, JSON.stringify(parsed.metadata), docId);

    res.json({
      document: {
        id: docId,
        url,
        chunks: parsed.chunks.length,
        status: "ready",
      },
    });
  } catch (err) {
    logger.error("scrape error", { error: err });
    res.status(500).json({ error: "scrape failed" });
  }
});

documentRouter.get("/:workspaceId", (req: Request, res: Response) => {
  const db = (req as any).db as Database;
  const documents = db
    .prepare("SELECT * FROM documents WHERE workspace_id = ? ORDER BY created_at DESC")
    .all(req.params.workspaceId);
  res.json({ documents });
});

documentRouter.delete("/:docId", (req: Request, res: Response) => {
  const db = (req as any).db as Database;
  db.prepare("DELETE FROM documents WHERE id = ?").run(req.params.docId);
  res.json({ deleted: true });
});

async function processDocument(
  docId: string,
  buffer: Buffer,
  filename: string,
  workspaceId: string,
  db: Database,
  config: XioConfig
): Promise<void> {
  const parsed = await parseDocument(buffer, filename);

  const llm = createLLMProvider(config);
  const vectorDb = createVectorDB(config);

  const collectionName = `ws_${workspaceId}`;
  await vectorDb.createCollection(collectionName);

  // embed chunks in batches of 32
  const batchSize = 32;
  for (let i = 0; i < parsed.chunks.length; i += batchSize) {
    const batch = parsed.chunks.slice(i, i + batchSize);
    const embeddings = await llm.embedBatch(batch);

    const vectors = batch.map((chunk, j) => ({
      id: `${docId}_${i + j}`,
      content: chunk,
      embedding: embeddings[j],
      metadata: {
        documentId: docId,
        chunkIndex: i + j,
        filename,
      },
    }));

    await vectorDb.upsert(collectionName, vectors);
  }

  db.prepare(
    "UPDATE documents SET status = ?, chunk_count = ?, metadata = ? WHERE id = ?"
  ).run("ready", parsed.chunks.length, JSON.stringify(parsed.metadata), docId);

  logger.info(`document processed: ${filename} (${parsed.chunks.length} chunks)`);
}
