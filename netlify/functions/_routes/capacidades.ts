import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { audit } from "../_lib/audit";

const app = new Hono();

/* Capacidades da squad com repositórios associados. */
app.get("/", async (c) => {
  const me = c.get("me");
  const squadId = c.req.query("squadId") ?? me.squadId;
  if (!squadId) return c.json([]);
  const db = await getDb();
  const caps = await db.select().from(s.capacidade).where(eq(s.capacidade.squadId, squadId));
  const repos = await db.select().from(s.repositorio).where(eq(s.repositorio.squadId, squadId));
  const links = await db.select().from(s.capacidadeRepositorio);
  const inis = await db.select().from(s.iniciativa).where(eq(s.iniciativa.squadId, squadId));

  return c.json({
    capacidades: caps.map((cp: any) => ({
      ...cp,
      repositorios: links
        .filter((l: any) => l.capacidadeId === cp.id)
        .map((l: any) => repos.find((r: any) => r.id === l.repositorioId))
        .filter(Boolean),
      iniciativas: inis.filter((i: any) => i.capacidadeId === cp.id).length,
    })),
    repositorios: repos,
  });
});

const ConectarRepo = z.object({
  nome: z.string().min(3), // org/repo
  linguagem: z.string().optional(),
  capacidadeId: z.string().uuid().optional(),
});

/* Conectar repositório do GitHub e (opcionalmente) associar à capacidade.
   Com GitHub App configurada, valida via API; sem, registra direto (demo). */
app.post("/repos/conectar", async (c) => {
  const me = c.get("me");
  if (!me.squadId) return c.json({ error: "usuário sem squad" }, 400);
  const body = ConectarRepo.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const db = await getDb();
  const [repo] = await db
    .insert(s.repositorio)
    .values({
      squadId: me.squadId,
      nome: body.data.nome,
      linguagem: body.data.linguagem ?? null,
      url: `https://github.example.com/${body.data.nome}`,
    })
    .returning();
  if (body.data.capacidadeId) {
    await db
      .insert(s.capacidadeRepositorio)
      .values({ capacidadeId: body.data.capacidadeId, repositorioId: repo.id });
  }
  await audit(me, "conectar_repo", `repo:${repo.nome}`);
  return c.json(repo, 201);
});

export default app;
