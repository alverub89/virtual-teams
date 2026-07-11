import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { NavSection } from "../routes/nav";
import { post, useMe } from "../lib/api";

const iniciais = (nome: string) =>
  nome.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export default function AppShell({
  sections,
  foot,
}: {
  sections: NavSection[];
  foot?: React.ReactNode;
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
