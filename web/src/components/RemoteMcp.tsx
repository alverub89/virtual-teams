import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { post } from "../lib/api";
import { Button, Card, Chip } from "./ui";

interface RemoteTool {
  name: string;
  description?: string;
  inputSchema?: { properties?: Record<string, { description?: string; type?: string }>; required?: string[] };
}

function RemoteToolCall({ alvo, tool, exemplo, apiBase }: { alvo: { url?: string; mcpId?: string }; tool: RemoteTool; exemplo?: Record<string, unknown>; apiBase: string }) {
  const props = tool.inputSchema?.properties ?? {};
  const campos = Object.keys(props);
  const [args, setArgs] = useState<Record<string, string>>(() =>
    Object.fromEntries(campos.map((k) => [k, exemplo?.[k] != null ? String(exemplo[k]) : ""]))
  );
  const [out, setOut] = useState("");
  const [ms, setMs] = useState<number | null>(null);

  const chamar = useMutation({
    mutationFn: async () => {
      const t0 = performance.now();
      const parsed: Record<string, unknown> = {};
      for (const k of campos) if (args[k] !== "") parsed[k] = args[k];
      const r = await post<{ ok: boolean; resultado?: unknown; erro?: string; isError?: boolean }>(`${apiBase}/mcp-client/call`, { ...alvo, name: tool.name, arguments: parsed });
      setMs(Math.round(performance.now() - t0));
      return r;
    },
    onSuccess: (r) => setOut(r.ok ? (typeof r.resultado === "string" ? r.resultado : JSON.stringify(r.resultado, null, 2)) : `Erro: ${r.erro}`),
    onError: (e) => setOut(`Erro: ${(e as Error).message}`),
  });

  return (
    <div className="card card-pad" style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b style={{ flex: 1 }}>{tool.name}</b>
        {ms != null && <span className="muted num">{ms} ms</span>}
      </div>
      {tool.description && <p className="sub">{tool.description}</p>}
      {campos.map((k) => (
        <div key={k} className="fld" style={{ marginTop: 6 }}>
          <label>{k}{tool.inputSchema?.required?.includes(k) ? " *" : ""} <span className="muted" style={{ fontWeight: 400 }}>— {props[k]?.description ?? props[k]?.type}</span></label>
          <input className="in" value={args[k] ?? ""} onChange={(e) => setArgs({ ...args, [k]: e.target.value })} />
        </div>
      ))}
      <div style={{ marginTop: 8 }}>
        <Button variant="primary" onClick={() => chamar.mutate()}>{chamar.isPending ? "Chamando…" : "Chamar tool ▶"}</Button>
      </div>
      {out && <div className="prompt-box" style={{ marginTop: 8, maxHeight: 240, overflow: "auto", whiteSpace: "pre-wrap" }}>{out}</div>}
    </div>
  );
}

// Conecta (como cliente MCP) a um servidor remoto pela URL, lista as tools reais
// e permite chamá-las — tudo via backend (evita CORS e trata SSE).
export function RemoteMcpTester({ url, mcpId, exemplos, apiBase = "/console" }: { url?: string; mcpId?: string; exemplos?: Record<string, Record<string, unknown>>; apiBase?: string }) {
  const [dados, setDados] = useState<{ serverInfo?: any; tools?: RemoteTool[]; erro?: string } | null>(null);
  const alvo = mcpId ? { mcpId } : { url };

  const conectar = useMutation({
    mutationFn: () => post<{ ok: boolean; serverInfo?: any; tools?: RemoteTool[]; erro?: string }>(`${apiBase}/mcp-client/tools`, alvo),
    onSuccess: (r) => setDados(r.ok ? { serverInfo: r.serverInfo, tools: r.tools } : { erro: r.erro }),
    onError: (e) => setDados({ erro: (e as Error).message }),
  });

  return (
    <Card pad>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h3 style={{ flex: 1 }}>Cliente MCP</h3>
        <Button variant="primary" onClick={() => conectar.mutate()}>{conectar.isPending ? "Conectando…" : dados ? "Reconectar" : "Conectar & listar tools"}</Button>
      </div>
      <p className="sub">O app conecta como cliente MCP{url ? <> a <code>{url}</code></> : ""} — handshake + tools/list em tempo real.</p>
      {dados?.erro && <div className="prompt-box" style={{ marginTop: 8 }}>Falha ao conectar: {dados.erro}</div>}
      {dados?.tools && (
        <>
          <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "10px 0" }}>
            {dados.serverInfo?.name && <Chip tone="good">{dados.serverInfo.name}</Chip>}
            <Chip tone="neutral">{dados.tools.length} tools</Chip>
          </div>
          {dados.tools.length === 0 && <p className="empty-note">Conectou, mas o servidor não expôs tools.</p>}
          {dados.tools.map((t) => <RemoteToolCall key={t.name} alvo={alvo} tool={t} exemplo={exemplos?.[t.name]} apiBase={apiBase} />)}
        </>
      )}
    </Card>
  );
}
