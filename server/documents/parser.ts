import { logger } from "../utils/logger";

export interface ParsedDocument {
  content: string;
  metadata: Record<string, any>;
  chunks: string[];
}

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

export function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    let chunk = text.slice(start, end);

    // try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = chunk.lastIndexOf(". ");
      const lastNewline = chunk.lastIndexOf("\n");
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > size * 0.5) {
        chunk = chunk.slice(0, breakPoint + 1);
      }
    }

    chunks.push(chunk.trim());
    start += chunk.length - overlap;
  }

  return chunks.filter((c) => c.length > 10);
}

export async function parsePDF(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const pdfParse = await import("pdf-parse");
    const data = await pdfParse.default(buffer);
    const chunks = chunkText(data.text);

    return {
      content: data.text,
      metadata: {
        pages: data.numpages,
        info: data.info,
      },
      chunks,
    };
  } catch (err) {
    logger.error("pdf parse failed", { error: err });
    throw new Error("failed to parse PDF");
  }
}

export async function parseDOCX(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    const chunks = chunkText(result.value);

    return {
      content: result.value,
      metadata: {},
      chunks,
    };
  } catch (err) {
    logger.error("docx parse failed", { error: err });
    throw new Error("failed to parse DOCX");
  }
}

export async function parseCSV(buffer: Buffer): Promise<ParsedDocument> {
  const text = buffer.toString("utf-8");
  const chunks = chunkText(text, 500, 50);

  return {
    content: text,
    metadata: { format: "csv" },
    chunks,
  };
}

export async function parsePlainText(buffer: Buffer): Promise<ParsedDocument> {
  const text = buffer.toString("utf-8");
  const chunks = chunkText(text);

  return {
    content: text,
    metadata: {},
    chunks,
  };
}

export async function scrapeWebpage(url: string): Promise<ParsedDocument> {
  try {
    const res = await fetch(url);
    const html = await res.text();
    const cheerio = await import("cheerio");
    const $ = cheerio.load(html);

    // remove scripts, styles, nav
    $("script, style, nav, footer, header, aside").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();
    const chunks = chunkText(text);

    return {
      content: text,
      metadata: {
        url,
        title: $("title").text() || "",
      },
      chunks,
    };
  } catch (err) {
    logger.error("web scrape failed", { url, error: err });
    throw new Error(`failed to scrape ${url}`);
  }
}

export function detectFileType(
  filename: string
): "pdf" | "docx" | "csv" | "txt" | "unknown" {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf":
      return "pdf";
    case "docx":
    case "doc":
      return "docx";
    case "csv":
      return "csv";
    case "txt":
    case "md":
    case "json":
    case "log":
      return "txt";
    default:
      return "unknown";
  }
}

export async function parseDocument(
  buffer: Buffer,
  filename: string
): Promise<ParsedDocument> {
  const type = detectFileType(filename);

  switch (type) {
    case "pdf":
      return parsePDF(buffer);
    case "docx":
      return parseDOCX(buffer);
    case "csv":
      return parseCSV(buffer);
    case "txt":
      return parsePlainText(buffer);
    default:
      return parsePlainText(buffer);
  }
}
