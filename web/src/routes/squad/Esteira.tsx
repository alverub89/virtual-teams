import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post, useMe } from "../../lib/api";
import { Button, Chip, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

interface EsteiraData {
  execucoes: { id: string; repositorio: string; etapa: string; status: string; detalhe: string | null }[];
  gmuds: { id: string; numero: string; titulo: string; status: string; risco: string; janela: string | null }[];
  ativa?: boolean;
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
  const { data: me } = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery<EsteiraData>({
    queryKey: ["esteira"],
    queryFn: () => api("/esteira"),
    refetchInterval: (q) => (q.state.data?.ativa ? 1200 : false),
  });
  const execucoes = [...(data?.execucoes ?? [])].sort(
    (a, b) => ORDEM_ETAPAS.indexOf(a.etapa) - ORDEM_ETAPAS.indexOf(b.etapa)
  );
  const podeAgir = me?.papel === "pm" || me?.papel === "tech_lead";

  const disparar = useMutation({
    mutationFn: () => post<{ ok: boolean; mensagem: string }>("/esteira/disparar", {}),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["esteira"] });
      toast(`🚀 ${r.mensagem}`);
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });
  const abrirGmud = useMutation({
    mutationFn: (titulo: string) => post<{ ok: boolean; mensagem: string; numero: string }>("/esteira/gmud", { titulo }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["esteira"] });
      toast(`🧾 ${r.mensagem}`);
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });
  const novaGmud = () => {
    const t = prompt("Título da mudança (GMUD):");
    if (t && t.trim().length >= 4) abrirGmud.mutate(t.trim());
  };

  return (
    <>
      <PageHead
        title="Esteira & GMUDs"
        description="Gates de qualidade da esteira padrão e as mudanças (GMUD) da squad no ServiceNow. Abrir GMUD é ação crítica — sempre com checkpoint humano."
        actions={podeAgir && (
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={() => disparar.mutate()}>{disparar.isPending ? "Disparando…" : "🚀 Disparar esteira"}</Button>
            <Button variant="primary" onClick={novaGmud}>🧾 Abrir GMUD</Button>
          </div>
        )}
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
