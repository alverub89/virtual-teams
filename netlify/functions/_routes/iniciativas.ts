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

  const system = composeSystemPrompt({
    nome: ag.nome,
    personalidade: `${ag.personalidade}\n\nContexto: etapa "${etapaRow.nome}" da iniciativa ${ini.codigo} — ${ini.titulo}. ${ini.descricao ?? ""}`,
    skills: agSkills,
    tools: agTools.map((t: any) => ({ ...t, descricao: t.descricao ?? "" })),
    guardRails: ["Responda em português, direto ao ponto, no contexto da etapa."],
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

  await db
    .update(s.iniciativaEtapa)
    .set({
      status: "concluida",
      concluidaEm: new Date(),
      artefato: etapaRow.artefato ?? {
        titulo: `${etapaRow.nome} — concluída`,
        secoes: [{ h: "Registro", itens: [`Etapa concluída por ${me.nome} com apoio do agente.`] }],
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
  await audit(me, "concluir_etapa", `iniciativa:${ini.codigo}`, { etapa: etapaRow.nome });
  return c.json({ ok: true, proximaEtapa: proxima <= 6 ? proxima : null });
});

export default app;
