import { Hono } from "hono";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { audit } from "../_lib/audit";

const app = new Hono();

/* Documentos visíveis por escopo: os da squad; os de RT (todas as squads do
   meu RT); os de comunidade (todas as squads da comunidade). Com iniciativa. */
app.get("/", async (c) => {
  const me = c.get("me");
  const escopo = c.req.query("escopo"); // squad|release_train|comunidade
  const db = await getDb();

  const squads = await db.select().from(s.squad);
  const rts = await db.select().from(s.releaseTrain);
  const rtDeSquad = new Map<string, string>(squads.map((sq: any) => [sq.id, sq.releaseTrainId]));
  const comDeRt = new Map<string, string>(rts.map((rt: any) => [rt.id, rt.comunidadeId]));
  const comDeSquad = (sid: string | null) => { const rt = sid ? rtDeSquad.get(sid) : undefined; return rt ? comDeRt.get(rt) : undefined; };
  const meuRt = me.squadId ? rtDeSquad.get(me.squadId) : undefined;
  // Diretoria (CTO/Gestão) enxerga tudo da própria comunidade — inclusive os
  // docs de escopo squad (features) das squads, que antes ficavam invisíveis
  // porque a diretoria não tem squadId próprio. Exceção: quando o CTO está
  // AUDITANDO uma squad, ele vê como aquela squad (não a comunidade toda).
  const verComunidade = (me.escopos ?? []).includes("comunidade") && !me.auditando;

  const visivel = (d: any) => {
    if (d.escopo === "comunidade") return comDeSquad(d.squadId) === me.comunidadeId;
    if (d.escopo === "release_train")
      return verComunidade ? comDeSquad(d.squadId) === me.comunidadeId : (d.squadId && rtDeSquad.get(d.squadId) === meuRt);
    // escopo squad (features): diretoria vê todas as squads da comunidade.
    return verComunidade ? comDeSquad(d.squadId) === me.comunidadeId : d.squadId === me.squadId;
  };

  const inis = await db.select().from(s.iniciativa);
  let docs = (await db.select().from(s.documento).orderBy(desc(s.documento.criadoEm))).filter(visivel);
  if (escopo) docs = docs.filter((d: any) => d.escopo === escopo);
  return c.json(docs.map(({ conteudo, ...r }: any) => {
    const ini = r.iniciativaId ? inis.find((i: any) => i.id === r.iniciativaId) : null;
    return { ...r, iniciativaCodigo: ini?.codigo ?? null, iniciativaTitulo: ini?.titulo ?? null, squadNome: squads.find((sq: any) => sq.id === r.squadId)?.nome ?? null };
  }));
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
