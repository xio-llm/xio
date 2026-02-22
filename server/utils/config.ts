import { config as dotenvConfig } from "dotenv";
import { z } from "zod";
import path from "path";

dotenvConfig();

const configSchema = z.object({
  port: z.coerce.number().default(3001),
  authToken: z.string().optional(),
  storageDir: z.string().default("./storage"),
  logLevel: z.string().default("info"),

  llmProvider: z.enum(["openai", "ollama", "anthropic", "lmstudio"]).default("ollama"),
  llmModel: z.string().default("llama3.2"),
  llmBaseUrl: z.string().default("http://localhost:11434"),
  llmApiKey: z.string().optional(),
  llmMaxTokens: z.coerce.number().default(4096),
  llmTemperature: z.coerce.number().default(0.7),

  embeddingProvider: z.enum(["openai", "ollama", "local"]).default("ollama"),
  embeddingModel: z.string().default("nomic-embed-text"),
  embeddingDimensions: z.coerce.number().default(768),

  vectorDb: z.enum(["chroma", "pinecone", "lancedb"]).default("chroma"),
  chromaUrl: z.string().default("http://localhost:8000"),
  pineconeApiKey: z.string().optional(),
  pineconeIndex: z.string().optional(),
  lancedbPath: z.string().default("./storage/lancedb"),

  whisperProvider: z.enum(["whisper-local", "openai-whisper"]).default("whisper-local"),
  whisperModel: z.string().default("base"),

  solanaRpcUrl: z.string().default("https://api.mainnet-beta.solana.com"),
  walletKeypairPath: z.string().optional(),
  walletEncryptionKey: z.string().optional(),

  creditsEnabled: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  creditsPerQuery: z.coerce.number().default(1),
  creditsPerUpload: z.coerce.number().default(5),
  solPricePerCredit: z.coerce.number().default(0.001),
});

export type XioConfig = z.infer<typeof configSchema>;

export function loadConfig(): XioConfig {
  const raw = {
    port: process.env.SERVER_PORT,
    authToken: process.env.AUTH_TOKEN,
    storageDir: process.env.STORAGE_DIR,
    logLevel: process.env.LOG_LEVEL,
    llmProvider: process.env.LLM_PROVIDER,
    llmModel: process.env.LLM_MODEL,
    llmBaseUrl: process.env.LLM_BASE_URL,
    llmApiKey: process.env.LLM_API_KEY,
    llmMaxTokens: process.env.LLM_MAX_TOKENS,
    llmTemperature: process.env.LLM_TEMPERATURE,
    embeddingProvider: process.env.EMBEDDING_PROVIDER,
    embeddingModel: process.env.EMBEDDING_MODEL,
    embeddingDimensions: process.env.EMBEDDING_DIMENSIONS,
    vectorDb: process.env.VECTOR_DB,
    chromaUrl: process.env.CHROMA_URL,
    pineconeApiKey: process.env.PINECONE_API_KEY,
    pineconeIndex: process.env.PINECONE_INDEX,
    lancedbPath: process.env.LANCEDB_PATH,
    whisperProvider: process.env.WHISPER_PROVIDER,
    whisperModel: process.env.WHISPER_MODEL,
    solanaRpcUrl: process.env.SOLANA_RPC_URL,
    walletKeypairPath: process.env.WALLET_KEYPAIR_PATH,
    walletEncryptionKey: process.env.WALLET_ENCRYPTION_KEY,
    creditsEnabled: process.env.CREDITS_ENABLED,
    creditsPerQuery: process.env.CREDITS_PER_QUERY,
    creditsPerUpload: process.env.CREDITS_PER_UPLOAD,
    solPricePerCredit: process.env.SOL_PRICE_PER_CREDIT,
  };

  return configSchema.parse(raw);
}
