import { Hono } from "hono";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { audit } from "../_lib/audit";

const app = new Hono();

/* Lista documentos visíveis: da squad + escopos superiores (consulta). */
app.get("/", async (c) => {
  const me = c.get("me");
  const escopo = c.req.query("escopo"); // squad|release_train|comunidade
  const squadId = c.req.query("squadId");
  const db = await getDb();
  let docs = (await db.select().from(s.documento).orderBy(desc(s.documento.criadoEm))).filter(
    (d: any) => d.squadId === (squadId ?? me.squadId)
  );
  if (escopo) docs = docs.filter((d: any) => d.escopo === escopo);
  return c.json(docs.map(({ conteudo, ...resto }: any) => resto));
});

app.get("/:id", async (c) => {
  const db = await getDb();
  const [doc] = await db.select().from(s.documento).where(eq(s.documento.id, c.req.param("id")));
  if (!doc) return c.json({ error: "documento não encontrado" }, 404);
  return c.json(doc);
});

const CriarDoc = z.object({
  titulo: z.string().min(4),
  tipo: z.enum(["prd", "adr", "api", "guia", "postmortem", "doc"]).default("doc"),
  resumo: z.string().optional(),
  conteudo: z.string().min(10),
  iniciativaId: z.string().uuid().optional(),
  escopo: z.enum(["squad", "release_train", "comunidade"]).default("squad"),
});

app.post("/", async (c) => {
  const me = c.get("me");
  if (!me.squadId && me.papel !== "cto")
    return c.json({ error: "usuário sem squad" }, 400);
  const body = CriarDoc.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const db = await getDb();
  const [doc] = await db
    .insert(s.documento)
    .values({ ...body.data, squadId: me.squadId, autorNome: me.nome })
    .returning();
  await audit(me, "criar_doc", `doc:${doc.titulo}`);
  return c.json(doc, 201);
});

export default app;
