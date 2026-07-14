import { and, asc, eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { getProvider } from "../../../ai/provider";
import { resolveModel } from "../../../ai/router";

// Motor da execução autônoma (docs/spec §8). Máquina de estados persistida:
// avança passos automáticos enquanto houver orçamento de tempo; para em
// checkpoint humano (aguardando_aprovacao) sem consumir computação.

const TIME_BUDGET_MS = 13 * 60 * 1000;

const PASSOS_PADRAO = [
  { ordem: 1, nome: "Analisar KR alvo e histórico", agenteNome: "Agente Analista", tipo: "automatica" },
  { ordem: 2, nome: "Mapear capacidades e repositórios", agenteNome: "Agente Arquiteto", tipo: "automatica" },
  { ordem: 3, nome: "Gerar PRD preliminar", agenteNome: "Agente PM", tipo: "automatica" },
  { ordem: 4, nome: "Checkpoint: aprovar PRD e escopo", agenteNome: null, tipo: "checkpoint" },
  { ordem: 5, nome: "Criar histórias no board", agenteNome: "Agente SM", tipo: "automatica" },
  { ordem: 6, nome: "Preparar branch e esqueleto no repositório", agenteNome: "Agente Dev", tipo: "automatica" },
  { ordem: 7, nome: "Checkpoint: revisar entregáveis do run", agenteNome: null, tipo: "checkpoint" },
] as const;

export async function criarRun(opts: {
  squadId: string;
  krId?: string;
  objetivo: string;
  criadoPor: string;
}) {
  const db = await getDb();
  const [run] = await db
    .insert(s.execucaoAutonoma)
    .values({ ...opts, status: "em_andamento", passoAtual: 0 })
    .returning();
  await db
    .insert(s.execucaoPasso)
    .values(PASSOS_PADRAO.map((p) => ({ ...p, execucaoId: run.id, status: "pendente" })));
  return run;
}

/* Executa um passo automático chamando o agente correspondente. */
async function executarPasso(run: any, passo: any): Promise<{ resumo: string; itens: string[]; tokens: number }> {
  const provider = await getProvider();
  const res = await provider.chat({
    model: await resolveModel(passo.ordem <= 2 ? "classificacao" : passo.ordem === 3 ? "prd" : "historias"),
    system: `Você é ${passo.agenteNome} numa execução autônoma de squad virtual. Execute o passo "${passo.nome}" para o objetivo: ${run.objetivo}. Responda com um parágrafo de resumo executivo do que foi feito.`,
    messages: [{ role: "user", content: `Execute o passo ${passo.ordem}: ${passo.nome}.` }],
    maxTokens: 800,
  });
  const limpar = (t: string) => t.replace(/\*\*/g, "").trim();
  const linhas = res.content.split("\n").filter((l) => l.trim().startsWith("1") || l.trim().startsWith("-"));
  return {
    resumo: limpar(res.content.split("\n").find((l) => l.trim().length > 20) ?? res.content.slice(0, 200)),
    itens: linhas.slice(0, 3).map((l) => limpar(l.replace(/^[-\d.*\s]+/, ""))),
    tokens: res.usage.promptTokens + res.usage.completionTokens,
  };
}

/* Laço de avanço (docs/spec §8.2) — idempotente e limitado por tempo. */
export async function advanceRun(runId: string): Promise<void> {
  const db = await getDb();
  const deadline = Date.now() + TIME_BUDGET_MS;

  for (;;) {
    const [run] = await db
      .select()
      .from(s.execucaoAutonoma)
      .where(eq(s.execucaoAutonoma.id, runId));
    if (!run || run.status !== "em_andamento") return;
    if (Date.now() > deadline) return; // sweeper reenfileira

    const passos = await db
      .select()
      .from(s.execucaoPasso)
      .where(eq(s.execucaoPasso.execucaoId, runId))
      .orderBy(asc(s.execucaoPasso.ordem));
    const proximo = passos.find((p: any) => p.status === "pendente" || p.status === "em_execucao");

    if (!proximo) {
      const { reconciliarKrsDaExecucao } = await import("./kr");
      await reconciliarKrsDaExecucao(db, run);
      await db
        .update(s.execucaoAutonoma)
        .set({ status: "concluida", atualizadoEm: new Date() })
        .where(eq(s.execucaoAutonoma.id, runId));
      return;
    }

    if (proximo.tipo === "checkpoint") {
      // Pausa natural: cria o checkpoint e encerra sem consumir computação.
      const passoAnterior = passos.find((p: any) => p.ordem === proximo.ordem - 1);
      await db
        .update(s.execucaoPasso)
        .set({ status: "aguardando" })
        .where(eq(s.execucaoPasso.id, proximo.id));
      const abertos = await db
        .select()
        .from(s.execucaoCheckpoint)
        .where(
          and(
            eq(s.execucaoCheckpoint.execucaoId, runId),
            eq(s.execucaoCheckpoint.passoOrdem, proximo.ordem)
          )
        );
      if (abertos.length === 0) {
        await db.insert(s.execucaoCheckpoint).values({
          execucaoId: runId,
          passoOrdem: proximo.ordem,
          titulo: proximo.nome.replace(/^Checkpoint:\s*/i, ""),
          resumo: passoAnterior?.saida?.resumo ?? "Revisão humana necessária para prosseguir.",
        });
      }
      await db
        .update(s.execucaoAutonoma)
        .set({ status: "aguardando_aprovacao", passoAtual: proximo.ordem, atualizadoEm: new Date() })
        .where(eq(s.execucaoAutonoma.id, runId));
      return;
    }

    // Passo automático: teto de tokens é guard-rail duro (docs/spec §8.4).
    if (run.tokensGastos >= run.tetoTokens) {
      await db
        .update(s.execucaoAutonoma)
        .set({ status: "pausada", atualizadoEm: new Date() })
        .where(eq(s.execucaoAutonoma.id, runId));
      return;
    }

    await db
      .update(s.execucaoPasso)
      .set({ status: "em_execucao" })
      .where(eq(s.execucaoPasso.id, proximo.id));
    const saida = await executarPasso(run, proximo);
    await db
      .update(s.execucaoPasso)
      .set({ status: "concluido", saida: { resumo: saida.resumo, itens: saida.itens }, concluidoEm: new Date() })
      .where(eq(s.execucaoPasso.id, proximo.id));
    await db
      .update(s.execucaoAutonoma)
      .set({
        passoAtual: proximo.ordem,
        tokensGastos: run.tokensGastos + saida.tokens,
        atualizadoEm: new Date(),
      })
      .where(eq(s.execucaoAutonoma.id, runId));
  }
}

/* Enfileira o avanço: Background Function em produção; inline no dev/demo. */
export async function enqueueAdvance(runId: string): Promise<void> {
  const base = process.env.URL; // definida pela Netlify em produção
  if (base && process.env.DATABASE_URL) {
    await fetch(`${base}/.netlify/functions/run-advance-background`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId }),
    });
  } else {
    // Modo demo/local: roda no mesmo processo, sem bloquear a resposta.
    void advanceRun(runId).catch((err) => console.error("[run-engine]", err));
  }
}
