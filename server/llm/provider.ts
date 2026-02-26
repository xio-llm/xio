import type { XioConfig } from "../utils/config";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  tokensUsed: number;
  model: string;
}

export interface LLMStreamChunk {
  content: string;
  done: boolean;
}

export interface LLMProvider {
  chat(messages: LLMMessage[]): Promise<LLMResponse>;
  stream(messages: LLMMessage[]): AsyncGenerator<LLMStreamChunk>;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export function createLLMProvider(config: XioConfig): LLMProvider {
  switch (config.llmProvider) {
    case "openai":
      return new OpenAIProvider(config);
    case "ollama":
      return new OllamaProvider(config);
    case "anthropic":
      return new AnthropicProvider(config);
    case "lmstudio":
      return new LMStudioProvider(config);
    default:
      throw new Error(`unsupported llm provider: ${config.llmProvider}`);
  }
}

class OllamaProvider implements LLMProvider {
  private baseUrl: string;
  private model: string;
  private embeddingModel: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: XioConfig) {
    this.baseUrl = config.llmBaseUrl;
    this.model = config.llmModel;
    this.embeddingModel = config.embeddingModel;
    this.maxTokens = config.llmMaxTokens;
    this.temperature = config.llmTemperature;
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        options: {
          num_predict: this.maxTokens,
          temperature: this.temperature,
        },
      }),
    });

    const data = await res.json();
    return {
      content: data.message?.content || "",
      tokensUsed: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      model: this.model,
    };
  }

  async *stream(messages: LLMMessage[]): AsyncGenerator<LLMStreamChunk> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
        options: {
          num_predict: this.maxTokens,
          temperature: this.temperature,
        },
      }),
    });

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          yield {
            content: chunk.message?.content || "",
            done: chunk.done || false,
          };
        } catch {
          // skip malformed json
        }
      }
    }
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.embeddingModel, input: text }),
    });
    const data = await res.json();
    return data.embeddings?.[0] || [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.embeddingModel, input: texts }),
    });
    const data = await res.json();
    return data.embeddings || [];
  }
}

class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private embeddingModel: string;
  private maxTokens: number;
  private temperature: number;
  private baseUrl: string;

  constructor(config: XioConfig) {
    this.apiKey = config.llmApiKey || "";
    this.model = config.llmModel;
    this.embeddingModel = config.embeddingModel;
    this.maxTokens = config.llmMaxTokens;
    this.temperature = config.llmTemperature;
    this.baseUrl = config.llmBaseUrl || "https://api.openai.com/v1";
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
      }),
    });

    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content || "",
      tokensUsed: data.usage?.total_tokens || 0,
      model: this.model,
    };
  }

  async *stream(messages: LLMMessage[]): AsyncGenerator<LLMStreamChunk> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        stream: true,
      }),
    });

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.replace(/^data: /, "").trim();
        if (!trimmed || trimmed === "[DONE]") continue;
        try {
          const chunk = JSON.parse(trimmed);
          const content = chunk.choices?.[0]?.delta?.content || "";
          yield { content, done: false };
        } catch {
          // skip
        }
      }
    }

    yield { content: "", done: true };
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.embeddingModel, input: text }),
    });
    const data = await res.json();
    return data.data?.[0]?.embedding || [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.embeddingModel, input: texts }),
    });
    const data = await res.json();
    return (data.data || []).map((d: any) => d.embedding);
  }
}

class AnthropicProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: XioConfig) {
    this.apiKey = config.llmApiKey || "";
    this.model = config.llmModel || "claude-3-5-sonnet-20241022";
    this.maxTokens = config.llmMaxTokens;
    this.temperature = config.llmTemperature;
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: systemMsg?.content,
        messages: chatMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    const data = await res.json();
    return {
      content: data.content?.[0]?.text || "",
      tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      model: this.model,
    };
  }

  async *stream(messages: LLMMessage[]): AsyncGenerator<LLMStreamChunk> {
    // anthropic streaming via SSE
    const result = await this.chat(messages);
    yield { content: result.content, done: true };
  }

  async embed(_text: string): Promise<number[]> {
    throw new Error("anthropic does not support embeddings directly, use a separate embedding provider");
  }

  async embedBatch(_texts: string[]): Promise<number[][]> {
    throw new Error("anthropic does not support embeddings directly");
  }
}

class LMStudioProvider extends OpenAIProvider {
  constructor(config: XioConfig) {
    super({
      ...config,
      llmBaseUrl: config.llmBaseUrl || "http://localhost:1234/v1",
    });
  }
}
