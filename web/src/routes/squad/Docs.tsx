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
  iniciativaId?: string | null;
  iniciativaCodigo?: string | null;
  iniciativaTitulo?: string | null;
  squadNome?: string | null;
}

const TIPOS = [
  { key: "", label: "Todos os tipos" },
  { key: "prd", label: "PRDs" },
  { key: "adr", label: "ADRs" },
  { key: "sdd", label: "SDDs" },
  { key: "api", label: "APIs" },
  { key: "guia", label: "Guias" },
  { key: "postmortem", label: "Post-mortems" },
];
const ESCOPOS = [
  { key: "", label: "Todos os escopos" },
  { key: "squad", label: "Squad" },
  { key: "release_train", label: "Release Train" },
  { key: "comunidade", label: "Comunidade" },
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
  const [escopo, setEscopo] = useState("");
  const { data: docs } = useQuery<DocMeta[]>({ queryKey: ["docs", escopo], queryFn: () => api(`/docs${escopo ? `?escopo=${escopo}` : ""}`) });

  const filtrados = docs?.filter(
    (d) =>
      (!tipo || d.tipo === tipo) &&
      (!busca || `${d.titulo} ${d.resumo}`.toLowerCase().includes(busca.toLowerCase()))
  ) ?? [];

  // Agrupa por iniciativa; docs sem iniciativa ficam em "Documentos da squad".
  const grupos = new Map<string, { titulo: string; docs: DocMeta[] }>();
  for (const d of filtrados) {
    const chave = d.iniciativaId ?? "_avulsos";
    const titulo = d.iniciativaId ? `${d.iniciativaCodigo ?? "Iniciativa"} — ${d.iniciativaTitulo ?? ""}` : "Documentos da squad";
    if (!grupos.has(chave)) grupos.set(chave, { titulo, docs: [] });
    grupos.get(chave)!.docs.push(d);
  }
  const ordenados = [...grupos.entries()].sort((a, b) => (a[0] === "_avulsos" ? 1 : b[0] === "_avulsos" ? -1 : a[1].titulo.localeCompare(b[1].titulo)));

  return (
    <>
      <PageHead
        title="Documentação"
        description="Organizada por iniciativa e escopo. O que é de squad fica na squad; RT aparece para o Release Train; comunidade para todos."
      />
      <div className="doc-toolbar">
        <div className="doc-search">
          🔎 <input placeholder="Buscar documento…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {ESCOPOS.map((e) => (
          <button key={e.key} className={`filter-chip ${escopo === e.key ? "active" : ""}`} onClick={() => setEscopo(e.key)}>
            {e.label}
          </button>
        ))}
        <span style={{ width: 1, background: "rgba(127,127,127,.25)", alignSelf: "stretch" }} />
        {TIPOS.map((t) => (
          <button key={t.key} className={`filter-chip ${tipo === t.key ? "active" : ""}`} onClick={() => setTipo(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {ordenados.map(([chave, g]) => (
        <div key={chave} style={{ marginBottom: 22 }}>
          <h3 style={{ margin: "0 0 10px", display: "flex", gap: 8, alignItems: "center" }}>
            {chave === "_avulsos" ? "📁" : "🚀"} {g.titulo}
            <span className="sub" style={{ fontSize: 12.5, fontWeight: 400 }}>({g.docs.length})</span>
          </h3>
          <DocGrid docs={g.docs} base="/squad/docs" />
        </div>
      ))}
      {filtrados.length === 0 && <p className="empty-note">Nada encontrado.</p>}
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
