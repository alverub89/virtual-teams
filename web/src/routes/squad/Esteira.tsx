import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Chip, PageHead } from "../../components/ui";

interface EsteiraData {
  execucoes: { id: string; repositorio: string; etapa: string; status: string; detalhe: string | null }[];
  gmuds: { id: string; numero: string; titulo: string; status: string; risco: string; janela: string | null }[];
}

const GMUD_TONE: Record<string, "blue" | "good" | "warn" | "crit" | "neutral"> = {
  rascunho: "neutral",
  aguardando_aprovacao: "warn",
  agendada: "blue",
  executada: "good",
  rollback: "crit",
};
const ORDEM_ETAPAS = ["build", "testes", "seguranca", "deploy_hml", "gmud", "deploy_prod"];

export default function Esteira() {
  const { data } = useQuery<EsteiraData>({ queryKey: ["esteira"], queryFn: () => api("/esteira") });
  const execucoes = [...(data?.execucoes ?? [])].sort(
    (a, b) => ORDEM_ETAPAS.indexOf(a.etapa) - ORDEM_ETAPAS.indexOf(b.etapa)
  );

  return (
    <>
      <PageHead
        title="Esteira & GMUDs"
        description="Gates de qualidade da esteira padrão e as mudanças (GMUD) da squad no ServiceNow. Abrir GMUD é ação crítica — sempre com checkpoint humano."
      />
      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <h3>Esteira — {execucoes[0]?.repositorio ?? "sem execução ativa"}</h3>
        <div className="pipe" style={{ marginTop: 12 }}>
          {execucoes.map((ex, i) => (
            <>
              <div key={ex.id} className="pipe-step" title={ex.detalhe ?? undefined}>
                <div className="p-name">{ex.etapa.replace("_", " ")}</div>
                {ex.detalhe && <div className="p-time">{ex.detalhe}</div>}
                <div className="p-status">
                  <Chip tone={ex.status === "ok" ? "good" : ex.status === "em_execucao" ? "blue" : ex.status === "falha" ? "crit" : "neutral"}>
                    {ex.status === "ok" ? "✓ ok" : ex.status.replace("_", " ")}
                  </Chip>
                </div>
              </div>
              {i < execucoes.length - 1 && <span key={`${ex.id}-a`} className="pipe-arrow">→</span>}
            </>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <h3>GMUDs</h3>
          <p className="sub">mudanças da squad · ServiceNow</p>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Número</th>
              <th>Mudança</th>
              <th>Janela</th>
              <th>Risco</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.gmuds.map((g) => (
              <tr key={g.id}>
                <td className="mono">{g.numero}</td>
                <td>{g.titulo}</td>
                <td className="muted">{g.janela ?? "—"}</td>
                <td>
                  <Chip tone={g.risco === "alto" ? "crit" : g.risco === "medio" ? "warn" : "neutral"}>{g.risco}</Chip>
                </td>
                <td>
                  <Chip tone={GMUD_TONE[g.status] ?? "neutral"}>{g.status.replace("_", " ")}</Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
