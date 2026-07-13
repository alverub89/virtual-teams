import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { audit } from "../_lib/audit";

// Fluxos de trabalho da squad — a pessoa MONTA um workflow do que a squad faz,
// encadeando passos de agente (IA) e de validação humana (porta que pausa até
// alguém aprovar), e EXECUTA gerando runs com humano no loop.
const app = new Hono();

const podeEditar = (me: any) => me.papel === "pm" || me.papel === "tech_lead" || me.papel === "cto";

async function meuWorkflow(db: any, me: any, id: string) {
  const [w] = await db.select().from(s.workflow).where(eq(s.workflow.id, id));
  return w && w.squadId === me.squadId ? w : null;
}

/* ---------- listagem: workflows + insumos para montar passos ---------- */
app.get("/", async (c) => {
  const me = c.get("me");
  if (!me.squadId) return c.json({ semSquad: true });
  const db = await getDb();
  const workflows = (await db.select().from(s.workflow)).filter((w: any) => w.squadId === me.squadId)
    .sort((a: any, b: any) => (b.atualizadoEm > a.atualizadoEm ? 1 : -1));
  const passos = await db.select().from(s.workflowPasso);
  const runs = (await db.select().from(s.workflowRun)).filter((r: any) => r.squadId === me.squadId)
    .sort((a: any, b: any) => (b.criadoEm > a.criadoEm ? 1 : -1)).slice(0, 20);

  const agentes = (await db.select().from(s.agente)).filter((a: any) => a.ativo)
    .map((a: any) => ({ id: a.id, nome: a.nome, papel: a.papel, emoji: a.emoji }));
  const mcps = (await db.select().from(s.conexaoMcp))
    .filter((m: any) => m.criadoPor === me.id || (m.aprovacao === "aprovado" && (m.escopo === "global" || m.squadId === me.squadId)))
    .map((m: any) => ({ id: m.id, nome: m.nome, sistema: m.sistema }));

  return c.json({
    podeEditar: podeEditar(me),
    agentes,
    mcps,
    workflows: workflows.map((w: any) => ({
      id: w.id, nome: w.nome, descricao: w.descricao, status: w.status,
      passos: passos.filter((p: any) => p.workflowId === w.id).length,
      atualizadoEm: w.atualizadoEm,
    })),
    runs: runs.map((r: any) => ({ id: r.id, workflowId: r.workflowId, titulo: r.titulo, status: r.status, criadoEm: r.criadoEm })),
  });
});

app.post("/", async (c) => {
  const me = c.get("me");
  if (!podeEditar(me) || !me.squadId) return c.json({ error: "sem permissão" }, 403);
  const body = z.object({ nome: z.string().min(2).max(120), descricao: z.string().max(600).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const db = await getDb();
  const [w] = await db.insert(s.workflow).values({
    squadId: me.squadId, nome: body.data.nome, descricao: body.data.descricao ?? null, status: "rascunho", criadoPor: me.id,
  }).returning();
  await audit(me, "criar_workflow", `workflow:${body.data.nome}`);
  return c.json(w, 201);
});

/* ---------- detalhe: workflow + passos ordenados ---------- */
app.get("/:id", async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const w = await meuWorkflow(db, me, c.req.param("id"));
  if (!w) return c.json({ error: "não encontrado" }, 404);
  const passos = (await db.select().from(s.workflowPasso)).filter((p: any) => p.workflowId === w.id)
    .sort((a: any, b: any) => a.ordem - b.ordem);
  const agentes = (await db.select().from(s.agente)).filter((a: any) => a.ativo)
    .map((a: any) => ({ id: a.id, nome: a.nome, papel: a.papel, emoji: a.emoji }));
  const mcps = (await db.select().from(s.conexaoMcp))
    .filter((m: any) => m.criadoPor === me.id || (m.aprovacao === "aprovado" && (m.escopo === "global" || m.squadId === me.squadId)))
    .map((m: any) => ({ id: m.id, nome: m.nome, sistema: m.sistema }));
  return c.json({
    podeEditar: podeEditar(me), agentes, mcps,
    workflow: { id: w.id, nome: w.nome, descricao: w.descricao, status: w.status },
    passos: passos.map((p: any) => ({ id: p.id, ordem: p.ordem, tipo: p.tipo, nome: p.nome, instrucao: p.instrucao, agenteId: p.agenteId, config: p.config })),
  });
});

app.put("/:id", async (c) => {
  const me = c.get("me");
  if (!podeEditar(me)) return c.json({ error: "sem permissão" }, 403);
  const db = await getDb();
  const w = await meuWorkflow(db, me, c.req.param("id"));
  if (!w) return c.json({ error: "não encontrado" }, 404);
  const body = z.object({
    nome: z.string().min(2).max(120).optional(),
    descricao: z.string().max(600).nullable().optional(),
    status: z.enum(["rascunho", "ativo", "arquivado"]).optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  await db.update(s.workflow).set({ ...body.data, atualizadoEm: new Date() }).where(eq(s.workflow.id, w.id));
  return c.json({ ok: true });
});

app.delete("/:id", async (c) => {
  const me = c.get("me");
  if (!podeEditar(me)) return c.json({ error: "sem permissão" }, 403);
  const db = await getDb();
  const w = await meuWorkflow(db, me, c.req.param("id"));
  if (!w) return c.json({ error: "não encontrado" }, 404);
  const runs = (await db.select().from(s.workflowRun)).filter((r: any) => r.workflowId === w.id);
  for (const r of runs) await db.delete(s.workflowRunPasso).where(eq(s.workflowRunPasso.runId, r.id));
  await db.delete(s.workflowRun).where(eq(s.workflowRun.workflowId, w.id));
  await db.delete(s.workflowPasso).where(eq(s.workflowPasso.workflowId, w.id));
  await db.delete(s.workflow).where(eq(s.workflow.id, w.id));
  return c.json({ ok: true });
});

/* ---------- passos ---------- */
const PassoIn = z.object({
  tipo: z.enum(["agente", "validacao", "mcp"]),
  nome: z.string().min(2).max(120),
  instrucao: z.string().max(2000).nullable().optional(),
  agenteId: z.string().uuid().nullable().optional(),
  config: z.record(z.any()).nullable().optional(),
});

app.post("/:id/passos", async (c) => {
  const me = c.get("me");
  if (!podeEditar(me)) return c.json({ error: "sem permissão" }, 403);
  const db = await getDb();
  const w = await meuWorkflow(db, me, c.req.param("id"));
  if (!w) return c.json({ error: "não encontrado" }, 404);
  const body = PassoIn.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const existentes = (await db.select().from(s.workflowPasso)).filter((p: any) => p.workflowId === w.id);
  const ordem = existentes.reduce((mx: number, p: any) => Math.max(mx, p.ordem), 0) + 1;
  const [p] = await db.insert(s.workflowPasso).values({
    workflowId: w.id, ordem, tipo: body.data.tipo, nome: body.data.nome,
    instrucao: body.data.instrucao ?? null, agenteId: body.data.agenteId ?? null, config: body.data.config ?? null,
  }).returning();
  await db.update(s.workflow).set({ atualizadoEm: new Date() }).where(eq(s.workflow.id, w.id));
  return c.json(p, 201);
});

app.put("/passos/:id", async (c) => {
  const me = c.get("me");
  if (!podeEditar(me)) return c.json({ error: "sem permissão" }, 403);
  const db = await getDb();
  const [p] = await db.select().from(s.workflowPasso).where(eq(s.workflowPasso.id, c.req.param("id")));
  if (!p || !(await meuWorkflow(db, me, p.workflowId))) return c.json({ error: "não encontrado" }, 404);
  const body = PassoIn.partial().safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  await db.update(s.workflowPasso).set(body.data as any).where(eq(s.workflowPasso.id, p.id));
  return c.json({ ok: true });
});

app.delete("/passos/:id", async (c) => {
  const me = c.get("me");
  if (!podeEditar(me)) return c.json({ error: "sem permissão" }, 403);
  const db = await getDb();
  const [p] = await db.select().from(s.workflowPasso).where(eq(s.workflowPasso.id, c.req.param("id")));
  if (!p || !(await meuWorkflow(db, me, p.workflowId))) return c.json({ error: "não encontrado" }, 404);
  await db.delete(s.workflowPasso).where(eq(s.workflowPasso.id, p.id));
  return c.json({ ok: true });
});

// Reordenar passos: recebe a lista de ids na nova ordem.
app.post("/:id/reordenar", async (c) => {
  const me = c.get("me");
  if (!podeEditar(me)) return c.json({ error: "sem permissão" }, 403);
  const db = await getDb();
  const w = await meuWorkflow(db, me, c.req.param("id"));
  if (!w) return c.json({ error: "não encontrado" }, 404);
  const body = z.object({ ids: z.array(z.string().uuid()) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const meus = new Set((await db.select().from(s.workflowPasso)).filter((p: any) => p.workflowId === w.id).map((p: any) => p.id));
  let ordem = 1;
  for (const id of body.data.ids) if (meus.has(id)) await db.update(s.workflowPasso).set({ ordem: ordem++ }).where(eq(s.workflowPasso.id, id));
  await db.update(s.workflow).set({ atualizadoEm: new Date() }).where(eq(s.workflow.id, w.id));
  return c.json({ ok: true });
});

/* ---------- executar: cria uma run (snapshot dos passos) e avança ---------- */
app.post("/:id/executar", async (c) => {
  const me = c.get("me");
  if (!podeEditar(me) || !me.squadId) return c.json({ error: "sem permissão" }, 403);
  const db = await getDb();
  const w = await meuWorkflow(db, me, c.req.param("id"));
  if (!w) return c.json({ error: "não encontrado" }, 404);
  const body = z.object({ titulo: z.string().max(160).optional(), entrada: z.string().max(4000).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const passos = (await db.select().from(s.workflowPasso)).filter((p: any) => p.workflowId === w.id).sort((a: any, b: any) => a.ordem - b.ordem);
  if (!passos.length) return c.json({ error: "adicione ao menos um passo antes de executar" }, 400);

  const agentes = await db.select().from(s.agente);
  const [run] = await db.insert(s.workflowRun).values({
    workflowId: w.id, squadId: me.squadId, titulo: body.data.titulo || w.nome, entrada: body.data.entrada ?? null,
    status: "em_andamento", criadoPor: me.id,
  }).returning();
  for (const p of passos) {
    const ag = p.agenteId ? agentes.find((a: any) => a.id === p.agenteId) : null;
    await db.insert(s.workflowRunPasso).values({
      runId: run.id, ordem: p.ordem, tipo: p.tipo, nome: p.nome,
      agenteNome: ag ? `${ag.emoji ?? "🤖"} ${ag.nome}` : null, instrucao: p.instrucao, config: p.config,
    });
  }
  const { avancarRun } = await import("../_lib/workflows");
  await avancarRun(me, run.id);
  await audit(me, "executar_workflow", `workflow:${w.id}`, { runId: run.id });
  return c.json({ ok: true, runId: run.id });
});

/* ---------- runs ---------- */
async function minhaRun(db: any, me: any, id: string) {
  const [r] = await db.select().from(s.workflowRun).where(eq(s.workflowRun.id, id));
  return r && r.squadId === me.squadId ? r : null;
}

app.get("/runs/:id", async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const r = await minhaRun(db, me, c.req.param("id"));
  if (!r) return c.json({ error: "não encontrado" }, 404);
  const [w] = await db.select().from(s.workflow).where(eq(s.workflow.id, r.workflowId));
  const passos = (await db.select().from(s.workflowRunPasso)).filter((p: any) => p.runId === r.id).sort((a: any, b: any) => a.ordem - b.ordem);
  return c.json({
    podeEditar: podeEditar(me),
    run: { id: r.id, titulo: r.titulo, entrada: r.entrada, status: r.status, passoAtual: r.passoAtual, workflowId: r.workflowId, workflowNome: w?.nome, criadoEm: r.criadoEm },
    passos: passos.map((p: any) => ({ id: p.id, ordem: p.ordem, tipo: p.tipo, nome: p.nome, agenteNome: p.agenteNome, instrucao: p.instrucao, status: p.status, saida: p.saida, comentario: p.comentario })),
  });
});

// Decisão humana na porta de validação atual: aprovar (segue) ou rejeitar (para).
app.post("/runs/:id/validar", async (c) => {
  const me = c.get("me");
  if (!podeEditar(me)) return c.json({ error: "sem permissão" }, 403);
  const db = await getDb();
  const r = await minhaRun(db, me, c.req.param("id"));
  if (!r) return c.json({ error: "não encontrado" }, 404);
  if (r.status !== "aguardando") return c.json({ error: "esta run não está aguardando validação" }, 409);
  const body = z.object({ decisao: z.enum(["aprovar", "rejeitar"]), comentario: z.string().max(1000).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const passos = (await db.select().from(s.workflowRunPasso)).filter((p: any) => p.runId === r.id);
  const alvo = passos.find((p: any) => p.status === "aguardando");
  if (!alvo) return c.json({ error: "nenhuma validação pendente" }, 409);

  const aprovado = body.data.decisao === "aprovar";
  await db.update(s.workflowRunPasso).set({
    status: aprovado ? "aprovado" : "rejeitado",
    saida: { resumo: aprovado ? "Validação aprovada." : "Validação rejeitada." },
    comentario: body.data.comentario ?? null, decididoPor: me.id, decididoEm: new Date(),
  }).where(eq(s.workflowRunPasso.id, alvo.id));

  if (!aprovado) {
    await db.update(s.workflowRun).set({ status: "cancelado", atualizadoEm: new Date() }).where(eq(s.workflowRun.id, r.id));
    await audit(me, "validar_workflow", `run:${r.id}`, { decisao: "rejeitar" });
    return c.json({ ok: true });
  }
  await db.update(s.workflowRun).set({ status: "em_andamento", atualizadoEm: new Date() }).where(eq(s.workflowRun.id, r.id));
  const { avancarRun } = await import("../_lib/workflows");
  await avancarRun(me, r.id);
  await audit(me, "validar_workflow", `run:${r.id}`, { decisao: "aprovar" });
  return c.json({ ok: true });
});

export default app;
