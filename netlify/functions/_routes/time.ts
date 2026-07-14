import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { audit } from "../_lib/audit";
import { PAPEL_LABEL, type Papel } from "../../../shared/types";

// Gestão da própria squad pelo time (PM/Tech Lead): membros, convites, nome e
// repositórios. Escrita exige pm/tech_lead (ou cto) na própria squad.
const app = new Hono();

const podeEditar = (me: any) => me.papel === "pm" || me.papel === "tech_lead" || me.papel === "cto";

app.get("/", async (c) => {
  const me = c.get("me");
  if (!me.squadId) return c.json({ squad: null, membros: [], repos: [], convites: [] });
  const db = await getDb();
  const [sq] = await db.select().from(s.squad).where(eq(s.squad.id, me.squadId));
  const membros = (await db.select().from(s.pessoa)).filter((p: any) => p.squadId === me.squadId && p.ativo);
  const repos = await db.select().from(s.repositorio).where(eq(s.repositorio.squadId, me.squadId));
  const convites = (await db.select().from(s.convite)).filter((v: any) => v.squadId === me.squadId && v.status === "pendente");
  return c.json({
    squad: sq ? { id: sq.id, nome: sq.nome } : null,
    podeEditar: podeEditar(me),
    membros: membros.map((p: any) => ({ id: p.id, nome: p.nome, email: p.email, papel: p.papel, papelLabel: PAPEL_LABEL[p.papel as Papel] ?? p.papel, ehVoce: p.id === me.id })),
    repos,
    convites: convites.map((v: any) => ({ id: v.id, email: v.email, papel: v.papel, emailEnviado: v.emailEnviado })),
  });
});

app.put("/nome", async (c) => {
  const me = c.get("me");
  if (!podeEditar(me) || !me.squadId) return c.json({ error: "sem permissão" }, 403);
  const body = z.object({ nome: z.string().min(2).max(80) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "nome inválido" }, 400);
  const db = await getDb();
  await db.update(s.squad).set({ nome: body.data.nome }).where(eq(s.squad.id, me.squadId));
  await audit(me, "renomear_squad", `squad:${me.squadId}`, { nome: body.data.nome });
  return c.json({ ok: true });
});

const RepoIn = z.object({ nome: z.string().min(3).max(120), linguagem: z.string().max(40).optional() });

// Associa um ou mais repositórios (por nome org/repo) à squad. Idempotente por nome.
app.post("/repos", async (c) => {
  const me = c.get("me");
  if (!podeEditar(me) || !me.squadId) return c.json({ error: "sem permissão" }, 403);
  const body = z.union([RepoIn, z.object({ repos: z.array(RepoIn).min(1).max(30) })]).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const lista = "repos" in body.data ? body.data.repos : [body.data];
  const { normalizarRepoNome } = await import("../_lib/capacidades");
  // Normaliza para org/repo (aceita URL completa) e rejeita entradas inválidas.
  const norm = lista.map((r) => ({ ...r, nome: normalizarRepoNome(r.nome) }));
  const invalidos = norm.filter((r) => !r.nome).length;
  if (invalidos && norm.every((r) => !r.nome)) return c.json({ error: "informe o repositório no formato org/repo (ou a URL do GitHub)" }, 400);
  const db = await getDb();
  const existentes = new Set((await db.select().from(s.repositorio).where(eq(s.repositorio.squadId, me.squadId))).map((r: any) => r.nome));
  const novos = norm.filter((r) => r.nome && !existentes.has(r.nome));
  const criados = novos.length
    ? await db.insert(s.repositorio).values(novos.map((r) => ({ squadId: me.squadId, nome: r.nome!, linguagem: r.linguagem ?? null, url: `https://github.com/${r.nome}` }))).returning()
    : [];
  await audit(me, "conectar_repos", `squad:${me.squadId}`, { qtd: criados.length });
  return c.json({ ok: true, criados: criados.length }, 201);
});

app.delete("/repos/:id", async (c) => {
  const me = c.get("me");
  if (!podeEditar(me) || !me.squadId) return c.json({ error: "sem permissão" }, 403);
  const db = await getDb();
  const id = c.req.param("id");
  const [repo] = await db.select().from(s.repositorio).where(eq(s.repositorio.id, id));
  if (!repo || repo.squadId !== me.squadId) return c.json({ error: "não encontrado" }, 404);
  await db.delete(s.capacidadeRepositorio).where(eq(s.capacidadeRepositorio.repositorioId, id));
  await db.delete(s.repositorio).where(eq(s.repositorio.id, id));
  return c.json({ ok: true });
});

export default app;
