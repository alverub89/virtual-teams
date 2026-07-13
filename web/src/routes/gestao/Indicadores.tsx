import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Chip, EstadoErro, HBar, Kpi, PageHead } from "../../components/ui";

interface Indicadores {
  kpis: {
    iniciativasAtivas: number;
    leadTimeDias: number | null;
    taxaSucessoGmud: number | null;
    custoIaMes: number;
    runsAutonomos: number;
    squads: number;
    squadsEmAlerta?: number;
  };
  fluxo: { etapa: string; iniciativas: number }[];
  leadTimePorEtapa: { etapa: string; dias: number; amostra: number }[];
  masterCobertura: { total: number; revisados: number; pct: number | null; notaMedia: number | null };
  consumoPorSquad: { squad: string; tokens: number; custo: number; budget: number | null; pct: number | null; alerta: boolean }[];
  gmuds90d: { numero: string; titulo: string; status: string; janela: string | null }[];
  progressoKrs: { descricao: string; progresso: number }[];
}

export default function Indicadores() {
  const { data, error } = useQuery<Indicadores>({ queryKey: ["indicadores"], queryFn: () => api("/gestao/indicadores") });

  if (error) return <><PageHead title="Indicadores" description="Lead time, GMUDs, consumo de IA e progresso de OKRs." /><EstadoErro error={error} /></>;

  return (
    <>
      <PageHead
        title="Indicadores"
        description="O fluxo de produção da diretoria — da ideia ao deploy — com lead time, GMUDs e custo de IA."
      />
      {data && data.kpis.iniciativasAtivas === 0 && data.kpis.runsAutonomos === 0 && (
        <div className="card" style={{ marginBottom: 14 }}>ℹ️ Ainda sem dados suficientes — os indicadores se preenchem conforme as squads criam iniciativas, executam runs e registram GMUDs.</div>
      )}
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Kpi label="Iniciativas ativas" value={data ? data.kpis.iniciativasAtivas : "…"} delta={data ? `${data.kpis.squads} squads` : undefined} />
        <Kpi label="Lead time — ideia ao deploy" value={data ? (data.kpis.leadTimeDias ?? "—") : "…"} suffix="dias" />
        <Kpi label="Sucesso de GMUD (90d)" value={!data ? "…" : data.kpis.taxaSucessoGmud != null ? `${data.kpis.taxaSucessoGmud}%` : "—"} delta={!data ? undefined : data.kpis.taxaSucessoGmud != null ? `${data.gmuds90d.length} mudanças` : "amostra insuficiente"} />
        <Kpi label="Custo de IA no mês" value={data ? `R$ ${data.kpis.custoIaMes.toFixed(0)}` : "…"} delta={data ? `${data.kpis.runsAutonomos} runs autônomos` : undefined} />
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card viz">
          <h3>Fluxo de produção — iniciativas por etapa</h3>
          <div className="sub">onde as features estão na jornada, agora</div>
          <HBar rows={(data?.fluxo ?? []).map((f) => ({ label: f.etapa, value: f.iniciativas }))} />
          <div className="axis-note">iniciativas em andamento por etapa do método</div>
        </div>
        <div className="card viz">
          <h3>Consumo de IA por squad — mês atual{data && data.kpis.squadsEmAlerta ? ` · ${data.kpis.squadsEmAlerta} em alerta` : ""}</h3>
          <div className="sub">tokens consumidos vs. orçamento do mês</div>
          {(data?.consumoPorSquad ?? []).length === 0 && <p className="sub">Sem consumo registrado neste mês.</p>}
          {(data?.consumoPorSquad ?? []).map((c) => (
            <div key={c.squad} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 8, fontSize: 12.5, marginBottom: 4, alignItems: "center" }}>
                <span style={{ flex: 1 }}>{c.squad}</span>
                {c.alerta && <Chip tone="crit">⚠️ {c.pct}%</Chip>}
                <b className="num">{(c.tokens / 1e6).toFixed(2)}M{c.budget ? ` / ${(c.budget / 1e6).toFixed(1)}M` : ""}</b>
              </div>
              <div className="meter"><i style={{ width: `${c.pct != null ? Math.min(100, c.pct) : 0}%`, background: c.alerta ? "#dc2626" : undefined }} /></div>
            </div>
          ))}
          <div className="axis-note">defina o teto por squad no Console; alerta a partir de 80%</div>
        </div>
      </div>

      <div className="grid g2" style={{ alignItems: "start", marginTop: 14 }}>
        <div className="card viz">
          <h3>Lead time por etapa do método</h3>
          <div className="sub">onde está o gargalo real — média de dias em cada fase</div>
          {(data?.leadTimePorEtapa ?? []).length === 0 && <p className="sub">Sem etapas concluídas ainda.</p>}
          <HBar rows={(data?.leadTimePorEtapa ?? []).map((e) => ({ label: `${e.etapa} (${e.amostra})`, value: e.dias }))} />
          <div className="axis-note">dias médios por fase · (n) = iniciativas na amostra</div>
        </div>
        <div className="card viz">
          <h3>Validação pelo Agente Master</h3>
          <div className="sub">documentos da execução autônoma que passaram pela crítica do Master</div>
          {data && data.masterCobertura.total === 0 ? (
            <p className="sub" style={{ marginTop: 10 }}>Nenhum passo autônomo concluído ainda — a cobertura aparece quando houver execução autônoma.</p>
          ) : (
            <>
              <div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap" }}>
                <div><div className="num" style={{ fontSize: 26, fontWeight: 700 }}>{data?.masterCobertura.pct ?? "—"}%</div><div className="sub">com checkpoint do Master</div></div>
                <div><div className="num" style={{ fontSize: 26, fontWeight: 700 }}>{data?.masterCobertura.notaMedia ?? "—"}</div><div className="sub">nota média (0–10)</div></div>
                <div><div className="num" style={{ fontSize: 26, fontWeight: 700 }}>{data ? `${data.masterCobertura.revisados}/${data.masterCobertura.total}` : "—"}</div><div className="sub">passos revisados</div></div>
              </div>
              <div className="meter" style={{ marginTop: 12 }}><i style={{ width: `${data?.masterCobertura.pct ?? 0}%` }} /></div>
              <div className="axis-note">o restante seguiu sem revisão crítica registrada</div>
            </>
          )}
        </div>
      </div>

      <div className="grid g2" style={{ alignItems: "start", marginTop: 14 }}>
        <div className="card viz">
          <h3>Progresso dos KRs</h3>
          <div className="sub">realizado mais recente vs. meta do trimestre</div>
          {data?.progressoKrs.map((k) => (
            <div key={k.descricao} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", fontSize: 12.5, marginBottom: 4, gap: 8 }}>
                <span style={{ flex: 1 }}>{k.descricao}</span>
                <b className="num">{k.progresso}%</b>
              </div>
              <div className="meter"><i style={{ width: `${k.progresso}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-pad" style={{ paddingBottom: 0 }}>
            <h3>GMUDs — últimos 90 dias</h3>
          </div>
          <table className="tbl">
            <tbody>
              {data?.gmuds90d.map((g) => (
                <tr key={g.numero}>
                  <td className="mono">{g.numero}</td>
                  <td>{g.titulo}</td>
                  <td>
                    <Chip tone={g.status === "executada" ? "good" : g.status === "rollback" ? "crit" : g.status === "aguardando_aprovacao" ? "warn" : "neutral"}>
                      {g.status.replace("_", " ")}
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
