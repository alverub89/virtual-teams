import { Hono } from "hono";
import { z } from "zod";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { rbac } from "../_mw/rbac";
import { audit } from "../_lib/audit";

const app = new Hono();

/* Cascata de OKRs: comunidade → RT → squad, com KRs, medições e features. */
app.get("/", async (c) => {
  const db = await getDb();
  const okrs = await db.select().from(s.okr);
  const krs = await db.select().from(s.keyResult).orderBy(asc(s.keyResult.ordem));
  const krIds = krs.map((k: any) => k.id);
  const medicoes = krIds.length
    ? await db.select().from(s.krMedicao).where(inArray(s.krMedicao.krId, krIds)).orderBy(asc(s.krMedicao.mes))
    : [];
  const features = krIds.length
    ? await db
        .select({
          krId: s.krFeature.krId,
          iniciativaId: s.krFeature.iniciativaId,
          codigo: s.iniciativa.codigo,
          titulo: s.iniciativa.titulo,
          etapaAtual: s.iniciativa.etapaAtual,
          status: s.iniciativa.status,
        })
        .from(s.krFeature)
        .innerJoin(s.iniciativa, eq(s.krFeature.iniciativaId, s.iniciativa.id))
        .where(inArray(s.krFeature.krId, krIds))
    : [];

  return c.json(
    okrs.map((o: any) => ({
      ...o,
      krs: krs
        .filter((k: any) => k.okrId === o.id)
        .map((k: any) => ({
          ...k,
          medicoes: medicoes.filter((m: any) => m.krId === k.id),
          features: features.filter((f: any) => f.krId === k.id),
        })),
    }))
  );
});

const Medicao = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/),
  planejado: z.number().nullable().optional(),
  realizado: z.number().nullable().optional(),
});

/* Imputar planejado/realizado de um KR (upsert por mês). */
app.post("/krs/:id/medicoes", rbac("imputar_kr"), async (c) => {
  const me = c.get("me");
  const body = Medicao.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const krId = c.req.param("id");

  const db = await getDb();
  const existentes = await db.select().from(s.krMedicao).where(eq(s.krMedicao.krId, krId));
  const atual = existentes.find((m: any) => m.mes === body.data.mes);
  if (atual) {
    await db
      .update(s.krMedicao)
      .set({
        planejado: body.data.planejado ?? atual.planejado,
        realizado: body.data.realizado ?? atual.realizado,
      })
      .where(eq(s.krMedicao.id, atual.id));
  } else {
    await db.insert(s.krMedicao).values({ krId, ...body.data });
  }
  await audit(me, "imputar_kr", `kr:${krId}`, body.data);
  return c.json({ ok: true });
});

/* Associar feature (iniciativa) a um KR. */
app.post("/krs/:id/features", rbac("imputar_kr"), async (c) => {
  const me = c.get("me");
  const { iniciativaId } = await c.req.json<{ iniciativaId?: string }>();
  if (!iniciativaId) return c.json({ error: "iniciativaId obrigatório" }, 400);
  const krId = c.req.param("id");
  const db = await getDb();
  const jaTem = await db.select().from(s.krFeature).where(eq(s.krFeature.krId, krId));
  if (jaTem.some((f: any) => f.iniciativaId === iniciativaId))
    return c.json({ ok: true, jaAssociada: true });
  await db.insert(s.krFeature).values({ krId, iniciativaId });
  await audit(me, "associar_feature_kr", `kr:${krId}`, { iniciativaId });
  return c.json({ ok: true }, 201);
});

export default app;
