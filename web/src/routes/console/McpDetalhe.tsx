import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, del, post } from "../../lib/api";
import { Button, Card, Chip, Fld, Modal, PageHead } from "../../components/ui";
import { RemoteMcpTester } from "../../components/RemoteMcp";
import { useToast } from "../../lib/toast";

interface Tool {
  id: string;
  nome: string;
  descricao: string | null;
  permissao: string;
  execucao: string;
  parametros: string | null;
  inputSchema: Record<string, unknown> | null;
  handlerConfig: Record<string, unknown> | null;
}
interface McpDet {
  id: string;
  nome: string;
  sistema: string;
  status: string;
  descricao: string | null;
  escopo: string;
  slug: string | null;
  url: string | null;
  proposito: string | null;
  geradoEm: string | null;
  endpoint: string | null;
  tools: Tool[];
}

export default function McpDetalhe() {
  const { id } = useParams();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: mcp } = useQuery<McpDet>({ queryKey: ["mcp", id], queryFn: () => api(`/console/mcps/${id}`) });

  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [permissao, setPermissao] = useState("leitura");
  const [execucao, setExecucao] = useState("ia");
  const [parametros, setParametros] = useState("");
  const [httpMetodo, setHttpMetodo] = useState("GET");
  const [httpUrl, setHttpUrl] = useState("");
  const [httpHeaders, setHttpHeaders] = useState("");
  const [httpBody, setHttpBody] = useState("");

  const [testar, setTestar] = useState<Tool | null>(null);
  const [testArgs, setTestArgs] = useState("{}");
  const [testOut, setTestOut] = useState<string>("");

  const resetForm = () => {
    setNome(""); setDescricao(""); setPermissao("leitura"); setExecucao("ia");
    setParametros(""); setHttpMetodo("GET"); setHttpUrl(""); setHttpHeaders(""); setHttpBody("");
  };

  const criarTool = useMutation({
    mutationFn: () => {
      let handlerConfig: Record<string, unknown> | undefined;
      if (execucao === "http") {
        let headers: Record<string, string> = {};
        try { headers = httpHeaders.trim() ? JSON.parse(httpHeaders) : {}; } catch { throw new Error("Headers precisam ser JSON válido"); }
        handlerConfig = { metodo: httpMetodo, url: httpUrl, headers, ...(httpBody.trim() ? { body: httpBody } : {}) };
      }
      return post(`/console/tools`, { nome, descricao, permissao, conexaoMcpId: id, execucao, parametros, handlerConfig });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mcp", id] }); qc.invalidateQueries({ queryKey: ["mcps"] }); setNovo(false); resetForm(); toast("🔧 Tool cadastrada"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const removerTool = useMutation({
    mutationFn: (tid: string) => del(`/console/tools/${tid}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mcp", id] }); qc.invalidateQueries({ queryKey: ["mcps"] }); toast("🗑️ Tool removida"); },
  });

  const gerar = useMutation({
    mutationFn: () => post<{ slug: string; endpoint: string; tools: number }>(`/console/mcps/${id}/gerar`),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["mcp", id] }); qc.invalidateQueries({ queryKey: ["mcps"] }); toast(`✨ MCP gerado — vivo em /mcp/${r.slug}`); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const rodarTeste = useMutation({
    mutationFn: () => {
      let args: unknown = {};
      try { args = testArgs.trim() ? JSON.parse(testArgs) : {}; } catch { throw new Error("Argumentos precisam ser JSON válido"); }
      return post<{ ok: boolean; resultado?: unknown; erro?: string }>(`/console/tools/${testar!.id}/testar`, { arguments: args });
    },
    onSuccess: (r) => setTestOut(r.ok ? (typeof r.resultado === "string" ? r.resultado : JSON.stringify(r.resultado, null, 2)) : `Erro: ${r.erro}`),
    onError: (e) => setTestOut(`Erro: ${(e as Error).message}`),
  });

  if (!mcp) return <p className="muted">Carregando…</p>;

  return (
    <>
      <PageHead
        crumbs={<><Link to="/console/mcps">MCPs & modelos</Link> › {mcp.nome}</>}
        title={`🔌 ${mcp.nome}`}
        description={mcp.proposito || mcp.descricao || mcp.sistema}
        actions={
          <>
            <Button onClick={() => setNovo(true)}>+ Nova tool</Button>
            <Button variant="primary" onClick={() => gerar.mutate()}>{gerar.isPending ? "Gerando…" : mcp.slug ? "Regerar com IA" : "Gerar MCP com IA"}</Button>
          </>
        }
      />

      <div className="grid g2" style={{ alignItems: "start", marginBottom: 8 }}>
        <Card pad>
          <h3>Servidor MCP</h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
            <Chip tone={mcp.escopo === "global" ? "blue" : "neutral"}>{mcp.escopo}</Chip>
            <Chip tone={mcp.slug ? "good" : "neutral"}>{mcp.slug ? "vivo" : "não gerado"}</Chip>
            <Chip tone="neutral">{mcp.tools.length} tool(s)</Chip>
          </div>
          {mcp.endpoint ? (
            <>
              <p className="sub" style={{ marginBottom: 4 }}>Endpoint (JSON-RPC 2.0 · POST):</p>
              <div className="prompt-box" style={{ userSelect: "all" }}>{mcp.endpoint}</div>
              <p className="sub" style={{ marginTop: 8 }}>Métodos: <code>initialize</code> · <code>tools/list</code> · <code>tools/call</code>. Gerado em {mcp.geradoEm ? new Date(mcp.geradoEm).toLocaleString("pt-BR") : "—"}.</p>
            </>
          ) : (
            <p className="empty-note">Cadastre as tools e clique em <b>Gerar MCP com IA</b> — a IA cria os schemas de entrada e os handlers, e o servidor passa a responder ao vivo.</p>
          )}
        </Card>
        <Card pad>
          <h3>Como funciona</h3>
          <ol className="sub" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Cadastre cada <b>tool</b> descrevendo o que faz e seus parâmetros.</li>
            <li>Escolha a execução: <b>IA</b> (o modelo resolve a partir do prompt) ou <b>HTTP</b> (chama uma API real).</li>
            <li>Clique em <b>Gerar</b> — a IA compõe o manifesto, os JSON Schemas e os handlers.</li>
            <li>O MCP fica <b>vivo</b> no endpoint e pode ser plugado por qualquer cliente MCP.</li>
          </ol>
        </Card>
      </div>

      {mcp.url && (
        <div style={{ marginBottom: 8 }}>
          <RemoteMcpTester url={mcp.url} />
        </div>
      )}

      <div className="sec-title">Tools registradas</div>
      {mcp.tools.length === 0 && <p className="empty-note">Nenhuma tool ainda. Comece por <b>+ Nova tool</b>.</p>}
      <div className="grid g2">
        {mcp.tools.map((t) => (
          <Card key={t.id} pad>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ flex: 1 }}>{t.nome}</h3>
              <Chip tone={t.execucao === "http" ? "blue" : "neutral"}>{t.execucao === "http" ? "HTTP" : "IA"}</Chip>
              <span className={`perm ${t.permissao}`}>{t.permissao}</span>
            </div>
            <p className="sub">{t.descricao}</p>
            {t.parametros && <p className="sub" style={{ marginTop: 4 }}><b>Params:</b> {t.parametros}</p>}
            {t.inputSchema && (
              <div className="prompt-box" style={{ marginTop: 8, maxHeight: 120, overflow: "auto" }}>{JSON.stringify(t.inputSchema, null, 2)}</div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Button onClick={() => { setTestar(t); setTestArgs("{}"); setTestOut(""); }}>Testar</Button>
              <Button onClick={() => confirm(`Remover a tool "${t.nome}"?`) && removerTool.mutate(t.id)}>Remover</Button>
            </div>
          </Card>
        ))}
      </div>

      {novo && (
        <Modal
          title="Nova tool"
          subtitle="Descreva o que a tool faz e seus parâmetros — a IA transforma isso em schema e handler ao gerar o MCP."
          onClose={() => setNovo(false)}
          foot={<><Button onClick={() => setNovo(false)}>Cancelar</Button><Button variant="primary" onClick={() => nome.length >= 2 && criarTool.mutate()}>{criarTool.isPending ? "Salvando…" : "Cadastrar tool"}</Button></>}
        >
          <div className="fld-row">
            <Fld label="Nome (identificador)"><input className="in" value={nome} onChange={(e) => setNome(e.target.value.replace(/\s+/g, "_"))} placeholder="ex.: cotacao_atual" /></Fld>
            <Fld label="Permissão">
              <select className="in" value={permissao} onChange={(e) => setPermissao(e.target.value)}>
                <option value="leitura">leitura</option>
                <option value="escrita">escrita</option>
                <option value="critica">crítica (checkpoint humano)</option>
              </select>
            </Fld>
          </div>
          <Fld label="O que a tool faz"><input className="in" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Busca a cotação atual de uma moeda" /></Fld>
          <Fld label="Parâmetros (linguagem natural)"><textarea className="in" rows={2} value={parametros} onChange={(e) => setParametros(e.target.value)} placeholder="moeda (código, obrigatório), base (moeda base, opcional)" /></Fld>
          <Fld label="Execução">
            <select className="in" value={execucao} onChange={(e) => setExecucao(e.target.value)}>
              <option value="ia">IA — o modelo resolve a partir do prompt gerado</option>
              <option value="http">HTTP — chama uma API real</option>
            </select>
          </Fld>
          {execucao === "http" && (
            <>
              <div className="fld-row">
                <Fld label="Método">
                  <select className="in" value={httpMetodo} onChange={(e) => setHttpMetodo(e.target.value)}>
                    {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Fld>
                <Fld label="URL (use {{param}} para interpolar)"><input className="in" value={httpUrl} onChange={(e) => setHttpUrl(e.target.value)} placeholder="https://api.exemplo.com/rate?symbol={{moeda}}" /></Fld>
              </div>
              <Fld label="Headers (JSON, opcional)"><textarea className="in" rows={2} value={httpHeaders} onChange={(e) => setHttpHeaders(e.target.value)} placeholder='{"authorization":"Bearer ..."}' /></Fld>
              <Fld label="Body template (opcional, use {{param}})"><textarea className="in" rows={2} value={httpBody} onChange={(e) => setHttpBody(e.target.value)} placeholder='{"symbol":"{{moeda}}"}' /></Fld>
            </>
          )}
        </Modal>
      )}

      {testar && (
        <Modal
          title={`Testar: ${testar.nome}`}
          subtitle="Executa a tool exatamente como o endpoint MCP faria (tools/call)."
          onClose={() => setTestar(null)}
          foot={<><Button onClick={() => setTestar(null)}>Fechar</Button><Button variant="primary" onClick={() => rodarTeste.mutate()}>{rodarTeste.isPending ? "Executando…" : "Executar"}</Button></>}
        >
          <Fld label="Argumentos (JSON)"><textarea className="in" rows={4} value={testArgs} onChange={(e) => setTestArgs(e.target.value)} /></Fld>
          {testOut && (
            <>
              <div className="sec-title" style={{ marginTop: 6 }}>Resultado</div>
              <div className="prompt-box" style={{ maxHeight: 240, overflow: "auto", whiteSpace: "pre-wrap" }}>{testOut}</div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
