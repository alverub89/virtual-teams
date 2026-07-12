import { Navigate, useNavigate } from "react-router-dom";
import { useMe } from "../lib/api";
import { homeDoPapel } from "../../../shared/types";

// Seletor de visão — só aparece para quem tem acesso a mais de um contexto.
export default function Entry() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  if (!me) return null;

  const visoes = [
    {
      role: "Console da Plataforma",
      title: "Configurar a plataforma",
      desc: "Estrutura da área, método institucional, documentação base, agentes e convites.",
      to: "/console",
      pode: me.papel === "cto",
    },
    {
      role: "Workspace da Squad",
      title: "Construir produto com agentes",
      desc: "Iniciativas com a jornada, OKRs, execução autônoma e a estação dev.",
      to: "/squad/iniciativas",
      pode: ["pm", "tech_lead", "dev"].includes(me.papel),
    },
    {
      role: "Visão de Gestão",
      title: "Acompanhar resultados",
      desc: "Indicadores da área e produtividade das squads.",
      to: "/gestao",
      pode: me.papel === "gestao" || me.papel === "cto",
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
