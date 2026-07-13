import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post, useMe } from "../../lib/api";
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
}
interface ReposDisp { repos: { id: string; nome: string; linguagem: string | null }[]; temToken: boolean }

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

  const { data: artigos } = useQuery<Artigo[]>({
    queryKey: ["kb", escopo],
    queryFn: () => api(`/kb${escopo ? `?escopo=${escopo}` : ""}`),
    // enquanto houver artigo "gerando", atualiza sozinho
    refetchInterval: (q) => (q.state.data?.some((a) => a.status === "gerando") ? 4000 : false),
  });
  const { data: reposDisp } = useQuery<ReposDisp>({ queryKey: ["kb-repos"], queryFn: () => api("/kb/repos-disponiveis") });

  const gerarDeRepo = useMutation({
    mutationFn: () => post<Artigo>("/kb/gerar-de-repo", { repo: repoSel, escopo: escopoRepo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kb"] });
      setGerando(false); setRepoSel("");
      toast("🤖 Gerando documentação do repositório…");
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

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
            <Button onClick={() => { setEscopoRepo("squad"); setRepoSel(reposDisp?.repos[0]?.nome ?? ""); setGerando(true); }}>
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
                {a.origem === "ia" && <Chip tone="blue">🤖 do repositório</Chip>}
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
              <Button variant="primary" onClick={() => repoSel && gerarDeRepo.mutate()}>
                {gerarDeRepo.isPending ? "Iniciando…" : "🤖 Gerar"}
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

  if (!artigo) return <p className="muted">Carregando…</p>;
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
            <div className="dm-sub">{artigo.autorNome} · {new Date(artigo.criadoEm).toLocaleDateString("pt-BR")}</div>
          </div>
          <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            <EscopoChip escopo={artigo.escopo} />
            {artigo.endossos.map((n) => (
              <Chip key={n} tone="good">✓ {n === "comunidade" ? "comunidade" : "RT"}</Chip>
            ))}
            {me?.papel === "cto" && artigo.endossos.length < 2 && (
              <Button onClick={() => endossar.mutate(artigo.endossos.includes("release_train") ? "comunidade" : "release_train")}>
                Endossar
              </Button>
            )}
          </span>
        </div>
        {artigo.status === "gerando" ? (
          <div className="card" style={{ textAlign: "center", padding: 28 }}>
            <div style={{ fontSize: 30 }}>⏳</div>
            <h3 style={{ margin: "8px 0 4px" }}>Gerando documentação…</h3>
            <p className="sub">{artigo.progresso ?? "Lendo o repositório e sintetizando o artigo."}</p>
          </div>
        ) : (
          <>
            {artigo.status === "erro" && <div className="card" style={{ marginBottom: 12 }}>⚠️ {artigo.progresso ?? "Falha na geração."}</div>}
            {artigo.progresso && artigo.status === "pronto" && <p className="sub" style={{ marginBottom: 8 }}>ℹ️ {artigo.progresso}</p>}
            <Markdown conteudo={artigo.conteudo} />
          </>
        )}
      </div>
    </>
  );
}
