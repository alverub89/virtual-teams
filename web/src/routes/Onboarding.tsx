import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post, useMe } from "../lib/api";
import type { Me } from "../../../shared/types";

interface Agente { id: string; nome: string; emoji: string | null }
interface Fase { nome: string; agenteId: string; gera: string; checkpoint?: boolean }

const FASES_PADRAO: { nome: string; agente: string; gera: string; checkpoint?: boolean }[] = [
  { nome: "Brief", agente: "Analista", gera: "Brief do problema" },
  { nome: "PRD", agente: "PM", gera: "PRD com RF/NFR e métricas" },
  { nome: "Arquitetura", agente: "Arquiteto", gera: "Desenho e ADRs" },
  { nome: "Histórias", agente: "SM", gera: "Histórias INVEST" },
  { nome: "Desenvolvimento", agente: "Dev", gera: "Código e PRs" },
  { nome: "Esteira & GMUD", agente: "QA", gera: "Evidências e GMUD", checkpoint: true },
];

const PAPEIS = [
  { v: "pm", l: "Product Manager" },
  { v: "tech_lead", l: "Tech Lead" },
  { v: "gestao", l: "Gestão" },
];

// Onboarding do CTO: monta a plataforma da instituição, passo a passo.
export default function Onboarding() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [passo, setPasso] = useState(1);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const [comunidade, setComunidade] = useState("");
  const [releaseTrain, setReleaseTrain] = useState("");
  const [squad, setSquad] = useState("");
  const [metodoNome, setMetodoNome] = useState("");
  const [fases, setFases] = useState<Fase[]>([]);
  const [docTitulo, setDocTitulo] = useState("Padrões de Arquitetura");
  const [docConteudo, setDocConteudo] = useState(
    "## Guardrails da instituição\n- Idempotência em toda operação crítica\n- PII mascarada em logs e prompts\n- Nenhum agente faz merge ou abre mudança sem aprovação humana"
  );
  const [criado, setCriado] = useState<{ squadId: string; squadNome: string } | null>(null);
  const [conviteEmail, setConviteEmail] = useState("");
  const [convitePapel, setConvitePapel] = useState("pm");

  const { data: agentes } = useQuery<Agente[]>({
    queryKey: ["agentes-onb"],
    queryFn: () => api("/console/agentes"),
  });

  // Pré-preenche as fases quando os agentes chegam.
  useEffect(() => {
    if (agentes && agentes.length && fases.length === 0) {
      const byNome = (n: string) => agentes.find((a) => a.nome.includes(n))?.id ?? agentes[0].id;
      setFases(FASES_PADRAO.map((f) => ({ nome: f.nome, agenteId: byNome(f.agente), gera: f.gera, checkpoint: f.checkpoint })));
    }
  }, [agentes]);

  const pular = async () => {
    setCarregando(true);
    try {
      const { me: novo } = await post<{ me: Me }>("/onboarding/pular");
      qc.setQueryData(["me"], novo);
      navigate("/console", { replace: true });
    } finally {
      setCarregando(false);
    }
  };

  const criarPlataforma = async () => {
    setErro(null);
    setCarregando(true);
    try {
      const r = await post<{ me: Me; squadId: string; squadNome: string }>("/onboarding", {
        comunidadeNome: comunidade,
        releaseTrainNome: releaseTrain,
        squadNome: squad,
        metodoNome,
        metodoEtapas: fases.map((f) => ({ nome: f.nome, agenteId: f.agenteId, gera: f.gera, checkpoint: f.checkpoint })),
        docTitulo,
        docConteudo,
      });
      qc.setQueryData(["me"], r.me);
      setCriado({ squadId: r.squadId, squadNome: r.squadNome });
      setPasso(5);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  };

  const enviarConvite = async () => {
    setErro(null);
    setCarregando(true);
    try {
      if (conviteEmail.includes("@")) {
        await post("/convites", {
          email: conviteEmail,
          papel: convitePapel,
          squadId: convitePapel === "gestao" ? undefined : criado?.squadId,
        });
      }
      qc.invalidateQueries();
      navigate("/console", { replace: true });
    } catch (e) {
      setErro((e as Error).message);
      setCarregando(false);
    }
  };

  const setFase = (i: number, patch: Partial<Fase>) =>
    setFases((arr) => arr.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <div className="screen-entry">
      <div className="entry-inner" style={{ maxWidth: 680 }}>
        <div className="entry-logo">AI</div>
        <h1>Setup da plataforma</h1>
        <p className="tag">
          Olá, <b>{me?.nome}</b> — vamos montar a base para as squads. Você pode{" "}
          <a style={{ color: "#fff", textDecoration: "underline", cursor: "pointer" }} onClick={pular}>
            pular e configurar depois
          </a>
          .
        </p>

        <div className="onb-card" style={{ maxWidth: 680 }}>
          <span className="onb-step">Passo {passo} de 5</span>

          {passo === 1 && (
            <>
              <h3>Sua área e a primeira release train</h3>
              <p className="onb-help">A área é o guarda-chuva da diretoria; a release train agrupa squads afins.</p>
              <div className="fld">
                <label>Área (comunidade)</label>
                <input className="in" value={comunidade} onChange={(e) => setComunidade(e.target.value)} placeholder="Ex.: Meios de Pagamento" autoFocus />
              </div>
              <div className="fld">
                <label>Release Train</label>
                <input className="in" value={releaseTrain} onChange={(e) => setReleaseTrain(e.target.value)} placeholder="Ex.: RT Adquirência" />
              </div>
              <button className="btn primary onb-btn" disabled={comunidade.length < 2 || releaseTrain.length < 2} onClick={() => setPasso(2)}>
                Continuar
              </button>
            </>
          )}

          {passo === 2 && (
            <>
              <h3>A primeira squad</h3>
              <p className="onb-help">O time que vai trabalhar em features. Você convida as pessoas no fim.</p>
              <div className="fld">
                <label>Nome da squad</label>
                <input className="in" value={squad} onChange={(e) => setSquad(e.target.value)} placeholder="Ex.: Squad Pix" autoFocus />
              </div>
              <Nav onBack={() => setPasso(1)} onNext={() => setPasso(3)} disabled={squad.length < 2} />
            </>
          )}

          {passo === 3 && (
            <>
              <h3>O método institucional</h3>
              <p className="onb-help">O passo a passo que <b>toda squad</b> vai seguir: fases, agente responsável e o que cada fase gera. As squads herdam este default (e podem criar o próprio depois).</p>
              <div className="fld">
                <label>Nome do método</label>
                <input className="in" value={metodoNome} onChange={(e) => setMetodoNome(e.target.value)} placeholder="Ex.: Método Itaú de Produto" autoFocus />
              </div>
              <div style={{ maxHeight: 280, overflowY: "auto", marginTop: 4 }}>
                {fases.map((f, i) => (
                  <div key={i} className="card" style={{ padding: 10, marginBottom: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 1fr", gap: 8, alignItems: "center" }}>
                      <span className="onb-step" style={{ margin: 0 }}>{i + 1}</span>
                      <input className="in" value={f.nome} onChange={(e) => setFase(i, { nome: e.target.value })} placeholder="Fase" />
                      <select className="in" value={f.agenteId} onChange={(e) => setFase(i, { agenteId: e.target.value })}>
                        {agentes?.map((a) => (
                          <option key={a.id} value={a.id}>{a.emoji ?? "🤖"} {a.nome}</option>
                        ))}
                      </select>
                    </div>
                    <input className="in" style={{ marginTop: 6 }} value={f.gera} onChange={(e) => setFase(i, { gera: e.target.value })} placeholder="O que esta fase gera" />
                  </div>
                ))}
              </div>
              <Nav onBack={() => setPasso(2)} onNext={() => setPasso(4)} disabled={metodoNome.length < 2 || fases.length === 0} />
            </>
          )}

          {passo === 4 && (
            <>
              <h3>Documentação base</h3>
              <p className="onb-help">Padrões e guardrails da instituição — herdados por todas as squads e agentes.</p>
              <div className="fld">
                <label>Título</label>
                <input className="in" value={docTitulo} onChange={(e) => setDocTitulo(e.target.value)} />
              </div>
              <div className="fld">
                <label>Conteúdo (markdown)</label>
                <textarea className="in" rows={6} value={docConteudo} onChange={(e) => setDocConteudo(e.target.value)} />
              </div>
              {erro && <p className="login-note" style={{ color: "var(--crit)" }}>{erro}</p>}
              <Nav
                onBack={() => setPasso(3)}
                onNext={criarPlataforma}
                nextLabel={carregando ? "Criando…" : "Criar plataforma"}
                disabled={docTitulo.length < 3 || docConteudo.length < 10 || carregando}
              />
            </>
          )}

          {passo === 5 && (
            <>
              <h3>Convide a primeira pessoa</h3>
              <p className="onb-help">Estrutura, método e docs criados ✓. Agora convide alguém para a <b>{criado?.squadNome}</b> — ela recebe por email e já entra no lugar certo.</p>
              <div className="fld">
                <label>Email da pessoa</label>
                <input className="in" type="email" value={conviteEmail} onChange={(e) => setConviteEmail(e.target.value)} placeholder="pessoa@empresa.com" autoFocus />
              </div>
              <div className="fld">
                <label>Papel</label>
                <select className="in" value={convitePapel} onChange={(e) => setConvitePapel(e.target.value)}>
                  {PAPEIS.map((p) => (
                    <option key={p.v} value={p.v}>{p.l}</option>
                  ))}
                </select>
              </div>
              {erro && <p className="login-note" style={{ color: "var(--crit)" }}>{erro}</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button className="btn" style={{ justifyContent: "center", padding: "11px 18px" }} onClick={() => navigate("/console", { replace: true })}>
                  Pular convite
                </button>
                <button className="btn primary" style={{ flex: 1, justifyContent: "center", padding: "11px" }} disabled={carregando} onClick={enviarConvite}>
                  {carregando ? "Enviando…" : "Convidar e concluir"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Nav({ onBack, onNext, disabled, nextLabel = "Continuar" }: { onBack: () => void; onNext: () => void; disabled?: boolean; nextLabel?: string }) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
      <button className="btn" style={{ justifyContent: "center", padding: "11px 18px" }} onClick={onBack}>
        Voltar
      </button>
      <button className="btn primary" style={{ flex: 1, justifyContent: "center", padding: "11px" }} disabled={disabled} onClick={onNext}>
        {nextLabel}
      </button>
    </div>
  );
}
