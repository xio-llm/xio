import { describe, it, expect } from "vitest";
import { chunkText, detectFileType } from "../server/documents/parser";

describe("chunkText", () => {
  it("should split text into chunks", () => {
    const text = "a".repeat(3000);
    const chunks = chunkText(text, 1000, 200);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].length).toBeLessThanOrEqual(1000);
  });

  it("should return single chunk for short text", () => {
    const chunks = chunkText("hello world", 1000, 200);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("hello world");
  });

  it("should filter out very short chunks", () => {
    const chunks = chunkText("ok", 1000, 200);
    expect(chunks).toHaveLength(0);
  });

  it("should preserve sentence boundaries when possible", () => {
    const text = "First sentence here. Second sentence here. " + "a".repeat(900);
    const chunks = chunkText(text, 100, 20);
    // first chunk should end at a sentence boundary
    expect(chunks[0]).toMatch(/\.$/);
  });
});

describe("detectFileType", () => {
  it("should detect PDF", () => {
    expect(detectFileType("document.pdf")).toBe("pdf");
  });

  it("should detect DOCX", () => {
    expect(detectFileType("report.docx")).toBe("docx");
  });

  it("should detect CSV", () => {
    expect(detectFileType("data.csv")).toBe("csv");
  });

  it("should detect TXT and variants", () => {
    expect(detectFileType("notes.txt")).toBe("txt");
    expect(detectFileType("readme.md")).toBe("txt");
    expect(detectFileType("config.json")).toBe("txt");
  });

  it("should return unknown for unsupported types", () => {
    expect(detectFileType("image.png")).toBe("unknown");
  });
});
