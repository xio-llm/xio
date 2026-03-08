import {
  Keypair,
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import fs from "fs";
import { logger } from "../utils/logger";
import type { XioConfig } from "../utils/config";

let connection: Connection | null = null;

export async function initWallet(config: XioConfig): Promise<Keypair | null> {
  if (!config.walletKeypairPath) return null;

  try {
    const keypairPath = config.walletKeypairPath;
    if (!fs.existsSync(keypairPath)) {
      logger.warn(`wallet keypair not found at ${keypairPath}, generating new wallet`);
      const kp = Keypair.generate();
      fs.writeFileSync(keypairPath, JSON.stringify(Array.from(kp.secretKey)));
      logger.info(`new wallet generated: ${kp.publicKey.toBase58()}`);
      return kp;
    }

    const raw = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
    connection = new Connection(config.solanaRpcUrl, "confirmed");
    return kp;
  } catch (err) {
    logger.error("failed to load wallet", { error: err });
    return null;
  }
}

export function getConnection(config: XioConfig): Connection {
  if (!connection) {
    connection = new Connection(config.solanaRpcUrl, "confirmed");
  }
  return connection;
}

export async function getWalletBalance(
  config: XioConfig,
  wallet: Keypair
): Promise<{ sol: number; lamports: number }> {
  const conn = getConnection(config);
  const lamports = await conn.getBalance(wallet.publicKey);
  return {
    sol: lamports / LAMPORTS_PER_SOL,
    lamports,
  };
}

export async function sendSOL(
  config: XioConfig,
  wallet: Keypair,
  to: string,
  amountSOL: number
): Promise<string> {
  const conn = getConnection(config);
  const recipient = new PublicKey(to);
  const lamports = Math.round(amountSOL * LAMPORTS_PER_SOL);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: recipient,
      lamports,
    })
  );

  const signature = await sendAndConfirmTransaction(conn, tx, [wallet]);
  logger.info(`sent ${amountSOL} SOL to ${to}`, { signature });
  return signature;
}

export async function sendSPLToken(
  config: XioConfig,
  wallet: Keypair,
  to: string,
  mint: string,
  amount: number,
  decimals: number
): Promise<string> {
  const conn = getConnection(config);
  const mintPubkey = new PublicKey(mint);
  const recipient = new PublicKey(to);

  const senderAta = await getAssociatedTokenAddress(mintPubkey, wallet.publicKey);
  const recipientAta = await getAssociatedTokenAddress(mintPubkey, recipient);

  const rawAmount = BigInt(Math.round(amount * 10 ** decimals));

  const tx = new Transaction().add(
    createTransferInstruction(
      senderAta,
      recipientAta,
      wallet.publicKey,
      rawAmount,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  const signature = await sendAndConfirmTransaction(conn, tx, [wallet]);
  logger.info(`sent ${amount} tokens (${mint}) to ${to}`, { signature });
  return signature;
}

export async function getTokenBalance(
  config: XioConfig,
  wallet: Keypair,
  mint: string
): Promise<number> {
  const conn = getConnection(config);
  const mintPubkey = new PublicKey(mint);
  const ata = await getAssociatedTokenAddress(mintPubkey, wallet.publicKey);

  try {
    const account = await getAccount(conn, ata);
    return Number(account.amount);
  } catch {
    return 0;
  }
}

export async function getRecentTransactions(
  config: XioConfig,
  wallet: Keypair,
  limit = 20
): Promise<any[]> {
  const conn = getConnection(config);
  const signatures = await conn.getSignaturesForAddress(wallet.publicKey, {
    limit,
  });

  return signatures.map((sig) => ({
    signature: sig.signature,
    slot: sig.slot,
    blockTime: sig.blockTime,
    err: sig.err,
    memo: sig.memo,
  }));
}
