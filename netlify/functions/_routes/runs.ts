import { Hono } from "hono";
import { z } from "zod";
import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { rbac } from "../_mw/rbac";
import { audit } from "../_lib/audit";
import { criarRun, enqueueAdvance } from "../_lib/run-engine";
import { DecisaoCheckpoint } from "../../../shared/types";

// Execução autônoma (docs/spec §8) — runs, passos e checkpoints humanos.
const app = new Hono();

/* Runs da squad. */
app.get("/", async (c) => {
  const me = c.get("me");
  const squadId = c.req.query("squadId") ?? me.squadId;
  if (!squadId) return c.json([]);
  const db = await getDb();
  const runs = await db
    .select()
    .from(s.execucaoAutonoma)
    .where(eq(s.execucaoAutonoma.squadId, squadId))
    .orderBy(desc(s.execucaoAutonoma.criadoEm));
  const krs = await db.select().from(s.keyResult);
  const inis = await db.select().from(s.iniciativa);
  return c.json(
    runs.map((r: any) => ({
      ...r,
      krDescricao: krs.find((k: any) => k.id === r.krId)?.descricao ?? null,
      iniciativaCodigo: inis.find((i: any) => i.id === r.iniciativaId)?.codigo ?? null,
    }))
  );
});

/* Iniciativas da squad elegíveis para orquestração (não concluídas). */
app.get("/iniciativas-elegiveis", async (c) => {
  const me = c.get("me");
  if (!me.squadId) return c.json([]);
  const db = await getDb();
  const inis = (await db.select().from(s.iniciativa)).filter((i: any) => i.squadId === me.squadId && i.status !== "concluida");
  const etapas = await db.select().from(s.iniciativaEtapa);
  return c.json(inis.map((i: any) => {
    const ets = etapas.filter((e: any) => e.iniciativaId === i.id);
    return { id: i.id, codigo: i.codigo, titulo: i.titulo, etapaAtual: i.etapaAtual, etapasTotal: ets.length };
  }));
});

/* Inicia a orquestração autônoma de uma iniciativa (o agente conduz até o fim). */
app.post("/iniciativa", rbac("iniciar_run"), async (c) => {
  const me = c.get("me");
  if (!me.squadId) return c.json({ error: "usuário sem squad" }, 400);
  const body = z.object({ iniciativaId: z.string().uuid() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "iniciativaId obrigatório" }, 400);
  const db = await getDb();
  const [ini] = await db.select().from(s.iniciativa).where(eq(s.iniciativa.id, body.data.iniciativaId));
  if (!ini || ini.squadId !== me.squadId) return c.json({ error: "iniciativa não encontrada" }, 404);
  if (ini.status === "concluida") return c.json({ error: "iniciativa já concluída" }, 409);

  const [exec] = await db.insert(s.execucaoAutonoma).values({
    squadId: me.squadId, iniciativaId: ini.id, modo: "iniciativa",
    objetivo: `Orquestrar a iniciativa ${ini.codigo} — ${ini.titulo} até concluir`,
    status: "em_andamento", progresso: "na fila…", criadoPor: me.id,
  }).returning();
  const { enqueueOrquestrar } = await import("../_lib/orquestrador");
  await enqueueOrquestrar(exec.id);
  await audit(me, "orquestrar_iniciativa", `iniciativa:${ini.codigo}`, { execId: exec.id });
  return c.json(exec, 202);
});

const CriarRunBody = z.object({
  krId: z.string().uuid().optional(),
  objetivo: z.string().min(8),
});

/* Inicia um run (docs/spec §5.2) e enfileira o motor de avanço. */
app.post("/", rbac("iniciar_run"), async (c) => {
  const me = c.get("me");
  if (!me.squadId) return c.json({ error: "usuário sem squad" }, 400);
  const body = CriarRunBody.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const run = await criarRun({
    squadId: me.squadId,
    krId: body.data.krId,
    objetivo: body.data.objetivo,
    criadoPor: me.id,
  });
  await audit(me, "iniciar_run", `run:${run.id}`, { objetivo: run.objetivo });
  await enqueueAdvance(run.id);
  return c.json(run, 202);
});

/* Estado completo do run: passos + checkpoints. */
app.get("/:id", async (c) => {
  const db = await getDb();
  const [run] = await db
    .select()
    .from(s.execucaoAutonoma)
    .where(eq(s.execucaoAutonoma.id, c.req.param("id")));
  if (!run) return c.json({ error: "run não encontrado" }, 404);
  const passos = await db
    .select()
    .from(s.execucaoPasso)
    .where(eq(s.execucaoPasso.execucaoId, run.id))
    .orderBy(asc(s.execucaoPasso.ordem));
  const checkpoints = await db
    .select()
    .from(s.execucaoCheckpoint)
    .where(eq(s.execucaoCheckpoint.execucaoId, run.id));
  const krs = await db.select().from(s.keyResult);
  const [ini] = run.iniciativaId ? await db.select().from(s.iniciativa).where(eq(s.iniciativa.id, run.iniciativaId)) : [null];
  const totalEtapas = ini ? (await db.select().from(s.iniciativaEtapa)).filter((e: any) => e.iniciativaId === ini.id).length : null;
  return c.json({
    ...run,
    krDescricao: krs.find((k: any) => k.id === run.krId)?.descricao ?? null,
    iniciativaCodigo: ini?.codigo ?? null,
    totalEtapas,
    passos,
    checkpoints,
  });
});

/* Cancelar a orquestração de uma iniciativa (o loop de background respeita). */
app.post("/:id/cancelar", rbac("iniciar_run"), async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const [run] = await db.select().from(s.execucaoAutonoma).where(eq(s.execucaoAutonoma.id, c.req.param("id")));
  if (!run || run.squadId !== me.squadId) return c.json({ error: "run não encontrado" }, 404);
  if (run.status !== "em_andamento") return c.json({ error: "run não está em andamento" }, 409);
  await db.update(s.execucaoAutonoma).set({ status: "cancelada", progresso: "cancelada pelo usuário", atualizadoEm: new Date() }).where(eq(s.execucaoAutonoma.id, run.id));
  await audit(me, "cancelar_run", `run:${run.id}`);
  return c.json({ ok: true });
});

/* Retomar/tentar novamente a orquestração de uma iniciativa. */
app.post("/:id/retomar", rbac("iniciar_run"), async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const [run] = await db.select().from(s.execucaoAutonoma).where(eq(s.execucaoAutonoma.id, c.req.param("id")));
  if (!run || run.squadId !== me.squadId) return c.json({ error: "run não encontrado" }, 404);
  if (run.modo !== "iniciativa") return c.json({ error: "apenas orquestração de iniciativa" }, 400);
  if (run.status === "em_andamento" || run.status === "concluida") return c.json({ error: `run já ${run.status}` }, 409);
  await db.update(s.execucaoAutonoma).set({ status: "em_andamento", progresso: "retomando…", atualizadoEm: new Date() }).where(eq(s.execucaoAutonoma.id, run.id));
  const { enqueueOrquestrar } = await import("../_lib/orquestrador");
  await enqueueOrquestrar(run.id);
  await audit(me, "retomar_run", `run:${run.id}`);
  return c.json({ ok: true });
});

const Decisao = z.object({
  decisao: DecisaoCheckpoint,
  ajuste: z.string().optional(),
});

/* Decisão humana no checkpoint (docs/spec §8.3). */
app.post("/:id/checkpoints/:cid", rbac("decidir_checkpoint"), async (c) => {
  const me = c.get("me");
  const body = Decisao.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const db = await getDb();
  const [ck] = await db
    .select()
    .from(s.execucaoCheckpoint)
    .where(eq(s.execucaoCheckpoint.id, c.req.param("cid")));
  if (!ck || ck.execucaoId !== c.req.param("id"))
    return c.json({ error: "checkpoint não encontrado" }, 404);
  if (ck.status === "decidido") return c.json({ error: "checkpoint já decidido" }, 409);

  await db
    .update(s.execucaoCheckpoint)
    .set({
      status: "decidido",
      decisao: body.data.decisao,
      ajuste: body.data.ajuste ?? null,
      aprovadorId: me.id,
      decididoEm: new Date(),
    })
    .where(eq(s.execucaoCheckpoint.id, ck.id));

  const { decisao } = body.data;
  if (decisao === "aprovado") {
    // Marca o passo de checkpoint como concluído e retoma o motor.
    const passos = await db
      .select()
      .from(s.execucaoPasso)
      .where(eq(s.execucaoPasso.execucaoId, ck.execucaoId));
    const passo = passos.find((p: any) => p.ordem === ck.passoOrdem);
    if (passo) {
      await db
        .update(s.execucaoPasso)
        .set({ status: "concluido", saida: { resumo: `Aprovado por ${me.nome}.` }, concluidoEm: new Date() })
        .where(eq(s.execucaoPasso.id, passo.id));
    }
    await db
      .update(s.execucaoAutonoma)
      .set({ status: "em_andamento", atualizadoEm: new Date() })
      .where(eq(s.execucaoAutonoma.id, ck.execucaoId));
    await enqueueAdvance(ck.execucaoId);
  } else {
    await db
      .update(s.execucaoAutonoma)
      .set({ status: decisao === "ajustar" ? "pausada" : "rejeitada", atualizadoEm: new Date() })
      .where(eq(s.execucaoAutonoma.id, ck.execucaoId));
  }
  await audit(me, "decidir_checkpoint", `run:${ck.execucaoId}`, { decisao, ajuste: body.data.ajuste });
  return c.json({ ok: true, decisao });
});

/* Retomar run pausado (após ajuste). */
app.post("/:id/retomar", rbac("iniciar_run"), async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const [run] = await db
    .select()
    .from(s.execucaoAutonoma)
    .where(eq(s.execucaoAutonoma.id, c.req.param("id")));
  if (!run) return c.json({ error: "run não encontrado" }, 404);
  if (run.status !== "pausada") return c.json({ error: "run não está pausado" }, 400);
  await db
    .update(s.execucaoAutonoma)
    .set({ status: "em_andamento", atualizadoEm: new Date() })
    .where(eq(s.execucaoAutonoma.id, run.id));
  await audit(me, "retomar_run", `run:${run.id}`);
  await enqueueAdvance(run.id);
  return c.json({ ok: true });
});

export default app;
