import { Hono } from "hono";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { rbac } from "../_mw/rbac";
import { getProvider } from "../../../ai/provider";
import { resolveModel, type TipoTarefa } from "../../../ai/router";
import { composeSystemPrompt } from "../../../ai/prompts";
import { audit } from "../_lib/audit";

const app = new Hono();

/* Lista iniciativas da squad do usuário. */
app.get("/", async (c) => {
  const me = c.get("me");
  const squadId = c.req.query("squadId") ?? me.squadId;
  if (!squadId) return c.json([]);
  const db = await getDb();
  const inis = await db
    .select()
    .from(s.iniciativa)
    .where(eq(s.iniciativa.squadId, squadId))
    .orderBy(desc(s.iniciativa.criadoEm));
  const caps = await db.select().from(s.capacidade).where(eq(s.capacidade.squadId, squadId));
  return c.json(
    inis.map((i: any) => ({
      ...i,
      capacidadeNome: caps.find((cp: any) => cp.id === i.capacidadeId)?.nome ?? null,
    }))
  );
});

const CriarIniciativa = z.object({
  titulo: z.string().min(4),
  descricao: z.string().optional(),
  capacidadeId: z.string().uuid().optional(),
});

/* Cria iniciativa com as etapas do método ativo. */
app.post("/", rbac("criar_iniciativa"), async (c) => {
  const me = c.get("me");
  if (!me.squadId) return c.json({ error: "usuário sem squad" }, 400);
  const body = CriarIniciativa.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const db = await getDb();
  const [metodo] = await db.select().from(s.metodo).where(eq(s.metodo.ativo, true));
  const etapas = await db
    .select()
    .from(s.metodoEtapa)
    .where(eq(s.metodoEtapa.metodoId, metodo.id))
    .orderBy(asc(s.metodoEtapa.ordem));

  const num = 100 + Math.floor(Math.random() * 899);
  const [ini] = await db
    .insert(s.iniciativa)
    .values({
      codigo: `INI-${num}`,
      squadId: me.squadId,
      capacidadeId: body.data.capacidadeId ?? null,
      titulo: body.data.titulo,
      descricao: body.data.descricao,
      criadoPor: me.id,
    })
    .returning();

  await db.insert(s.iniciativaEtapa).values(
    etapas.map((e: any) => ({
      iniciativaId: ini.id,
      ordem: e.ordem,
      nome: e.nome,
      agenteId: e.agenteId,
      status: e.ordem === 1 ? "em_andamento" : "pendente",
    }))
  );
  await audit(me, "criar_iniciativa", `iniciativa:${ini.codigo}`, { titulo: ini.titulo });
  return c.json(ini, 201);
});

/* Jornada completa de uma iniciativa. */
app.get("/:codigo", async (c) => {
  const db = await getDb();
  const [ini] = await db
    .select()
    .from(s.iniciativa)
    .where(eq(s.iniciativa.codigo, c.req.param("codigo")));
  if (!ini) return c.json({ error: "iniciativa não encontrada" }, 404);

  const etapas = await db
    .select()
    .from(s.iniciativaEtapa)
    .where(eq(s.iniciativaEtapa.iniciativaId, ini.id))
    .orderBy(asc(s.iniciativaEtapa.ordem));
  const agentes = await db.select().from(s.agente);
  const historias = await db
    .select()
    .from(s.historia)
    .where(eq(s.historia.iniciativaId, ini.id));
  const docs = await db
    .select({ id: s.documento.id, titulo: s.documento.titulo, tipo: s.documento.tipo, emoji: s.documento.emoji })
    .from(s.documento)
    .where(eq(s.documento.iniciativaId, ini.id));
  const capacidade = ini.capacidadeId
    ? (await db.select().from(s.capacidade).where(eq(s.capacidade.id, ini.capacidadeId)))[0]
    : null;

  return c.json({
    ...ini,
    capacidade,
    historias,
    docs,
    etapas: etapas.map((e: any) => ({
      ...e,
      agente: agentes.find((a: any) => a.id === e.agenteId) ?? null,
    })),
  });
});

/* Mensagens do chat de uma etapa. */
app.get("/:codigo/mensagens", async (c) => {
  const etapa = Number(c.req.query("etapa") ?? "1");
  const db = await getDb();
  const [ini] = await db
    .select()
    .from(s.iniciativa)
    .where(eq(s.iniciativa.codigo, c.req.param("codigo")));
  if (!ini) return c.json({ error: "iniciativa não encontrada" }, 404);
  const msgs = await db
    .select()
    .from(s.mensagemChat)
    .where(and(eq(s.mensagemChat.iniciativaId, ini.id), eq(s.mensagemChat.etapaOrdem, etapa)))
    .orderBy(asc(s.mensagemChat.criadoEm));
  return c.json(msgs);
});

const TAREFA_POR_ETAPA: Record<number, TipoTarefa> = {
  1: "resumo",
  2: "prd",
  3: "arquitetura",
  4: "historias",
  5: "arquitetura",
  6: "classificacao",
};

// Cada etapa da jornada ENTREGA um documento formal (armazenado em `documento`,
// visível em Documentação). Metadados do documento por etapa.
const DOC_ETAPA: Record<number, { tipo: string; emoji: string; titulo: (t: string) => string; foco: string }> = {
  1: { tipo: "doc", emoji: "📋", titulo: (t) => `Brief — ${t}`, foco: "um brief de descoberta (problema, objetivo, público, escopo, hipóteses, métricas de sucesso e riscos)" },
  2: { tipo: "prd", emoji: "📄", titulo: (t) => `PRD — ${t}`, foco: "um PRD (contexto, requisitos funcionais e não-funcionais, fluxos de usuário, critérios de aceite e o que está fora de escopo)" },
  3: { tipo: "adr", emoji: "🏛️", titulo: (t) => `Arquitetura — ${t}`, foco: "um documento de arquitetura/ADR (decisões, componentes, integrações, dados, trade-offs e guard rails)" },
  4: { tipo: "doc", emoji: "📝", titulo: (t) => `Histórias — ${t}`, foco: "um backlog de histórias no formato INVEST, cada uma com critérios de aceite e estimativa" },
  5: { tipo: "guia", emoji: "🛠️", titulo: (t) => `Notas de desenvolvimento — ${t}`, foco: "notas de desenvolvimento (abordagem técnica, decomposição em tarefas, pontos de atenção e estratégia de testes)" },
  6: { tipo: "doc", emoji: "🚀", titulo: (t) => `Plano de release e GMUD — ${t}`, foco: "um plano de release e GMUD (janela, nível de risco, plano de rollback, checklist de deploy e evidências)" },
};

// Contexto que "transborda" entre etapas: os documentos já gerados nas etapas
// anteriores da iniciativa. Cada etapa constrói sobre a anterior (o PRD parte
// do Brief, a Arquitetura parte do PRD, etc.) em vez de recomeçar do zero.
async function contextoEtapasAnteriores(db: any, ini: any, maxCharsPorDoc = 1400): Promise<string> {
  const docs = await db
    .select()
    .from(s.documento)
    .where(eq(s.documento.iniciativaId, ini.id))
    .orderBy(asc(s.documento.criadoEm));
  if (!docs.length) return "";
  return docs
    .map((d: any) => `### ${d.emoji ?? "📄"} ${d.titulo}\n${(d.conteudo ?? "").slice(0, maxCharsPorDoc)}`)
    .join("\n\n");
}

// Gera (via IA) o documento formal da etapa a partir do contexto + conversa e
// o persiste em `documento`. Retorna o registro criado. Tolerante a falha da
// IA: cai para um documento montado a partir da própria conversa.
async function gerarDocumentoDaEtapa(db: any, ini: any, ordem: number, etapaNome: string, ag: any): Promise<any> {
  const cfg = DOC_ETAPA[ordem] ?? { tipo: "doc", emoji: "📄", titulo: (t: string) => `${etapaNome} — ${t}`, foco: `o artefato da etapa "${etapaNome}"` };
  const titulo = cfg.titulo(ini.titulo);
  const historico = await db
    .select()
    .from(s.mensagemChat)
    .where(and(eq(s.mensagemChat.iniciativaId, ini.id), eq(s.mensagemChat.etapaOrdem, ordem)))
    .orderBy(asc(s.mensagemChat.criadoEm));
  const transcript = historico.map((m: any) => `${m.autorNome}: ${m.conteudo}`).join("\n");

  let markdown = "";
  try {
    const provider = await getProvider();
    const model = await resolveModel(TAREFA_POR_ETAPA[ordem] ?? "resumo");
    const system =
      `Você é ${ag?.nome ?? "o agente da etapa"}. Produza um DOCUMENTO FORMAL em Markdown: ${cfg.foco}. ` +
      "Use títulos (##), listas e tabelas quando ajudar. Seja específico e acionável. " +
      "Entregue SOMENTE o documento final, em português — sem saudações, sem conversa e sem meta-comentários.";
    const anteriores = await contextoEtapasAnteriores(db, ini);
    const user =
      `Iniciativa ${ini.codigo} — ${ini.titulo}\n${ini.descricao ?? ""}\n\n` +
      (anteriores ? `Documentos das etapas anteriores (construa SOBRE eles, mantendo consistência):\n${anteriores}\n\n` : "") +
      `Conversa da etapa (fonte):\n${transcript || "(sem conversa registrada; gere o documento a partir do contexto acima)"}`;
    const res = await provider.chat({ model, system, messages: [{ role: "user", content: user }], maxTokens: 1600, temperature: 0.3 });
    markdown = (res.content ?? "").trim();
  } catch {
    markdown = "";
  }
  if (!markdown) {
    markdown = `## ${titulo}\n\n_Documento gerado a partir da conversa da etapa._\n\n${transcript || "Sem conteúdo registrado nesta etapa."}`;
  }
  const resumo = markdown.replace(/[#*`>_-]/g, "").split("\n").map((l: string) => l.trim()).filter(Boolean)[0]?.slice(0, 180) ?? titulo;

  const [doc] = await db.insert(s.documento).values({
    squadId: ini.squadId,
    iniciativaId: ini.id,
    titulo,
    tipo: cfg.tipo,
    emoji: cfg.emoji,
    resumo,
    conteudo: markdown,
    autorNome: ag?.nome ?? "Agente da etapa",
    escopo: "squad",
  }).returning();
  return doc;
}

/* Chat com o agente da etapa — streaming SSE (docs/spec §8.5). */
app.post("/:codigo/chat", async (c) => {
  const me = c.get("me");
  const { mensagem, etapa } = await c.req.json<{ mensagem: string; etapa: number }>();
  if (!mensagem?.trim()) return c.json({ error: "mensagem vazia" }, 400);

  const db = await getDb();
  const [ini] = await db
    .select()
    .from(s.iniciativa)
    .where(eq(s.iniciativa.codigo, c.req.param("codigo")));
  if (!ini) return c.json({ error: "iniciativa não encontrada" }, 404);
  if (ini.squadId !== me.squadId && me.papel !== "cto")
    return c.json({ error: "chat permitido apenas na própria squad" }, 403);

  const [etapaRow] = await db
    .select()
    .from(s.iniciativaEtapa)
    .where(and(eq(s.iniciativaEtapa.iniciativaId, ini.id), eq(s.iniciativaEtapa.ordem, etapa)));
  const [ag] = etapaRow?.agenteId
    ? await db.select().from(s.agente).where(eq(s.agente.id, etapaRow.agenteId))
    : [null];
  if (!ag) return c.json({ error: "etapa sem agente" }, 400);

  const agSkills = await db
    .select({ nome: s.skill.nome, instrucoes: s.skill.instrucoes })
    .from(s.agenteSkill)
    .innerJoin(s.skill, eq(s.agenteSkill.skillId, s.skill.id))
    .where(eq(s.agenteSkill.agenteId, ag.id));
  const agTools = await db
    .select({ nome: s.tool.nome, descricao: s.tool.descricao, permissao: s.tool.permissao })
    .from(s.agenteTool)
    .innerJoin(s.tool, eq(s.agenteTool.toolId, s.tool.id))
    .where(eq(s.agenteTool.agenteId, ag.id));

  const contextoAnterior = await contextoEtapasAnteriores(db, ini);
  const system = composeSystemPrompt({
    nome: ag.nome,
    personalidade:
      `${ag.personalidade}\n\nContexto: etapa "${etapaRow.nome}" da iniciativa ${ini.codigo} — ${ini.titulo}. ${ini.descricao ?? ""}` +
      (contextoAnterior
        ? `\n\nVocê JÁ TEM ACESSO aos documentos das etapas anteriores desta iniciativa (abaixo). Use-os como base e NÃO recomece do zero nem peça informação que já está aqui — apenas confirme lacunas pontuais.\n\n${contextoAnterior}`
        : ""),
    skills: agSkills,
    tools: agTools.map((t: any) => ({ ...t, descricao: t.descricao ?? "" })),
    guardRails: [
      "Responda em português, direto ao ponto, no contexto da etapa.",
      "Ao concluir esta etapa, um DOCUMENTO FORMAL é gerado e salvo em Documentação a partir desta conversa — nunca diga que você não cria documentos. Ajude a construir o conteúdo desse documento; se pedirem para vê-lo, oriente a concluir a etapa para gerá-lo (ou apresente uma prévia do documento).",
      "Você recebe os documentos das etapas anteriores no contexto; se perguntarem se tem acesso ao brief/PRD/etc., a resposta é SIM — referencie o conteúdo, não diga que não tem acesso.",
    ],
  });

  const historico = await db
    .select()
    .from(s.mensagemChat)
    .where(and(eq(s.mensagemChat.iniciativaId, ini.id), eq(s.mensagemChat.etapaOrdem, etapa)))
    .orderBy(asc(s.mensagemChat.criadoEm));

  await db.insert(s.mensagemChat).values({
    iniciativaId: ini.id,
    etapaOrdem: etapa,
    autor: "user",
    autorNome: me.nome,
    conteudo: mensagem,
  });

  const provider = await getProvider();
  const req = {
    model: await resolveModel(TAREFA_POR_ETAPA[etapa] ?? "resumo"),
    system,
    maxTokens: ag.maxTokens,
    messages: [
      ...historico.map((m: any) => ({
        role: m.autor === "user" ? ("user" as const) : ("assistant" as const),
        content: m.conteudo,
      })),
      { role: "user" as const, content: mensagem },
    ],
  };

  const mesAtual = new Date().toISOString().slice(0, 7);
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let completo = "";
      let tokens = 0;
      try {
        for await (const chunk of provider.stream(req)) {
          completo += chunk.delta;
          if (chunk.usage) tokens = chunk.usage.promptTokens + chunk.usage.completionTokens;
          if (chunk.delta)
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`));
        }
        // Persiste a resposta e o consumo ao encerrar (docs/spec §5.2).
        await db.insert(s.mensagemChat).values({
          iniciativaId: ini.id,
          etapaOrdem: etapa,
          autor: "agente",
          autorNome: ag.nome,
          conteudo: completo,
          tokens,
        });
        const [cons] = await db
          .select()
          .from(s.consumoTokens)
          .where(and(eq(s.consumoTokens.squadId, ini.squadId), eq(s.consumoTokens.mes, mesAtual)));
        if (cons) {
          await db
            .update(s.consumoTokens)
            .set({ completionTokens: cons.completionTokens + tokens })
            .where(eq(s.consumoTokens.id, cons.id));
        } else {
          await db.insert(s.consumoTokens).values({
            squadId: ini.squadId,
            mes: mesAtual,
            completionTokens: tokens,
          });
        }
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true, tokens })}\n\n`));
      } catch (err) {
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
});

/* Concluir a etapa atual (gera artefato e avança). */
app.post("/:codigo/etapas/:ordem/concluir", rbac("criar_iniciativa"), async (c) => {
  const me = c.get("me");
  const ordem = Number(c.req.param("ordem"));
  const db = await getDb();
  const [ini] = await db
    .select()
    .from(s.iniciativa)
    .where(eq(s.iniciativa.codigo, c.req.param("codigo")));
  if (!ini) return c.json({ error: "iniciativa não encontrada" }, 404);
  if (ini.squadId !== me.squadId) return c.json({ error: "apenas a própria squad" }, 403);
  if (ordem !== ini.etapaAtual) return c.json({ error: "só a etapa atual pode ser concluída" }, 400);

  const [etapaRow] = await db
    .select()
    .from(s.iniciativaEtapa)
    .where(and(eq(s.iniciativaEtapa.iniciativaId, ini.id), eq(s.iniciativaEtapa.ordem, ordem)));
  const [ag] = etapaRow?.agenteId
    ? await db.select().from(s.agente).where(eq(s.agente.id, etapaRow.agenteId))
    : [null];

  // Toda etapa ENTREGA um documento formal, gerado pelo agente e armazenado em
  // Documentação (visível na jornada e em /squad/docs).
  const doc = await gerarDocumentoDaEtapa(db, ini, ordem, etapaRow.nome, ag);

  await db
    .update(s.iniciativaEtapa)
    .set({
      status: "concluida",
      concluidaEm: new Date(),
      artefato: {
        titulo: doc.titulo,
        secoes: [
          { h: "Documento gerado", itens: [`${doc.emoji ?? "📄"} ${doc.titulo} — por ${doc.autorNome}. Disponível em Documentação.`] },
          ...(doc.resumo ? [{ h: "Resumo", itens: [doc.resumo] }] : []),
        ],
      },
    })
    .where(eq(s.iniciativaEtapa.id, etapaRow.id));

  const proxima = ordem + 1;
  if (proxima > 6) {
    await db.update(s.iniciativa).set({ status: "concluida" }).where(eq(s.iniciativa.id, ini.id));
  } else {
    await db
      .update(s.iniciativa)
      .set({ etapaAtual: proxima })
      .where(eq(s.iniciativa.id, ini.id));
    await db
      .update(s.iniciativaEtapa)
      .set({ status: "em_andamento" })
      .where(and(eq(s.iniciativaEtapa.iniciativaId, ini.id), eq(s.iniciativaEtapa.ordem, proxima)));
  }
  await audit(me, "concluir_etapa", `iniciativa:${ini.codigo}`, { etapa: etapaRow.nome, docId: doc.id });
  return c.json({ ok: true, proximaEtapa: proxima <= 6 ? proxima : null, docId: doc.id });
});

export default app;
