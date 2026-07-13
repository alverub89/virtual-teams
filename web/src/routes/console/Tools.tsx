import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, del, post } from "../../lib/api";
import { Button, Card, Chip, Fld, Modal, PageHead } from "../../components/ui";
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
  origem: string | null; // null = avulsa; senão nome do MCP
  agentes: number;
}

export default function Tools() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: tools } = useQuery<Tool[]>({ queryKey: ["tools"], queryFn: () => api("/console/tools") });

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
  const [testOut, setTestOut] = useState("");

  const resetForm = () => {
    setNome(""); setDescricao(""); setPermissao("leitura"); setExecucao("ia");
    setParametros(""); setHttpMetodo("GET"); setHttpUrl(""); setHttpHeaders(""); setHttpBody("");
  };

  const invalidar = () => { qc.invalidateQueries({ queryKey: ["tools"] }); qc.invalidateQueries({ queryKey: ["agentes"] }); };

  const criar = useMutation({
    mutationFn: () => {
      let handlerConfig: Record<string, unknown> | undefined;
      if (execucao === "http") {
        let headers: Record<string, string> = {};
        try { headers = httpHeaders.trim() ? JSON.parse(httpHeaders) : {}; } catch { throw new Error("Headers precisam ser JSON válido"); }
        handlerConfig = { metodo: httpMetodo, url: httpUrl, headers, ...(httpBody.trim() ? { body: httpBody } : {}) };
      }
      return post(`/console/tools`, { nome, descricao, permissao, execucao, parametros, handlerConfig }); // sem conexaoMcpId = avulsa
    },
    onSuccess: () => { invalidar(); setNovo(false); resetForm(); toast("🔧 Tool criada — já pode plugar num agente"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const remover = useMutation({
    mutationFn: (id: string) => del(`/console/tools/${id}`),
    onSuccess: () => { invalidar(); toast("🗑️ Tool removida"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const gerarSchema = useMutation({
    mutationFn: (id: string) => post(`/console/tools/${id}/gerar-schema`),
    onSuccess: () => { invalidar(); toast("✨ Schema gerado com IA"); },
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

  const avulsas = tools?.filter((t) => !t.origem) ?? [];
  const deMcp = tools?.filter((t) => t.origem) ?? [];

  const cardTool = (t: Tool) => (
    <Card key={t.id} pad>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h3 style={{ flex: 1 }}>{t.nome}</h3>
        <Chip tone={t.execucao === "http" ? "blue" : "neutral"}>{t.execucao === "http" ? "HTTP" : "IA"}</Chip>
        <span className={`perm ${t.permissao}`}>{t.permissao}</span>
      </div>
      <p className="sub">{t.descricao}</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
        {t.origem ? <Chip tone="neutral">via {t.origem}</Chip> : <Chip tone="good">avulsa</Chip>}
        <Chip tone="neutral">{t.agentes} agente(s)</Chip>
        {t.inputSchema && <Chip tone="blue">schema ✓</Chip>}
      </div>
      {t.parametros && <p className="sub" style={{ marginTop: 6 }}><b>Params:</b> {t.parametros}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <Button onClick={() => { setTestar(t); setTestArgs("{}"); setTestOut(""); }}>Testar</Button>
        {!t.origem && <Button onClick={() => gerarSchema.mutate(t.id)}>{gerarSchema.isPending ? "Gerando…" : "Gerar schema (IA)"}</Button>}
        {!t.origem && <Button onClick={() => confirm(`Remover a tool "${t.nome}"?`) && remover.mutate(t.id)}>Remover</Button>}
      </div>
    </Card>
  );

  return (
    <>
      <PageHead
        title="Tools do ambiente"
        description="Tools avulsas cadastradas direto no ambiente — plugue em qualquer agente sem precisar de um MCP. Também lista as tools que vieram dos MCPs."
        actions={
          <>
            <Link to="/console/agentes" className="btn" style={{ textDecoration: "none" }}>Agentes</Link>
            <Button variant="primary" onClick={() => setNovo(true)}>+ Nova tool</Button>
          </>
        }
      />

      <div className="banner" style={{ marginBottom: 10 }}>
        🔧 <span>Uma tool avulsa aparece no catálogo de <b>Agentes</b> (marcada como “interno”) e pode ser atribuída a qualquer agente. Se quiser expô-la também num servidor MCP, cadastre-a dentro de um MCP em <Link to="/console/mcps">MCPs</Link>.</span>
      </div>

      <div className="sec-title">Avulsas (do ambiente)</div>
      {avulsas.length === 0 && <p className="empty-note">Nenhuma tool avulsa ainda. Crie a primeira em <b>+ Nova tool</b>.</p>}
      <div className="grid g2">{avulsas.map(cardTool)}</div>

      {deMcp.length > 0 && (
        <>
          <div className="sec-title" style={{ marginTop: 16 }}>Vindas de MCPs</div>
          <div className="grid g2">{deMcp.map(cardTool)}</div>
        </>
      )}

      {novo && (
        <Modal
          title="Nova tool do ambiente"
          subtitle="Descreva o que faz e os parâmetros. Depois é só atribuir a um agente (e opcionalmente gerar o schema com IA)."
          onClose={() => setNovo(false)}
          foot={<><Button onClick={() => setNovo(false)}>Cancelar</Button><Button variant="primary" onClick={() => nome.length >= 2 && criar.mutate()}>{criar.isPending ? "Salvando…" : "Criar tool"}</Button></>}
        >
          <div className="fld-row">
            <Fld label="Nome (identificador)"><input className="in" value={nome} onChange={(e) => setNome(e.target.value.replace(/\s+/g, "_"))} placeholder="ex.: buscar_cliente" /></Fld>
            <Fld label="Permissão">
              <select className="in" value={permissao} onChange={(e) => setPermissao(e.target.value)}>
                <option value="leitura">leitura</option>
                <option value="escrita">escrita</option>
                <option value="critica">crítica (checkpoint humano)</option>
              </select>
            </Fld>
          </div>
          <Fld label="O que a tool faz"><input className="in" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Busca um cliente pelo CPF na base" /></Fld>
          <Fld label="Parâmetros (linguagem natural)"><textarea className="in" rows={2} value={parametros} onChange={(e) => setParametros(e.target.value)} placeholder="cpf (obrigatório), incluir_historico (opcional)" /></Fld>
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
                <Fld label="URL (use {{param}} para interpolar)"><input className="in" value={httpUrl} onChange={(e) => setHttpUrl(e.target.value)} placeholder="https://api.exemplo.com/clientes/{{cpf}}" /></Fld>
              </div>
              <Fld label="Headers (JSON, opcional)"><textarea className="in" rows={2} value={httpHeaders} onChange={(e) => setHttpHeaders(e.target.value)} placeholder='{"authorization":"Bearer ..."}' /></Fld>
              <Fld label="Body template (opcional, use {{param}})"><textarea className="in" rows={2} value={httpBody} onChange={(e) => setHttpBody(e.target.value)} placeholder='{"cpf":"{{cpf}}"}' /></Fld>
            </>
          )}
        </Modal>
      )}

      {testar && (
        <Modal
          title={`Testar: ${testar.nome}`}
          subtitle="Executa a tool como um agente/MCP faria."
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
