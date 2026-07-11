import { Hono } from "hono";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { rbac } from "../_mw/rbac";
import { audit } from "../_lib/audit";

const app = new Hono();

/* Base de conhecimento da squad do usuário, por escopo, com endossos. */
app.get("/", async (c) => {
  const me = c.get("me");
  const escopo = c.req.query("escopo");
  const db = await getDb();
  let artigos = (await db.select().from(s.kbArtigo).orderBy(desc(s.kbArtigo.criadoEm))).filter(
    (a: any) => a.squadId === me.squadId
  );
  if (escopo) artigos = artigos.filter((a: any) => a.escopo === escopo);
  const endossos = await db.select().from(s.kbEndosso);
  return c.json(
    artigos.map(({ conteudo, ...a }: any) => ({
      ...a,
      endossos: endossos.filter((e: any) => e.artigoId === a.id).map((e: any) => e.nivel),
    }))
  );
});

app.get("/:id", async (c) => {
  const db = await getDb();
  const [artigo] = await db.select().from(s.kbArtigo).where(eq(s.kbArtigo.id, c.req.param("id")));
  if (!artigo) return c.json({ error: "artigo não encontrado" }, 404);
  const endossos = await db.select().from(s.kbEndosso).where(eq(s.kbEndosso.artigoId, artigo.id));
  return c.json({ ...artigo, endossos: endossos.map((e: any) => e.nivel) });
});

const CriarArtigo = z.object({
  titulo: z.string().min(4),
  resumo: z.string().optional(),
  conteudo: z.string().min(10),
  escopo: z.enum(["squad", "release_train", "comunidade"]).default("squad"),
});

app.post("/", async (c) => {
  const me = c.get("me");
  const body = CriarArtigo.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const db = await getDb();
  const [artigo] = await db
    .insert(s.kbArtigo)
    .values({ ...body.data, squadId: me.squadId, autorId: me.id, autorNome: me.nome })
    .returning();
  await audit(me, "publicar_kb", `kb:${artigo.titulo}`, { escopo: artigo.escopo });
  return c.json(artigo, 201);
});

/* Endosso RT/comunidade — só arquiteto (docs/spec §5.2). */
app.post("/:id/endossar", rbac("endossar_kb"), async (c) => {
  const me = c.get("me");
  const { nivel } = await c.req.json<{ nivel?: "release_train" | "comunidade" }>();
  if (!nivel) return c.json({ error: "nivel obrigatório" }, 400);
  const db = await getDb();
  const artigoId = c.req.param("id");
  const existentes = await db.select().from(s.kbEndosso).where(eq(s.kbEndosso.artigoId, artigoId));
  if (existentes.some((e: any) => e.nivel === nivel)) return c.json({ ok: true, jaEndossado: true });
  await db.insert(s.kbEndosso).values({ artigoId, pessoaId: me.id, nivel });
  await audit(me, "endossar_kb", `kb:${artigoId}`, { nivel });
  return c.json({ ok: true }, 201);
});

export default app;
