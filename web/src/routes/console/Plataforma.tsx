import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, del, post, put } from "../../lib/api";
import { Button, Card, Chip, Fld, Modal, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

/* ==================== Blueprints (Arquitetura & padrões) ==================== */

interface Blueprint { id: string; nome: string; descricao: string | null; guardRails: string[] }

export function Blueprints() {
  const toast = useToast();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [rails, setRails] = useState("");

  const { data } = useQuery<Blueprint[]>({ queryKey: ["blueprints"], queryFn: () => api("/console/blueprints") });

  const criar = useMutation({
    mutationFn: () => post("/console/blueprints", { nome, descricao, guardRails: rails.split("\n").map((r) => r.trim()).filter(Boolean) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["blueprints"] }); setAberto(false); setNome(""); setDescricao(""); setRails(""); toast("🏛️ Blueprint criado"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });
  const remover = useMutation({
    mutationFn: (id: string) => del(`/console/blueprints/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["blueprints"] }); toast("🗑️ Removido"); },
  });

  return (
    <>
      <PageHead
        title="Arquitetura & padrões"
        description="Blueprints herdados por todas as squads. Os guard-rails aqui valem para pessoas e agentes."
        actions={<Button variant="primary" onClick={() => setAberto(true)}>+ Novo blueprint</Button>}
      />
      <div className="grid g3">
        {data?.map((b) => (
          <Card key={b.id} pad>
            <h3>🏛️ {b.nome}</h3>
            <p className="sub">{b.descricao}</p>
            <div className="sec-title" style={{ margin: "12px 0 6px" }}>Guard-rails</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {b.guardRails.map((g) => <span key={g} className="pill">🛡️ {g}</span>)}
            </div>
            <div style={{ marginTop: 10 }}>
              <Button onClick={() => confirm(`Remover "${b.nome}"?`) && remover.mutate(b.id)}>Remover</Button>
            </div>
          </Card>
        ))}
      </div>

      {aberto && (
        <Modal title="Novo blueprint" onClose={() => setAberto(false)}
          foot={<><Button onClick={() => setAberto(false)}>Cancelar</Button><Button variant="primary" onClick={() => nome.length >= 2 && criar.mutate()}>{criar.isPending ? "Criando…" : "Criar"}</Button></>}>
          <Fld label="Nome"><input className="in" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Microserviço Java padrão" /></Fld>
          <Fld label="Descrição"><input className="in" value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Fld>
          <Fld label="Guard-rails (um por linha)"><textarea className="in" rows={5} value={rails} onChange={(e) => setRails(e.target.value)} placeholder={"Idempotência em toda operação financeira\nPII mascarada em logs e prompts"} /></Fld>
        </Modal>
      )}
    </>
  );
}

/* ==================== Métodos ==================== */

interface Etapa { id?: string; nome: string; agenteNome?: string | null; agenteId?: string | null; descricao?: string | null; tipo?: string; instrucao?: string | null; config?: { minSaidas?: number; maxSaidas?: number; iteracoes?: number } | null }
interface Metodo { id: string; nome: string; descricao: string | null; escopo: string; ativo: boolean; etapas: Etapa[] }
interface AgenteMin { id: string; nome: string; emoji: string | null }
interface Template { nome: string; fases: { nome: string; gera?: string; checkpoint?: boolean }[] }

type FaseForm = { nome: string; agenteId: string; gera: string; checkpoint: boolean; instrucao: string; minSaidas: string; maxSaidas: string };

export function Metodos() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery<Metodo[]>({ queryKey: ["metodos"], queryFn: () => api("/console/metodos") });
  const { data: agentes } = useQuery<AgenteMin[]>({ queryKey: ["agentes"], queryFn: () => api("/console/agentes") });
  const { data: templates } = useQuery<Template[]>({ queryKey: ["metodo-templates"], queryFn: () => api("/console/metodo-templates") });

  const [edit, setEdit] = useState<Metodo | "novo" | null>(null);
  const [nome, setNome] = useState("");
  const [escopo, setEscopo] = useState("publico");
  const [fases, setFases] = useState<FaseForm[]>([]);

  const ag0 = () => agentes?.[0]?.id ?? "";
  const faseVazia = (): FaseForm => ({ nome: "", agenteId: ag0(), gera: "", checkpoint: false, instrucao: "", minSaidas: "", maxSaidas: "" });
  const abrirNovo = () => { setEdit("novo"); setNome(""); setEscopo("publico"); setFases([faseVazia()]); };
  const abrirEdit = (m: Metodo) => {
    setEdit(m); setNome(m.nome); setEscopo(m.escopo);
    setFases(m.etapas.map((e) => ({ nome: e.nome, agenteId: e.agenteId ?? ag0(), gera: e.descricao ?? "", checkpoint: e.tipo === "checkpoint", instrucao: e.instrucao ?? "", minSaidas: e.config?.minSaidas ? String(e.config.minSaidas) : "", maxSaidas: e.config?.maxSaidas ? String(e.config.maxSaidas) : "" })));
  };
  const usarTemplate = (t: Template) => {
    if (!nome) setNome(t.nome);
    setFases(t.fases.map((f) => ({ ...faseVazia(), nome: f.nome, gera: f.gera ?? "", checkpoint: !!f.checkpoint })));
  };
  const setFase = (i: number, p: Partial<FaseForm>) => setFases((a) => a.map((f, j) => (j === i ? { ...f, ...p } : f)));

  const salvar = useMutation({
    mutationFn: () => {
      const body = { nome, escopo, etapas: fases.filter((f) => f.nome.trim()).map((f) => {
        const min = parseInt(f.minSaidas, 10); const max = parseInt(f.maxSaidas, 10);
        const config = (!isNaN(min) || !isNaN(max)) ? { ...(isNaN(min) ? {} : { minSaidas: min }), ...(isNaN(max) ? {} : { maxSaidas: max }) } : undefined;
        return { nome: f.nome, agenteId: f.agenteId || undefined, gera: f.gera, checkpoint: f.checkpoint, instrucao: f.instrucao || undefined, config };
      }) };
      return edit === "novo" ? post("/console/metodos", body) : put(`/console/metodos/${(edit as Metodo).id}`, body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["metodos"] }); setEdit(null); toast("🧭 Método salvo"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });
  const remover = useMutation({
    mutationFn: (id: string) => del(`/console/metodos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["metodos"] }); toast("🗑️ Removido"); },
  });

  return (
    <>
      <PageHead
        title="Métodos"
        description="O passo a passo que as squads seguem. Crie métodos (públicos ou de uma comunidade), edite as fases e defina o agente e o que cada fase gera."
        actions={<Button variant="primary" onClick={abrirNovo}>+ Novo método</Button>}
      />
      {data?.length === 0 && <p className="empty-note">Nenhum método ainda — crie o primeiro (pode partir de um framework de mercado).</p>}
      {data?.map((m) => (
        <Card key={m.id} className="cfg-metodo" pad>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <h3>{m.nome} {m.ativo && <Chip tone="good">ativo</Chip>}</h3>
              <p className="sub">{m.descricao}</p>
            </div>
            <Chip tone={m.escopo === "publico" ? "blue" : "neutral"}>{m.escopo === "publico" ? "público" : "comunidade"}</Chip>
            <Button onClick={() => abrirEdit(m)}>Editar</Button>
            <Button onClick={() => confirm(`Remover "${m.nome}"?`) && remover.mutate(m.id)}>Remover</Button>
          </div>
          <div style={{ marginTop: 10 }}>
            {m.etapas.map((e, i) => (
              <div key={e.id ?? i} className="cfg-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
                <span className="icon-sq">{i + 1}</span>
                <div className="c-info"><b>{e.nome}</b><span>{e.descricao}</span></div>
                {e.tipo === "checkpoint" && <span className="hitl">checkpoint</span>}
                <Chip>{e.agenteNome ?? "—"}</Chip>
              </div>
            ))}
          </div>
        </Card>
      ))}

      {edit && (
        <Modal
          title={edit === "novo" ? "Novo método" : "Editar método"}
          subtitle="Parta de um framework de mercado ou monte do zero. Adicione/remova fases livremente."
          onClose={() => setEdit(null)}
          foot={<><Button onClick={() => setEdit(null)}>Cancelar</Button><Button variant="primary" onClick={() => nome.length >= 2 && fases.some((f) => f.nome.trim()) && salvar.mutate()}>{salvar.isPending ? "Salvando…" : "Salvar método"}</Button></>}
        >
          <div className="fld-row">
            <Fld label="Nome do método"><input className="in" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Método Itaú de Produto" /></Fld>
            <Fld label="Escopo">
              <select className="in" value={escopo} onChange={(e) => setEscopo(e.target.value)}>
                <option value="publico">Público (todas as comunidades)</option>
                <option value="comunidade">Só a minha comunidade</option>
              </select>
            </Fld>
          </div>
          {edit === "novo" && (
            <Fld label="Partir de um framework de mercado (opcional)">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {templates?.map((t) => <button key={t.nome} className="pill" onClick={() => usarTemplate(t)}>{t.nome}</button>)}
              </div>
            </Fld>
          )}
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>Fases</label>
          <div style={{ maxHeight: 320, overflowY: "auto", marginTop: 6 }}>
            {fases.map((f, i) => (
              <div key={i} className="card" style={{ padding: 10, marginBottom: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center" }}>
                  <input className="in" value={f.nome} onChange={(e) => setFase(i, { nome: e.target.value })} placeholder={`Fase ${i + 1}`} />
                  <select className="in" value={f.agenteId} onChange={(e) => setFase(i, { agenteId: e.target.value })}>
                    {agentes?.map((a) => <option key={a.id} value={a.id}>{a.emoji ?? "🤖"} {a.nome}</option>)}
                  </select>
                  <button className="modal-x" title="Remover fase" onClick={() => setFases((a) => a.filter((_, j) => j !== i))}>✕</button>
                </div>
                <input className="in" style={{ marginTop: 6 }} value={f.gera} onChange={(e) => setFase(i, { gera: e.target.value })} placeholder="O que esta fase gera" />
                <textarea className="in" style={{ marginTop: 6 }} rows={2} value={f.instrucao} onChange={(e) => setFase(i, { instrucao: e.target.value })} placeholder="Instrução do agente nesta etapa (opcional — sobrepõe o padrão)" />
                <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <label className="check-item" style={{ fontSize: 12 }}>
                    <input type="checkbox" checked={f.checkpoint} onChange={(e) => setFase(i, { checkpoint: e.target.checked })} /> checkpoint humano
                  </label>
                  <span className="sub" style={{ fontSize: 11.5 }}>Saídas (ex.: histórias):</span>
                  <input className="in" style={{ width: 70 }} type="number" min={1} value={f.minSaidas} onChange={(e) => setFase(i, { minSaidas: e.target.value })} placeholder="mín" />
                  <input className="in" style={{ width: 70 }} type="number" min={1} value={f.maxSaidas} onChange={(e) => setFase(i, { maxSaidas: e.target.value })} placeholder="máx" />
                </div>
              </div>
            ))}
          </div>
          <button className="btn" style={{ marginTop: 8 }} onClick={() => setFases((a) => [...a, faseVazia()])}>+ Adicionar fase</button>
        </Modal>
      )}
    </>
  );
}

/* ==================== Esteiras & GMUD ==================== */

interface IntegracoesResp {
  status: {
    github: { conectado: boolean; motivo: string };
    serviceNow: { conectado: boolean; motivo: string };
  };
  config: { githubOrg: string | null; githubRepoPadrao: string | null; githubWorkflow: string | null; serviceNowInstance: string | null };
}

export function EsteiraConfig() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery<IntegracoesResp>({ queryKey: ["integracoes"], queryFn: () => api("/console/integracoes") });
  const [org, setOrg] = useState<string | null>(null);
  const [repo, setRepo] = useState<string | null>(null);
  const [wf, setWf] = useState<string | null>(null);
  const [sn, setSn] = useState<string | null>(null);
  // Estado só é "não editado ainda" enquanto null; ao carregar, hidrata uma vez.
  const cfg = data?.config;
  const orgV = org ?? cfg?.githubOrg ?? "";
  const repoV = repo ?? cfg?.githubRepoPadrao ?? "";
  const wfV = wf ?? cfg?.githubWorkflow ?? "deploy.yml";
  const snV = sn ?? cfg?.serviceNowInstance ?? "";

  const salvar = useMutation({
    mutationFn: () => put("/console/integracoes", {
      githubOrg: orgV.trim() || null,
      githubRepoPadrao: repoV.trim() || null,
      githubWorkflow: wfV.trim() || "deploy.yml",
      serviceNowInstance: snV.trim() || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["integracoes"] }); toast("💾 Integrações salvas"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const gh = data?.status.github;
  const snStatus = data?.status.serviceNow;

  return (
    <>
      <PageHead title="Esteiras & GMUD" description="Gates de qualidade e integrações reais (GitHub Actions + ServiceNow). Configuração da comunidade — squads herdam." />

      <div className="grid g2" style={{ alignItems: "start" }}>
        <Card pad className="cfg-github">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="icon-sq">🐙</span>
            <div style={{ flex: 1 }}>
              <h3>GitHub Actions</h3>
              <p className="sub">Dispara a esteira real (workflow_dispatch) dos repositórios da squad.</p>
            </div>
            <Chip tone={gh?.conectado ? "good" : "warn"}>{gh?.conectado ? "conectado" : "não conectado"}</Chip>
          </div>
          <p className="sub" style={{ margin: "8px 0 12px" }}>🔑 {gh?.motivo ?? "…"}</p>
          <Fld label="Organização"><input className="in" value={orgV} onChange={(e) => setOrg(e.target.value)} placeholder="ex.: itau-meios" /></Fld>
          <Fld label="Repositório padrão"><input className="in" value={repoV} onChange={(e) => setRepo(e.target.value)} placeholder="ex.: split-service" /></Fld>
          <Fld label="Workflow (arquivo)"><input className="in" value={wfV} onChange={(e) => setWf(e.target.value)} placeholder="deploy.yml" /></Fld>
        </Card>

        <Card pad>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="icon-sq">🧾</span>
            <div style={{ flex: 1 }}>
              <h3>ServiceNow (GMUD)</h3>
              <p className="sub">Abre change requests reais ao promover para produção.</p>
            </div>
            <Chip tone={snStatus?.conectado ? "good" : "warn"}>{snStatus?.conectado ? "conectado" : "não conectado"}</Chip>
          </div>
          <p className="sub" style={{ margin: "8px 0 12px" }}>🔑 {snStatus?.motivo ?? "…"}</p>
          <Fld label="Instância ServiceNow"><input className="in" value={snV} onChange={(e) => setSn(e.target.value)} placeholder="ex.: itau (→ itau.service-now.com)" /></Fld>
          <div className="banner" style={{ marginTop: 12, fontSize: 12 }}>
            🔒 <span>As credenciais (tokens/senhas) ficam em variáveis de ambiente do servidor — nunca no banco. Sem elas, disparos ficam <b>pendentes</b> e a GMUD é registrada como rascunho local.</span>
          </div>
        </Card>
      </div>
      <div style={{ marginTop: 12 }}>
        <Button variant="primary" onClick={() => salvar.mutate()}>{salvar.isPending ? "Salvando…" : "💾 Salvar integrações"}</Button>
      </div>

      <div className="card card-pad" style={{ marginTop: 14 }}>
        <h3>Gates de qualidade (esteira padrão)</h3>
        <p className="sub" style={{ marginBottom: 10 }}>todo repositório conectado passa por estes gates</p>
        {[
          ["build", "Build reproduzível com cache"],
          ["testes", "Suíte completa · cobertura mínima 80%"],
          ["seguranca", "SAST + análise de dependências"],
          ["deploy_hml", "Deploy em homologação com smoke test"],
          ["gmud", "Mudança aprovada com evidências"],
          ["deploy_prod", "Deploy canário com rollback automático"],
        ].map(([k, d]) => (
          <div key={k} className="cfg-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <span className="icon-sq">⚙️</span>
            <div className="c-info"><b>{k.replace("_", " ")}</b><span>{d}</span></div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ==================== MCPs & modelos ==================== */

interface Mcp { id: string; nome: string; sistema: string; status: string; descricao: string | null; url: string | null; escopo: string; squadId: string | null; slug: string | null; proposito: string | null; tools: { id: string; nome: string; permissao: string }[] }
interface Rota { id: string; tarefa: string; nivel: string; modelo: string; custoRelativo: number }
interface Consumo { id: string; squadNome: string; promptTokens: number; completionTokens: number; custo: number; budget: number | null; percentual: number | null }
interface SquadMin { squads: { id: string; nome: string }[] }

export function Mcps() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: mcps } = useQuery<Mcp[]>({ queryKey: ["mcps"], queryFn: () => api("/console/mcps") });
  const { data: rotas } = useQuery<Rota[]>({ queryKey: ["modelos"], queryFn: () => api("/console/modelos") });
  const { data: consumo } = useQuery<Consumo[]>({ queryKey: ["consumo"], queryFn: () => api("/console/consumo") });
  const { data: setup } = useQuery<SquadMin>({ queryKey: ["console-setup"], queryFn: () => api("/console/setup") });

  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [sistema, setSistema] = useState("");
  const [url, setUrl] = useState("");
  const [escopo, setEscopo] = useState("global");
  const [squadId, setSquadId] = useState("");

  const criar = useMutation({
    mutationFn: () => post("/console/mcps", { nome, sistema, url: url || undefined, escopo, squadId: escopo === "squad" ? squadId || undefined : undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mcps"] }); setAberto(false); setNome(""); setSistema(""); setUrl(""); toast("🔌 Conexão MCP criada"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });
  const remover = useMutation({
    mutationFn: (id: string) => del(`/console/mcps/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mcps"] }); toast("🗑️ Removido"); },
  });

  return (
    <>
      <PageHead
        title="MCPs & modelos"
        description="Conexões MCP com os sistemas (globais ou por squad), o roteamento de modelos por tarefa e o consumo por squad."
        actions={<Button variant="primary" onClick={() => setAberto(true)}>+ Nova conexão MCP</Button>}
      />
      <div className="sec-title">Conexões MCP</div>
      <div className="grid g3" style={{ marginBottom: 8 }}>
        {mcps?.map((m) => (
          <Card key={m.id} pad>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ flex: 1 }}><Link to={`/console/mcps/${m.id}`} style={{ color: "inherit", textDecoration: "none" }}>{m.nome}</Link></h3>
              <Chip tone={m.status === "conectado" ? "good" : "neutral"}>{m.slug ? "vivo" : m.status}</Chip>
            </div>
            <p className="sub">{m.proposito || m.descricao || m.sistema}</p>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
              <Chip tone={m.escopo === "global" ? "blue" : "neutral"}>{m.escopo === "global" ? "global" : "squad"}</Chip>
              <Chip tone="neutral">{m.tools?.length ?? 0} tool(s)</Chip>
              {m.slug && <span className="perm leitura">/mcp/{m.slug}</span>}
              <button className="modal-x" style={{ marginLeft: "auto" }} title="Remover" onClick={() => confirm(`Remover "${m.nome}"?`) && remover.mutate(m.id)}>✕</button>
            </div>
            <Link to={`/console/mcps/${m.id}`} className="btn" style={{ textDecoration: "none", marginTop: 10, display: "inline-block" }}>Tools & gerar →</Link>
          </Card>
        ))}
      </div>
      <div className="banner" style={{ marginBottom: 8 }}>
        🔌 <span>Cadastre tools em cada MCP, gere o servidor com IA e ele passa a responder ao vivo em <code>/api/mcp/&lt;slug&gt;</code> (JSON-RPC: initialize · tools/list · tools/call).</span>
      </div>

      <div className="sec-title">Roteamento de modelos por tarefa</div>
      <div className="card" style={{ marginBottom: 8 }}>
        <table className="tbl">
          <thead><tr><th>Tarefa</th><th>Nível</th><th>Modelo</th><th>Custo</th></tr></thead>
          <tbody>
            {rotas?.map((r) => (
              <tr key={r.id}><td>{r.tarefa}</td><td><Chip tone={r.nivel === "avancado" ? "blue" : r.nivel === "leve" ? "neutral" : "warn"}>{r.nivel}</Chip></td><td className="mono">{r.modelo}</td><td className="num">{r.custoRelativo}×</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sec-title">Consumo por squad — mês atual</div>
      <div className="card card-pad">
        {consumo?.length === 0 && <p className="empty-note">Sem consumo registrado ainda.</p>}
        {consumo?.map((c) => (
          <div key={c.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, fontSize: 12.5, marginBottom: 4 }}>
              <b style={{ flex: 1 }}>{c.squadNome}</b>
              <span className="muted num">{((c.promptTokens + c.completionTokens) / 1e6).toFixed(2)}M · R$ {c.custo.toFixed(0)}{c.percentual != null && ` · ${c.percentual}%`}</span>
            </div>
            <div className="meter"><i className={c.percentual != null && c.percentual >= 80 ? "warn" : ""} style={{ width: `${Math.min(100, c.percentual ?? 0)}%` }} /></div>
          </div>
        ))}
      </div>

      {aberto && (
        <Modal title="Nova conexão MCP" onClose={() => setAberto(false)}
          foot={<><Button onClick={() => setAberto(false)}>Cancelar</Button><Button variant="primary" onClick={() => nome.length >= 2 && sistema.length >= 2 && criar.mutate()}>{criar.isPending ? "Criando…" : "Criar"}</Button></>}>
          <div className="fld-row">
            <Fld label="Nome"><input className="in" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: GitHub Enterprise" /></Fld>
            <Fld label="Sistema"><input className="in" value={sistema} onChange={(e) => setSistema(e.target.value)} placeholder="github" /></Fld>
          </div>
          <Fld label="URL do servidor MCP (opcional)"><input className="in" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.exemplo.com" /></Fld>
          <div className="fld-row">
            <Fld label="Escopo">
              <select className="in" value={escopo} onChange={(e) => setEscopo(e.target.value)}>
                <option value="global">Global (todas as squads)</option>
                <option value="squad">Só uma squad</option>
              </select>
            </Fld>
            {escopo === "squad" && (
              <Fld label="Squad">
                <select className="in" value={squadId} onChange={(e) => setSquadId(e.target.value)}>
                  <option value="">— selecionar —</option>
                  {setup?.squads.map((sq) => <option key={sq.id} value={sq.id}>{sq.nome}</option>)}
                </select>
              </Fld>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
