import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import type { Database } from "better-sqlite3";
import { createLLMProvider } from "../llm/provider";
import { createVectorDB } from "../vectordb/provider";
import { deductCredits } from "../wallet/credits";
import { logger } from "../utils/logger";
import type { XioConfig } from "../utils/config";

export const chatRouter = Router();

const SYSTEM_PROMPT = `You are Xio, a helpful assistant that answers questions based on the user's uploaded documents and data. When answering, reference specific information from the provided context. If the context doesn't contain relevant information, say so clearly. Be concise and accurate.`;

chatRouter.post("/:workspaceId", async (req: Request, res: Response) => {
  const db = (req as any).db as Database;
  const config = (req as any).config as XioConfig;
  const { message, conversationId } = req.body;

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    // check credits
    if (config.creditsEnabled) {
      const ok = deductCredits(db, "chat_query", config.creditsPerQuery);
      if (!ok) {
        return res.status(402).json({ error: "insufficient credits" });
      }
    }

    // get or create conversation
    let convId = conversationId;
    if (!convId) {
      convId = uuid();
      db.prepare(
        "INSERT INTO conversations (id, workspace_id, title) VALUES (?, ?, ?)"
      ).run(convId, req.params.workspaceId, message.slice(0, 80));
    }

    // save user message
    const userMsgId = uuid();
    db.prepare(
      "INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)"
    ).run(userMsgId, convId, "user", message);

    // retrieve relevant context
    const llm = createLLMProvider(config);
    const vectorDb = createVectorDB(config);
    const collectionName = `ws_${req.params.workspaceId}`;

    const queryEmbedding = await llm.embed(message);
    const results = await vectorDb.search(collectionName, queryEmbedding, 5);

    // build context from search results
    const context = results
      .filter((r) => r.score > 0.3)
      .map((r) => r.content)
      .join("\n\n---\n\n");

    // get conversation history
    const history = db
      .prepare(
        "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 20"
      )
      .all(convId) as { role: string; content: string }[];

    // build messages
    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
    ];

    if (context) {
      messages.push({
        role: "system" as const,
        content: `Relevant context from uploaded documents:\n\n${context}`,
      });
    }

    // add history (skip the just-inserted user message to avoid duplication)
    for (const msg of history.slice(0, -1)) {
      messages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }

    messages.push({ role: "user" as const, content: message });

    // generate response
    const response = await llm.chat(messages);

    // save assistant message
    const assistantMsgId = uuid();
    db.prepare(
      "INSERT INTO messages (id, conversation_id, role, content, tokens_used) VALUES (?, ?, ?, ?, ?)"
    ).run(assistantMsgId, convId, "assistant", response.content, response.tokensUsed);

    // update conversation timestamp
    db.prepare(
      "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
    ).run(convId);

    res.json({
      conversationId: convId,
      message: {
        id: assistantMsgId,
        role: "assistant",
        content: response.content,
        tokensUsed: response.tokensUsed,
        model: response.model,
      },
      sources: results.slice(0, 3).map((r) => ({
        content: r.content.slice(0, 200),
        score: r.score,
        metadata: r.metadata,
      })),
    });
  } catch (err) {
    logger.error("chat error", { error: err });
    res.status(500).json({ error: "chat failed" });
  }
});

chatRouter.post("/:workspaceId/stream", async (req: Request, res: Response) => {
  const db = (req as any).db as Database;
  const config = (req as any).config as XioConfig;
  const { message, conversationId } = req.body;

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const llm = createLLMProvider(config);
    const vectorDb = createVectorDB(config);
    const collectionName = `ws_${req.params.workspaceId}`;

    // retrieve context
    const queryEmbedding = await llm.embed(message);
    const results = await vectorDb.search(collectionName, queryEmbedding, 5);
    const context = results
      .filter((r) => r.score > 0.3)
      .map((r) => r.content)
      .join("\n\n---\n\n");

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
    ];

    if (context) {
      messages.push({
        role: "system" as const,
        content: `Relevant context:\n\n${context}`,
      });
    }

    messages.push({ role: "user" as const, content: message });

    let fullResponse = "";

    for await (const chunk of llm.stream(messages)) {
      fullResponse += chunk.content;
      res.write(`data: ${JSON.stringify({ content: chunk.content, done: chunk.done })}\n\n`);
    }

    // save to db
    let convId = conversationId || uuid();
    if (!conversationId) {
      db.prepare(
        "INSERT INTO conversations (id, workspace_id, title) VALUES (?, ?, ?)"
      ).run(convId, req.params.workspaceId, message.slice(0, 80));
    }

    db.prepare(
      "INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)"
    ).run(uuid(), convId, "user", message);
    db.prepare(
      "INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)"
    ).run(uuid(), convId, "assistant", fullResponse);

    res.write(`data: ${JSON.stringify({ conversationId: convId, done: true })}\n\n`);
    res.end();
  } catch (err) {
    logger.error("stream error", { error: err });
    res.write(`data: ${JSON.stringify({ error: "stream failed" })}\n\n`);
    res.end();
  }
});

chatRouter.get("/conversations/:workspaceId", (req: Request, res: Response) => {
  const db = (req as any).db as Database;
  const conversations = db
    .prepare(
      "SELECT * FROM conversations WHERE workspace_id = ? ORDER BY updated_at DESC"
    )
    .all(req.params.workspaceId);
  res.json({ conversations });
});

chatRouter.get("/messages/:conversationId", (req: Request, res: Response) => {
  const db = (req as any).db as Database;
  const messages = db
    .prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
    )
    .all(req.params.conversationId);
  res.json({ messages });
});
