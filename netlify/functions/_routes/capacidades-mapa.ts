import { Hono } from "hono";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { audit } from "../_lib/audit";

// Mapa de capacidades da squad — arquitetura de negócio (fluxo de valor →
// capacidades → repos), versionada, gerada por IA lendo os repositórios.
const app = new Hono();

const podeEditar = (me: any) => me.papel === "pm" || me.papel === "tech_lead" || me.papel === "cto";

async function comunidadeDaSquad(db: any, squadId: string) {
  const [sq] = await db.select().from(s.squad).where(eq(s.squad.id, squadId));
  if (!sq) return null;
  const [rt] = await db.select().from(s.releaseTrain).where(eq(s.releaseTrain.id, sq.releaseTrainId));
  if (!rt) return null;
  const [com] = await db.select().from(s.comunidade).where(eq(s.comunidade.id, rt.comunidadeId));
  return com ?? null;
}

app.get("/", async (c) => {
  const me = c.get("me");
  if (!me.squadId) return c.json({ semSquad: true });
  const db = await getDb();
  const repos = (await db.select().from(s.repositorio)).filter((r: any) => r.squadId === me.squadId);
  const com = await comunidadeDaSquad(db, me.squadId);
  const { resolveGithubToken } = await import("../_lib/capacidades");
  const mapas = (await db.select().from(s.mapaCapacidade)).filter((m: any) => m.squadId === me.squadId).sort((a: any, b: any) => b.versao - a.versao);
  const emAnalise = mapas.find((m: any) => m.status === "analisando");
  const atual = mapas.find((m: any) => m.status === "pronto");
  const reposNovos = atual ? repos.filter((r: any) => !(atual.reposAnalisados ?? []).includes(r.nome)).map((r: any) => r.nome) : [];
  const base = (await db.select().from(s.capacidade)).filter((cp: any) => cp.squadId === me.squadId)
    .map((cp: any) => ({ id: cp.id, nome: cp.nome, descricao: cp.descricao, nivel: cp.nivel ?? 1, pai: cp.pai ?? null, fluxoValor: cp.fluxoValor ?? null, repos: cp.repos ?? [], origem: cp.origem ?? "manual" }));

  return c.json({
    base,
    podeEditar: podeEditar(me),
    temToken: !!resolveGithubToken(com),
    tokenViaEnv: !com?.githubToken && !!resolveGithubToken(com),
    repos: repos.map((r: any) => ({ id: r.id, nome: r.nome, linguagem: r.linguagem ?? null, url: r.url ?? null })),
    analisando: emAnalise ? { versao: emAnalise.versao, progresso: emAnalise.progresso, motivo: emAnalise.motivo } : null,
    mapaAtual: atual ? { id: atual.id, versao: atual.versao, motivo: atual.motivo, conteudo: atual.conteudo, impacto: atual.impacto, criadoEm: atual.criadoEm, reposAnalisados: atual.reposAnalisados, diagnostico: atual.progresso } : null,
    reposNovos,
    versoes: mapas.map((m: any) => ({ id: m.id, versao: m.versao, status: m.status, motivo: m.motivo, criadoEm: m.criadoEm })),
  });
});

app.get("/versoes/:id", async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const [m] = await db.select().from(s.mapaCapacidade).where(eq(s.mapaCapacidade.id, c.req.param("id")));
  if (!m || m.squadId !== me.squadId) return c.json({ error: "não encontrado" }, 404);
  return c.json({ id: m.id, versao: m.versao, status: m.status, motivo: m.motivo, conteudo: m.conteudo, impacto: m.impacto, reposAnalisados: m.reposAnalisados, criadoEm: m.criadoEm });
});

app.put("/token", async (c) => {
  const me = c.get("me");
  if (!podeEditar(me) || !me.squadId) return c.json({ error: "sem permissão" }, 403);
  const body = z.object({ token: z.string().min(4) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "token inválido" }, 400);
  const db = await getDb();
  const com = await comunidadeDaSquad(db, me.squadId);
  if (!com) return c.json({ error: "comunidade não encontrada" }, 404);
  await db.update(s.comunidade).set({ githubToken: body.data.token }).where(eq(s.comunidade.id, com.id));
  await audit(me, "set_github_token", `comunidade:${com.id}`);
  return c.json({ ok: true });
});

async function novaVersao(c: any, motivoBase: string) {
  const me = c.get("me");
  if (!podeEditar(me) || !me.squadId) return c.json({ error: "sem permissão" }, 403);
  const db = await getDb();
  const emAnalise = (await db.select().from(s.mapaCapacidade)).find((m: any) => m.squadId === me.squadId && m.status === "analisando");
  if (emAnalise) return c.json({ error: "já existe uma análise em andamento" }, 409);
  const mapas = (await db.select().from(s.mapaCapacidade)).filter((m: any) => m.squadId === me.squadId);
  const maxV = mapas.reduce((mx: number, m: any) => Math.max(mx, m.versao), 0);
  const motivo = motivoBase === "inicial" ? (maxV === 0 ? "inicial" : "regeneracao") : motivoBase;
  const [mapa] = await db.insert(s.mapaCapacidade).values({
    squadId: me.squadId, versao: maxV + 1, status: "analisando", progresso: "na fila…", motivo, criadoPor: me.id,
  }).returning();
  const { enqueueAnalise } = await import("../_lib/capacidades");
  await enqueueAnalise(mapa.id);
  await audit(me, "gerar_mapa_capacidades", `squad:${me.squadId}`, { versao: mapa.versao, motivo });
  return c.json({ ok: true, versao: mapa.versao });
}

app.post("/testar-token", async (c) => {
  const me = c.get("me");
  if (!me.squadId) return c.json({ error: "sem squad" }, 400);
  const db = await getDb();
  const com = await comunidadeDaSquad(db, me.squadId);
  const { resolveGithubToken, testarToken } = await import("../_lib/capacidades");
  const token = resolveGithubToken(com);
  const repos = (await db.select().from(s.repositorio)).filter((r: any) => r.squadId === me.squadId).map((r: any) => r.nome);
  return c.json(await testarToken(token, repos));
});

/* ---------- Base de capacidades: cadastro manual ---------- */
const CapIn = z.object({
  nome: z.string().min(2).max(120),
  descricao: z.string().max(500).optional(),
  nivel: z.union([z.literal(1), z.literal(2)]).default(1),
  pai: z.string().optional().nullable(),
  fluxoValor: z.string().optional().nullable(),
  repos: z.array(z.string()).optional(),
});

app.post("/capacidade", async (c) => {
  const me = c.get("me");
  if (!podeEditar(me) || !me.squadId) return c.json({ error: "sem permissão" }, 403);
  const body = CapIn.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const db = await getDb();
  const [cp] = await db.insert(s.capacidade).values({
    squadId: me.squadId, nome: body.data.nome, descricao: body.data.descricao ?? null,
    nivel: body.data.nivel, pai: body.data.pai ?? null, fluxoValor: body.data.fluxoValor ?? null,
    repos: body.data.repos ?? [], origem: "manual",
  }).returning();
  await audit(me, "criar_capacidade", `cap:${body.data.nome}`);
  return c.json(cp, 201);
});

app.put("/capacidade/:id", async (c) => {
  const me = c.get("me");
  if (!podeEditar(me) || !me.squadId) return c.json({ error: "sem permissão" }, 403);
  const body = CapIn.partial().safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const db = await getDb();
  const [cp] = await db.select().from(s.capacidade).where(eq(s.capacidade.id, c.req.param("id")));
  if (!cp || cp.squadId !== me.squadId) return c.json({ error: "não encontrada" }, 404);
  await db.update(s.capacidade).set(body.data as any).where(eq(s.capacidade.id, cp.id));
  return c.json({ ok: true });
});

app.delete("/capacidade/:id", async (c) => {
  const me = c.get("me");
  if (!podeEditar(me) || !me.squadId) return c.json({ error: "sem permissão" }, 403);
  const db = await getDb();
  const [cp] = await db.select().from(s.capacidade).where(eq(s.capacidade.id, c.req.param("id")));
  if (!cp || cp.squadId !== me.squadId) return c.json({ error: "não encontrada" }, 404);
  await db.delete(s.capacidade).where(eq(s.capacidade.id, cp.id));
  return c.json({ ok: true });
});

app.post("/gerar", (c) => novaVersao(c, "inicial"));

app.post("/avaliar-impacto", (c) => novaVersao(c, "impacto: reavaliação por novos repositórios"));

export default app;
