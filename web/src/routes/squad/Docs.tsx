import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { EscopoChip, PageHead } from "../../components/ui";

export interface DocMeta {
  id: string;
  titulo: string;
  tipo: string;
  emoji: string | null;
  resumo: string | null;
  autorNome: string;
  escopo: string;
  criadoEm: string;
}

const TIPOS = [
  { key: "", label: "Todos" },
  { key: "prd", label: "PRDs" },
  { key: "adr", label: "ADRs" },
  { key: "api", label: "APIs" },
  { key: "guia", label: "Guias" },
  { key: "postmortem", label: "Post-mortems" },
];

export function DocGrid({ docs, base }: { docs: DocMeta[] | undefined; base: string }) {
  return (
    <div className="grid g3">
      {docs?.map((d) => (
        <Link key={d.id} to={`${base}/${d.id}`} className="doc-card" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="dc-top">
            <span className="dc-ic">{d.emoji ?? "📄"}</span>
            <div>
              <h3>{d.titulo}</h3>
              <div className="dc-meta">{d.autorNome}</div>
            </div>
          </div>
          <p>{d.resumo}</p>
          <div className="dc-foot" style={{ display: "flex", gap: 6 }}>
            <EscopoChip escopo={d.escopo} />
            <span className="pill">{d.tipo.toUpperCase()}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function Docs() {
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("");
  const { data: docs } = useQuery<DocMeta[]>({ queryKey: ["docs"], queryFn: () => api("/docs") });

  const filtrados = docs?.filter(
    (d) =>
      (!tipo || d.tipo === tipo) &&
      (!busca || `${d.titulo} ${d.resumo}`.toLowerCase().includes(busca.toLowerCase()))
  );

  return (
    <>
      <PageHead
        title="Documentação"
        description="Documentos da squad — gerados pelos agentes na jornada e escritos por pessoas. Escopos superiores aparecem para consulta."
      />
      <div className="doc-toolbar">
        <div className="doc-search">
          🔎 <input placeholder="Buscar documento…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {TIPOS.map((t) => (
          <button key={t.key} className={`filter-chip ${tipo === t.key ? "active" : ""}`} onClick={() => setTipo(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <DocGrid docs={filtrados} base="/squad/docs" />
      {filtrados?.length === 0 && <p className="empty-note">Nada encontrado.</p>}
    </>
  );
}

export function DocReader({ base }: { base: string }) {
  const { id } = useParams();
  const { data: doc } = useQuery<DocMeta & { conteudo: string; extra?: { promptPronto?: string; arquivo?: string } | null }>({
    queryKey: ["doc", id],
    queryFn: () => api(`/docs/${id}`),
  });
  if (!doc) return <p className="muted">Carregando…</p>;
  const isSdd = doc.tipo === "sdd";
  const copiar = async (txt: string) => { try { await navigator.clipboard.writeText(txt); } catch { /* */ } };
  const baixarSpec = () => {
    const blob = new Blob([doc.conteudo], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = doc.extra?.arquivo ?? "spec.md";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <>
      <div className="crumbs">
        <Link to={base}>Documentação</Link> › {doc.titulo}
      </div>
      <div className="doc-page">
        <div className="doc-metabar">
          <span className="dm-ic">{doc.emoji ?? "📄"}</span>
          <div>
            <h1>{doc.titulo}</h1>
            <div className="dm-sub">
              {doc.autorNome} · {new Date(doc.criadoEm).toLocaleDateString("pt-BR")}
            </div>
          </div>
          <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            {isSdd && doc.extra?.promptPronto && <button className="btn" onClick={() => copiar(doc.extra!.promptPronto!)}>📋 Copiar prompt</button>}
            {isSdd && <button className="btn" onClick={baixarSpec}>⬇️ Baixar {doc.extra?.arquivo ?? "spec.md"}</button>}
            <EscopoChip escopo={doc.escopo} />
          </span>
        </div>
        {isSdd && (
          <div className="card" style={{ marginBottom: 12, fontSize: 13 }}>
            🧩 <b>SDD para desenvolver em outro agente.</b> <span className="sub">Copie o prompt e cole no seu agente de código (Cursor, Claude Code…), ou baixe o {doc.extra?.arquivo ?? "spec.md"} para commitar no repositório.</span>
          </div>
        )}
        <Markdown conteudo={doc.conteudo} />
      </div>
    </>
  );
}

/* Render mínimo de markdown (h2, listas, negrito, parágrafos). */
export function Markdown({ conteudo }: { conteudo: string }) {
  const blocos = conteudo.split(/\n\n+/);
  return (
    <div className="prose">
      {blocos.map((b, i) => {
        const linhas = b.split("\n");
        if (linhas[0]?.startsWith("## ")) {
          return (
            <div key={i}>
              <h2>{linhas[0].slice(3)}</h2>
              {linhas.length > 1 && <Markdown conteudo={linhas.slice(1).join("\n")} />}
            </div>
          );
        }
        if (linhas.every((l) => l.trim().startsWith("- ") || l.trim().match(/^\d+\./))) {
          return (
            <ul key={i}>
              {linhas.map((l, j) => (
                <li key={j}>{negrito(l.replace(/^[-\d.]+\s*/, ""))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{negrito(b)}</p>;
      })}
    </div>
  );
}

function negrito(texto: string) {
  const partes = texto.split(/\*\*(.+?)\*\*/g);
  return partes.map((p, i) => (i % 2 === 1 ? <b key={i}>{p}</b> : p));
}
