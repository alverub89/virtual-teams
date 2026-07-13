// Orquestrador da execução autônoma de uma INICIATIVA: um agente conduz o fluxo
// inteiro — conclui cada etapa (gerando o documento/artefato), avança e segue
// até a iniciativa terminar. Cada etapa vira um passo com o que foi entregue.
// Roda em Background Function (muitas chamadas de IA).

import { eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";

export async function orquestrarIniciativa(db: any, execId: string): Promise<void> {
  const [exec] = await db.select().from(s.execucaoAutonoma).where(eq(s.execucaoAutonoma.id, execId));
  if (!exec || !exec.iniciativaId) return;
  const { concluirEtapaAtual } = await import("../_routes/iniciativas");

  try {
    let ordem = 0;
    for (let guarda = 0; guarda < 30; guarda++) {
      const [ini] = await db.select().from(s.iniciativa).where(eq(s.iniciativa.id, exec.iniciativaId));
      if (!ini || ini.status === "concluida") break;

      const [etapaRow] = (await db.select().from(s.iniciativaEtapa))
        .filter((e: any) => e.iniciativaId === ini.id && e.ordem === ini.etapaAtual);
      const nomeEtapa = etapaRow?.nome ?? `Etapa ${ini.etapaAtual}`;
      await db.update(s.execucaoAutonoma).set({ progresso: `Concluindo "${nomeEtapa}"…`, passoAtual: ini.etapaAtual, atualizadoEm: new Date() }).where(eq(s.execucaoAutonoma.id, execId));

      const r = await concluirEtapaAtual(db, ini, "Orquestrador");
      ordem += 1;
      await db.insert(s.execucaoPasso).values({
        execucaoId: execId, ordem, nome: nomeEtapa, agenteNome: "🎭 Orquestrador", tipo: "automatica",
        status: r.ok ? "concluido" : "rejeitado",
        saida: r.ok ? { resumo: `${r.doc.emoji ?? "📄"} ${r.doc.titulo}`, itens: r.doc.resumo ? [r.doc.resumo] : [] } : { resumo: r.erro ?? "falha" },
        concluidoEm: new Date(),
      });
      if (!r.ok) throw new Error(r.erro ?? "falha ao concluir etapa");
      if (r.terminou) break;
    }

    await db.update(s.execucaoAutonoma).set({ status: "concluida", progresso: null, atualizadoEm: new Date() }).where(eq(s.execucaoAutonoma.id, execId));
  } catch (e) {
    await db.update(s.execucaoAutonoma).set({ status: "rejeitada", progresso: `erro: ${e instanceof Error ? e.message : String(e)}`, atualizadoEm: new Date() }).where(eq(s.execucaoAutonoma.id, execId));
  }
}

export async function enqueueOrquestrar(execId: string): Promise<void> {
  const base = process.env.URL;
  if (base && process.env.DATABASE_URL) {
    await fetch(`${base}/.netlify/functions/orquestrar-background`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ execId }),
    }).catch((err) => console.error("[orquestrador] enqueue", err));
  } else {
    void getDb().then((db) => orquestrarIniciativa(db, execId)).catch((err) => console.error("[orquestrador]", err));
  }
}
