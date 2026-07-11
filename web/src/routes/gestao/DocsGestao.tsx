import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { PageHead } from "../../components/ui";
import { DocGrid, type DocMeta } from "../squad/Docs";

/* Documentações em modo consulta para a diretoria. */

export function DocsFeatures() {
  const { data: docs } = useQuery<DocMeta[]>({ queryKey: ["docs-gestao"], queryFn: () => api("/docs") });
  const deFeature = docs?.filter((d) => ["prd", "adr", "api", "postmortem"].includes(d.tipo));
  return (
    <>
      <PageHead
        title="Documentação das features"
        description="PRDs, ADRs e contratos gerados nas jornadas — somente leitura nesta visão."
      />
      <DocGrid docs={deFeature} base="/gestao/features" />
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
  return (
    <>
      <PageHead
        title="Documentação da comunidade"
        description="Padrões e guias com escopo de comunidade e release train — somente leitura nesta visão."
      />
      <DocGrid docs={[...(docs ?? []), ...(docsRt ?? [])]} base="/gestao/comunidade" />
    </>
  );
}
