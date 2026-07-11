// Sweeper agendado (docs/spec §2 e §8.2): reenfileira runs `em_andamento`
// sem progresso recente (invocação anterior estourou o orçamento de tempo
// ou morreu) e alerta consumo acima de 80% do budget.
import { and, eq, lt } from "drizzle-orm";
import { getDb, schema as s } from "../../db/client";
import { enqueueAdvance } from "./_lib/run-engine";

export default async () => {
  const db = await getDb();
  const limite = new Date(Date.now() - 5 * 60 * 1000);
  const travados = await db
    .select()
    .from(s.execucaoAutonoma)
    .where(
      and(eq(s.execucaoAutonoma.status, "em_andamento"), lt(s.execucaoAutonoma.atualizadoEm, limite))
    );
  for (const run of travados) await enqueueAdvance(run.id);

  const consumo = await db.select().from(s.consumoTokens);
  const squads = await db.select().from(s.squad);
  for (const r of consumo) {
    const sq = squads.find((x: any) => x.id === r.squadId);
    if (sq?.budgetTokensMes && r.promptTokens + r.completionTokens > sq.budgetTokensMes * 0.8) {
      console.warn(`[custos] ${sq.nome} acima de 80% do budget de tokens do mês`);
    }
  }
  return new Response(`ok · ${travados.length} run(s) reenfileirado(s)`);
};

export const config = { schedule: "*/2 * * * *" };
