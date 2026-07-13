// Cliente MCP (transporte Streamable HTTP) — o app age como CLIENTE de um
// servidor MCP externo: faz o handshake (initialize), lista as tools e as chama.
// Aceita resposta em application/json OU text/event-stream (SSE) e propaga o
// cabeçalho de sessão (mcp-session-id) quando o servidor usa sessão.
//
// Como funções serverless não guardam estado entre chamadas, cada operação
// (listar / chamar) refaz o handshake — simples e robusto para demonstração.

const PROTOCOL = "2024-11-05";

interface RpcResult {
  ok: boolean;
  status: number;
  json?: any;
  sid?: string | null;
  raw: string;
}

async function postRpc(url: string, body: any, sessionId?: string | null): Promise<RpcResult> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const sid = res.headers.get("mcp-session-id") ?? sessionId ?? null;
  const ct = res.headers.get("content-type") ?? "";
  const raw = await res.text();

  let json: any;
  if (ct.includes("text/event-stream")) {
    // SSE: junta as linhas "data:" e pega o último JSON com id/result/error.
    const datas = raw.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
    for (const d of datas) {
      try {
        const j = JSON.parse(d);
        if (j.id === body.id || j.result !== undefined || j.error !== undefined) json = j;
      } catch { /* ignora keep-alives */ }
    }
  } else {
    try { json = JSON.parse(raw); } catch { /* corpo não-JSON */ }
  }
  return { ok: res.ok, status: res.status, json, sid, raw };
}

async function initialize(url: string): Promise<RpcResult> {
  const r = await postRpc(url, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "AI Workspace", version: "1.0.0" } },
  });
  // Notificação de "initialized" (best-effort; muitos servidores exigem).
  if (r.ok) await postRpc(url, { jsonrpc: "2.0", method: "notifications/initialized" }, r.sid).catch(() => {});
  return r;
}

const erro = (r: RpcResult) => r.json?.error?.message ?? `HTTP ${r.status}` + (r.raw ? ` — ${r.raw.slice(0, 200)}` : "");

export async function listarToolsRemoto(
  url: string
): Promise<{ ok: boolean; serverInfo?: any; tools?: any[]; erro?: string }> {
  try {
    const init = await initialize(url);
    if (!init.ok || init.json?.error) return { ok: false, erro: erro(init) };
    const r = await postRpc(url, { jsonrpc: "2.0", id: 2, method: "tools/list" }, init.sid);
    if (!r.ok || r.json?.error) return { ok: false, erro: erro(r) };
    return { ok: true, serverInfo: init.json?.result?.serverInfo, tools: r.json?.result?.tools ?? [] };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

export async function chamarToolRemoto(
  url: string,
  name: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; resultado?: unknown; isError?: boolean; erro?: string }> {
  try {
    const init = await initialize(url);
    if (!init.ok || init.json?.error) return { ok: false, erro: erro(init) };
    const r = await postRpc(url, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args ?? {} } }, init.sid);
    if (!r.ok || r.json?.error) return { ok: false, erro: erro(r) };
    const content = r.json?.result?.content ?? [];
    const texto = Array.isArray(content)
      ? content.map((c: any) => (c?.type === "text" ? c.text : JSON.stringify(c))).join("\n")
      : undefined;
    return { ok: true, resultado: texto || r.json?.result, isError: !!r.json?.result?.isError };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
