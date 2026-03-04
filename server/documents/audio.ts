import { logger } from "../utils/logger";
import type { XioConfig } from "../utils/config";
import type { ParsedDocument } from "./parser";
import { chunkText } from "./parser";

export interface WhisperResult {
  text: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  language: string;
  duration: number;
}

export async function transcribeAudio(
  buffer: Buffer,
  config: XioConfig
): Promise<ParsedDocument> {
  if (config.whisperProvider === "openai-whisper") {
    return transcribeOpenAI(buffer, config);
  }
  return transcribeLocal(buffer, config);
}

async function transcribeOpenAI(
  buffer: Buffer,
  config: XioConfig
): Promise<ParsedDocument> {
  const formData = new FormData();
  formData.append("file", new Blob([buffer]), "audio.wav");
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.llmApiKey}`,
    },
    body: formData,
  });

  const data = (await res.json()) as WhisperResult;
  const chunks = chunkText(data.text);

  return {
    content: data.text,
    metadata: {
      language: data.language,
      duration: data.duration,
      segments: data.segments?.length || 0,
    },
    chunks,
  };
}

async function transcribeLocal(
  _buffer: Buffer,
  config: XioConfig
): Promise<ParsedDocument> {
  // local whisper runs via subprocess or python binding
  // this is a placeholder for the whisper.cpp / faster-whisper integration
  logger.info(`local whisper transcription requested (model: ${config.whisperModel})`);

  // in production, this would shell out to whisper or use a gRPC service
  throw new Error(
    "local whisper transcription requires whisper.cpp or faster-whisper to be installed. " +
      "set WHISPER_PROVIDER=openai-whisper to use the cloud API instead."
  );
}
