import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NavSection } from "../routes/nav";
import { api, post, useMe } from "../lib/api";

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

  // O modo auditoria vem do cookie assinado (me.auditSquadId). Sem squad
  // escolhida, mostramos um convite claro em vez de páginas vazias.
  const precisaEscolherSquad = audit && me?.papel === "cto" && !me?.auditSquadId;

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
            {precisaEscolherSquad ? (
              <div className="card" style={{ textAlign: "center", padding: 40, maxWidth: 620, margin: "24px auto" }}>
                <div style={{ fontSize: 34 }}>🔍</div>
                <h3 style={{ margin: "10px 0 6px" }}>Escolha uma squad para auditar</h3>
                <p className="sub" style={{ margin: "0 auto", maxWidth: 460 }}>
                  Como CTO você entra na visão da squad em <b>modo leitura</b> — percorra a jornada real
                  (Brief → PRD → Arquitetura → Histórias → Desenvolvimento → GMUD), iniciativas, docs e OKRs,
                  sem alterar nada. Use o seletor <b>“— escolher squad —”</b> na barra acima.
                </p>
              </div>
            ) : (
              <Outlet />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// Barra de "auditar como squad": liga/desliga o MODO DE SESSÃO no servidor
// (reemite o cookie). O estado atual vem de me.auditSquadId, não do cliente.
function AuditBar() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data } = useQuery<{ squads: { id: string; nome: string }[] }>({
    queryKey: ["me-squads"],
    queryFn: () => api("/me/squads"),
    staleTime: 60_000,
  });
  const atualId = me?.auditSquadId ?? "";
  const atualNome = data?.squads.find((s) => s.id === atualId)?.nome ?? me?.squadNome ?? "";

  const refazTudo = () => { qc.invalidateQueries({ queryKey: ["me"] }); qc.invalidateQueries(); };
  const iniciar = useMutation({
    mutationFn: (squadId: string) => post("/me/audit/start", { squadId }),
    onSuccess: refazTudo,
  });
  const encerrar = useMutation({
    mutationFn: () => post("/me/audit/stop"),
    onSuccess: refazTudo,
  });
  const ocupado = iniciar.isPending || encerrar.isPending;

  return (
    <div className={`audit-bar ${atualId ? "on" : ""}`}>
      <span className="audit-icon">🔍</span>
      {atualId ? (
        <>
          <b>Auditando como {atualNome}</b>
          <span className="audit-note">visão somente leitura — o servidor bloqueia qualquer alteração da squad</span>
        </>
      ) : (
        <span className="audit-note">Auditar como squad — veja a plataforma pela ótica de uma squad</span>
      )}
      <div className="spacer" />
      <select className="in" value={atualId} disabled={ocupado} onChange={(e) => e.target.value && iniciar.mutate(e.target.value)} style={{ maxWidth: 220 }}>
        <option value="">— escolher squad —</option>
        {data?.squads.map((s) => (
          <option key={s.id} value={s.id}>{s.nome}</option>
        ))}
      </select>
      {atualId && (
        <button className="btn" disabled={ocupado} onClick={() => encerrar.mutate()}>Sair da auditoria</button>
      )}
    </div>
  );
}
