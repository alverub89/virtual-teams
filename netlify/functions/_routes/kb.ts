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
      tipoDoc: a.tipoDoc ?? null,
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
  const { TIPOS_DOC } = await import("../_lib/kbgen");
  return c.json({
    repos: repos.map((r: any) => ({ id: r.id, nome: r.nome, linguagem: r.linguagem ?? null })),
    temToken: !!resolveGithubToken(com),
    tiposDoc: TIPOS_DOC.map(({ key, label, emoji, padrao }) => ({ key, label, emoji, padrao })),
  });
});

/* Gera um CONJUNTO de documentos (funcional, técnico, dados, …) de um repositório. */
app.post("/gerar-de-repo", async (c) => {
  const me = c.get("me");
  if (!me.squadId) return c.json({ error: "usuário sem squad" }, 400);
  const { TIPOS_DOC } = await import("../_lib/kbgen");
  const chaves = TIPOS_DOC.map((t) => t.key) as [string, ...string[]];
  const body = z.object({
    repo: z.string().min(3),
    escopo: z.enum(["squad", "release_train", "comunidade"]).default("squad"),
    tipos: z.array(z.enum(chaves)).min(1).optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const db = await getDb();
  const repos = (await db.select().from(s.repositorio)).filter((r: any) => r.squadId === me.squadId);
  if (!repos.some((r: any) => r.nome === body.data.repo)) return c.json({ error: "repositório não é da squad" }, 404);

  const tipos = body.data.tipos?.length ? body.data.tipos : TIPOS_DOC.filter((t) => t.padrao).map((t) => t.key);
  const criados: any[] = [];
  for (const key of tipos) {
    const t = TIPOS_DOC.find((x) => x.key === key)!;
    const [artigo] = await db.insert(s.kbArtigo).values({
      escopo: body.data.escopo,
      squadId: me.squadId,
      titulo: `${t.label} — ${body.data.repo}`,
      resumo: `Gerando documentação ${t.label.toLowerCase()}…`,
      conteudo: `_Gerando documentação ${t.label.toLowerCase()} a partir do repositório…_`,
      autorId: me.id,
      autorNome: me.nome,
      status: "gerando",
      origem: "ia",
      repo: body.data.repo,
      tipoDoc: key,
      progresso: "na fila…",
    }).returning();
    criados.push(artigo);
  }
  const { enqueueKb } = await import("../_lib/kbgen");
  await enqueueKb(criados.map((a) => a.id));
  await audit(me, "gerar_kb_repo", `kb:${body.data.repo}`, { repo: body.data.repo, tipos });
  return c.json({ ok: true, artigos: criados }, 201);
});

app.get("/:id", async (c) => {
  const db = await getDb();
  const [artigo] = await db.select().from(s.kbArtigo).where(eq(s.kbArtigo.id, c.req.param("id")));
  if (!artigo) return c.json({ error: "artigo não encontrado" }, 404);
  const endossos = await db.select().from(s.kbEndosso).where(eq(s.kbEndosso.artigoId, artigo.id));
  return c.json({ ...artigo, endossos: endossos.map((e: any) => e.nivel) });
});

/* Editar um artigo (inclusive os gerados por IA). Registra quem editou. */
app.put("/:id", async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const [art] = await db.select().from(s.kbArtigo).where(eq(s.kbArtigo.id, c.req.param("id")));
  if (!art || art.squadId !== me.squadId) return c.json({ error: "artigo não encontrado" }, 404);
  const pode = me.papel === "pm" || me.papel === "tech_lead" || me.papel === "cto" || art.autorId === me.id;
  if (!pode) return c.json({ error: "sem permissão" }, 403);
  if (art.status === "gerando") return c.json({ error: "aguarde a geração terminar" }, 409);
  const body = z.object({
    titulo: z.string().min(4).optional(),
    resumo: z.string().nullable().optional(),
    conteudo: z.string().min(1).optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  await db.update(s.kbArtigo).set({
    ...body.data,
    status: "pronto",
    editadoPor: me.id, editadoNome: me.nome, editadoEm: new Date(),
  }).where(eq(s.kbArtigo.id, art.id));
  await audit(me, "editar_kb", `kb:${art.id}`);
  return c.json({ ok: true });
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

/* Regenerar um documento gerado por IA (relê o repositório). */
app.post("/:id/regenerar", async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const [art] = await db.select().from(s.kbArtigo).where(eq(s.kbArtigo.id, c.req.param("id")));
  if (!art || art.squadId !== me.squadId) return c.json({ error: "artigo não encontrado" }, 404);
  const pode = me.papel === "pm" || me.papel === "tech_lead" || me.papel === "cto" || art.autorId === me.id;
  if (!pode) return c.json({ error: "sem permissão" }, 403);
  if (art.origem !== "ia" || !art.repo) return c.json({ error: "apenas documentos gerados de repositório" }, 400);
  if (art.status === "gerando") return c.json({ error: "já está gerando" }, 409);
  await db.update(s.kbArtigo).set({ status: "gerando", progresso: "na fila…" }).where(eq(s.kbArtigo.id, art.id));
  const { enqueueKb } = await import("../_lib/kbgen");
  await enqueueKb([art.id]);
  await audit(me, "regenerar_kb", `kb:${art.id}`, { repo: art.repo });
  return c.json({ ok: true });
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
