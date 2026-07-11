import { useNavigate } from "react-router-dom";

// Seletor de visão — aparece para quem tem acesso a mais de um contexto
// (docs/spec, seção 4.1). Com RBAC real, o redirect por papel é automático.
const VISOES = [
  {
    role: "Squad",
    title: "Trabalhar na squad",
    desc: "Iniciativas, jornada com agentes, OKRs, docs e execução autônoma.",
    to: "/squad/iniciativas",
  },
  {
    role: "Console",
    title: "Configurar a plataforma",
    desc: "Blueprints, esteiras, métodos, agentes & skills, MCPs e modelos.",
    to: "/console",
  },
  {
    role: "Gestão",
    title: "Acompanhar resultados",
    desc: "Indicadores da diretoria e documentações em modo consulta.",
    to: "/gestao",
  },
];

export default function Entry() {
  const navigate = useNavigate();
  return (
    <div className="screen-entry">
      <div className="entry-inner">
        <div className="entry-logo">AI</div>
        <h1>AI Workspace</h1>
        <p className="tag">
          O ambiente <b>AI-First</b> de produto da diretoria — da ideia à produção.
        </p>
        <div className="persona-grid">
          {VISOES.map((v) => (
            <div key={v.to} className="persona-card" onClick={() => navigate(v.to)}>
              <span className="role">{v.role}</span>
              <h3>{v.title}</h3>
              <p>{v.desc}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="entry-foot">Escolha a visão para continuar</div>
    </div>
  );
}
