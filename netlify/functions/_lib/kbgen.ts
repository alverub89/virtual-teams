// Geração de artigos da Base de Conhecimento a partir de um repositório —
// mesmo motor da análise de capacidades: lê o repo UMA vez e sintetiza vários
// documentos (funcional, técnico, dados, …), cada um com foco próprio, para dar
// contexto ao time e aos agentes. Roda em Background Function em produção.

import { eq, inArray } from "drizzle-orm";
import { schema as s } from "../../../db/client";
import { estruturaRepo, lerArquivos, montarContexto, selecionarArquivos, resolveGithubToken, SCHEMA, type EstruturaRepo } from "./capacidades";

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
// Tenta 2 vezes (a síntese pode falhar por JSON malformado esporádico).
async function sintetizar(repo: string, foco: string, contexto: string): Promise<{ markdown: string; resumo: string } | null> {
  const { gerarJson } = await import("./aigen");
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const doc = await gerarJson({
        tarefa: "arquitetura",
        system:
          "Você escreve documentação técnica de software para uma BASE DE CONHECIMENTO, dando CONTEXTO ao time e a agentes de IA. " +
          `Escreva ${foco} Seja DETALHADO e específico ao que foi lido (cite arquivos, módulos, campos e rotas reais); não invente o que não está evidente. Responda SOMENTE JSON válido.`,
        instrucao:
          `Conteúdo lido do repositório ${repo}:\n${contexto}\n\n` +
          'Formato JSON: { "resumo": "1 a 2 frases", "markdown": "documentação rica em Markdown, com seções (##), listas e tabelas quando ajudar" }',
        maxTokens: 3000,
      });
      const markdown = doc?.markdown && String(doc.markdown).trim();
      const resumo = doc?.resumo && String(doc.resumo).trim();
      if (markdown) return { markdown, resumo: resumo || "" };
    } catch {
      /* tenta de novo */
    }
  }
  return null;
}

// Fallback LIMPO quando a síntese por IA não conclui: usa os metadados lidos,
// nunca despeja o contexto cru (que contém JSON de API).
function fallbackDoc(tipoEmoji: string, tipoLabel: string, repo: string, est: EstruturaRepo): string {
  if (!est.ok) return `# ${tipoEmoji} ${tipoLabel} — ${repo}\n\n> ⚠️ Não foi possível ler o repositório: ${est.erro}.\n\nVerifique o token do GitHub e use **Regenerar**.`;
  const m = est.meta;
  return (
    `# ${tipoEmoji} ${tipoLabel} — ${repo}\n\n` +
    `> ⚠️ A síntese por IA não pôde ser concluída agora. Abaixo, o que foi lido do repositório. Use **Regenerar** para tentar de novo.\n\n` +
    `- **Linguagem:** ${m?.lingua || "-"}\n` +
    `- **Descrição:** ${m?.descricao || "-"}\n` +
    `- **Pastas de topo:** ${(m?.dirsTopo ?? []).join(", ") || "-"}\n` +
    `- **Arquivos:** ${m?.arquivos ?? "-"}\n`
  );
}

// A IA PLANEJA a leitura: dada a estrutura do repo e os tipos de documento a
// produzir, escolhe um checklist de arquivos a ler (com o motivo de cada um).
// Fallback heurístico se a IA falhar. Bounded a ~14 arquivos.
async function planejarLeitura(repo: string, est: EstruturaRepo, tiposLabels: string[]): Promise<{ path: string; motivo: string }[]> {
  const validos = new Set(est.paths);
  try {
    const { gerarJson } = await import("./aigen");
    const plano = await gerarJson({
      tarefa: "arquitetura",
      system:
        "Você planeja a LEITURA de um repositório para documentá-lo. Dada a lista de arquivos, escolha os arquivos MAIS INFORMATIVOS " +
        "para produzir a documentação pedida (entrypoints, rotas/controllers, serviços de domínio, modelos/schema/migrações, config). " +
        "Priorize amplitude de áreas. Escolha no máximo 14. Responda SOMENTE JSON.",
      instrucao:
        `Repositório: ${repo}\nDocumentos a produzir: ${tiposLabels.join(", ")}\n` +
        `Linguagem: ${est.meta?.lingua || "-"}\nPastas de topo: ${(est.meta?.dirsTopo ?? []).join(", ")}\n` +
        `Manifest:\n${est.manifest || "-"}\n\nArquivos (escolha só destes caminhos):\n${est.paths.slice(0, 400).join("\n")}\n\n` +
        'Formato JSON: { "passos": [{ "path": "caminho/exato/do/arquivo", "motivo": "por que ler" }] }',
      maxTokens: 1500,
    });
    const passos = Array.isArray(plano?.passos) ? plano.passos : [];
    const limpos = passos
      .filter((p: any) => p?.path && validos.has(p.path))
      .map((p: any) => ({ path: String(p.path), motivo: String(p.motivo ?? "").slice(0, 140) }))
      .slice(0, 14);
    // dedup por path
    const vistos = new Set<string>();
    const dedup = limpos.filter((p: any) => (vistos.has(p.path) ? false : (vistos.add(p.path), true)));
    if (dedup.length) return dedup;
  } catch { /* cai no heurístico */ }
  // Fallback heurístico: schema + âncoras.
  const escolhidos = selecionarArquivos(est.paths, { maxArquivos: 12, foco: SCHEMA, maxFoco: 6 }, est.manifestPath);
  return escolhidos.map((path) => ({ path, motivo: "arquivo relevante (seleção automática)" }));
}

// Gera um LOTE de documentos (vários tipos) para o mesmo repositório: lê o repo
// uma vez e sintetiza cada artigo. Cada artigo falha isoladamente.
export async function gerarKbDeRepoGrupo(db: any, artigoIds: string[]): Promise<void> {
  if (!artigoIds.length) return;
  const arts = (await db.select().from(s.kbArtigo).where(inArray(s.kbArtigo.id, artigoIds)));
  if (!arts.length) return;
  const repo = arts[0].repo as string;

  const ids = arts.map((a: any) => a.id);
  const setTodos = (vals: any) => db.update(s.kbArtigo).set(vals).where(inArray(s.kbArtigo.id, ids));
  try {
    const [sq] = await db.select().from(s.squad).where(eq(s.squad.id, arts[0].squadId));
    const [rt] = sq ? await db.select().from(s.releaseTrain).where(eq(s.releaseTrain.id, sq.releaseTrainId)) : [];
    const [com] = rt ? await db.select().from(s.comunidade).where(eq(s.comunidade.id, rt.comunidadeId)) : [];
    const token = resolveGithubToken(com);

    // 1) Estrutura do repositório (árvore de arquivos).
    await setTodos({ progresso: `Lendo a estrutura de ${repo}…`, plano: null });
    const est = await estruturaRepo(repo, token);
    if (!est.ok) {
      for (const a of arts) {
        const tipo = tipoDe(a.tipoDoc);
        await db.update(s.kbArtigo).set({ status: "pronto", conteudo: fallbackDoc(tipo.emoji, tipo.label, repo, est), progresso: `não foi possível ler: ${est.erro}` }).where(eq(s.kbArtigo.id, a.id));
      }
      return;
    }

    // 2) A IA PLANEJA o checklist de leitura (o que ver no repo).
    await setTodos({ progresso: "Planejando o que ler no repositório…" });
    const tiposLabels = arts.map((a: any) => tipoDe(a.tipoDoc).label);
    const passos = await planejarLeitura(repo, est, tiposLabels);
    const checklist = passos.map((p) => ({ ...p, lido: false }));
    await setTodos({ plano: checklist, progresso: `Vou ler ${checklist.length} arquivo(s)…` });

    // 3) Executa o checklist: lê cada arquivo, marca como lido, segue.
    const arquivos = await lerArquivos(repo, token, passos.map((p) => p.path), 2400, async (path, i, total) => {
      const atual = checklist.map((c) => (c.path === path ? { ...c, lido: true } : c));
      // marca lidos os anteriores também (ordem sequencial)
      for (let k = 0; k < i - 1; k++) atual[k].lido = true;
      await setTodos({ plano: atual, progresso: `Lendo ${path} (${i}/${total})…` });
    });
    const checklistFinal = checklist.map((c) => ({ ...c, lido: arquivos.some((a) => a.path === c.path) }));
    const contexto = montarContexto(repo, est, arquivos);

    // 4) Sintetiza cada documento a partir do contexto reunido.
    for (const a of arts) {
      const tipo = tipoDe(a.tipoDoc);
      await db.update(s.kbArtigo).set({ progresso: `Sintetizando documentação ${tipo.label.toLowerCase()}…`, plano: checklistFinal }).where(eq(s.kbArtigo.id, a.id));
      const doc = await sintetizar(repo, tipo.foco, contexto);
      const markdown = doc?.markdown || fallbackDoc(tipo.emoji, tipo.label, repo, est);
      const resumo = doc?.resumo || `Documentação ${tipo.label.toLowerCase()} de ${repo}.`;
      const diag = doc ? null : "síntese por IA indisponível — use Regenerar";
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
