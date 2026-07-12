import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post, useMe } from "../../lib/api";
import { Button, Card, Chip, EscopoChip, Fld, Modal, PageHead } from "../../components/ui";
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

const trimestreAtual = () => {
  const now = new Date();
  return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
};

type KrForm = { descricao: string; unidade: string; baseline: string; meta: string; invertido: boolean };
const krVazio = (): KrForm => ({ descricao: "", unidade: "%", baseline: "0", meta: "100", invertido: false });

export default function Okrs() {
  const { data: me } = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const [medindo, setMedindo] = useState<Kr | null>(null);
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const [realizado, setRealizado] = useState("");

  const [novoAberto, setNovoAberto] = useState(false);
  const [objetivo, setObjetivo] = useState("");
  const [trimestre, setTrimestre] = useState(trimestreAtual());
  const [krs, setKrs] = useState<KrForm[]>([krVazio()]);

  const { data: okrs, isLoading } = useQuery<Okr[]>({ queryKey: ["okrs"], queryFn: () => api("/okrs") });

  const criar = useMutation({
    mutationFn: () =>
      post("/okrs", {
        objetivo,
        trimestre,
        krs: krs
          .filter((k) => k.descricao.trim())
          .map((k) => ({
            descricao: k.descricao,
            unidade: k.unidade || "%",
            baseline: Number(k.baseline) || 0,
            meta: Number(k.meta) || 0,
            invertido: k.invertido,
          })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["okrs"] });
      setNovoAberto(false);
      setObjetivo("");
      setKrs([krVazio()]);
      toast("🎯 Objetivo criado");
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const medir = useMutation({
    mutationFn: () => post(`/okrs/krs/${medindo!.id}/medicoes`, { mes, realizado: Number(realizado) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["okrs"] });
      setMedindo(null);
      toast("📊 Realizado atualizado");
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const ordem = ["comunidade", "release_train", "squad"];
  const ordenados = [...(okrs ?? [])].sort((a, b) => ordem.indexOf(a.escopo) - ordem.indexOf(b.escopo));
  const podeCriar = objetivo.length >= 4 && krs.some((k) => k.descricao.trim() && k.meta !== "");

  return (
    <>
      <PageHead
        title="OKRs"
        description="Seus objetivos e resultados-chave. Crie um objetivo, defina os KRs e associe as iniciativas que os movem."
        actions={
          (me?.papel === "pm" || me?.papel === "tech_lead") && (
            <Button variant="primary" onClick={() => setNovoAberto(true)}>
              + Novo objetivo
            </Button>
          )
        }
      />

      {!isLoading && ordenados.length === 0 && (
        <Card>
          <h3>Nenhum objetivo ainda 🎯</h3>
          <p className="sub" style={{ margin: "6px 0 14px" }}>
            Comece definindo o que sua squad quer alcançar neste trimestre. Depois é só criar iniciativas
            e pôr os agentes para trabalhar nelas.
          </p>
          {(me?.papel === "pm" || me?.papel === "tech_lead") && (
            <Button variant="primary" onClick={() => setNovoAberto(true)}>
              Criar meu primeiro objetivo
            </Button>
          )}
        </Card>
      )}

      {ordenados.map((okr, idx) => (
        <div key={okr.id}>
          {idx > 0 && <div className="casc-arrow">↳ desdobra em</div>}
          <div className={`casc-row ${okr.escopo === "squad" ? "mine" : ""}`} style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
              <div className="cr-obj">
                <b>{okr.objetivo}</b>
                <div className="cr-sub">{okr.dono} · {okr.trimestre}</div>
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
                    <span className="kr-nums"><b>{p.ultimo}</b> {kr.unidade} · meta {kr.meta}</span>
                  </div>
                  <div className={`kr-bar ${p.noRitmo ? "ok" : ""}`} title={`Realizado: ${p.ultimo} ${kr.unidade}`}>
                    <div className="fill" style={{ width: `${p.pct}%` }} />
                    {p.planPct != null && (
                      <div className="plan" style={{ left: `${Math.max(0, Math.min(100, p.planPct))}%` }}>
                        <b>PLAN</b>
                      </div>
                    )}
                  </div>
                  {kr.features.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, fontSize: 12, color: "var(--ink-3)" }}>
                      movida por:
                      {kr.features.map((f) => (
                        <Link key={f.codigo} to={`/squad/iniciativas/${f.codigo}`} className="contrib" style={{ textDecoration: "none" }}>
                          {f.codigo} · {f.titulo.slice(0, 34)}{f.titulo.length > 34 ? "…" : ""}
                        </Link>
                      ))}
                    </div>
                  )}
                  {(me?.papel === "pm" || me?.papel === "tech_lead") && okr.escopo === "squad" && (
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

      {novoAberto && (
        <Modal
          title="Novo objetivo"
          subtitle="Defina o objetivo e ao menos um resultado-chave (KR) mensurável."
          onClose={() => setNovoAberto(false)}
          foot={
            <>
              <Button onClick={() => setNovoAberto(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => podeCriar && criar.mutate()}>
                {criar.isPending ? "Criando…" : "Criar objetivo"}
              </Button>
            </>
          }
        >
          <div className="fld-row">
            <Fld label="Objetivo">
              <input className="in" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="Ex.: Reduzir o tempo de liquidação" />
            </Fld>
            <Fld label="Trimestre">
              <input className="in" value={trimestre} onChange={(e) => setTrimestre(e.target.value)} placeholder="2026-Q3" />
            </Fld>
          </div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>Resultados-chave (KRs)</label>
          {krs.map((k, i) => (
            <div key={i} className="card" style={{ padding: 12, marginTop: 8 }}>
              <input
                className="in"
                value={k.descricao}
                onChange={(e) => setKrs((arr) => arr.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))}
                placeholder={`KR${i + 1} — ex.: Splits liquidados em D+1`}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, marginTop: 8, alignItems: "center" }}>
                <input className="in" value={k.baseline} onChange={(e) => setKrs((arr) => arr.map((x, j) => (j === i ? { ...x, baseline: e.target.value } : x)))} placeholder="Base" title="Valor inicial" />
                <input className="in" value={k.meta} onChange={(e) => setKrs((arr) => arr.map((x, j) => (j === i ? { ...x, meta: e.target.value } : x)))} placeholder="Meta" title="Meta" />
                <input className="in" value={k.unidade} onChange={(e) => setKrs((arr) => arr.map((x, j) => (j === i ? { ...x, unidade: e.target.value } : x)))} placeholder="un." title="Unidade (%, dias, R$…)" />
                {krs.length > 1 && (
                  <button className="modal-x" title="Remover KR" onClick={() => setKrs((arr) => arr.filter((_, j) => j !== i))}>✕</button>
                )}
              </div>
              <label className="check-item" style={{ marginTop: 8, fontSize: 12 }}>
                <input type="checkbox" checked={k.invertido} onChange={(e) => setKrs((arr) => arr.map((x, j) => (j === i ? { ...x, invertido: e.target.checked } : x)))} />
                menor é melhor (ex.: reduzir chamados)
              </label>
            </div>
          ))}
          {krs.length < 6 && (
            <button className="btn" style={{ marginTop: 8 }} onClick={() => setKrs((arr) => [...arr, krVazio()])}>
              + Adicionar KR
            </button>
          )}
        </Modal>
      )}

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
