import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { PageHead } from "../../components/ui";
import { DocGrid, type DocMeta } from "../squad/Docs";

/* Documentações em modo consulta para a diretoria. */

export function DocsFeatures() {
  const { data: docs, isLoading } = useQuery<DocMeta[]>({ queryKey: ["docs-gestao"], queryFn: () => api("/docs?comunidade=1") });
  // "Features" = tudo gerado numa jornada de iniciativa (Brief, PRD, ADR,
  // histórias, SDD, GMUD…), independente do tipo — não só PRD/ADR.
  const deFeature = docs?.filter((d) => d.iniciativaCodigo || ["prd", "adr", "api", "sdd", "postmortem", "guia"].includes(d.tipo));
  return (
    <>
      <PageHead
        title="Documentação das features"
        description="PRDs, ADRs, histórias, SDDs e planos gerados nas jornadas das squads — somente leitura nesta visão."
      />
      {isLoading ? (
        <p className="muted">Carregando…</p>
      ) : !deFeature?.length ? (
        <p className="empty-note">Nenhum documento de feature publicado ainda — eles aparecem conforme as squads avançam as iniciativas (Brief → PRD → Arquitetura → …).</p>
      ) : (
        <DocGrid docs={deFeature} base="/gestao/features" />
      )}
    </>
  );
}

export function DocsComunidade() {
  const { data: docs } = useQuery<DocMeta[]>({
    queryKey: ["docs-comunidade"],
    queryFn: () => api("/docs?escopo=comunidade"),
  });
  const { data: docsRt } = useQuery<DocMeta[]>({
    queryKey: ["docs-rt"],
    queryFn: () => api("/docs?escopo=release_train"),
  });
  const todos = [...(docs ?? []), ...(docsRt ?? [])];
  return (
    <>
      <PageHead
        title="Documentação da comunidade"
        description="Padrões e guias com escopo de comunidade e release train — somente leitura nesta visão."
      />
      {todos.length === 0 ? (
        <p className="empty-note">Nenhum documento de comunidade ou release train publicado ainda.</p>
      ) : (
        <DocGrid docs={todos} base="/gestao/comunidade" />
      )}
    </>
  );
}
