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
  return c.json(
    runs.map((r: any) => ({
      ...r,
      krDescricao: krs.find((k: any) => k.id === r.krId)?.descricao ?? null,
    }))
  );
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
  return c.json({
    ...run,
    krDescricao: krs.find((k: any) => k.id === run.krId)?.descricao ?? null,
    passos,
    checkpoints,
  });
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
