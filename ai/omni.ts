import type { ChatChunk, ChatRequest, ChatResponse, LLMProvider } from "./provider";

// Adapter do Omni AI Gateway (repo alverub89/omni-ai-gateway) —
// POST {AI_BASE_URL}/api/chat, auth por header x-omni-product-key,
// body { provider, model, messages, maxTokens }, resposta JSON única.
// O gateway não faz streaming; stream() simula chunking sobre a resposta
// completa para preservar a UX de digitação do chat.

interface OmniResponse {
  content: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  model?: string;
  error?: string;
}

export class OmniProvider implements LLMProvider {
  constructor(
    private baseUrl = process.env.AI_BASE_URL ?? "",
    private productKey = process.env.OMNI_PRODUCT_KEY ?? process.env.AI_API_KEY ?? "",
    private provider = process.env.AI_GATEWAY_PROVIDER ?? "openai"
  ) {
    if (!this.baseUrl) throw new Error("AI_BASE_URL não configurada");
    if (!this.productKey) throw new Error("OMNI_PRODUCT_KEY não configurada");
  }

  private async call(req: ChatRequest): Promise<OmniResponse> {
    const messages = [
      { role: "system", content: req.system },
      ...req.messages.map((m) => ({
        role: m.role === "tool" ? "user" : m.role,
        content: m.content,
      })),
    ];
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-omni-product-key": this.productKey,
      },
      body: JSON.stringify({
        provider: this.provider,
        model: req.model,
        maxTokens: req.maxTokens ?? 2000,
        messages,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as OmniResponse;
    if (!res.ok) throw new Error(`Gateway ${res.status}: ${data.error ?? "erro"}`);
    return data;
  }

  private usage(r: OmniResponse) {
    return {
      promptTokens: r.usage?.inputTokens ?? 0,
      completionTokens: r.usage?.outputTokens ?? 0,
    };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const r = await this.call(req);
    return { content: r.content ?? "", usage: this.usage(r) };
  }

  async *stream(req: ChatRequest): AsyncIterable<ChatChunk> {
    const r = await this.call(req);
    const texto = r.content ?? "";
    const palavras = texto.split(/(?<=\s)/);
    for (const p of palavras) {
      await new Promise((res) => setTimeout(res, 12));
      yield { delta: p };
    }
    yield { delta: "", usage: this.usage(r) };
  }

  async embed(): Promise<number[][]> {
    throw new Error("Omni gateway não expõe embeddings");
  }
}
