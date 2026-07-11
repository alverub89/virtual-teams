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
  criadoEm: string;
}
interface RunDetalhe extends Run {
  passos: {
    id: string;
    ordem: number;
    nome: string;
    agenteNome: string | null;
    tipo: string;
    status: string;
    saida: { resumo?: string; itens?: string[] } | null;
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
          me?.papel === "pm" && (
            <Button variant="primary" onClick={() => setNovoAberto(true)}>
              ✦ Iniciar squad virtual
            </Button>
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
                <Chip tone={st.tone}>{st.label}</Chip>
                <h3 style={{ marginTop: 8 }}>{r.objetivo}</h3>
                <p className="sub">
                  {r.krDescricao ? `KR: ${r.krDescricao} · ` : ""}
                  {Math.round(r.tokensGastos / 1000)}k tokens
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
                {run.krDescricao ? `KR alvo: ${run.krDescricao} · ` : ""}
                consumo {Math.round(run.tokensGastos / 1000)}k / teto {Math.round(run.tetoTokens / 1000)}k tokens
              </p>
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
                        {p.status === "em_execucao" && <p className="muted">executando…</p>}
                        {ck && me?.papel === "pm" && (
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
    </>
  );
}
