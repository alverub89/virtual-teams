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
      // Respeita cancelamento humano: se o status saiu de "em_andamento", para.
      const [atual] = await db.select().from(s.execucaoAutonoma).where(eq(s.execucaoAutonoma.id, execId));
      if (!atual || atual.status !== "em_andamento") return;
      const [ini] = await db.select().from(s.iniciativa).where(eq(s.iniciativa.id, exec.iniciativaId));
      if (!ini || ini.status === "concluida") break;

      const [etapaRow] = (await db.select().from(s.iniciativaEtapa))
        .filter((e: any) => e.iniciativaId === ini.id && e.ordem === ini.etapaAtual);
      const nomeEtapa = etapaRow?.nome ?? `Etapa ${ini.etapaAtual}`;
      await db.update(s.execucaoAutonoma).set({ progresso: `"${nomeEtapa}": o agente está produzindo…`, passoAtual: ini.etapaAtual, atualizadoEm: new Date() }).where(eq(s.execucaoAutonoma.id, execId));

      // O Master valida cada documento e manda revisar quantas voltas precisar.
      const onRodada = async (rodada: number, fase: string, parecer?: { nota: number }) => {
        const txt = fase === "produzir" ? `escrevendo (rodada ${rodada})`
          : fase === "criticar" ? `Master avaliando (rodada ${rodada})`
          : fase === "revisar" ? `revisão pedida pelo Master (nota ${parecer?.nota ?? "?"}/10) — nova volta`
          : `aprovado pelo Master (nota ${parecer?.nota ?? "?"}/10)`;
        await db.update(s.execucaoAutonoma).set({ progresso: `"${nomeEtapa}": ${txt}`, atualizadoEm: new Date() }).where(eq(s.execucaoAutonoma.id, execId));
      };
      const onProgresso = async (txt: string) => {
        await db.update(s.execucaoAutonoma).set({ progresso: `"${nomeEtapa}": ${txt.replace(/^Desenvolvimento:\s*/, "")}`, atualizadoEm: new Date() }).where(eq(s.execucaoAutonoma.id, execId));
      };
      const r = await concluirEtapaAtual(db, ini, "Orquestrador", { critico: true, onRodada, onProgresso });
      ordem += 1;
      const rev = r.revisao;
      const nota = rev ? ` · Master ${rev.nota}/10 em ${rev.rodadas} rodada(s)` : "";
      const itens = [
        r.doc?.resumo,
        ...(rev && rev.problemas.length && rev.nota < 8 ? [`Master apontou: ${rev.problemas.slice(0, 2).join("; ")}`] : []),
        ...(r.sddCount ? [`🧩 ${r.sddCount} SDD(s) gerados na sequência`] : []),
      ].filter(Boolean) as string[];
      await db.insert(s.execucaoPasso).values({
        execucaoId: execId, ordem, nome: nomeEtapa, agenteNome: `🎭 Orquestrador${nota}`, tipo: "automatica",
        status: r.ok ? "concluido" : "rejeitado",
        saida: r.ok
          ? { resumo: `${r.doc.emoji ?? "📄"} ${r.doc.titulo}`, itens, revisao: rev ? { nota: rev.nota, rodadas: rev.rodadas, problemas: rev.problemas } : null }
          : { resumo: r.erro ?? "falha" },
        concluidoEm: new Date(),
      });
      if (!r.ok) throw new Error(r.erro ?? "falha ao concluir etapa");
      if (r.terminou) break;
    }

    // Reconcilia KRs ligados (direto ou via a iniciativa): o trabalho entregue
    // move o "realizado" — antes ficava desacoplado da Gestão.
    const { reconciliarKrsDaExecucao } = await import("./kr");
    await reconciliarKrsDaExecucao(db, exec);
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
