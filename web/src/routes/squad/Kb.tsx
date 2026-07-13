import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post, put, useMe } from "../../lib/api";
import { Button, Chip, EscopoChip, Fld, Modal, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";
import { Markdown } from "./Docs";

interface Artigo {
  id: string;
  titulo: string;
  resumo: string | null;
  escopo: string;
  autorNome: string;
  criadoEm: string;
  endossos: string[];
  status?: string;
  origem?: string;
  repo?: string | null;
  progresso?: string | null;
  tipoDoc?: string | null;
  autorId?: string | null;
  editadoNome?: string | null;
  editadoEm?: string | null;
  plano?: { path: string; motivo: string; lido: boolean }[] | null;
}
interface TipoDoc { key: string; label: string; emoji: string; padrao: boolean }
interface ReposDisp { repos: { id: string; nome: string; linguagem: string | null }[]; temToken: boolean; tiposDoc: TipoDoc[] }

const ESCOPOS = [
  { key: "", label: "Todos" },
  { key: "squad", label: "Squad" },
  { key: "release_train", label: "Release Train" },
  { key: "comunidade", label: "Comunidade" },
];

export default function Kb() {
  const { data: me } = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [escopo, setEscopo] = useState("");
  const [publicando, setPublicando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [resumo, setResumo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [escopoNovo, setEscopoNovo] = useState("squad");
  const [gerando, setGerando] = useState(false);
  const [repoSel, setRepoSel] = useState("");
  const [escopoRepo, setEscopoRepo] = useState("squad");
  const [tiposSel, setTiposSel] = useState<string[]>([]);

  const { data: artigos } = useQuery<Artigo[]>({
    queryKey: ["kb", escopo],
    queryFn: () => api(`/kb${escopo ? `?escopo=${escopo}` : ""}`),
    // enquanto houver artigo "gerando", atualiza sozinho
    refetchInterval: (q) => (q.state.data?.some((a) => a.status === "gerando") ? 4000 : false),
  });
  const { data: reposDisp } = useQuery<ReposDisp>({ queryKey: ["kb-repos"], queryFn: () => api("/kb/repos-disponiveis") });

  const gerarDeRepo = useMutation({
    mutationFn: () => post<{ artigos: Artigo[] }>("/kb/gerar-de-repo", { repo: repoSel, escopo: escopoRepo, tipos: tiposSel }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["kb"] });
      setGerando(false); setRepoSel("");
      toast(`🤖 Gerando ${r.artigos?.length ?? 0} documento(s) do repositório…`);
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });
  const toggleTipo = (k: string) => setTiposSel((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const abrirGerar = () => {
    setEscopoRepo("squad");
    setRepoSel(reposDisp?.repos[0]?.nome ?? "");
    setTiposSel(reposDisp?.tiposDoc.filter((t) => t.padrao).map((t) => t.key) ?? []);
    setGerando(true);
  };

  const publicar = useMutation({
    mutationFn: () => post<Artigo>("/kb", { titulo, resumo: resumo || undefined, conteudo, escopo: escopoNovo }),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["kb"] });
      setPublicando(false);
      toast("📚 Artigo publicado na base de conhecimento");
      navigate(`/squad/kb/${a.id}`);
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  return (
    <>
      <PageHead
        title="Base de Conhecimento"
        description="Aprendizados da squad publicados por escopo. Gere documentação a partir dos repositórios para dar contexto ao time e aos agentes."
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={abrirGerar}>
              🤖 Gerar do repositório
            </Button>
            <Button variant="primary" onClick={() => setPublicando(true)}>
              + Publicar artigo
            </Button>
          </div>
        }
      />
      <div className="doc-toolbar">
        {ESCOPOS.map((e) => (
          <button key={e.key} className={`filter-chip ${escopo === e.key ? "active" : ""}`} onClick={() => setEscopo(e.key)}>
            {e.label}
          </button>
        ))}
      </div>
      <div className="grid g3">
        {artigos?.map((a) => {
          const gerandoArt = a.status === "gerando";
          const erroArt = a.status === "erro";
          return (
            <div key={a.id} className="kb-card" style={gerandoArt ? { opacity: 0.75, cursor: "default" } : undefined}
              onClick={() => !gerandoArt && navigate(`/squad/kb/${a.id}`)}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <EscopoChip escopo={a.escopo} />
                {a.tipoDoc && <Chip tone="blue">{(reposDisp?.tiposDoc.find((t) => t.key === a.tipoDoc)?.emoji ?? "📄")} {reposDisp?.tiposDoc.find((t) => t.key === a.tipoDoc)?.label ?? a.tipoDoc}</Chip>}
                {a.origem === "ia" && !a.tipoDoc && <Chip tone="blue">🤖 do repositório</Chip>}
                {gerandoArt && <Chip tone="warn">⏳ gerando…</Chip>}
                {erroArt && <Chip tone="crit">erro</Chip>}
                {a.endossos.length > 0 && <Chip tone="good">✓ endossado</Chip>}
              </div>
              <h3>{a.titulo}</h3>
              <p>{gerandoArt ? (a.progresso ?? "Lendo o repositório…") : erroArt ? (a.progresso ?? "Falha na geração") : a.resumo}</p>
              <div className="kb-foot">{a.autorNome} · {new Date(a.criadoEm).toLocaleDateString("pt-BR")}</div>
            </div>
          );
        })}
      </div>

      {publicando && (
        <Modal
          title="Publicar artigo na Base de Conhecimento"
          subtitle="Escolha o escopo — artigos de RT/comunidade dependem de endosso do CTO."
          onClose={() => setPublicando(false)}
          foot={
            <>
              <Button onClick={() => setPublicando(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => titulo.length >= 4 && conteudo.length >= 10 && publicar.mutate()}>
                {publicar.isPending ? "Publicando…" : "Publicar"}
              </Button>
            </>
          }
        >
          <Fld label="Título">
            <input className="in" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </Fld>
          <div className="fld-row">
            <Fld label="Escopo">
              <select className="in" value={escopoNovo} onChange={(e) => setEscopoNovo(e.target.value)}>
                <option value="squad">Squad {me?.squadNome ? `(${me.squadNome})` : ""}</option>
                <option value="release_train">Release Train</option>
                <option value="comunidade">Comunidade</option>
              </select>
            </Fld>
            <Fld label="Resumo">
              <input className="in" value={resumo} onChange={(e) => setResumo(e.target.value)} />
            </Fld>
          </div>
          <Fld label="Conteúdo (markdown)">
            <textarea className="in" rows={7} value={conteudo} onChange={(e) => setConteudo(e.target.value)} />
          </Fld>
        </Modal>
      )}

      {gerando && (
        <Modal
          title="Gerar documentação de um repositório"
          subtitle="A IA lê a estrutura, README e arquivos principais do repositório e escreve um artigo de contexto — que fica reutilizável pelo time e pelos agentes."
          onClose={() => setGerando(false)}
          foot={
            <>
              <Button onClick={() => setGerando(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => repoSel && tiposSel.length && gerarDeRepo.mutate()}>
                {gerarDeRepo.isPending ? "Iniciando…" : `🤖 Gerar ${tiposSel.length || ""} doc(s)`}
              </Button>
            </>
          }
        >
          {!reposDisp?.repos.length ? (
            <p className="sub">Nenhum repositório conectado à squad. Conecte repositórios em <Link to="/comunidade">Comunidade &amp; Pessoas</Link>.</p>
          ) : (
            <>
              <Fld label="Repositório">
                <select className="in" value={repoSel} onChange={(e) => setRepoSel(e.target.value)}>
                  {reposDisp.repos.map((r) => (
                    <option key={r.id} value={r.nome}>{r.nome}{r.linguagem ? ` · ${r.linguagem}` : ""}</option>
                  ))}
                </select>
              </Fld>
              <Fld label="Documentos a gerar">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {reposDisp.tiposDoc.map((t) => {
                    const on = tiposSel.includes(t.key);
                    return (
                      <button key={t.key} type="button" onClick={() => toggleTipo(t.key)}
                        className={`filter-chip ${on ? "active" : ""}`} style={{ borderRadius: 8 }}>
                        {on ? "✓ " : ""}{t.emoji} {t.label}
                      </button>
                    );
                  })}
                </div>
              </Fld>
              <Fld label="Escopo">
                <select className="in" value={escopoRepo} onChange={(e) => setEscopoRepo(e.target.value)}>
                  <option value="squad">Squad {me?.squadNome ? `(${me.squadNome})` : ""}</option>
                  <option value="release_train">Release Train</option>
                  <option value="comunidade">Comunidade</option>
                </select>
              </Fld>
              {!reposDisp.temToken && (
                <p className="sub" style={{ marginTop: 8 }}>
                  ⚠️ Sem token do GitHub configurado — repositórios privados podem não ser lidos. Configure o token em Capacidades.
                </p>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}

export function KbArtigo() {
  const { id } = useParams();
  const { data: me } = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: artigo } = useQuery<Artigo & { conteudo: string }>({
    queryKey: ["kb-artigo", id],
    queryFn: () => api(`/kb/${id}`),
    refetchInterval: (q) => (q.state.data?.status === "gerando" ? 4000 : false),
  });

  const endossar = useMutation({
    mutationFn: (nivel: string) => post(`/kb/${id}/endossar`, { nivel }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kb-artigo", id] });
      toast("✓ Endosso registrado");
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const [editando, setEditando] = useState(false);
  const [eTitulo, setETitulo] = useState("");
  const [eResumo, setEResumo] = useState("");
  const [eConteudo, setEConteudo] = useState("");
  const abrirEdicao = () => {
    if (!artigo) return;
    setETitulo(artigo.titulo); setEResumo(artigo.resumo ?? ""); setEConteudo(artigo.conteudo);
    setEditando(true);
  };
  const salvar = useMutation({
    mutationFn: () => put(`/kb/${id}`, { titulo: eTitulo, resumo: eResumo || null, conteudo: eConteudo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kb-artigo", id] });
      qc.invalidateQueries({ queryKey: ["kb"] });
      setEditando(false);
      toast("💾 Documento atualizado");
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });
  const regenerar = useMutation({
    mutationFn: () => post(`/kb/${id}/regenerar`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kb-artigo", id] }); toast("🤖 Regenerando documento…"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  if (!artigo) return <p className="muted">Carregando…</p>;
  const podeEditar = artigo.status !== "gerando" && (me?.papel === "pm" || me?.papel === "tech_lead" || me?.papel === "cto" || me?.id === artigo.autorId);
  return (
    <>
      <div className="crumbs">
        <Link to="/squad/kb">Base de Conhecimento</Link> › {artigo.titulo}
      </div>
      <div className="doc-page">
        <div className="doc-metabar">
          <span className="dm-ic">📚</span>
          <div>
            <h1>{artigo.titulo}</h1>
            <div className="dm-sub">
              {artigo.autorNome} · {new Date(artigo.criadoEm).toLocaleDateString("pt-BR")}
              {artigo.editadoNome && <> · ✍️ editado por {artigo.editadoNome}{artigo.editadoEm ? ` em ${new Date(artigo.editadoEm).toLocaleDateString("pt-BR")}` : ""}</>}
            </div>
          </div>
          <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {artigo.origem === "ia" && <Chip tone="blue">🤖 Gerado por IA{artigo.editadoNome ? " · revisado" : ""}</Chip>}
            <EscopoChip escopo={artigo.escopo} />
            {artigo.endossos.map((n) => (
              <Chip key={n} tone="good">✓ {n === "comunidade" ? "comunidade" : "RT"}</Chip>
            ))}
            {podeEditar && artigo.origem === "ia" && artigo.repo && <Button onClick={() => regenerar.mutate()}>🤖 Regenerar</Button>}
            {podeEditar && <Button onClick={abrirEdicao}>✏️ Editar</Button>}
            {me?.papel === "cto" && artigo.endossos.length < 2 && (
              <Button onClick={() => endossar.mutate(artigo.endossos.includes("release_train") ? "comunidade" : "release_train")}>
                Endossar
              </Button>
            )}
          </span>
        </div>
        {artigo.origem === "ia" && artigo.status === "pronto" && (
          <div className="card" style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            🤖 <span className="sub">Este documento foi gerado por IA a partir do repositório{artigo.repo ? ` ${artigo.repo}` : ""}. Revise e edite antes de tratar como fonte definitiva.</span>
          </div>
        )}
        {artigo.status === "gerando" ? (
          <div className="card" style={{ padding: 24 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 30 }}>⏳</div>
              <h3 style={{ margin: "8px 0 4px" }}>Gerando documentação…</h3>
              <p className="sub">{artigo.progresso ?? "Planejando a leitura do repositório."}</p>
            </div>
            {!!artigo.plano?.length && (
              <div style={{ marginTop: 16, maxWidth: 620, marginInline: "auto" }}>
                <div className="sub" style={{ fontSize: 12.5, marginBottom: 6 }}>Plano de leitura da IA</div>
                {artigo.plano.map((p) => (
                  <div key={p.path} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "4px 0", opacity: p.lido ? 1 : 0.6 }}>
                    <span>{p.lido ? "✅" : "⬜"}</span>
                    <div>
                      <code style={{ fontSize: 12.5 }}>{p.path}</code>
                      {p.motivo && <div className="sub" style={{ fontSize: 11.5 }}>{p.motivo}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {artigo.status === "erro" && <div className="card" style={{ marginBottom: 12 }}>⚠️ {artigo.progresso ?? "Falha na geração."}</div>}
            {artigo.progresso && artigo.status === "pronto" && <p className="sub" style={{ marginBottom: 8 }}>ℹ️ {artigo.progresso}</p>}
            <Markdown conteudo={artigo.conteudo} />
          </>
        )}
      </div>

      {editando && (
        <Modal
          title="Editar documento"
          subtitle="Edite o conteúdo em Markdown. A alteração fica registrada como revisão sua."
          onClose={() => setEditando(false)}
          foot={
            <>
              <Button onClick={() => setEditando(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => eTitulo.length >= 4 && eConteudo.length >= 1 && salvar.mutate()}>
                {salvar.isPending ? "Salvando…" : "💾 Salvar"}
              </Button>
            </>
          }
        >
          <Fld label="Título"><input className="in" value={eTitulo} onChange={(e) => setETitulo(e.target.value)} /></Fld>
          <Fld label="Resumo"><input className="in" value={eResumo} onChange={(e) => setEResumo(e.target.value)} /></Fld>
          <Fld label="Conteúdo (markdown)">
            <textarea className="in" rows={16} value={eConteudo} onChange={(e) => setEConteudo(e.target.value)} style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }} />
          </Fld>
        </Modal>
      )}
    </>
  );
}
