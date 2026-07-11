import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Kpi, PageHead } from "../../components/ui";

interface Overview {
  squads: number;
  agentes: number;
  blueprints: number;
  runsAtivos: number;
  checkpointsPendentes: number;
  custoMes: number;
  atividade: { id: string; pessoaNome: string | null; acao: string; alvo: string | null; criadoEm: string }[];
}

const ACAO_LABEL: Record<string, string> = {
  iniciar_run: "iniciou execução autônoma",
  decidir_checkpoint: "decidiu checkpoint",
  endossar_kb: "endossou artigo",
  criar_iniciativa: "criou iniciativa",
  concluir_etapa: "concluiu etapa",
  atualizar_agente: "atualizou agente",
  atualizar_blueprint: "atualizou blueprint",
  atualizar_rota_modelo: "alterou rota de modelo",
  publicar_kb: "publicou artigo",
  conectar_repo: "conectou repositório",
  imputar_kr: "atualizou medição de KR",
  associar_feature_kr: "associou feature a KR",
  criar_doc: "publicou documento",
  retomar_run: "retomou execução",
};

export default function CfgHome() {
  const { data } = useQuery<Overview>({ queryKey: ["console-overview"], queryFn: () => api("/console/overview") });

  return (
    <>
      <PageHead
        title="Console da plataforma"
        description="Visão geral do que a plataforma governa: squads, agentes, blueprints e o pulso das execuções."
      />
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Kpi label="Squads na plataforma" value={data?.squads ?? "…"} />
        <Kpi label="Agentes ativos" value={data?.agentes ?? "…"} />
        <Kpi label="Runs autônomos ativos" value={data?.runsAtivos ?? "…"} delta={data ? `${data.checkpointsPendentes} aguardando decisão` : undefined} tone={data && data.checkpointsPendentes > 0 ? "down" : "flat"} />
        <Kpi label="Custo de IA no mês" value={data ? `R$ ${data.custoMes.toFixed(0)}` : "…"} />
      </div>
      <div className="card card-pad">
        <h3>Atividade recente</h3>
        <p className="sub" style={{ marginBottom: 8 }}>trilha de auditoria das ações sensíveis</p>
        {data?.atividade.map((a) => (
          <div key={a.id} className="feed">
            <span>•</span>
            <span>
              <b>{a.pessoaNome ?? "sistema"}</b> {ACAO_LABEL[a.acao] ?? a.acao}
              {a.alvo ? <span className="mono muted"> · {a.alvo}</span> : null}
            </span>
            <span className="f-time">{new Date(a.criadoEm).toLocaleString("pt-BR")}</span>
          </div>
        ))}
        {data?.atividade.length === 0 && <p className="empty-note">Sem atividade registrada ainda.</p>}
      </div>
    </>
  );
}
