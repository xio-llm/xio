import type { XioConfig } from "../utils/config";
import { logger } from "../utils/logger";

export interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
}

export interface VectorSearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, any>;
}

export interface VectorDBProvider {
  createCollection(name: string): Promise<void>;
  deleteCollection(name: string): Promise<void>;
  upsert(collection: string, documents: VectorDocument[]): Promise<void>;
  search(collection: string, embedding: number[], topK?: number): Promise<VectorSearchResult[]>;
  delete(collection: string, ids: string[]): Promise<void>;
}

export function createVectorDB(config: XioConfig): VectorDBProvider {
  switch (config.vectorDb) {
    case "chroma":
      return new ChromaProvider(config);
    case "pinecone":
      return new PineconeProvider(config);
    case "lancedb":
      return new LanceDBProvider(config);
    default:
      throw new Error(`unsupported vector db: ${config.vectorDb}`);
  }
}

class ChromaProvider implements VectorDBProvider {
  private url: string;

  constructor(config: XioConfig) {
    this.url = config.chromaUrl;
  }

  async createCollection(name: string): Promise<void> {
    await fetch(`${this.url}/api/v1/collections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, get_or_create: true }),
    });
  }

  async deleteCollection(name: string): Promise<void> {
    await fetch(`${this.url}/api/v1/collections/${name}`, {
      method: "DELETE",
    });
  }

  async upsert(collection: string, documents: VectorDocument[]): Promise<void> {
    const col = await this.getCollectionId(collection);
    if (!col) return;

    await fetch(`${this.url}/api/v1/collections/${col}/upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: documents.map((d) => d.id),
        embeddings: documents.map((d) => d.embedding),
        documents: documents.map((d) => d.content),
        metadatas: documents.map((d) => d.metadata),
      }),
    });
  }

  async search(
    collection: string,
    embedding: number[],
    topK = 5
  ): Promise<VectorSearchResult[]> {
    const col = await this.getCollectionId(collection);
    if (!col) return [];

    const res = await fetch(`${this.url}/api/v1/collections/${col}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query_embeddings: [embedding],
        n_results: topK,
        include: ["documents", "metadatas", "distances"],
      }),
    });

    const data = await res.json();
    const ids = data.ids?.[0] || [];
    const docs = data.documents?.[0] || [];
    const distances = data.distances?.[0] || [];
    const metadatas = data.metadatas?.[0] || [];

    return ids.map((id: string, i: number) => ({
      id,
      content: docs[i] || "",
      score: 1 - (distances[i] || 0),
      metadata: metadatas[i] || {},
    }));
  }

  async delete(collection: string, ids: string[]): Promise<void> {
    const col = await this.getCollectionId(collection);
    if (!col) return;

    await fetch(`${this.url}/api/v1/collections/${col}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  }

  private async getCollectionId(name: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.url}/api/v1/collections/${name}`);
      const data = await res.json();
      return data.id || null;
    } catch {
      return null;
    }
  }
}

class PineconeProvider implements VectorDBProvider {
  private apiKey: string;
  private index: string;

  constructor(config: XioConfig) {
    this.apiKey = config.pineconeApiKey || "";
    this.index = config.pineconeIndex || "";
  }

  async createCollection(_name: string): Promise<void> {
    logger.debug("pinecone uses indexes, collection creation is a no-op");
  }

  async deleteCollection(_name: string): Promise<void> {
    // pinecone indexes are managed externally
  }

  async upsert(_collection: string, documents: VectorDocument[]): Promise<void> {
    const vectors = documents.map((d) => ({
      id: d.id,
      values: d.embedding,
      metadata: { ...d.metadata, content: d.content },
    }));

    await fetch(`https://${this.index}/vectors/upsert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": this.apiKey,
      },
      body: JSON.stringify({ vectors, namespace: _collection }),
    });
  }

  async search(
    collection: string,
    embedding: number[],
    topK = 5
  ): Promise<VectorSearchResult[]> {
    const res = await fetch(`https://${this.index}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": this.apiKey,
      },
      body: JSON.stringify({
        vector: embedding,
        topK,
        namespace: collection,
        includeMetadata: true,
      }),
    });

    const data = await res.json();
    return (data.matches || []).map((m: any) => ({
      id: m.id,
      content: m.metadata?.content || "",
      score: m.score || 0,
      metadata: m.metadata || {},
    }));
  }

  async delete(collection: string, ids: string[]): Promise<void> {
    await fetch(`https://${this.index}/vectors/delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": this.apiKey,
      },
      body: JSON.stringify({ ids, namespace: collection }),
    });
  }
}

class LanceDBProvider implements VectorDBProvider {
  private dbPath: string;

  constructor(config: XioConfig) {
    this.dbPath = config.lancedbPath;
  }

  async createCollection(_name: string): Promise<void> {
    logger.debug(`lancedb: table ${_name} will be created on first upsert at ${this.dbPath}`);
  }

  async deleteCollection(_name: string): Promise<void> {
    // lancedb tables are deleted by removing the directory
  }

  async upsert(_collection: string, _documents: VectorDocument[]): Promise<void> {
    // lancedb native node bindings would handle this
    logger.warn("lancedb upsert requires @lancedb/lancedb native module");
  }

  async search(
    _collection: string,
    _embedding: number[],
    _topK = 5
  ): Promise<VectorSearchResult[]> {
    logger.warn("lancedb search requires @lancedb/lancedb native module");
    return [];
  }

  async delete(_collection: string, _ids: string[]): Promise<void> {
    // no-op without native bindings
  }
}
