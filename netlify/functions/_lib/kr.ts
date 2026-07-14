import { eq } from "drizzle-orm";
import { schema as s } from "../../../db/client";

// Reconciliação de KR ↔ trabalho entregue: quando uma execução ligada a um KR
// conclui, o "realizado" do mês avança em direção à meta (respeitando KRs
// invertidos, onde menor é melhor). Usa o planejado do mês se houver; senão,
// um passo de 1/3 do intervalo baseline→meta — para o número sair de 0.
async function reconciliarKr(db: any, krId: string): Promise<void> {
  const [kr] = await db.select().from(s.keyResult).where(eq(s.keyResult.id, krId));
  if (!kr) return;
  const mes = new Date().toISOString().slice(0, 7);
  const meds = (await db.select().from(s.krMedicao)).filter((m: any) => m.krId === krId);
  const doMes = meds.find((m: any) => m.mes === mes);
  const passo = kr.baseline + (kr.meta - kr.baseline) / 3;
  const alvo = doMes?.planejado != null ? doMes.planejado : passo;
  const atual = doMes?.realizado != null ? doMes.realizado : kr.baseline;
  const novo = kr.invertido ? Math.min(atual, alvo) : Math.max(atual, alvo);
  if (doMes) await db.update(s.krMedicao).set({ realizado: novo }).where(eq(s.krMedicao.id, doMes.id));
  else await db.insert(s.krMedicao).values({ krId, mes, planejado: doMes?.planejado ?? null, realizado: novo });
}

// Reconcilia todos os KRs ligados a uma execução: direto (exec.krId) e via a
// iniciativa (kr_feature). Tolerante a falha — nunca derruba a execução.
export async function reconciliarKrsDaExecucao(db: any, exec: any): Promise<void> {
  const alvos = new Set<string>();
  if (exec?.krId) alvos.add(exec.krId);
  if (exec?.iniciativaId) {
    const feats = (await db.select().from(s.krFeature)).filter((f: any) => f.iniciativaId === exec.iniciativaId);
    for (const f of feats) alvos.add(f.krId);
  }
  for (const krId of alvos) {
    try { await reconciliarKr(db, krId); } catch { /* métrica é best-effort */ }
  }
}
