import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Chip, PageHead } from "../../components/ui";

interface DevData {
  historias: { id: string; codigo: string; titulo: string; pontos: number | null; status: string; iniciativaCodigo: string; minha: boolean }[];
  prs: { id: string; numero: number; titulo: string; autorNome: string; status: string; repositorio: string }[];
  execucoes: { id: string; repositorio: string; etapa: string; status: string; detalhe: string | null }[];
}

const PR_TONE: Record<string, "blue" | "good" | "neutral"> = { aberto: "blue", aprovado: "good", merged: "neutral" };

export default function EstacaoDev() {
  const { data } = useQuery<DevData>({ queryKey: ["dev"], queryFn: () => api("/esteira/dev") });

  return (
    <>
      <PageHead
        title="Estação dev"
        description="Seu contexto de trabalho: histórias, pull requests e o estado da esteira dos repositórios da squad."
      />
      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card card-pad">
          <h3>Histórias da squad</h3>
          <p className="sub" style={{ marginBottom: 10 }}>sincronizadas com o board</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data?.historias.map((h) => (
              <div className="story" key={h.id} style={h.minha ? { borderColor: "var(--accent-soft-2)" } : undefined}>
                <span className="s-id">{h.codigo}</span>
                <span className="s-title">
                  {h.titulo}
                  <small>{h.iniciativaCodigo}{h.minha ? " · sua" : ""}</small>
                </span>
                <Chip tone={h.status === "concluida" ? "good" : h.status === "em_dev" ? "blue" : "neutral"}>
                  {h.status.replace("_", " ")}
                </Chip>
                {h.pontos != null && <span className="pts">{h.pontos} pts</span>}
              </div>
            ))}
            {data?.historias.length === 0 && <p className="empty-note">Sem histórias no momento.</p>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card card-pad">
            <h3>Pull requests</h3>
            <p className="sub" style={{ marginBottom: 10 }}>agentes abrem PRs; o merge é sempre humano</p>
            {data?.prs.map((pr) => (
              <div key={pr.id} className="pend-row">
                <div className="p-info">
                  <b>#{pr.numero} · {pr.titulo}</b>
                  <span>{pr.repositorio} · {pr.autorNome}</span>
                </div>
                <Chip tone={PR_TONE[pr.status] ?? "neutral"}>{pr.status}</Chip>
              </div>
            ))}
          </div>
          <div className="card card-pad">
            <h3>Esteira agora</h3>
            <div className="pipe" style={{ marginTop: 10 }}>
              {data?.execucoes.map((ex) => (
                <div key={ex.id} className="pipe-step" title={ex.detalhe ?? undefined}>
                  <div className="p-name">{ex.etapa.replace("_", " ")}</div>
                  <div className="p-time">{ex.repositorio.split("/")[1]}</div>
                  <div className="p-status">
                    <Chip tone={ex.status === "ok" ? "good" : ex.status === "em_execucao" ? "blue" : ex.status === "falha" ? "crit" : "neutral"}>
                      {ex.status.replace("_", " ")}
                    </Chip>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
