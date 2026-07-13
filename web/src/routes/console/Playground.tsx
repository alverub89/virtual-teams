import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post } from "../../lib/api";
import { Button, Card, Chip, Fld, PageHead } from "../../components/ui";
import { RemoteMcpTester } from "../../components/RemoteMcp";
import { useToast } from "../../lib/toast";

interface Tool {
  id: string;
  nome: string;
  descricao: string | null;
  permissao: string;
  execucao: string;
  inputSchema: { properties?: Record<string, { description?: string }>; required?: string[] } | null;
  exemplo: Record<string, unknown>;
}
interface MarketMcp { nome: string; sistema: string; url: string; descricao: string; categoria: string; registrado: boolean }
interface RemoteMcp { nome: string; sistema: string; url: string; descricao: string; dica: string; registrado: boolean; exemplos: Record<string, Record<string, unknown>> }
interface Estado {
  provisionado: boolean;
  mcp: { nome: string; proposito: string | null; endpoint: string | null; tools: Tool[] } | null;
  remotos: RemoteMcp[];
  market: MarketMcp[];
}

function ToolRunner({ tool }: { tool: Tool }) {
  const props = tool.inputSchema?.properties ?? {};
  const campos = Object.keys(props);
  const [args, setArgs] = useState<Record<string, string>>(() =>
    Object.fromEntries(campos.map((k) => [k, String((tool.exemplo as any)?.[k] ?? "")]))
  );
  const [out, setOut] = useState<string>("");
  const [ms, setMs] = useState<number | null>(null);

  const rodar = useMutation({
    mutationFn: async () => {
      const t0 = performance.now();
      const r = await post<{ ok: boolean; resultado?: unknown; erro?: string }>(`/console/tools/${tool.id}/testar`, { arguments: args });
      setMs(Math.round(performance.now() - t0));
      return r;
    },
    onSuccess: (r) => setOut(r.ok ? (typeof r.resultado === "string" ? r.resultado : JSON.stringify(r.resultado, null, 2)) : `Erro: ${r.erro}`),
    onError: (e) => setOut(`Erro: ${(e as Error).message}`),
  });

  const rpc = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool.nome, arguments: args } };

  return (
    <Card pad>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h3 style={{ flex: 1 }}>{tool.nome}</h3>
        <Chip tone={tool.execucao === "http" ? "blue" : "neutral"}>{tool.execucao === "http" ? "HTTP real" : "IA"}</Chip>
        <span className={`perm ${tool.permissao}`}>{tool.permissao}</span>
      </div>
      <p className="sub">{tool.descricao}</p>
      {campos.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {campos.map((k) => (
            <div key={k} className="fld">
              <label>{k}{tool.inputSchema?.required?.includes(k) ? " *" : ""} <span className="muted" style={{ fontWeight: 400 }}>— {props[k]?.description}</span></label>
              <input className="in" value={args[k] ?? ""} onChange={(e) => setArgs({ ...args, [k]: e.target.value })} />
            </div>
          ))}
        </div>
      )}
      {campos.length === 0 && <p className="sub" style={{ marginTop: 4 }}>Sem parâmetros.</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
        <Button variant="primary" onClick={() => rodar.mutate()}>{rodar.isPending ? "Chamando…" : "Executar ao vivo ▶"}</Button>
        {ms != null && <span className="muted num">{ms} ms</span>}
      </div>
      <details style={{ marginTop: 8 }}>
        <summary className="muted" style={{ cursor: "pointer", fontSize: 12.5 }}>ver chamada JSON-RPC (tools/call)</summary>
        <div className="prompt-box" style={{ marginTop: 6, maxHeight: 140, overflow: "auto" }}>{JSON.stringify(rpc, null, 2)}</div>
      </details>
      {out && (
        <>
          <div className="sec-title" style={{ marginTop: 10 }}>Resposta real</div>
          <div className="prompt-box" style={{ maxHeight: 260, overflow: "auto", whiteSpace: "pre-wrap" }}>{out}</div>
        </>
      )}
    </Card>
  );
}

export default function Playground() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery<Estado>({ queryKey: ["playground"], queryFn: () => api("/console/playground") });

  const provisionar = useMutation({
    mutationFn: () => post<{ endpoint: string; total: number; toolsNovas: number }>("/console/playground/provisionar"),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["playground"] }); qc.invalidateQueries({ queryKey: ["mcps"] }); toast(`🎮 Playground pronto — ${r.total} tools reais, vivo no endpoint`); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const registrar = useMutation({
    mutationFn: (nome: string) => post("/console/playground/registrar-mercado", { nome }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["playground"] }); qc.invalidateQueries({ queryKey: ["mcps"] }); toast("🔌 MCP de mercado registrado"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const [conectar, setConectar] = useState<{ url: string; exemplos?: Record<string, Record<string, unknown>> } | null>(null);
  const [urlManual, setUrlManual] = useState("");
  const categorias = [...new Set((data?.market ?? []).map((m) => m.categoria))];

  return (
    <>
      <PageHead
        title="Playground de MCP"
        description="Um MCP real, pronto para demonstração: tools que batem em APIs públicas de verdade (bancos, PIX, CEP, CNPJ, câmbio, feriados) e um catálogo dos MCPs do mercado."
        actions={
          data?.provisionado
            ? <Link to="/console/mcps" className="btn" style={{ textDecoration: "none" }}>Ver em MCPs →</Link>
            : <Button variant="primary" onClick={() => provisionar.mutate()}>{provisionar.isPending ? "Provisionando…" : "🎮 Provisionar playground"}</Button>
        }
      />

      {!data && <p className="muted">Carregando…</p>}

      {data && !data.provisionado && (
        <Card pad>
          <h3>Ambiente de demonstração real</h3>
          <p className="sub" style={{ marginTop: 6, lineHeight: 1.7 }}>
            Clique em <b>Provisionar playground</b> para criar na sua conta um servidor MCP vivo — <b>Playground — Dados Financeiros BR</b> — com
            tools que chamam APIs públicas reais (BrasilAPI e Frankfurter/BCE). Sem chave, sem mock: você digita um CEP, um CNPJ, um código de banco,
            e recebe o dado de verdade. Cada tool também é chamável por qualquer cliente MCP externo no endpoint gerado.
          </p>
          <ul className="sub" style={{ paddingLeft: 18, marginTop: 8, lineHeight: 1.8 }}>
            <li>💳 <b>listar_bancos</b> · <b>consultar_banco</b> — bancos do Brasil (ex.: 341 = Itaú)</li>
            <li>⚡ <b>participantes_pix</b> — instituições integradas ao PIX</li>
            <li>📍 <b>consultar_cep</b> · 🏢 <b>consultar_cnpj</b> — dados cadastrais</li>
            <li>💱 <b>cotacao_moeda</b> — câmbio USD→BRL ao vivo · 📈 <b>taxas_juros</b> — Selic/CDI/IPCA</li>
            <li>🗓️ <b>feriados_nacionais</b> · 🤖 <b>explicar_para_cliente</b> (tool de IA)</li>
          </ul>
        </Card>
      )}

      {data?.provisionado && data.mcp && (
        <>
          <Card pad style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ flex: 1 }}>🎮 {data.mcp.nome}</h3>
              <Chip tone="good">vivo</Chip>
              <Chip tone="neutral">{data.mcp.tools.length} tools reais</Chip>
            </div>
            <p className="sub" style={{ marginTop: 4 }}>{data.mcp.proposito}</p>
            {data.mcp.endpoint && (
              <>
                <p className="sub" style={{ marginTop: 8, marginBottom: 4 }}>Endpoint MCP (JSON-RPC · POST) — plugável em qualquer cliente MCP:</p>
                <div className="prompt-box" style={{ userSelect: "all" }}>{data.mcp.endpoint}</div>
              </>
            )}
          </Card>

          <div className="sec-title">Tools — execute ao vivo</div>
          <div className="grid g2">
            {data.mcp.tools.map((t) => <ToolRunner key={t.id} tool={t} />)}
          </div>
        </>
      )}

      <div className="sec-title" style={{ marginTop: 18 }}>MCPs remotos — conecte e teste de verdade</div>
      <div className="banner" style={{ marginBottom: 10 }}>
        🔗 <span>Servidores MCP remotos <b>públicos e sem chave</b>. Registre a URL e clique em <b>Conectar</b> — o app age como <b>cliente MCP</b> (initialize + tools/list + tools/call) e traz as tools reais do servidor.</span>
      </div>
      <div className="grid g3">
        {data?.remotos.map((m) => (
          <Card key={m.nome} pad>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ flex: 1 }}>{m.nome}</h3>
              {m.registrado && <Chip tone="good">registrado</Chip>}
            </div>
            <p className="sub" style={{ minHeight: 38 }}>{m.descricao}</p>
            <p className="sub" style={{ fontSize: 11.5 }}><b>Ex.:</b> {m.dica}</p>
            <div className="prompt-box" style={{ fontSize: 11, userSelect: "all", margin: "6px 0" }}>{m.url}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant="primary" onClick={() => setConectar({ url: m.url, exemplos: m.exemplos })}>Conectar</Button>
              {!m.registrado && <Button onClick={() => registrar.mutate(m.nome)}>Registrar</Button>}
            </div>
          </Card>
        ))}
      </div>

      <Card pad style={{ marginTop: 10 }}>
        <h3>Conectar por URL</h3>
        <p className="sub">Cole a URL de qualquer servidor MCP (transporte Streamable HTTP) para conectar e testar.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <Fld label="URL do servidor MCP"><input className="in" value={urlManual} onChange={(e) => setUrlManual(e.target.value)} placeholder="https://mcp.exemplo.com/mcp" /></Fld>
          </div>
          <Button variant="primary" onClick={() => urlManual.startsWith("http") && setConectar({ url: urlManual })}>Conectar</Button>
        </div>
      </Card>

      {conectar && (
        <div style={{ marginTop: 10 }}>
          <RemoteMcpTester key={conectar.url} url={conectar.url} exemplos={conectar.exemplos} />
        </div>
      )}

      <div className="sec-title" style={{ marginTop: 18 }}>MCPs disponíveis no mercado</div>
      <div className="banner" style={{ marginBottom: 10 }}>
        🌐 <span>Servidores MCP reais do ecossistema. Registre como referência para plugar depois — ou monte o seu em <Link to="/console/mcps">MCPs</Link>.</span>
      </div>
      {categorias.map((cat) => (
        <div key={cat} style={{ marginBottom: 12 }}>
          <div className="sec-title" style={{ fontSize: 13 }}>{cat}</div>
          <div className="grid g3">
            {data?.market.filter((m) => m.categoria === cat).map((m) => (
              <Card key={m.nome} pad>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h3 style={{ flex: 1 }}>{m.nome}</h3>
                  {m.registrado ? <Chip tone="good">registrado</Chip> : <Chip tone="neutral">{m.sistema}</Chip>}
                </div>
                <p className="sub" style={{ minHeight: 40 }}>{m.descricao}</p>
                <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                  <a href={m.url} target="_blank" rel="noreferrer" className="btn" style={{ textDecoration: "none" }}>Docs ↗</a>
                  {!m.registrado && <Button onClick={() => registrar.mutate(m.nome)}>Registrar</Button>}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
