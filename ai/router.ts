// Roteador de modelos — mecanismo de "escalar barato" (docs/spec, seção 7.1).
// Fonte primária: tabela ai_workspace.modelo_ia_rota (tarefa → nível → custo).
// Fallback: env AI_MODELS_JSON = {"avancado": "...", "intermediario": "...", "leve": "..."}.

export type NivelModelo = "avancado" | "intermediario" | "leve";

export type TipoTarefa =
  | "arquitetura"
  | "prd"
  | "historias"
  | "resumo"
  | "classificacao"
  | "sync";

const NIVEL_POR_TAREFA: Record<TipoTarefa, NivelModelo> = {
  arquitetura: "avancado",
  prd: "avancado",
  historias: "intermediario",
  resumo: "intermediario",
  classificacao: "leve",
  sync: "leve",
};

export function resolveModel(tarefa: TipoTarefa): string {
  // TODO(Fase 2): consultar modelo_ia_rota no Neon antes do fallback por env.
  const mapa = JSON.parse(process.env.AI_MODELS_JSON ?? "{}") as Partial<
    Record<NivelModelo, string>
  >;
  const nivel = NIVEL_POR_TAREFA[tarefa];
  const modelo = mapa[nivel];
  if (!modelo) throw new Error(`Nenhum modelo configurado para o nível "${nivel}"`);
  return modelo;
}
