// Geração de artigos da Base de Conhecimento a partir de um repositório —
// mesmo motor da análise de capacidades: lê o repo UMA vez e sintetiza vários
// documentos (funcional, técnico, dados, …), cada um com foco próprio, para dar
// contexto ao time e aos agentes. Roda em Background Function em produção.

import { eq, inArray } from "drizzle-orm";
import { schema as s } from "../../../db/client";
import { lerRepo, resolveGithubToken } from "./capacidades";

// Catálogo de tipos de documento gerados por repositório. `padrao` = marcado
// por default na UI. Cada tipo tem um FOCO específico para a síntese da IA.
export const TIPOS_DOC: { key: string; label: string; emoji: string; padrao: boolean; foco: string }[] = [
  {
    key: "funcional", label: "Funcional", emoji: "📗", padrao: true,
    foco: "documentação FUNCIONAL (visão de negócio/usuário): propósito, funcionalidades, atores/personas, principais fluxos e jornadas, regras de negócio e casos de uso. Evite detalhe técnico de implementação.",
  },
  {
    key: "tecnico", label: "Técnico", emoji: "📘", padrao: true,
    foco: "documentação TÉCNICA: arquitetura e componentes, stack e frameworks, organização de módulos/pastas, padrões e decisões de design, build, execução, testes e observabilidade.",
  },
  {
    key: "dados", label: "Dados", emoji: "🗄️", padrao: true,
    foco: "documentação de DADOS: principais entidades e modelos, esquema (tabelas/coleções e campos), relacionamentos, contratos de dados, persistência e migrações. Use uma tabela para as entidades quando possível.",
  },
  {
    key: "api", label: "API & Integrações", emoji: "🔌", padrao: false,
    foco: "documentação de API e INTEGRAÇÕES: endpoints/rotas expostas e seus contratos, eventos publicados/consumidos, e integrações com serviços externos e internos.",
  },
  {
    key: "operacao", label: "Operação & Deploy", emoji: "⚙️", padrao: false,
    foco: "documentação de OPERAÇÃO: pré-requisitos, variáveis de ambiente e configuração, como buildar e implantar (deploy), ambientes, monitoração e um runbook de incidentes comum.",
  },
];

function tipoDe(key: string | null | undefined) {
  return TIPOS_DOC.find((t) => t.key === key) ?? { key: "geral", label: "Documentação", emoji: "📄", padrao: true, foco: "uma documentação de contexto do repositório" };
}

// Sintetiza um documento de um tipo a partir do conteúdo já lido do repositório.
async function sintetizar(repo: string, foco: string, contexto: string): Promise<{ markdown: string; resumo: string } | null> {
  try {
    const { gerarJson } = await import("./aigen");
    const doc = await gerarJson({
      tarefa: "arquitetura",
      system:
        "Você escreve documentação técnica de software para uma BASE DE CONHECIMENTO, dando CONTEXTO ao time e a agentes de IA. " +
        `Escreva ${foco} Responda SOMENTE JSON. Baseie-se apenas no conteúdo lido — não invente o que não está evidente.`,
      instrucao:
        `Conteúdo lido do repositório ${repo}:\n${contexto}\n\n` +
        'Formato JSON: { "resumo": "1 a 2 frases", "markdown": "documentação em Markdown, com títulos (##), listas e tabelas quando ajudar" }',
      maxTokens: 2200,
    });
    const markdown = doc?.markdown && String(doc.markdown).trim();
    const resumo = doc?.resumo && String(doc.resumo).trim();
    if (markdown) return { markdown, resumo: resumo || "" };
    return null;
  } catch {
    return null;
  }
}

// Gera um LOTE de documentos (vários tipos) para o mesmo repositório: lê o repo
// uma vez e sintetiza cada artigo. Cada artigo falha isoladamente.
export async function gerarKbDeRepoGrupo(db: any, artigoIds: string[]): Promise<void> {
  if (!artigoIds.length) return;
  const arts = (await db.select().from(s.kbArtigo).where(inArray(s.kbArtigo.id, artigoIds)));
  if (!arts.length) return;
  const repo = arts[0].repo as string;

  try {
    const [sq] = await db.select().from(s.squad).where(eq(s.squad.id, arts[0].squadId));
    const [rt] = sq ? await db.select().from(s.releaseTrain).where(eq(s.releaseTrain.id, sq.releaseTrainId)) : [];
    const [com] = rt ? await db.select().from(s.comunidade).where(eq(s.comunidade.id, rt.comunidadeId)) : [];
    const token = resolveGithubToken(com);

    for (const a of arts) await db.update(s.kbArtigo).set({ progresso: `Lendo ${repo}…` }).where(eq(s.kbArtigo.id, a.id));
    const lido = await lerRepo(repo, token); // UMA leitura para todos os docs

    for (const a of arts) {
      const tipo = tipoDe(a.tipoDoc);
      await db.update(s.kbArtigo).set({ progresso: `Sintetizando documentação ${tipo.label.toLowerCase()}…` }).where(eq(s.kbArtigo.id, a.id));
      const doc = await sintetizar(repo, tipo.foco, lido.contexto);
      const markdown = doc?.markdown
        || `# ${tipo.emoji} ${tipo.label} — ${repo}\n\n${lido.ok ? "_Gerado a partir do conteúdo lido do repositório._" : `_Não foi possível ler o repositório: ${lido.erro}._`}\n\n${lido.contexto}`;
      const resumo = doc?.resumo || `Documentação ${tipo.label.toLowerCase()} de ${repo}.`;
      const diag = lido.ok ? (doc ? null : "gerado a partir do conteúdo do repositório (síntese por IA indisponível)") : `leitura parcial de ${repo}: ${lido.erro}`;
      await db.update(s.kbArtigo).set({ status: "pronto", conteudo: markdown, resumo: resumo.slice(0, 280), progresso: diag }).where(eq(s.kbArtigo.id, a.id));
    }
  } catch (e) {
    for (const a of arts) {
      const [cur] = await db.select().from(s.kbArtigo).where(eq(s.kbArtigo.id, a.id));
      if (cur?.status === "gerando") await db.update(s.kbArtigo).set({ status: "erro", progresso: `erro: ${e instanceof Error ? e.message : String(e)}` }).where(eq(s.kbArtigo.id, a.id));
    }
  }
}

// Background Function em produção (até 15 min); inline no dev/demo.
export async function enqueueKb(artigoIds: string[]): Promise<void> {
  const base = process.env.URL;
  if (base && process.env.DATABASE_URL) {
    await fetch(`${base}/.netlify/functions/kb-generate-background`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artigoIds }),
    }).catch((err) => console.error("[kbgen] enqueue", err));
  } else {
    const { getDb } = await import("../../../db/client");
    void getDb().then((db) => gerarKbDeRepoGrupo(db, artigoIds)).catch((err) => console.error("[kbgen]", err));
  }
}
