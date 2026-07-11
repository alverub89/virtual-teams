import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Chip, PageHead } from "../../components/ui";

/* Telas de governança do console: blueprints, métodos, esteira e MCPs/modelos. */

interface Blueprint { id: string; nome: string; descricao: string | null; guardRails: string[] }

export function Blueprints() {
  const { data } = useQuery<Blueprint[]>({ queryKey: ["blueprints"], queryFn: () => api("/console/blueprints") });
  return (
    <>
      <PageHead
        title="Arquitetura & padrões"
        description="Blueprints herdados por todas as squads. Os guard-rails aqui valem para pessoas e agentes."
      />
      <div className="grid g3">
        {data?.map((b) => (
          <div key={b.id} className="card card-pad">
            <h3>🏛️ {b.nome}</h3>
            <p className="sub">{b.descricao}</p>
            <div className="sec-title" style={{ margin: "12px 0 6px" }}>Guard-rails</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {b.guardRails.map((g) => (
                <span key={g} className="pill">🛡️ {g}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

interface Metodo {
  id: string;
  nome: string;
  versao: string;
  descricao: string | null;
  ativo: boolean;
  etapas: { id: string; ordem: number; nome: string; agenteNome: string | null; tipo: string; descricao: string | null }[];
}

export function Metodos() {
  const { data } = useQuery<Metodo[]>({ queryKey: ["metodos"], queryFn: () => api("/console/metodos") });
  return (
    <>
      <PageHead
        title="Métodos"
        description="Os métodos de trabalho plugáveis da plataforma. O método ativo define as etapas da jornada de toda iniciativa."
      />
      {data?.map((m) => (
        <div key={m.id} className="card" style={{ marginBottom: 14 }}>
          <div className="card-pad" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <h3>{m.nome} <span className="muted">{m.versao}</span></h3>
              <p className="sub">{m.descricao}</p>
            </div>
            {m.ativo && <Chip tone="good">ativo · todas as squads</Chip>}
          </div>
          <div style={{ padding: "0 20px 18px" }}>
            {m.etapas.map((e) => (
              <div key={e.id} className="cfg-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
                <span className="icon-sq">{e.ordem}</span>
                <div className="c-info">
                  <b>{e.nome}</b>
                  <span>{e.descricao}</span>
                </div>
                {e.tipo === "checkpoint" && <span className="hitl">checkpoint</span>}
                <Chip>{e.agenteNome ?? "—"}</Chip>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function EsteiraConfig() {
  return (
    <>
      <PageHead
        title="Esteiras & GMUD"
        description="Gates de qualidade da esteira padrão e as regras de mudança. Configuração global — squads herdam."
      />
      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <h3>Gates de qualidade (esteira padrão)</h3>
        <p className="sub" style={{ marginBottom: 10 }}>todo repositório conectado passa por estes gates</p>
        {[
          ["build", "Build reproduzível com cache", "obrigatório"],
          ["testes", "Suíte completa · cobertura mínima 80%", "obrigatório"],
          ["seguranca", "SAST + análise de dependências + segredo no código", "obrigatório"],
          ["deploy_hml", "Deploy em homologação com smoke test", "obrigatório"],
          ["gmud", "Mudança aprovada no ServiceNow com evidências", "crítico · checkpoint humano"],
          ["deploy_prod", "Deploy canário com rollback automático", "obrigatório"],
        ].map(([key, desc, tipo]) => (
          <div key={key} className="cfg-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <span className="icon-sq">⚙️</span>
            <div className="c-info">
              <b>{key.replace("_", " ")}</b>
              <span>{desc}</span>
            </div>
            <Chip tone={tipo.startsWith("crítico") ? "crit" : "neutral"}>{tipo}</Chip>
          </div>
        ))}
      </div>
      <div className="banner">
        🛡️ <span><b>Guard-rail global:</b> nenhum agente faz merge ou abre GMUD sem checkpoint humano aprovado. Isso é aplicado no servidor, não na interface.</span>
      </div>
    </>
  );
}

interface Mcp { id: string; nome: string; sistema: string; status: string; descricao: string | null; tools: { id: string; nome: string; permissao: string }[] }
interface Rota { id: string; tarefa: string; nivel: string; modelo: string; custoRelativo: number }
interface Consumo { id: string; squadNome: string; promptTokens: number; completionTokens: number; custo: number; budget: number | null; percentual: number | null }

export function Mcps() {
  const { data: mcps } = useQuery<Mcp[]>({ queryKey: ["mcps"], queryFn: () => api("/console/mcps") });
  const { data: rotas } = useQuery<Rota[]>({ queryKey: ["modelos"], queryFn: () => api("/console/modelos") });
  const { data: consumo } = useQuery<Consumo[]>({ queryKey: ["consumo"], queryFn: () => api("/console/consumo") });

  return (
    <>
      <PageHead
        title="MCPs & modelos"
        description="Conexões com os sistemas da casa, o roteamento de modelos por tarefa (escalar barato) e o consumo por squad."
      />
      <div className="sec-title">Conexões MCP</div>
      <div className="grid g3" style={{ marginBottom: 8 }}>
        {mcps?.map((m) => (
          <div key={m.id} className="card card-pad">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ flex: 1 }}>{m.nome}</h3>
              <Chip tone={m.status === "conectado" ? "good" : "crit"}>
                <span className="dot" style={{ background: m.status === "conectado" ? "var(--good)" : "var(--crit)" }} /> {m.status}
              </Chip>
            </div>
            <p className="sub">{m.descricao}</p>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
              {m.tools.map((t) => (
                <span key={t.id} className={`perm ${t.permissao}`}>{t.nome}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="sec-title">Roteamento de modelos por tarefa</div>
      <div className="card" style={{ marginBottom: 8 }}>
        <table className="tbl">
          <thead>
            <tr><th>Tarefa</th><th>Nível</th><th>Modelo</th><th>Custo relativo</th></tr>
          </thead>
          <tbody>
            {rotas?.map((r) => (
              <tr key={r.id}>
                <td>{r.tarefa}</td>
                <td><Chip tone={r.nivel === "avancado" ? "blue" : r.nivel === "leve" ? "neutral" : "warn"}>{r.nivel}</Chip></td>
                <td className="mono">{r.modelo}</td>
                <td className="num">{r.custoRelativo}×</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sec-title">Consumo por squad — mês atual</div>
      <div className="card card-pad">
        {consumo?.map((c) => (
          <div key={c.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, fontSize: 12.5, marginBottom: 4 }}>
              <b style={{ flex: 1 }}>{c.squadNome}</b>
              <span className="muted num">
                {((c.promptTokens + c.completionTokens) / 1e6).toFixed(2)}M tokens · R$ {c.custo.toFixed(0)}
                {c.percentual != null && ` · ${c.percentual}% do budget`}
              </span>
            </div>
            <div className="meter">
              <i className={c.percentual != null && c.percentual >= 80 ? "warn" : ""} style={{ width: `${Math.min(100, c.percentual ?? 0)}%` }} />
            </div>
          </div>
        ))}
        <p className="axis-note">alerta automático ao atingir 80% do budget da squad</p>
      </div>
    </>
  );
}
