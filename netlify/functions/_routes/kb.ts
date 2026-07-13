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
      status: a.status ?? "pronto",
      origem: a.origem ?? "manual",
      endossos: endossos.filter((e: any) => e.artigoId === a.id).map((e: any) => e.nivel),
    }))
  );
});

/* Repositórios da squad disponíveis para gerar documentação (KB de contexto). */
app.get("/repos-disponiveis", async (c) => {
  const me = c.get("me");
  if (!me.squadId) return c.json({ repos: [], temToken: false });
  const db = await getDb();
  const repos = (await db.select().from(s.repositorio)).filter((r: any) => r.squadId === me.squadId);
  const [sq] = await db.select().from(s.squad).where(eq(s.squad.id, me.squadId));
  const [rt] = sq ? await db.select().from(s.releaseTrain).where(eq(s.releaseTrain.id, sq.releaseTrainId)) : [];
  const [com] = rt ? await db.select().from(s.comunidade).where(eq(s.comunidade.id, rt.comunidadeId)) : [];
  const { resolveGithubToken } = await import("../_lib/capacidades");
  return c.json({
    repos: repos.map((r: any) => ({ id: r.id, nome: r.nome, linguagem: r.linguagem ?? null })),
    temToken: !!resolveGithubToken(com),
  });
});

/* Gera um artigo de KB documentando um repositório (IA lê o repo em background). */
app.post("/gerar-de-repo", async (c) => {
  const me = c.get("me");
  if (!me.squadId) return c.json({ error: "usuário sem squad" }, 400);
  const body = z.object({
    repo: z.string().min(3),
    escopo: z.enum(["squad", "release_train", "comunidade"]).default("squad"),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const db = await getDb();
  const repos = (await db.select().from(s.repositorio)).filter((r: any) => r.squadId === me.squadId);
  if (!repos.some((r: any) => r.nome === body.data.repo)) return c.json({ error: "repositório não é da squad" }, 404);

  const [artigo] = await db.insert(s.kbArtigo).values({
    escopo: body.data.escopo,
    squadId: me.squadId,
    titulo: `Documentação — ${body.data.repo}`,
    resumo: "Gerando documentação a partir do repositório…",
    conteudo: "_Gerando documentação a partir do repositório…_",
    autorId: me.id,
    autorNome: me.nome,
    status: "gerando",
    origem: "ia",
    repo: body.data.repo,
    progresso: "na fila…",
  }).returning();
  const { enqueueKb } = await import("../_lib/kbgen");
  await enqueueKb(artigo.id);
  await audit(me, "gerar_kb_repo", `kb:${artigo.titulo}`, { repo: body.data.repo });
  return c.json(artigo, 201);
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
