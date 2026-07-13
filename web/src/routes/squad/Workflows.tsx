import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, del, post, put } from "../../lib/api";
import { Button, Chip, Fld, Modal, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

interface Agente { id: string; nome: string; papel: string; emoji: string | null }
interface McpRef { id: string; nome: string; sistema: string }
interface Wf { id: string; nome: string; descricao: string | null; status: string; passos: number; atualizadoEm: string }
interface RunRef { id: string; workflowId: string; titulo: string; status: string; criadoEm: string }
interface Lista { podeEditar: boolean; agentes: Agente[]; mcps: McpRef[]; workflows: Wf[]; runs: RunRef[]; semSquad?: boolean }

const STATUS: Record<string, { label: string; tone: "neutral" | "warn" | "good" | "crit" }> = {
  rascunho: { label: "Rascunho", tone: "neutral" },
  ativo: { label: "Ativo", tone: "good" },
  arquivado: { label: "Arquivado", tone: "neutral" },
  em_andamento: { label: "Em andamento", tone: "warn" },
  aguardando: { label: "Aguardando validação", tone: "warn" },
  concluido: { label: "Concluído", tone: "good" },
  cancelado: { label: "Cancelado", tone: "crit" },
};
const St = ({ s }: { s: string }) => <Chip tone={STATUS[s]?.tone ?? "neutral"}>{STATUS[s]?.label ?? s}</Chip>;

const TIPOS: Record<string, { emoji: string; label: string }> = {
  agente: { emoji: "🤖", label: "Agente (IA)" },
  validacao: { emoji: "✋", label: "Validação humana" },
  mcp: { emoji: "🔌", label: "Acionar MCP" },
};

/* ============================ Lista ============================ */
export default function Workflows() {
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery<Lista>({ queryKey: ["workflows"], queryFn: () => api("/workflows") });

  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState(""); const [desc, setDesc] = useState("");
  const criar = useMutation({
    mutationFn: () => post<{ id: string }>("/workflows", { nome, descricao: desc || undefined }),
    onSuccess: (w) => { setNovo(false); setNome(""); setDesc(""); qc.invalidateQueries({ queryKey: ["workflows"] }); nav(`/squad/workflows/${w.id}`); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  if (data?.semSquad) return <PageHead title="Fluxos de trabalho" description="Entre em uma squad para montar fluxos de trabalho." />;

  return (
    <>
      <PageHead
        title="Fluxos de trabalho"
        description="Monte o que a squad faz como uma sequência de passos — agentes de IA e validações humanas no meio — e execute com gente no loop."
        actions={data?.podeEditar ? <Button variant="primary" onClick={() => setNovo(true)}>+ Novo fluxo</Button> : undefined}
      />

      {!data?.workflows.length && (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 34 }}>🧩</div>
          <h3 style={{ margin: "8px 0 4px" }}>Nenhum fluxo ainda</h3>
          <p className="sub">Crie um fluxo, encadeie passos de agente e coloque uma porta de validação humana onde precisar de aprovação.</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
        {data?.workflows.map((w) => (
          <Link key={w.id} to={`/squad/workflows/${w.id}`} className="card" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
              <strong>{w.nome}</strong><St s={w.status} />
            </div>
            {w.descricao && <p className="sub" style={{ margin: "6px 0 0" }}>{w.descricao}</p>}
            <div className="sub" style={{ marginTop: 10, fontSize: 12.5 }}>{w.passos} passo(s)</div>
          </Link>
        ))}
      </div>

      {!!data?.runs.length && (
        <>
          <h3 style={{ margin: "26px 0 10px" }}>Execuções recentes</h3>
          <div className="card" style={{ padding: 0 }}>
            {data.runs.map((r) => (
              <Link key={r.id} to={`/squad/workflows/runs/${r.id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "11px 14px", borderTop: "1px solid rgba(127,127,127,.14)", textDecoration: "none", color: "inherit" }}>
                <span>{r.titulo}</span><St s={r.status} />
              </Link>
            ))}
          </div>
        </>
      )}

      {novo && (
        <Modal title="Novo fluxo de trabalho" onClose={() => setNovo(false)} foot={<><Button onClick={() => setNovo(false)}>Cancelar</Button><Button variant="primary" onClick={() => nome.trim() && criar.mutate()}>Criar</Button></>}>
          <Fld label="Nome"><input className="in" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Descoberta de feature" /></Fld>
          <Fld label="Descrição (opcional)"><textarea className="in" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="O que este fluxo entrega?" /></Fld>
        </Modal>
      )}
    </>
  );
}

/* ============================ Builder ============================ */
interface Passo { id: string; ordem: number; tipo: string; nome: string; instrucao: string | null; agenteId: string | null; config: Record<string, unknown> | null }
interface Detalhe { podeEditar: boolean; agentes: Agente[]; mcps: McpRef[]; workflow: { id: string; nome: string; descricao: string | null; status: string }; passos: Passo[] }

export function WorkflowBuilder() {
  const { id = "" } = useParams();
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const key = ["workflow", id];
  const { data } = useQuery<Detalhe>({ queryKey: key, queryFn: () => api(`/workflows/${id}`) });
  const inval = () => qc.invalidateQueries({ queryKey: key });
  const podeEditar = data?.podeEditar;

  const [addOpen, setAddOpen] = useState(false);
  const [edit, setEdit] = useState<Passo | null>(null);
  const [tipo, setTipo] = useState("agente");
  const [pNome, setPNome] = useState(""); const [pInstr, setPInstr] = useState("");
  const [pAgente, setPAgente] = useState(""); const [pMcp, setPMcp] = useState("");

  const abrirAdd = () => { setEdit(null); setTipo("agente"); setPNome(""); setPInstr(""); setPAgente(data?.agentes[0]?.id ?? ""); setPMcp(data?.mcps[0]?.id ?? ""); setAddOpen(true); };
  const abrirEdit = (p: Passo) => { setEdit(p); setTipo(p.tipo); setPNome(p.nome); setPInstr(p.instrucao ?? ""); setPAgente(p.agenteId ?? data?.agentes[0]?.id ?? ""); setPMcp((p.config as any)?.mcpId ?? data?.mcps[0]?.id ?? ""); setAddOpen(true); };

  const payloadPasso = () => ({
    tipo, nome: pNome, instrucao: pInstr || undefined,
    agenteId: tipo === "agente" ? (pAgente || null) : null,
    config: tipo === "mcp" ? { mcpId: pMcp } : null,
  });
  const salvarPasso = useMutation({
    mutationFn: () => edit ? put(`/workflows/passos/${edit.id}`, payloadPasso()) : post(`/workflows/${id}/passos`, payloadPasso()),
    onSuccess: () => { setAddOpen(false); inval(); toast(edit ? "✏️ Passo atualizado" : "➕ Passo adicionado"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });
  const removerPasso = useMutation({ mutationFn: (pid: string) => del(`/workflows/passos/${pid}`), onSuccess: () => { inval(); toast("🗑️ Passo removido"); } });
  const reordenar = useMutation({ mutationFn: (ids: string[]) => post(`/workflows/${id}/reordenar`, { ids }), onSuccess: inval });
  const salvarMeta = useMutation({ mutationFn: (b: any) => put(`/workflows/${id}`, b), onSuccess: inval, onError: (e) => toast(`⚠️ ${(e as Error).message}`) });
  const excluir = useMutation({ mutationFn: () => del(`/workflows/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["workflows"] }); nav("/squad/workflows"); } });

  const mover = (idx: number, dir: -1 | 1) => {
    if (!data) return;
    const ids = data.passos.map((p) => p.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    reordenar.mutate(ids);
  };

  const [execOpen, setExecOpen] = useState(false);
  const [titulo, setTitulo] = useState(""); const [entrada, setEntrada] = useState("");
  const executar = useMutation({
    mutationFn: () => post<{ runId: string }>(`/workflows/${id}/executar`, { titulo: titulo || undefined, entrada: entrada || undefined }),
    onSuccess: (r) => { setExecOpen(false); setEntrada(""); nav(`/squad/workflows/runs/${r.runId}`); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  if (!data) return <PageHead title="Fluxo" description="Carregando…" />;
  const nomeAgente = (aid: string | null) => data.agentes.find((a) => a.id === aid);

  return (
    <>
      <PageHead
        title={data.workflow.nome}
        description={data.workflow.descricao ?? "Monte os passos e execute o fluxo."}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Link to="/squad/workflows" className="btn">← Fluxos</Link>
            {podeEditar && <Button variant="primary" onClick={() => { setTitulo(data.workflow.nome); setExecOpen(true); }}>▶ Executar</Button>}
          </div>
        }
      />

      {podeEditar && (
        <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label className="sub">Status:</label>
          <select className="in" style={{ maxWidth: 180 }} value={data.workflow.status} onChange={(e) => salvarMeta.mutate({ status: e.target.value })}>
            <option value="rascunho">Rascunho</option><option value="ativo">Ativo</option><option value="arquivado">Arquivado</option>
          </select>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={() => confirm("Excluir este fluxo e suas execuções?") && excluir.mutate()}>Excluir fluxo</button>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        {!data.passos.length && <p className="sub">Nenhum passo ainda. Adicione o primeiro passo do fluxo.</p>}
        {data.passos.map((p, i) => (
          <div key={p.id} className="card" style={{ display: "flex", gap: 12, alignItems: "start", marginBottom: 8 }}>
            <div style={{ fontSize: 22, lineHeight: 1.4 }}>{TIPOS[p.tipo]?.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong>{i + 1}. {p.nome}</strong>
                <Chip tone="neutral">{TIPOS[p.tipo]?.label ?? p.tipo}</Chip>
                {p.tipo === "agente" && p.agenteId && <span className="sub" style={{ fontSize: 12.5 }}>{nomeAgente(p.agenteId)?.emoji ?? "🤖"} {nomeAgente(p.agenteId)?.nome}</span>}
                {p.tipo === "mcp" && <span className="sub" style={{ fontSize: 12.5 }}>{data.mcps.find((m) => m.id === (p.config as any)?.mcpId)?.nome ?? "MCP"}</span>}
              </div>
              {p.instrucao && <p className="sub" style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{p.instrucao}</p>}
            </div>
            {podeEditar && (
              <div style={{ display: "flex", gap: 4 }}>
                <button className="btn" onClick={() => mover(i, -1)} disabled={i === 0}>↑</button>
                <button className="btn" onClick={() => mover(i, 1)} disabled={i === data.passos.length - 1}>↓</button>
                <button className="btn" onClick={() => abrirEdit(p)}>✏️</button>
                <button className="btn" onClick={() => removerPasso.mutate(p.id)}>🗑️</button>
              </div>
            )}
          </div>
        ))}
        {podeEditar && <Button onClick={abrirAdd}>+ Passo</Button>}
      </div>

      {addOpen && (
        <Modal
          title={edit ? "Editar passo" : "Novo passo"}
          subtitle="Um passo é um agente que roda a IA, uma validação humana que pausa o fluxo, ou o acionamento de um MCP."
          onClose={() => setAddOpen(false)}
          foot={<><Button onClick={() => setAddOpen(false)}>Cancelar</Button><Button variant="primary" onClick={() => pNome.trim() && salvarPasso.mutate()}>{edit ? "Salvar" : "Adicionar"}</Button></>}
        >
          <Fld label="Tipo de passo">
            <select className="in" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
            </select>
          </Fld>
          <Fld label="Nome do passo"><input className="in" value={pNome} onChange={(e) => setPNome(e.target.value)} placeholder="Ex.: Gerar brief de descoberta" /></Fld>
          {tipo === "agente" && (
            <Fld label="Agente">
              <select className="in" value={pAgente} onChange={(e) => setPAgente(e.target.value)}>
                {data.agentes.map((a) => <option key={a.id} value={a.id}>{a.emoji ?? "🤖"} {a.nome} — {a.papel}</option>)}
              </select>
            </Fld>
          )}
          {tipo === "mcp" && (
            <Fld label="MCP">
              {data.mcps.length ? (
                <select className="in" value={pMcp} onChange={(e) => setPMcp(e.target.value)}>
                  {data.mcps.map((m) => <option key={m.id} value={m.id}>{m.nome} ({m.sistema})</option>)}
                </select>
              ) : <p className="sub">Nenhum MCP disponível. Registre/aprove um MCP em Tools &amp; MCPs.</p>}
            </Fld>
          )}
          <Fld label={tipo === "validacao" ? "Orientação para quem valida" : tipo === "mcp" ? "Objetivo (o agente escolhe as ações do MCP)" : "O que o agente deve fazer"}>
            <textarea className="in" rows={4} value={pInstr} onChange={(e) => setPInstr(e.target.value)}
              placeholder={tipo === "validacao" ? "O que a pessoa deve conferir antes de aprovar?" : "Instrução em linguagem natural. Pode referenciar o resultado dos passos anteriores."} />
          </Fld>
        </Modal>
      )}

      {execOpen && (
        <Modal title="Executar fluxo" subtitle="Os passos de agente rodam automaticamente; nas validações humanas o fluxo pausa para você aprovar." onClose={() => setExecOpen(false)}
          foot={<><Button onClick={() => setExecOpen(false)}>Cancelar</Button><Button variant="primary" onClick={() => executar.mutate()}>{executar.isPending ? "Executando…" : "▶ Iniciar"}</Button></>}>
          <Fld label="Título da execução"><input className="in" value={titulo} onChange={(e) => setTitulo(e.target.value)} /></Fld>
          <Fld label="Entrada / contexto (opcional)"><textarea className="in" rows={4} value={entrada} onChange={(e) => setEntrada(e.target.value)} placeholder="Informação inicial que os passos vão usar. Ex.: a feature, o objetivo, links…" /></Fld>
        </Modal>
      )}
    </>
  );
}

/* ============================ Run ============================ */
interface RunPasso { id: string; ordem: number; tipo: string; nome: string; agenteNome: string | null; instrucao: string | null; status: string; saida: { resumo?: string } | null; comentario: string | null }
interface RunDet { podeEditar: boolean; run: { id: string; titulo: string; entrada: string | null; status: string; workflowId: string; workflowNome: string; criadoEm: string }; passos: RunPasso[] }

const RUN_ST: Record<string, { emoji: string; label: string }> = {
  pendente: { emoji: "⏳", label: "Pendente" },
  em_execucao: { emoji: "⚙️", label: "Executando" },
  concluido: { emoji: "✅", label: "Concluído" },
  aguardando: { emoji: "✋", label: "Aguardando você" },
  aprovado: { emoji: "✅", label: "Aprovado" },
  rejeitado: { emoji: "⛔", label: "Rejeitado" },
};

export function WorkflowRun() {
  const { id = "" } = useParams();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ["workflow-run", id];
  const { data } = useQuery<RunDet>({ queryKey: key, queryFn: () => api(`/workflows/runs/${id}`) });
  const [coment, setComent] = useState("");
  const validar = useMutation({
    mutationFn: (decisao: "aprovar" | "rejeitar") => post(`/workflows/runs/${id}/validar`, { decisao, comentario: coment || undefined }),
    onSuccess: () => { setComent(""); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  if (!data) return <PageHead title="Execução" description="Carregando…" />;

  return (
    <>
      <PageHead
        title={data.run.titulo}
        description={`Execução de ${data.run.workflowNome}`}
        actions={<div style={{ display: "flex", gap: 8, alignItems: "center" }}><St s={data.run.status} /><Link to={`/squad/workflows/${data.run.workflowId}`} className="btn">Ver fluxo</Link><Link to="/squad/workflows" className="btn">← Fluxos</Link></div>}
      />

      {data.run.entrada && (
        <div className="card"><div className="sub" style={{ fontSize: 12.5, marginBottom: 4 }}>Entrada</div><div style={{ whiteSpace: "pre-wrap" }}>{data.run.entrada}</div></div>
      )}

      <div style={{ marginTop: 14 }}>
        {data.passos.map((p, i) => {
          const st = RUN_ST[p.status] ?? { emoji: "•", label: p.status };
          const aguardando = p.status === "aguardando";
          return (
            <div key={p.id} className="card" style={{ marginBottom: 8, borderLeft: aguardando ? "3px solid var(--accent, #2563eb)" : undefined }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 18 }}>{TIPOS[p.tipo]?.emoji}</span>
                <strong>{i + 1}. {p.nome}</strong>
                <Chip tone={p.status === "rejeitado" ? "crit" : p.status === "concluido" || p.status === "aprovado" ? "good" : aguardando ? "warn" : "neutral"}>{st.label}</Chip>
                {p.agenteNome && <span className="sub" style={{ fontSize: 12.5 }}>{p.agenteNome}</span>}
              </div>
              {p.instrucao && p.tipo !== "validacao" && <p className="sub" style={{ margin: "6px 0 0", fontSize: 12.5 }}>{p.instrucao}</p>}
              {p.saida?.resumo && <div style={{ marginTop: 8, whiteSpace: "pre-wrap", background: "var(--card-2, rgba(127,127,127,.10))", padding: "10px 12px", borderRadius: 8, lineHeight: 1.55 }}>{p.saida.resumo}</div>}
              {p.comentario && <p className="sub" style={{ margin: "6px 0 0", fontSize: 12.5 }}>💬 {p.comentario}</p>}

              {aguardando && data.podeEditar && (
                <div style={{ marginTop: 12, borderTop: "1px solid rgba(127,127,127,.16)", paddingTop: 12 }}>
                  {p.instrucao && <p className="sub" style={{ marginTop: 0 }}>{p.instrucao}</p>}
                  <textarea className="in" rows={2} value={coment} onChange={(e) => setComent(e.target.value)} placeholder="Comentário (opcional)" style={{ marginBottom: 8 }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button variant="primary" onClick={() => validar.mutate("aprovar")}>{validar.isPending ? "…" : "✓ Aprovar e continuar"}</Button>
                    <button className="btn" onClick={() => validar.mutate("rejeitar")}>✕ Rejeitar</button>
                  </div>
                </div>
              )}
              {aguardando && !data.podeEditar && <p className="sub" style={{ marginTop: 8 }}>Aguardando validação de um responsável (PM/Tech Lead).</p>}
            </div>
          );
        })}
      </div>

      {data.run.status === "concluido" && <div className="card" style={{ textAlign: "center" }}>✅ Fluxo concluído.</div>}
      {data.run.status === "cancelado" && <div className="card" style={{ textAlign: "center" }}>⛔ Fluxo cancelado na validação.</div>}
    </>
  );
}
