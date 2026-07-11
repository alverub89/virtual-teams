import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Chip, PageHead } from "../../components/ui";

interface Estrutura {
  comunidade: { nome: string };
  releaseTrains: {
    id: string;
    nome: string;
    squads: { id: string; nome: string; minha: boolean; pessoas: number; iniciativas: number; capacidades: number }[];
  }[];
}

export default function Comunidade() {
  const { data } = useQuery<Estrutura>({ queryKey: ["estrutura"], queryFn: () => api("/estrutura") });

  return (
    <>
      <PageHead
        title={`Comunidade ${data?.comunidade.nome ?? ""}`}
        description="A estrutura da diretoria — release trains e squads. Você cria e edita na sua squad; o resto é consulta."
      />
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", alignItems: "start" }}>
        {data?.releaseTrains.map((rt) => (
          <div key={rt.id} className="rt-card">
            <div className="rt-head">
              <span className="rt-ic">🚆</span>
              <h3>{rt.nome}</h3>
              <Chip>{rt.squads.length} squads</Chip>
            </div>
            {rt.squads.map((sq) => (
              <div key={sq.id} className={`squad-row ${sq.minha ? "mine" : ""}`}>
                <div>
                  <div className="sq-name">{sq.nome} {sq.minha && "· sua squad"}</div>
                  <div className="sq-meta">
                    {sq.pessoas} pessoas · {sq.iniciativas} iniciativas ativas · {sq.capacidades} capacidades
                  </div>
                </div>
                <div className="sq-act">{sq.minha ? <Chip tone="blue">editável</Chip> : <Chip>consulta</Chip>}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
