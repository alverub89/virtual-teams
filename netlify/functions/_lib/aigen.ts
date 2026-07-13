// Helpers de geração/execução com IA para o construtor de MCP.
// - gerarJson: pede JSON estrito ao provedor e extrai o objeto com robustez.
// - executarTool: roda uma tool registrada (execucao "ia" ou "http") com args.

import { getProvider } from "../../../ai/provider";
import { resolveModel } from "../../../ai/router";

// Extrai o primeiro objeto/array JSON de um texto (o modelo às vezes embrulha
// em ```json ... ``` ou adiciona prosa). Lança se nada válido for achado.
export function extrairJson(texto: string): any {
  const t = texto.trim();
  // 1) tenta o texto cru primeiro — cobre JSON limpo que contém ``` DENTRO de
  //    strings (ex.: markdown com blocos de código), que a limpeza abaixo quebra.
  try { return JSON.parse(t); } catch { /* segue */ }
  // 2) remove a cerca de bloco (```json … ```) e tenta o miolo.
  const semJson = t.replace(/```json/gi, "```");
  if (semJson.includes("```")) {
    const dentro = semJson.split("```")[1];
    if (dentro) { try { return JSON.parse(dentro.trim()); } catch { /* segue */ } }
  }
  // 3) recorta do primeiro { (ou [) ao último } (ou ]).
  const ini = t.search(/[{[]/);
  const fim = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (ini >= 0 && fim > ini) return JSON.parse(t.slice(ini, fim + 1));
  throw new Error("resposta da IA não continha JSON válido");
}

// Pede ao provedor uma resposta JSON dado um system + instrução. tarefa define
// o nível do modelo (via roteador). Retorna o objeto já parseado.
export async function gerarJson(opts: {
  system: string;
  instrucao: string;
  tarefa?: "arquitetura" | "prd" | "historias" | "resumo" | "classificacao" | "sync";
  maxTokens?: number;
  onUsage?: (u: { promptTokens: number; completionTokens: number }) => void; // p/ contabilizar tokens por etapa
}): Promise<any> {
  const provider = await getProvider();
  const model = await resolveModel(opts.tarefa ?? "historias");
  const res = await provider.chat({
    model,
    system: opts.system,
    messages: [{ role: "user", content: opts.instrucao }],
    maxTokens: opts.maxTokens ?? 1200,
    temperature: 0.2,
  });
  if (opts.onUsage && res.usage) opts.onUsage(res.usage);
  return extrairJson(res.content);
}

// Substitui {{param}} num template (string ou objeto) pelos valores dos args.
function interpolar(tmpl: any, args: Record<string, unknown>): any {
  if (typeof tmpl === "string") {
    return tmpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
      const v = args[k];
      return v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    });
  }
  if (Array.isArray(tmpl)) return tmpl.map((x) => interpolar(x, args));
  if (tmpl && typeof tmpl === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(tmpl)) out[k] = interpolar(v, args);
    return out;
  }
  return tmpl;
}

// Executa uma tool registrada. Retorna { ok, resultado } ou { ok:false, erro }.
export async function executarTool(
  tool: { nome: string; descricao: string | null; execucao: string; handlerConfig: any; inputSchema: any },
  args: Record<string, unknown>
): Promise<{ ok: boolean; resultado?: unknown; erro?: string }> {
  try {
    if (tool.execucao === "http") {
      const cfg = tool.handlerConfig ?? {};
      const metodo = (cfg.metodo ?? cfg.method ?? "GET").toUpperCase();
      const url = interpolar(cfg.url ?? "", args);
      if (!url) return { ok: false, erro: "handler http sem url" };
      const headers = interpolar(cfg.headers ?? {}, args) as Record<string, string>;
      const temBody = metodo !== "GET" && metodo !== "HEAD" && (cfg.body ?? cfg.bodyTemplate);
      const body = temBody ? interpolar(cfg.body ?? cfg.bodyTemplate, args) : undefined;
      const res = await fetch(url, {
        method: metodo,
        headers: temBody ? { "content-type": "application/json", ...headers } : headers,
        body: temBody ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
      });
      const txt = await res.text();
      let parsed: unknown = txt;
      try { parsed = JSON.parse(txt); } catch { /* mantém texto */ }
      return { ok: res.ok, resultado: parsed, erro: res.ok ? undefined : `HTTP ${res.status}` };
    }

    // execucao "ia": usa o prompt do handler + os argumentos como contexto.
    // Se o handler declara um contextoUrl, o app busca esse conteúdo real
    // (ex.: README de um repo) e injeta como contexto ANTES de chamar o Omni —
    // a inteligência roda na infra própria, com dado de verdade (RAG-lite).
    const cfg = tool.handlerConfig ?? {};
    let contexto = "";
    if (cfg.contextoUrl) {
      try {
        const url = interpolar(cfg.contextoUrl, args);
        const res = await fetch(url, { headers: interpolar(cfg.contextoHeaders ?? {}, args) as Record<string, string> });
        contexto = res.ok
          ? (await res.text()).slice(0, cfg.contextoMax ?? 8000)
          : `(contexto indisponível: HTTP ${res.status})`;
      } catch (e) {
        contexto = `(contexto indisponível: ${e instanceof Error ? e.message : String(e)})`;
      }
    }
    const system =
      cfg.prompt ??
      `Você executa a tool "${tool.nome}": ${tool.descricao ?? ""}. Responda de forma direta e útil ao pedido, usando os parâmetros fornecidos.`;
    const provider = await getProvider();
    const model = await resolveModel("historias");
    const userContent = contexto
      ? `Contexto real:\n"""\n${contexto}\n"""\n\nParâmetros (JSON): ${JSON.stringify(args)}`
      : `Parâmetros (JSON): ${JSON.stringify(args)}`;
    const res = await provider.chat({
      model,
      system,
      messages: [{ role: "user", content: userContent }],
      maxTokens: cfg.maxTokens ?? 800,
      temperature: cfg.temperature ?? 0.4,
    });
    return { ok: true, resultado: res.content };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
