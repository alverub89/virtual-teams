import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, useMe } from "../../lib/api";
import { Card, Chip, PageHead } from "../../components/ui";

interface Setup {
  comunidade: { nome: string } | null;
  checklist: { area: boolean; metodo: boolean; docBase: boolean; convite: boolean };
  releaseTrains?: string[];
  agentes: number;
  metodo: { nome: string } | null;
  squads: {
    id: string;
    nome: string;
    releaseTrain: string | null;
    pessoas: number;
    iniciativas: number;
    okrs: number;
    convitesPendentes: number;
  }[];
}

const ITENS: { key: keyof Setup["checklist"]; label: string; desc: string; to: string }[] = [
  { key: "area", label: "Criar a área e squads", desc: "Comunidade, release trains e squads", to: "/console/arquitetura" },
  { key: "metodo", label: "Definir o método", desc: "Fases, agentes e o que cada uma gera", to: "/console/metodos" },
  { key: "docBase", label: "Publicar documentação base", desc: "Guardrails herdados pelas squads", to: "/console/arquitetura" },
  { key: "convite", label: "Convidar pessoas", desc: "PM, Tech Lead ou Gestão por email", to: "/console/convites" },
];

export default function CfgHome() {
  const { data: me } = useMe();
  const { data } = useQuery<Setup>({ queryKey: ["console-setup"], queryFn: () => api("/console/setup") });

  const feitos = data ? Object.values(data.checklist).filter(Boolean).length : 0;

  return (
    <>
      <PageHead
        title={data?.comunidade ? data.comunidade.nome : "Console da plataforma"}
        description="Monte a base que abastece as squads e acompanhe como estão indo."
        actions={<Link to="/console/convites" className="btn primary" style={{ textDecoration: "none" }}>+ Convidar pessoa</Link>}
      />

      <Card className="cfg-checklist" pad>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <h3 style={{ flex: 1 }}>Setup da plataforma</h3>
          <Chip tone={feitos === 4 ? "good" : "warn"}>{feitos}/4 concluído</Chip>
        </div>
        <p className="sub" style={{ marginBottom: 8 }}>
          {feitos === 4 ? "Tudo pronto — sua área está abastecida." : "Complete os passos para abastecer as squads."}
        </p>
        {ITENS.map((it) => {
          const ok = data?.checklist[it.key];
          return (
            <Link key={it.key} to={it.to} className="cfg-row" style={{ textDecoration: "none", color: "inherit" }}>
              <span className="chk" data-ok={ok ? "1" : "0"}>{ok ? "✓" : ""}</span>
              <div className="c-info">
                <b>{it.label}</b>
                <span>{it.desc}</span>
              </div>
              <Chip tone={ok ? "good" : "neutral"}>{ok ? "feito" : "pendente"}</Chip>
            </Link>
          );
        })}
      </Card>

      <div className="sec-title">Squads da área</div>
      {data && data.squads.length === 0 && (
        <p className="empty-note">Nenhuma squad ainda — crie a estrutura em Arquitetura & padrões.</p>
      )}
      <div className="grid g3">
        {data?.squads.map((sq) => (
          <Card key={sq.id} pad>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ flex: 1 }}>{sq.nome}</h3>
              {sq.convitesPendentes > 0 && <Chip tone="warn">{sq.convitesPendentes} convite(s)</Chip>}
            </div>
            <p className="sub">{sq.releaseTrain}</p>
            <div className="cap-stats" style={{ marginTop: 12 }}>
              <span><b>{sq.pessoas}</b> pessoas</span>
              <span><b>{sq.iniciativas}</b> iniciativas</span>
              <span><b>{sq.okrs}</b> OKRs</span>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid g3" style={{ marginTop: 16 }}>
        <Card pad>
          <h3>Método</h3>
          <p className="sub">{data?.metodo ? data.metodo.nome : "não definido"}</p>
        </Card>
        <Card pad>
          <h3>Agentes prontos</h3>
          <p className="sub">{data?.agentes ?? "…"} no catálogo · <Link to="/console/agentes">revisar</Link></p>
        </Card>
        <Card pad>
          <h3>Você</h3>
          <p className="sub">{me?.nome} · CTO da plataforma</p>
        </Card>
      </div>
    </>
  );
}
