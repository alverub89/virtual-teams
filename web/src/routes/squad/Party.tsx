import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post } from "../../lib/api";
import { Button, Chip, Fld, Modal, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

interface Agente { id: string; nome: string; papel: string; emoji: string | null }
interface Sessao { id: string; titulo: string; topico: string; status: string; criadoEm: string }
interface Lista { agentes: Agente[]; sessoes: Sessao[] }

const St = ({ s }: { s: string }) =>
  s === "concluido" ? <Chip tone="good">concluído</Chip> : s === "erro" ? <Chip tone="crit">erro</Chip> : <Chip tone="warn">em andamento</Chip>;

export default function Party() {
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery<Lista>({ queryKey: ["party"], queryFn: () => api("/party") });

  const [aberto, setAberto] = useState(false);
  const [topico, setTopico] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [rounds, setRounds] = useState(2);
  const toggle = (id: string) => setSel((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < 5 ? [...c, id] : c));

  const iniciar = useMutation({
    mutationFn: () => post<{ id: string }>("/party", { topico, agenteIds: sel, rounds }),
    onSuccess: (r) => { setAberto(false); setTopico(""); setSel([]); qc.invalidateQueries({ queryKey: ["party"] }); nav(`/squad/party/${r.id}`); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  return (
    <>
      <PageHead
        title="Mesa-redonda"
        description="Coloque vários agentes para debaterem um tópico entre si — o orquestrador conduz os turnos e fecha com uma síntese."
        actions={<Button variant="primary" onClick={() => { setSel(data?.agentes.slice(0, 3).map((a) => a.id) ?? []); setAberto(true); }}>+ Nova mesa</Button>}
      />
      {!data?.sessoes.length && (
        <div className="card" style={{ textAlign: "center", padding: 30 }}>
          <div style={{ fontSize: 32 }}>🎭</div>
          <h3 style={{ margin: "8px 0 4px" }}>Nenhuma mesa ainda</h3>
          <p className="sub">Escolha um tópico e de 2 a 5 agentes; eles debatem e você recebe uma síntese com acordos, divergências e próximos passos.</p>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
        {data?.sessoes.map((sess) => (
          <Link key={sess.id} to={`/squad/party/${sess.id}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
              <strong>{sess.titulo}</strong><St s={sess.status} />
            </div>
            <p className="sub" style={{ margin: "6px 0 0", fontSize: 12.5 }}>{sess.topico}</p>
          </Link>
        ))}
      </div>

      {aberto && (
        <Modal title="Nova mesa-redonda" subtitle="Escolha o tópico e os agentes (2 a 5)." onClose={() => setAberto(false)}
          foot={<><Button onClick={() => setAberto(false)}>Cancelar</Button><Button variant="primary" onClick={() => topico.length >= 4 && sel.length >= 2 && iniciar.mutate()}>{iniciar.isPending ? "Iniciando…" : "🎭 Iniciar"}</Button></>}>
          <Fld label="Tópico do debate"><textarea className="in" rows={2} value={topico} onChange={(e) => setTopico(e.target.value)} placeholder="Ex.: Devemos priorizar PIX Automático agora?" /></Fld>
          <Fld label={`Agentes (${sel.length}/5)`}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {data?.agentes.map((a) => {
                const on = sel.includes(a.id);
                return (
                  <button key={a.id} type="button" className={`filter-chip ${on ? "active" : ""}`} style={{ borderRadius: 8 }} onClick={() => toggle(a.id)}>
                    {on ? "✓ " : ""}{a.emoji ?? "🤖"} {a.nome}
                  </button>
                );
              })}
            </div>
          </Fld>
          <Fld label="Rodadas">
            <select className="in" style={{ maxWidth: 120 }} value={rounds} onChange={(e) => setRounds(Number(e.target.value))}>
              <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
            </select>
          </Fld>
        </Modal>
      )}
    </>
  );
}

interface Turno { ordem: number; agenteNome: string; emoji: string | null; conteudo: string }
interface Det { sessao: { id: string; titulo: string; topico: string; status: string; progresso: string | null; sintese: string | null; criadoEm: string }; turnos: Turno[] }

export function PartySessao() {
  const { id = "" } = useParams();
  const { data } = useQuery<Det>({
    queryKey: ["party-sessao", id],
    queryFn: () => api(`/party/${id}`),
    refetchInterval: (q) => (q.state.data?.sessao.status === "em_andamento" ? 3000 : false),
  });
  if (!data) return <PageHead title="Mesa-redonda" description="Carregando…" />;
  const s = data.sessao;
  return (
    <>
      <PageHead title={s.titulo} description={s.topico}
        actions={<div style={{ display: "flex", gap: 8, alignItems: "center" }}><St s={s.status} /><Link to="/squad/party" className="btn">← Mesas</Link></div>} />

      {s.status === "em_andamento" && (
        <div className="card" style={{ marginBottom: 12 }}>⏳ {s.progresso ?? "Conduzindo o debate…"}</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {data.turnos.map((t) => (
          <div key={t.ordem} className="card" style={{ display: "flex", gap: 12, alignItems: "start" }}>
            <span className="avatar" style={{ background: "var(--accent-deep, #1e40af)", flexShrink: 0 }}>{t.emoji ?? "🤖"}</span>
            <div>
              <b>{t.agenteNome}</b>
              <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{t.conteudo}</p>
            </div>
          </div>
        ))}
      </div>

      {s.sintese && (
        <div className="card" style={{ marginTop: 14, borderLeft: "3px solid var(--accent, #2563eb)" }}>
          <h3 style={{ marginTop: 0 }}>🎭 Síntese da mesa</h3>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{s.sintese}</div>
        </div>
      )}
    </>
  );
}
