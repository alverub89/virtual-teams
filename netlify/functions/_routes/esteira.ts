import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";

const app = new Hono();

/* Esteira & GMUDs da squad. */
app.get("/", async (c) => {
  const me = c.get("me");
  const squadId = c.req.query("squadId") ?? me.squadId;
  if (!squadId) return c.json({ execucoes: [], gmuds: [] });
  const db = await getDb();
  const execucoes = await db
    .select()
    .from(s.execucaoEsteira)
    .where(eq(s.execucaoEsteira.squadId, squadId));
  const gmuds = await db
    .select()
    .from(s.gmud)
    .where(eq(s.gmud.squadId, squadId))
    .orderBy(desc(s.gmud.criadoEm));
  return c.json({ execucoes, gmuds });
});

/* Estação dev: minhas histórias, PRs e esteira. */
app.get("/dev", async (c) => {
  const me = c.get("me");
  if (!me.squadId) return c.json({ historias: [], prs: [], execucoes: [] });
  const db = await getDb();
  const inis = await db.select().from(s.iniciativa).where(eq(s.iniciativa.squadId, me.squadId));
  const iniIds = new Set(inis.map((i: any) => i.id));
  const historias = (await db.select().from(s.historia)).filter((h: any) =>
    iniIds.has(h.iniciativaId)
  );
  const repos = await db.select().from(s.repositorio).where(eq(s.repositorio.squadId, me.squadId));
  const repoIds = new Set(repos.map((r: any) => r.id));
  const prs = (await db.select().from(s.pullRequest).orderBy(desc(s.pullRequest.criadoEm))).filter(
    (p: any) => repoIds.has(p.repositorioId)
  );
  const execucoes = await db
    .select()
    .from(s.execucaoEsteira)
    .where(eq(s.execucaoEsteira.squadId, me.squadId));
  return c.json({
    historias: historias.map((h: any) => ({
      ...h,
      iniciativaCodigo: inis.find((i: any) => i.id === h.iniciativaId)?.codigo,
      minha: h.responsavelId === me.id,
    })),
    prs: prs.map((p: any) => ({
      ...p,
      repositorio: repos.find((r: any) => r.id === p.repositorioId)?.nome,
    })),
    execucoes,
  });
});

export default app;
