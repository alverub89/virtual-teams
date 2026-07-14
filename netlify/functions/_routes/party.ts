import { Hono } from "hono";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { audit } from "../_lib/audit";

// Party mode — mesa-redonda de agentes. Disponível para squads (consomem o
// acervo) e para o console. A orquestração roda em background.
const app = new Hono();

app.get("/", async (c) => {
  const me = c.get("me");
  const db = await getDb();
  // Isolamento de tenant: só agentes globais (built-in) + os da minha comunidade.
  const agentes = (await db.select().from(s.agente))
    .filter((a: any) => a.ativo && (a.comunidadeId == null || a.comunidadeId === me.comunidadeId))
    .map((a: any) => ({ id: a.id, nome: a.nome, papel: a.papel, emoji: a.emoji }));
  const sessoes = (await db.select().from(s.partySessao).orderBy(desc(s.partySessao.criadoEm)))
    .filter((x: any) => !x.squadId || x.squadId === me.squadId)
    .slice(0, 20)
    .map((x: any) => ({ id: x.id, titulo: x.titulo, topico: x.topico, status: x.status, criadoEm: x.criadoEm }));
  return c.json({ agentes, sessoes });
});

app.post("/", async (c) => {
  const me = c.get("me");
  const body = z.object({
    titulo: z.string().max(160).optional(),
    topico: z.string().min(4).max(2000),
    agenteIds: z.array(z.string().uuid()).min(2).max(5),
    rounds: z.number().int().min(2).max(5).optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "escolha um tópico e de 2 a 5 agentes" }, 400);
  const db = await getDb();
  const rounds = body.data.rounds ?? 3;
  const [sess] = await db.insert(s.partySessao).values({
    squadId: me.squadId ?? null, titulo: body.data.titulo || body.data.topico.slice(0, 80),
    topico: body.data.topico, status: "em_andamento", progresso: "na fila…", criadoPor: me.id,
  }).returning();
  const { enqueueParty } = await import("../_lib/party");
  await enqueueParty(sess.id, body.data.agenteIds, rounds);
  await audit(me, "iniciar_party", `party:${sess.id}`, { agentes: body.data.agenteIds.length, rounds });
  return c.json({ ok: true, id: sess.id }, 201);
});

app.get("/:id", async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const [sess] = await db.select().from(s.partySessao).where(eq(s.partySessao.id, c.req.param("id")));
  if (!sess || (sess.squadId && sess.squadId !== me.squadId)) return c.json({ error: "não encontrada" }, 404);
  const turnos = (await db.select().from(s.partyTurno)).filter((t: any) => t.sessaoId === sess.id).sort((a: any, b: any) => a.ordem - b.ordem);
  return c.json({
    sessao: { id: sess.id, titulo: sess.titulo, topico: sess.topico, status: sess.status, progresso: sess.progresso, sintese: sess.sintese, criadoEm: sess.criadoEm },
    turnos: turnos.map((t: any) => ({ ordem: t.ordem, agenteNome: t.agenteNome, emoji: t.emoji, conteudo: t.conteudo })),
  });
});

export default app;
