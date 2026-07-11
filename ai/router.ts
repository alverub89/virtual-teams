// Roteador de modelos — mecanismo de "escalar barato" (docs/spec §7.1).
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

export async function resolveModel(tarefa: TipoTarefa): Promise<string> {
  const { getDb, schema } = await import("../db/client");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  const [rota] = await db
    .select()
    .from(schema.modeloIaRota)
    .where(eq(schema.modeloIaRota.tarefa, tarefa));
  if (rota) return rota.modelo;

  const mapa = JSON.parse(process.env.AI_MODELS_JSON ?? "{}") as Partial<
    Record<NivelModelo, string>
  >;
  const nivel = NIVEL_POR_TAREFA[tarefa];
  const modelo = mapa[nivel];
  if (!modelo) throw new Error(`Nenhum modelo configurado para a tarefa "${tarefa}" (nível "${nivel}") — cadastre em modelo_ia_rota ou AI_MODELS_JSON`);
  return modelo;
}
