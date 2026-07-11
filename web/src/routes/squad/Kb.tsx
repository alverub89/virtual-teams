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
}

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

  const { data: artigos } = useQuery<Artigo[]>({
    queryKey: ["kb", escopo],
    queryFn: () => api(`/kb${escopo ? `?escopo=${escopo}` : ""}`),
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
        description="Aprendizados da squad publicados por escopo. Artigos endossados valem para o release train ou a comunidade inteira."
        actions={
          <Button variant="primary" onClick={() => setPublicando(true)}>
            + Publicar artigo
          </Button>
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
        {artigos?.map((a) => (
          <div key={a.id} className="kb-card" onClick={() => navigate(`/squad/kb/${a.id}`)}>
            <div style={{ display: "flex", gap: 6 }}>
              <EscopoChip escopo={a.escopo} />
              {a.endossos.length > 0 && <Chip tone="good">✓ endossado</Chip>}
            </div>
            <h3>{a.titulo}</h3>
            <p>{a.resumo}</p>
            <div className="kb-foot">{a.autorNome} · {new Date(a.criadoEm).toLocaleDateString("pt-BR")}</div>
          </div>
        ))}
      </div>

      {publicando && (
        <Modal
          title="Publicar artigo na Base de Conhecimento"
          subtitle="Escolha o escopo — artigos de RT/comunidade dependem de endosso do arquiteto."
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
            {me?.papel === "arquiteto" && artigo.endossos.length < 2 && (
              <Button onClick={() => endossar.mutate(artigo.endossos.includes("release_train") ? "comunidade" : "release_train")}>
                Endossar
              </Button>
            )}
          </span>
        </div>
        <Markdown conteudo={artigo.conteudo} />
      </div>
    </>
  );
}
