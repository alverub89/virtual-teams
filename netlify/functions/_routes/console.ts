import { Hono } from "hono";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { rbac } from "../_mw/rbac";
import { audit } from "../_lib/audit";
import { composeSystemPrompt } from "../../../ai/prompts";

// Console da plataforma — leitura para todos os papéis com acesso; escrita
// exige papel arquiteto (docs/spec §6.2).
const app = new Hono();

// Home do CTO: estado do setup (checklist) + cards das squads da comunidade.
app.get("/setup", async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const vazio = {
    comunidade: null,
    checklist: { area: false, metodo: false, docBase: false, convite: false },
    squads: [],
    agentes: 0,
  };
  if (!me.comunidadeId) return c.json(vazio);

  const [com] = await db.select().from(s.comunidade).where(eq(s.comunidade.id, me.comunidadeId));
  if (!com) return c.json(vazio);

  const rts = (await db.select().from(s.releaseTrain)).filter((rt: any) => rt.comunidadeId === com.id);
  const rtIds = new Set(rts.map((rt: any) => rt.id));
  const squads = (await db.select().from(s.squad)).filter((sq: any) => rtIds.has(sq.releaseTrainId));
  const squadIds = new Set(squads.map((sq: any) => sq.id));
  const pessoas = (await db.select().from(s.pessoa)).filter((p: any) => p.comunidadeId === com.id);
  const inis = (await db.select().from(s.iniciativa)).filter((i: any) => squadIds.has(i.squadId));
  const okrs = (await db.select().from(s.okr)).filter((o: any) => o.squadId && squadIds.has(o.squadId));
  const convites = (await db.select().from(s.convite)).filter((v: any) => v.comunidadeId === com.id);
  const metodos = (await db.select().from(s.metodo)).filter((m: any) => m.ativo);
  const docsBase = (await db.select().from(s.documento)).filter((d: any) => d.escopo === "comunidade");
  const agentes = await db.select().from(s.agente);

  return c.json({
    comunidade: com,
    checklist: {
      area: squads.length > 0,
      metodo: metodos.length > 0,
      docBase: docsBase.length > 0,
      convite: convites.length > 0,
    },
    releaseTrains: rts.map((rt: any) => rt.nome),
    agentes: agentes.filter((a: any) => a.ativo).length,
    metodo: metodos[0] ? { nome: metodos[0].nome } : null,
    squads: squads.map((sq: any) => ({
      id: sq.id,
      nome: sq.nome,
      releaseTrain: rts.find((rt: any) => rt.id === sq.releaseTrainId)?.nome ?? null,
      pessoas: pessoas.filter((p: any) => p.squadId === sq.id).length,
      iniciativas: inis.filter((i: any) => i.squadId === sq.id).length,
      okrs: okrs.filter((o: any) => o.squadId === sq.id).length,
      convitesPendentes: convites.filter((v: any) => v.squadId === sq.id && v.status === "pendente").length,
    })),
  });
});

app.get("/overview", async (c) => {
  const db = await getDb();
  const squads = await db.select().from(s.squad);
  const agentes = await db.select().from(s.agente);
  const runs = await db.select().from(s.execucaoAutonoma);
  const consumo = await db.select().from(s.consumoTokens);
  const blueprints = await db.select().from(s.blueprint);
  const auditoria = await db.select().from(s.auditLog);
  return c.json({
    squads: squads.length,
    agentes: agentes.filter((a: any) => a.ativo).length,
    blueprints: blueprints.length,
    runsAtivos: runs.filter((r: any) => ["em_andamento", "aguardando_aprovacao"].includes(r.status)).length,
    checkpointsPendentes: runs.filter((r: any) => r.status === "aguardando_aprovacao").length,
    custoMes: consumo.reduce((acc: number, r: any) => acc + r.custo, 0),
    atividade: auditoria.slice(-8).reverse(),
  });
});

/* ---------- agentes, skills & tools ---------- */

app.get("/agentes", async (c) => {
  const db = await getDb();
  const agentes = await db.select().from(s.agente).orderBy(asc(s.agente.nome));
  const skills = await db.select().from(s.skill);
  const tools = await db.select().from(s.tool);
  const agSkills = await db.select().from(s.agenteSkill);
  const agTools = await db.select().from(s.agenteTool);
  return c.json(
    agentes.map((a: any) => ({
      ...a,
      skills: agSkills
        .filter((l: any) => l.agenteId === a.id)
        .map((l: any) => skills.find((sk: any) => sk.id === l.skillId))
        .filter(Boolean),
      tools: agTools
        .filter((l: any) => l.agenteId === a.id)
        .map((l: any) => tools.find((t: any) => t.id === l.toolId))
        .filter(Boolean),
    }))
  );
});

app.get("/agentes/:id", async (c) => {
  const db = await getDb();
  const [a] = await db.select().from(s.agente).where(eq(s.agente.id, c.req.param("id")));
  if (!a) return c.json({ error: "agente não encontrado" }, 404);
  const skills = await db.select().from(s.skill).orderBy(asc(s.skill.nome));
  const tools = await db.select().from(s.tool).orderBy(asc(s.tool.nome));
  const mcps = await db.select().from(s.conexaoMcp);
  const agSkills = await db.select().from(s.agenteSkill).where(eq(s.agenteSkill.agenteId, a.id));
  const agTools = await db.select().from(s.agenteTool).where(eq(s.agenteTool.agenteId, a.id));

  const minhasSkills = skills.filter((sk: any) => agSkills.some((l: any) => l.skillId === sk.id));
  const minhasTools = tools.filter((t: any) => agTools.some((l: any) => l.toolId === t.id));
  const prompt = composeSystemPrompt({
    nome: a.nome,
    personalidade: a.personalidade,
    skills: minhasSkills.map((sk: any) => ({ nome: sk.nome, instrucoes: sk.instrucoes })),
    tools: minhasTools.map((t: any) => ({ nome: t.nome, descricao: t.descricao ?? "", permissao: t.permissao })),
    guardRails: [],
  });

  return c.json({
    ...a,
    skillIds: agSkills.map((l: any) => l.skillId),
    toolIds: agTools.map((l: any) => l.toolId),
    catalogoSkills: skills,
    catalogoTools: tools.map((t: any) => ({
      ...t,
      mcp: mcps.find((m: any) => m.id === t.conexaoMcpId)?.nome ?? "interno",
    })),
    promptGerado: prompt,
  });
});

const AtualizarAgente = z.object({
  personalidade: z.string().min(10).optional(),
  nivelModelo: z.enum(["avancado", "intermediario", "leve"]).optional(),
  maxTokens: z.number().int().min(256).max(64000).optional(),
  ativo: z.boolean().optional(),
  skillIds: z.array(z.string().uuid()).optional(),
  toolIds: z.array(z.string().uuid()).optional(),
});

app.put("/agentes/:id", rbac("configurar_plataforma"), async (c) => {
  const me = c.get("me");
  const body = AtualizarAgente.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const id = c.req.param("id");
  const db = await getDb();
  const { skillIds, toolIds, ...campos } = body.data;

  if (Object.keys(campos).length > 0)
    await db.update(s.agente).set(campos).where(eq(s.agente.id, id));
  if (skillIds) {
    await db.delete(s.agenteSkill).where(eq(s.agenteSkill.agenteId, id));
    if (skillIds.length)
      await db.insert(s.agenteSkill).values(skillIds.map((skillId) => ({ agenteId: id, skillId })));
  }
  if (toolIds) {
    await db.delete(s.agenteTool).where(eq(s.agenteTool.agenteId, id));
    if (toolIds.length)
      await db.insert(s.agenteTool).values(toolIds.map((toolId) => ({ agenteId: id, toolId })));
  }
  await audit(me, "atualizar_agente", `agente:${id}`, campos);
  return c.json({ ok: true });
});

/* ---------- métodos, blueprints, MCPs & modelos ---------- */

app.get("/metodos", async (c) => {
  const db = await getDb();
  const metodos = await db.select().from(s.metodo);
  const etapas = await db.select().from(s.metodoEtapa).orderBy(asc(s.metodoEtapa.ordem));
  const agentes = await db.select().from(s.agente);
  return c.json(
    metodos.map((m: any) => ({
      ...m,
      etapas: etapas
        .filter((e: any) => e.metodoId === m.id)
        .map((e: any) => ({ ...e, agenteNome: agentes.find((a: any) => a.id === e.agenteId)?.nome ?? null })),
    }))
  );
});

app.get("/blueprints", async (c) => {
  const db = await getDb();
  return c.json(await db.select().from(s.blueprint).orderBy(asc(s.blueprint.nome)));
});

const AtualizarBlueprint = z.object({
  descricao: z.string().optional(),
  guardRails: z.array(z.string()).optional(),
});

app.put("/blueprints/:id", rbac("configurar_plataforma"), async (c) => {
  const me = c.get("me");
  const body = AtualizarBlueprint.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const db = await getDb();
  await db
    .update(s.blueprint)
    .set({ ...body.data, atualizadoEm: new Date() })
    .where(eq(s.blueprint.id, c.req.param("id")));
  await audit(me, "atualizar_blueprint", `blueprint:${c.req.param("id")}`);
  return c.json({ ok: true });
});

app.get("/mcps", async (c) => {
  const db = await getDb();
  const mcps = await db.select().from(s.conexaoMcp);
  const tools = await db.select().from(s.tool);
  return c.json(
    mcps.map((m: any) => ({
      ...m,
      tools: tools.filter((t: any) => t.conexaoMcpId === m.id),
    }))
  );
});

app.get("/modelos", async (c) => {
  const db = await getDb();
  return c.json(await db.select().from(s.modeloIaRota).orderBy(asc(s.modeloIaRota.tarefa)));
});

const AtualizarRota = z.object({
  nivel: z.enum(["avancado", "intermediario", "leve"]),
  modelo: z.string().min(2),
  custoRelativo: z.number().positive(),
});

app.put("/modelos/:id", rbac("configurar_plataforma"), async (c) => {
  const me = c.get("me");
  const body = AtualizarRota.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const db = await getDb();
  await db.update(s.modeloIaRota).set(body.data).where(eq(s.modeloIaRota.id, c.req.param("id")));
  await audit(me, "atualizar_rota_modelo", `rota:${c.req.param("id")}`, body.data);
  return c.json({ ok: true });
});

/* Consumo de tokens por squad no mês (docs/spec §7.2). */
app.get("/consumo", async (c) => {
  const db = await getDb();
  const consumo = await db.select().from(s.consumoTokens);
  const squads = await db.select().from(s.squad);
  return c.json(
    consumo.map((r: any) => {
      const sq = squads.find((x: any) => x.id === r.squadId);
      const total = r.promptTokens + r.completionTokens;
      return {
        ...r,
        squadNome: sq?.nome ?? "?",
        budget: sq?.budgetTokensMes ?? null,
        percentual: sq?.budgetTokensMes ? Math.round((total / sq.budgetTokensMes) * 100) : null,
      };
    })
  );
});

export default app;
