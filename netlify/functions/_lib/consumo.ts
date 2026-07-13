// Contabiliza tokens de IA: agregado por squad/mês (custo de IA) e por etapa da
// iniciativa (para prever custo por fase). Chamado após cada geração de doc.

import { eq } from "drizzle-orm";
import { schema as s } from "../../../db/client";

// Estimativa simples de custo (R$) por 1k tokens — POC. Ajustável por modelo.
const CUSTO_POR_1K_BRL = 0.02;

export async function registrarConsumo(
  db: any,
  opts: { squadId?: string | null; iniciativaId?: string; etapaOrdem?: number; promptTokens?: number; completionTokens?: number }
): Promise<void> {
  const promptTokens = opts.promptTokens ?? 0;
  const completionTokens = opts.completionTokens ?? 0;
  const total = promptTokens + completionTokens;
  if (total <= 0) return;

  // 1) Agregado por squad/mês (alimenta "Custo de IA no mês" e consumo por squad).
  if (opts.squadId) {
    const mes = new Date().toISOString().slice(0, 7);
    const custo = (total / 1000) * CUSTO_POR_1K_BRL;
    const [cons] = (await db.select().from(s.consumoTokens)).filter((r: any) => r.squadId === opts.squadId && r.mes === mes);
    if (cons) {
      await db.update(s.consumoTokens).set({
        promptTokens: cons.promptTokens + promptTokens,
        completionTokens: cons.completionTokens + completionTokens,
        custo: cons.custo + custo,
      }).where(eq(s.consumoTokens.id, cons.id));
    } else {
      await db.insert(s.consumoTokens).values({ squadId: opts.squadId, mes, promptTokens, completionTokens, custo });
    }
  }

  // 2) Por etapa da iniciativa (alimenta "Tokens por etapa").
  if (opts.iniciativaId && opts.etapaOrdem != null) {
    const [et] = (await db.select().from(s.iniciativaEtapa))
      .filter((e: any) => e.iniciativaId === opts.iniciativaId && e.ordem === opts.etapaOrdem);
    if (et) await db.update(s.iniciativaEtapa).set({ tokensGastos: (et.tokensGastos ?? 0) + total }).where(eq(s.iniciativaEtapa.id, et.id));
  }
}
