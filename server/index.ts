import { createApp } from "./app";
import { loadConfig } from "./utils/config";
import { logger } from "./utils/logger";
import { initDatabase } from "./db/sqlite";
import { initWallet } from "./wallet/agent";

async function main() {
  const config = loadConfig();

  logger.info("initializing xio...");

  const db = initDatabase(config.storageDir);
  logger.info("database ready");

  const wallet = config.walletKeypairPath
    ? await initWallet(config)
    : null;

  if (wallet) {
    logger.info(`agent wallet loaded: ${wallet.publicKey.toBase58()}`);
  }

  const app = createApp(config, db, wallet);

  app.listen(config.port, () => {
    logger.info(`xio running on http://localhost:${config.port}`);
    logger.info(`llm provider: ${config.llmProvider} (${config.llmModel})`);
    logger.info(`vector db: ${config.vectorDb}`);
    if (config.creditsEnabled) {
      logger.info(`credits system enabled (${config.creditsPerQuery} per query)`);
    }
  });
}

main().catch((err) => {
  logger.error("fatal startup error", err);
  process.exit(1);
});
