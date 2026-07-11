import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post, useMe } from "../../lib/api";
import { Button, Chip, EscopoChip, Fld, Modal, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

interface Kr {
  id: string;
  ordem: number;
  descricao: string;
  unidade: string;
  baseline: number;
  meta: number;
  invertido: boolean;
  medicoes: { mes: string; planejado: number | null; realizado: number | null }[];
  features: { codigo: string; titulo: string; etapaAtual: number; status: string }[];
}
interface Okr {
  id: string;
  escopo: string;
  objetivo: string;
  dono: string | null;
  trimestre: string;
  krs: Kr[];
}

function progresso(kr: Kr) {
  const meds = kr.medicoes.filter((m) => m.realizado != null);
  const ultimo = meds.at(-1)?.realizado ?? kr.baseline;
  const span = kr.meta - kr.baseline;
  const pct = span !== 0 ? ((ultimo - kr.baseline) / span) * 100 : 0;
  const planejadoAtual = kr.medicoes.filter((m) => m.planejado != null).find((m) => m.mes === meds.at(-1)?.mes)?.planejado;
  const noRitmo =
    planejadoAtual == null
      ? true
      : kr.invertido
        ? (meds.at(-1)?.realizado ?? kr.baseline) <= planejadoAtual
        : (meds.at(-1)?.realizado ?? kr.baseline) >= planejadoAtual;
  const planPct = planejadoAtual != null && span !== 0 ? ((planejadoAtual - kr.baseline) / span) * 100 : null;
  return { ultimo, pct: Math.max(0, Math.min(100, pct)), noRitmo, planPct };
}

export default function Okrs() {
  const { data: me } = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const [medindo, setMedindo] = useState<Kr | null>(null);
  const [mes, setMes] = useState("2026-07");
  const [realizado, setRealizado] = useState("");

  const { data: okrs } = useQuery<Okr[]>({ queryKey: ["okrs"], queryFn: () => api("/okrs") });

  const medir = useMutation({
    mutationFn: () =>
      post(`/okrs/krs/${medindo!.id}/medicoes`, { mes, realizado: Number(realizado) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["okrs"] });
      setMedindo(null);
      toast("📊 Realizado atualizado");
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const ordem = ["comunidade", "release_train", "squad"];
  const ordenados = [...(okrs ?? [])].sort((a, b) => ordem.indexOf(a.escopo) - ordem.indexOf(b.escopo));

  return (
    <>
      <PageHead
        title="OKRs"
        description="Objetivos e resultados-chave em cascata — comunidade, release train e squad. Associe features ao KR que elas movem."
      />
      {ordenados.map((okr, idx) => (
        <div key={okr.id}>
          {idx > 0 && <div className="casc-arrow">↳ desdobra em</div>}
          <div className={`casc-row ${okr.escopo === "squad" ? "mine" : ""}`} style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
              <div className="cr-obj">
                <b>{okr.objetivo}</b>
                <div className="cr-sub">
                  {okr.dono} · {okr.trimestre}
                </div>
              </div>
              <EscopoChip escopo={okr.escopo} />
            </div>
            {okr.krs.map((kr) => {
              const p = progresso(kr);
              return (
                <div className="kr" key={kr.id}>
                  <div className="kr-head">
                    <span className="kr-name">KR{kr.ordem} · {kr.descricao}</span>
                    <Chip tone={p.noRitmo ? "good" : "warn"}>{p.noRitmo ? "no ritmo" : "atrás do plano"}</Chip>
                    <span className="kr-nums">
                      <b>{p.ultimo}</b> {kr.unidade} · meta {kr.meta}
                    </span>
                  </div>
                  <div className={`kr-bar ${p.noRitmo ? "ok" : ""}`} title={`Realizado: ${p.ultimo} ${kr.unidade}`}>
                    <div className="fill" style={{ width: `${p.pct}%` }} />
                    {p.planPct != null && (
                      <div className="plan" style={{ left: `${Math.max(0, Math.min(100, p.planPct))}%` }}>
                        <b>PLAN</b>
                      </div>
                    )}
                  </div>
                  <div className="kr-legend">
                    <span><span className="sw" style={{ background: p.noRitmo ? "var(--good)" : "var(--accent)" }} /> realizado</span>
                    <span><span className="sw" style={{ borderLeft: "2px dashed var(--ink-2)", borderRadius: 0 }} /> planejado</span>
                  </div>
                  {kr.features.length > 0 && (
                    <div className="kr-moved" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, fontSize: 12, color: "var(--ink-3)" }}>
                      movida por:
                      {kr.features.map((f) => (
                        <Link key={f.codigo} to={`/squad/iniciativas/${f.codigo}`} className="contrib" style={{ textDecoration: "none" }}>
                          {f.codigo} · {f.titulo.slice(0, 34)}{f.titulo.length > 34 ? "…" : ""}
                        </Link>
                      ))}
                    </div>
                  )}
                  {me?.papel === "pm" && okr.escopo === "squad" && (
                    <div className="kr-actions">
                      <Button onClick={() => { setMedindo(kr); setRealizado(""); }}>Atualizar realizado</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {medindo && (
        <Modal
          title="Atualizar realizado"
          subtitle={medindo.descricao}
          onClose={() => setMedindo(null)}
          foot={
            <>
              <Button onClick={() => setMedindo(null)}>Cancelar</Button>
              <Button variant="primary" onClick={() => realizado !== "" && medir.mutate()}>
                {medir.isPending ? "Salvando…" : "Salvar medição"}
              </Button>
            </>
          }
        >
          <div className="fld-row">
            <Fld label="Mês">
              <input className="in" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
            </Fld>
            <Fld label={`Realizado (${medindo.unidade})`}>
              <input className="in" type="number" value={realizado} onChange={(e) => setRealizado(e.target.value)} />
            </Fld>
          </div>
        </Modal>
      )}
    </>
  );
}
