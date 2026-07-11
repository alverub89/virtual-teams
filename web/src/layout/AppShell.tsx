import { NavLink, Outlet, useNavigate } from "react-router-dom";
import type { NavSection } from "../routes/nav";

export default function AppShell({
  sections,
  foot,
}: {
  sections: NavSection[];
  foot?: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="app">
      <div className="topbar">
        <div className="brand" onClick={() => navigate("/")}>
          <span className="logo">AI</span>
          AI Workspace <small>Plataforma AI-First de Produto</small>
        </div>
        <div className="spacer" />
        <span className="env-chip">ambiente de desenvolvimento</span>
        <button className="persona-chip" onClick={() => navigate("/")}>
          <span className="avatar" style={{ background: "#b85700" }}>
            ·
          </span>
          Trocar de visão ▾
        </button>
      </div>
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
