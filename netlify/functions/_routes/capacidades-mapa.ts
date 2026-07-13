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
  const mapas = (await db.select().from(s.mapaCapacidade)).filter((m: any) => m.squadId === me.squadId).sort((a: any, b: any) => b.versao - a.versao);
  const emAnalise = mapas.find((m: any) => m.status === "analisando");
  const atual = mapas.find((m: any) => m.status === "pronto");
  const reposNovos = atual ? repos.filter((r: any) => !(atual.reposAnalisados ?? []).includes(r.nome)).map((r: any) => r.nome) : [];

  return c.json({
    podeEditar: podeEditar(me),
    temToken: !!com?.githubToken,
    repos: repos.map((r: any) => ({ id: r.id, nome: r.nome, linguagem: r.linguagem ?? null, url: r.url ?? null })),
    analisando: emAnalise ? { versao: emAnalise.versao, progresso: emAnalise.progresso, motivo: emAnalise.motivo } : null,
    mapaAtual: atual ? { id: atual.id, versao: atual.versao, motivo: atual.motivo, conteudo: atual.conteudo, impacto: atual.impacto, criadoEm: atual.criadoEm, reposAnalisados: atual.reposAnalisados } : null,
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

app.post("/gerar", (c) => novaVersao(c, "inicial"));

app.post("/avaliar-impacto", (c) => novaVersao(c, "impacto: reavaliação por novos repositórios"));

export default app;
