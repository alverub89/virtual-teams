import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post, useMe } from "../../lib/api";
import { Button, Chip, Fld, Modal, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

interface Run {
  id: string;
  objetivo: string;
  status: string;
  passoAtual: number;
  tokensGastos: number;
  tetoTokens: number;
  krDescricao: string | null;
  iniciativaCodigo: string | null;
  modo?: string;
  progresso?: string | null;
  totalEtapas?: number | null;
  criadoEm: string;
}
interface Elegivel { id: string; codigo: string; titulo: string; etapaAtual: number; etapasTotal: number }
interface RunDetalhe extends Run {
  passos: {
    id: string;
    ordem: number;
    nome: string;
    agenteNome: string | null;
    tipo: string;
    status: string;
    saida: { resumo?: string; itens?: string[]; revisao?: { nota: number; rodadas: number; problemas: string[] } | null } | null;
  }[];
  checkpoints: {
    id: string;
    passoOrdem: number;
    titulo: string;
    resumo: string | null;
    status: string;
    decisao: string | null;
  }[];
}

const STATUS_LABEL: Record<string, { label: string; tone: "blue" | "good" | "warn" | "crit" | "neutral" }> = {
  em_andamento: { label: "Em andamento", tone: "blue" },
  aguardando_aprovacao: { label: "Aguardando sua decisão", tone: "warn" },
  pausada: { label: "Pausada", tone: "neutral" },
  rejeitada: { label: "Rejeitada", tone: "crit" },
  cancelada: { label: "Cancelada", tone: "neutral" },
  concluida: { label: "Concluída", tone: "good" },
};

export default function Autonoma() {
  const { data: me } = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const [selId, setSelId] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [objetivo, setObjetivo] = useState("");
  const [krId, setKrId] = useState("");
  const [orqAberto, setOrqAberto] = useState(false);
  const [iniSel, setIniSel] = useState("");

  const emExecucao = (r?: { status: string } | null) => r?.status === "em_andamento";

  const { data: runs } = useQuery<Run[]>({
    queryKey: ["runs"],
    queryFn: () => api("/runs"),
    refetchInterval: (q) => (q.state.data?.some(emExecucao) ? 1500 : false),
  });
  const { data: run } = useQuery<RunDetalhe>({
    queryKey: ["run", selId],
    queryFn: () => api(`/runs/${selId}`),
    enabled: !!selId,
    refetchInterval: (q) => (emExecucao(q.state.data) ? 1200 : false),
  });
  const { data: okrs } = useQuery<{ escopo: string; krs: { id: string; descricao: string }[] }[]>({
    queryKey: ["okrs"],
    queryFn: () => api("/okrs"),
  });
  const krsSquad = okrs?.filter((o) => o.escopo === "squad").flatMap((o) => o.krs) ?? [];
  const { data: elegiveis } = useQuery<Elegivel[]>({ queryKey: ["runs-elegiveis"], queryFn: () => api("/runs/iniciativas-elegiveis") });

  const orquestrar = useMutation({
    mutationFn: () => post<Run>("/runs/iniciativa", { iniciativaId: iniSel }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["runs"] });
      setOrqAberto(false); setIniSel(""); setSelId(r.id);
      toast("🎭 Orquestrador iniciado — vai conduzir a iniciativa até concluir");
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });
  const cancelarRun = useMutation({
    mutationFn: (id: string) => post(`/runs/${id}/cancelar`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["runs"] }); qc.invalidateQueries({ queryKey: ["run", selId] }); toast("🛑 Orquestração cancelada"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });
  const retomarRun = useMutation({
    mutationFn: (id: string) => post(`/runs/${id}/retomar`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["runs"] }); qc.invalidateQueries({ queryKey: ["run", selId] }); toast("▶ Retomando a orquestração"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const iniciar = useMutation({
    mutationFn: () => post<Run>("/runs", { objetivo, krId: krId || undefined }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["runs"] });
      setNovoAberto(false);
      setObjetivo("");
      setSelId(r.id);
      toast("🤖 Squad virtual iniciada — os agentes estão trabalhando");
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const decidir = useMutation({
    mutationFn: ({ cid, decisao }: { cid: string; decisao: string }) =>
      post(`/runs/${selId}/checkpoints/${cid}`, { decisao }),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["runs"] });
      qc.invalidateQueries({ queryKey: ["run", selId] });
      toast(v.decisao === "aprovado" ? "✅ Aprovado — a squad virtual continua" : "🛑 Decisão registrada");
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  return (
    <>
      <PageHead
        title="Execução autônoma"
        description="A squad virtual executa o plano de ponta a ponta e para nos checkpoints para a sua decisão — humano no loop, sempre."
        actions={
          (me?.papel === "pm" || me?.papel === "tech_lead") && (
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="primary" onClick={() => { setIniSel(elegiveis?.[0]?.id ?? ""); setOrqAberto(true); }}>
                🎭 Orquestrar iniciativa
              </Button>
              <Button onClick={() => setNovoAberto(true)}>
                ✦ Squad virtual (KR)
              </Button>
            </div>
          )
        }
      />

      <div className="grid" style={{ gridTemplateColumns: "340px 1fr", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {runs?.map((r) => {
            const st = STATUS_LABEL[r.status] ?? { label: r.status, tone: "neutral" as const };
            return (
              <div
                key={r.id}
                className="card card-pad"
                style={{ cursor: "pointer", outline: selId === r.id ? "2px solid var(--accent)" : "none" }}
                onClick={() => setSelId(r.id)}
              >
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Chip tone={st.tone}>{st.label}</Chip>
                  {r.modo === "iniciativa" && <Chip tone="blue">🎭 {r.iniciativaCodigo ?? "iniciativa"}</Chip>}
                </div>
                <h3 style={{ marginTop: 8 }}>{r.objetivo}</h3>
                <p className="sub">
                  {r.modo === "iniciativa" && r.progresso && r.status === "em_andamento" ? r.progresso
                    : (r.krDescricao ? `KR: ${r.krDescricao} · ` : "") + `${Math.round(r.tokensGastos / 1000)}k tokens`}
                </p>
              </div>
            );
          })}
          {runs?.length === 0 && <p className="empty-note">Nenhum run ainda — inicie a squad virtual a partir de um KR.</p>}
        </div>

        <div>
          {run ? (
            <div className="card card-pad">
              <div style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 6 }}>
                <h3 style={{ flex: 1 }}>{run.objetivo}</h3>
                <span className="hitl">HITL · humano no loop</span>
              </div>
              <p className="sub" style={{ marginBottom: 14 }}>
                {run.modo === "iniciativa"
                  ? `Orquestração da iniciativa ${run.iniciativaCodigo ?? ""} — o agente conduz o fluxo inteiro`
                  : `${run.krDescricao ? `KR alvo: ${run.krDescricao} · ` : ""}consumo ${Math.round(run.tokensGastos / 1000)}k / teto ${Math.round(run.tetoTokens / 1000)}k tokens`}
              </p>

              {run.status === "pausada" && (me?.papel === "pm" || me?.papel === "tech_lead") && (
                <div className="card" style={{ marginBottom: 12, background: "#fffbeb", border: "1px solid #fde68a" }}>
                  <p className="sub" style={{ margin: 0 }}>⏸️ Run pausado após você pedir um ajuste. Retome para continuar do ponto em que parou, ou cancele.</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <Button variant="primary" onClick={() => retomarRun.mutate(run.id)}>▶ Retomar</Button>
                    <Button onClick={() => cancelarRun.mutate(run.id)}>🛑 Cancelar</Button>
                  </div>
                </div>
              )}
              {run.modo === "iniciativa" && (() => {
                const total = run.totalEtapas ?? 0;
                const feitos = run.passos.filter((p) => p.status === "concluido").length;
                const pct = total ? Math.round((feitos / total) * 100) : 0;
                return (
                  <div className="card" style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                      <span className="sub">{total ? `Etapas da iniciativa concluídas: ${feitos}/${total} · ${pct}%` : "orquestração"}</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        {run.status === "em_andamento" && <button className="btn" onClick={() => cancelarRun.mutate(run.id)}>🛑 Cancelar</button>}
                        {(run.status === "cancelada" || run.status === "rejeitada") && <button className="btn primary" onClick={() => retomarRun.mutate(run.id)}>▶ Tentar novamente</button>}
                      </div>
                    </div>
                    <div style={{ height: 8, borderRadius: 5, background: "rgba(127,127,127,.2)", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: run.status === "concluida" ? "#16a34a" : "var(--accent, #2563eb)", transition: "width .4s" }} />
                    </div>
                    {run.status === "em_andamento" && <p className="sub" style={{ margin: "8px 0 0" }}>⏳ {run.progresso ?? "Conduzindo as etapas…"} <span style={{ opacity: 0.7 }}>· a barra avança a cada etapa concluída; a fase atual (produzir/Master/revisar) aparece aqui em tempo real</span></p>}
                    {run.status === "concluida" && <p className="sub" style={{ margin: "8px 0 0" }}>✅ Concluída — documentos em Documentação.</p>}
                    {run.status === "cancelada" && <p className="sub" style={{ margin: "8px 0 0" }}>🛑 Cancelada. Você pode tentar novamente do ponto em que parou.</p>}
                    {run.status === "rejeitada" && <p className="sub" style={{ margin: "8px 0 0" }}>⚠️ {run.progresso ?? "Falhou."} Você pode tentar novamente.</p>}
                  </div>
                );
              })()}
              <div className="run">
                {run.passos.map((p) => {
                  const ck = run.checkpoints.find((k) => k.passoOrdem === p.ordem && k.status === "aberto");
                  const cls =
                    p.status === "concluido" ? "done" : p.status === "aguardando" ? "gate" : p.status === "em_execucao" ? "running" : "";
                  return (
                    <div key={p.id} className={`run-step ${cls}`}>
                      <div className="run-node">
                        {p.status === "concluido" ? "✓" : p.tipo === "checkpoint" ? "🙋" : p.status === "em_execucao" ? "⚙️" : p.ordem}
                      </div>
                      <div className="run-card">
                        <div className="rc-head">
                          <h4>{p.nome}</h4>
                          {p.tipo === "checkpoint" && <span className="hitl">checkpoint humano</span>}
                          {p.agenteNome && <span className="rc-agent">{p.agenteNome}</span>}
                        </div>
                        {p.saida?.resumo && <p>{p.saida.resumo}</p>}
                        {p.saida?.itens && p.saida.itens.length > 0 && (
                          <div className="run-out">
                            {p.saida.itens.map((it) => (
                              <span key={it} className="pill">{it}</span>
                            ))}
                          </div>
                        )}
                        {p.saida?.revisao && (
                          <div className="master-note">
                            <div className="mn-head">
                              <span className="mn-badge">🎯 Master</span>
                              <b>{p.saida.revisao.nota}/10</b>
                              <span className="sub">· {p.saida.revisao.rodadas} rodada(s) de revisão</span>
                            </div>
                            {p.saida.revisao.problemas.length > 0 ? (
                              <ul className="mn-list">
                                {p.saida.revisao.problemas.map((pb, i) => (
                                  <li key={i}>{pb}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="sub" style={{ margin: 0 }}>Aprovado sem ressalvas.</p>
                            )}
                          </div>
                        )}
                        {p.status === "em_execucao" && <p className="muted">executando…</p>}
                        {ck && (me?.papel === "pm" || me?.papel === "tech_lead") && (
                          <>
                            {ck.resumo && (
                              <div className="run-reason">
                                <b>Para decidir:</b> {ck.resumo}
                              </div>
                            )}
                            <div className="run-actions">
                              <Button variant="primary" onClick={() => decidir.mutate({ cid: ck.id, decisao: "aprovado" })}>
                                ✓ Aprovar e continuar
                              </Button>
                              <Button onClick={() => decidir.mutate({ cid: ck.id, decisao: "ajustar" })}>Pedir ajuste</Button>
                              <Button onClick={() => decidir.mutate({ cid: ck.id, decisao: "rejeitado" })}>✕ Rejeitar</Button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="card card-pad">
              <h3>Selecione um run</h3>
              <p className="sub">A timeline de passos, saídas dos agentes e checkpoints aparece aqui.</p>
            </div>
          )}
        </div>
      </div>

      {novoAberto && (
        <Modal
          title="Iniciar squad virtual"
          subtitle="Escolha o KR alvo; os agentes executam o plano e param nos checkpoints."
          onClose={() => setNovoAberto(false)}
          foot={
            <>
              <Button onClick={() => setNovoAberto(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => objetivo.length >= 8 && iniciar.mutate()}>
                {iniciar.isPending ? "Iniciando…" : "✦ Iniciar execução"}
              </Button>
            </>
          }
        >
          <Fld label="Objetivo do run">
            <textarea className="in" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="Ex.: Preparar a iniciativa de regras de split self-service" />
          </Fld>
          <Fld label="KR alvo (opcional)">
            <select className="in" value={krId} onChange={(e) => setKrId(e.target.value)}>
              <option value="">— nenhum —</option>
              {krsSquad.map((k) => (
                <option key={k.id} value={k.id}>{k.descricao}</option>
              ))}
            </select>
          </Fld>
        </Modal>
      )}

      {orqAberto && (
        <Modal
          title="🎭 Orquestrar iniciativa"
          subtitle="Um agente orquestrador conduz o fluxo inteiro da iniciativa — concluindo cada etapa e gerando os artefatos — até terminar."
          onClose={() => setOrqAberto(false)}
          foot={
            <>
              <Button onClick={() => setOrqAberto(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => iniSel && orquestrar.mutate()}>
                {orquestrar.isPending ? "Iniciando…" : "🎭 Iniciar orquestração"}
              </Button>
            </>
          }
        >
          {!elegiveis?.length ? (
            <p className="sub">Nenhuma iniciativa em andamento. Crie uma em Iniciativas.</p>
          ) : (
            <>
              <Fld label="Iniciativa">
                <select className="in" value={iniSel} onChange={(e) => setIniSel(e.target.value)}>
                  {elegiveis.map((i) => (
                    <option key={i.id} value={i.id}>{i.codigo} — {i.titulo} (etapa {i.etapaAtual}/{i.etapasTotal})</option>
                  ))}
                </select>
              </Fld>
              <p className="sub" style={{ fontSize: 12.5 }}>O orquestrador roda em segundo plano; acompanhe os passos aqui. Cada etapa gera seu documento na Documentação.</p>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
