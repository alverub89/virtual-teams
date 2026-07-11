import { Navigate, useNavigate } from "react-router-dom";
import { useMe } from "../lib/api";
import { homeDoPapel } from "../../../shared/types";

// Seletor de visão — só para quem tem acesso a mais de um contexto
// (docs/spec §4.1); com um único contexto, redireciona direto.
export default function Entry() {
  const navigate = useNavigate();
  const { data: me } = useMe();

  if (!me) return null;

  const visoes = [
    {
      role: "Workspace da Squad",
      title: "Construir produto com agentes",
      desc: "Capacidades, jornada completa da iniciativa com um agente por etapa, OKRs e execução autônoma.",
      to: "/squad/iniciativas",
      pode: !!me.squadId || me.papel === "arquiteto",
    },
    {
      role: "Console da Plataforma",
      title: "Configurar como tudo funciona",
      desc: "Blueprints, esteiras e GMUD, métodos, agentes & skills, MCPs, modelos e limites de custo.",
      to: "/console",
      pode: me.papel === "arquiteto",
    },
    {
      role: "Visão de Gestão",
      title: "Acompanhar indicadores",
      desc: "Fluxo de produção, lead time, sucesso de GMUD e custo de IA — com as documentações em consulta.",
      to: "/gestao",
      pode: ["diretor", "gerente", "coordenador"].includes(me.papel),
    },
  ].filter((v) => v.pode);

  if (visoes.length <= 1) return <Navigate to={homeDoPapel(me.papel)} replace />;

  return (
    <div className="screen-entry">
      <div className="entry-inner">
        <div className="entry-logo">AI</div>
        <h1>AI Workspace</h1>
        <p className="tag">
          Olá, <b>{me.nome}</b> — escolha a visão para continuar.
        </p>
        <div className="persona-grid">
          {visoes.map((v) => (
            <div key={v.to} className="persona-card" onClick={() => navigate(v.to)}>
              <span className="role">{v.role}</span>
              <h3>{v.title}</h3>
              <p>{v.desc}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="entry-foot">AI Workspace · plataforma AI-First da diretoria</div>
    </div>
  );
}
