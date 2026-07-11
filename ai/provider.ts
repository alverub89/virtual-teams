// Adapter do provedor de IA próprio — contrato OpenAI-compatible.
// Trocar de provedor = trocar só o OwnProvider (docs/spec, seção 7).

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ChatRequest {
  model: string; // resolvido pelo roteador (ai/router.ts)
  system: string; // prompt de sistema do agente (identidade + skills + tools)
  messages: Message[];
  tools?: ToolSpec[];
  maxTokens?: number;
  temperature?: number;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
}

export interface ChatResponse {
  content: string;
  toolCalls?: { id: string; name: string; arguments: string }[];
  usage: Usage;
}

export interface ChatChunk {
  delta: string;
  usage?: Usage; // presente no último chunk
}

export interface LLMProvider {
  chat(req: ChatRequest): Promise<ChatResponse>;
  stream(req: ChatRequest): AsyncIterable<ChatChunk>;
  embed(texts: string[]): Promise<number[][]>;
}

// Provider ativo: o real quando AI_BASE_URL existe; senão o mock de demo.
export async function getProvider(): Promise<LLMProvider> {
  if (process.env.AI_BASE_URL) return new OwnProvider();
  const { MockProvider } = await import("./mock");
  return new MockProvider();
}

export class OwnProvider implements LLMProvider {
  constructor(
    private baseUrl = process.env.AI_BASE_URL ?? "",
    private apiKey = process.env.AI_API_KEY ?? ""
  ) {
    if (!this.baseUrl) throw new Error("AI_BASE_URL não configurada");
  }

  private headers() {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${this.apiKey}`,
    };
  }

  private body(req: ChatRequest, stream: boolean) {
    return JSON.stringify({
      model: req.model,
      stream,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      messages: [{ role: "system", content: req.system }, ...req.messages],
      tools: req.tools?.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
    });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: this.body(req, false),
    });
    if (!res.ok) throw new Error(`IA ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as any;
    const choice = data.choices?.[0];
    return {
      content: choice?.message?.content ?? "",
      toolCalls: choice?.message?.tool_calls?.map((c: any) => ({
        id: c.id,
        name: c.function.name,
        arguments: c.function.arguments,
      })),
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  async *stream(req: ChatRequest): AsyncIterable<ChatChunk> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: this.body(req, true),
    });
    if (!res.ok || !res.body) throw new Error(`IA ${res.status}: ${await res.text()}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const payload = line.replace(/^data: ?/, "").trim();
        if (!payload || payload === "[DONE]") continue;
        const data = JSON.parse(payload);
        const delta = data.choices?.[0]?.delta?.content ?? "";
        const usage = data.usage
          ? {
              promptTokens: data.usage.prompt_tokens ?? 0,
              completionTokens: data.usage.completion_tokens ?? 0,
            }
          : undefined;
        if (delta || usage) yield { delta, usage };
      }
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ input: texts }),
    });
    if (!res.ok) throw new Error(`IA ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as any;
    return data.data.map((d: any) => d.embedding);
  }
}
