import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NavSection } from "../routes/nav";
import { api, getAuditSquad, post, setAuditSquad, useMe } from "../lib/api";

const iniciais = (nome: string) =>
  nome.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export default function AppShell({
  sections,
  foot,
  audit,
}: {
  sections: NavSection[];
  foot?: React.ReactNode;
  audit?: boolean;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();

  const sair = async () => {
    await post("/auth/logout");
    qc.clear();
    navigate("/login");
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand" onClick={() => navigate("/")}>
          <span className="logo">AI</span>
          AI Workspace <small>Plataforma AI-First de Produto</small>
        </div>
        <div className="spacer" />
        {me?.squadNome && <span className="env-chip">{me.squadNome}</span>}
        <button className="persona-chip" onClick={() => navigate("/")} title="Trocar de visão">
          <span className="avatar" style={{ background: "#b85700" }}>
            {me ? iniciais(me.nome) : "·"}
          </span>
          {me ? `${me.nome} · ${me.papel}` : "…"} ▾
        </button>
        <button className="env-chip" onClick={sair} style={{ cursor: "pointer" }}>
          ⎋ Sair
        </button>
      </div>
      {audit && me?.papel === "cto" && <AuditBar />}
      <div className="frame">
        <nav className="sidebar">
          {sections.map((s) => (
            <div key={s.label}>
              <div className="side-label">{s.label}</div>
              {s.items.map((i) => (
                <NavLink
                  key={i.path}
                  to={i.path}
                  end={i.path === "/console" || i.path === "/gestao"}
                  className={({ isActive }) => `side-item ${isActive ? "active" : ""}`}
                >
                  {i.label}
                </NavLink>
              ))}
            </div>
          ))}
          {foot && <div className="side-foot">{foot}</div>}
        </nav>
        <main>
          <div className="content">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

// Barra de "auditar como squad": só o CTO vê. Escolhe uma squad e passa a
// enxergar a área com a visão dela, em modo leitura.
function AuditBar() {
  const qc = useQueryClient();
  const [atual, setAtual] = useState(getAuditSquad());
  const { data } = useQuery<{ squads: { id: string; nome: string }[] }>({
    queryKey: ["me-squads"],
    queryFn: () => api("/me/squads"),
    staleTime: 60_000,
  });

  useEffect(() => {
    const h = () => setAtual(getAuditSquad());
    window.addEventListener("aiw-audit-change", h);
    return () => window.removeEventListener("aiw-audit-change", h);
  }, []);

  const escolher = (id: string) => {
    const sq = data?.squads.find((s) => s.id === id) ?? null;
    setAuditSquad(sq);
    qc.invalidateQueries(); // refaz tudo com o novo header
  };

  return (
    <div className={`audit-bar ${atual ? "on" : ""}`}>
      <span className="audit-icon">🔍</span>
      {atual ? (
        <>
          <b>Auditando como {atual.nome}</b>
          <span className="audit-note">visão somente leitura — você não altera nada da squad</span>
        </>
      ) : (
        <span className="audit-note">Auditar como squad — veja a plataforma pela ótica de uma squad</span>
      )}
      <div className="spacer" />
      <select className="in" value={atual?.id ?? ""} onChange={(e) => escolher(e.target.value)} style={{ maxWidth: 220 }}>
        <option value="">— escolher squad —</option>
        {data?.squads.map((s) => (
          <option key={s.id} value={s.id}>{s.nome}</option>
        ))}
      </select>
      {atual && (
        <button className="btn" onClick={() => { setAuditSquad(null); qc.invalidateQueries(); }}>Sair da auditoria</button>
      )}
    </div>
  );
}
