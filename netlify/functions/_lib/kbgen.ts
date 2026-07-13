// Geração de artigos da Base de Conhecimento a partir de um repositório —
// mesmo motor da análise de capacidades: planeja e lê o repo (estrutura +
// README + manifest + arquivos-âncora) e sintetiza com IA uma documentação de
// contexto. Roda em Background Function em produção (limites de tempo da API).

import { eq } from "drizzle-orm";
import { schema as s } from "../../../db/client";
import { lerRepo, resolveGithubToken } from "./capacidades";

export async function gerarKbDeRepo(db: any, artigoId: string): Promise<void> {
  const [art] = await db.select().from(s.kbArtigo).where(eq(s.kbArtigo.id, artigoId));
  if (!art) return;
  try {
    if (!art.repo) throw new Error("artigo sem repositório de origem");
    const [sq] = await db.select().from(s.squad).where(eq(s.squad.id, art.squadId));
    const [rt] = sq ? await db.select().from(s.releaseTrain).where(eq(s.releaseTrain.id, sq.releaseTrainId)) : [];
    const [com] = rt ? await db.select().from(s.comunidade).where(eq(s.comunidade.id, rt.comunidadeId)) : [];
    const token = resolveGithubToken(com);

    await db.update(s.kbArtigo).set({ progresso: `Lendo ${art.repo}…` }).where(eq(s.kbArtigo.id, artigoId));
    const lido = await lerRepo(art.repo, token);

    await db.update(s.kbArtigo).set({ progresso: "Sintetizando a documentação…" }).where(eq(s.kbArtigo.id, artigoId));
    // Síntese tolerante: se a IA falhar ou não devolver JSON, ainda entregamos
    // um artigo montado a partir do conteúdo lido do repositório.
    let doc: any = null;
    try {
      const { gerarJson } = await import("./aigen");
      doc = await gerarJson({
        tarefa: "arquitetura",
        system:
          "Você documenta um repositório de software para uma BASE DE CONHECIMENTO técnica. A partir do conteúdo lido, " +
          "escreva um artigo claro e útil que dê CONTEXTO ao time e aos agentes de IA. Responda SOMENTE JSON.",
        instrucao:
          `Conteúdo lido do repositório ${art.repo}:\n${lido.contexto}\n\n` +
          'Formato JSON: { "resumo": "1 a 2 frases", "markdown": "# Documentação em markdown com: Visão geral e propósito; ' +
          "Responsabilidades; Principais módulos/pastas; Integrações e dependências; Como rodar/build; Pontos de atenção e riscos. " +
          'Seja específico ao que foi lido — não invente." }',
        maxTokens: 2500,
      });
    } catch {
      doc = null;
    }

    const markdown = (doc?.markdown && String(doc.markdown).trim())
      || `# Documentação — ${art.repo}\n\n${lido.ok ? "_Gerada a partir do conteúdo lido do repositório._" : `_Não foi possível ler o repositório: ${lido.erro}._`}\n\n${lido.contexto}`;
    const resumo = (doc?.resumo && String(doc.resumo).trim()) || `Documentação gerada a partir de ${art.repo}.`;
    const diag = lido.ok ? (doc ? null : "gerado a partir do conteúdo do repositório (síntese por IA indisponível)") : `leitura parcial de ${art.repo}: ${lido.erro}`;

    await db.update(s.kbArtigo).set({
      status: "pronto",
      conteudo: markdown,
      resumo: resumo.slice(0, 280),
      progresso: diag,
    }).where(eq(s.kbArtigo.id, artigoId));
  } catch (e) {
    await db.update(s.kbArtigo).set({ status: "erro", progresso: `erro: ${e instanceof Error ? e.message : String(e)}` }).where(eq(s.kbArtigo.id, artigoId));
  }
}

// Background Function em produção (até 15 min); inline no dev/demo.
export async function enqueueKb(artigoId: string): Promise<void> {
  const base = process.env.URL;
  if (base && process.env.DATABASE_URL) {
    await fetch(`${base}/.netlify/functions/kb-generate-background`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artigoId }),
    }).catch((err) => console.error("[kbgen] enqueue", err));
  } else {
    const { getDb } = await import("../../../db/client");
    void getDb().then((db) => gerarKbDeRepo(db, artigoId)).catch((err) => console.error("[kbgen]", err));
  }
}
