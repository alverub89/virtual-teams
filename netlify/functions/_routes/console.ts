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

/* ==================== CRUD do CTO (setup editável) ==================== */

const cfg = rbac("configurar_plataforma"); // só CTO

/* ---------- Estrutura: comunidades → RTs → squads ---------- */

app.get("/estrutura", async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const coms = (await db.select().from(s.comunidade)).filter(
    (x: any) => x.donoId === me.id || x.id === me.comunidadeId
  );
  const comIds = new Set(coms.map((x: any) => x.id));
  const rts = (await db.select().from(s.releaseTrain)).filter((r: any) => comIds.has(r.comunidadeId));
  const rtIds = new Set(rts.map((r: any) => r.id));
  const squads = (await db.select().from(s.squad)).filter((sq: any) => rtIds.has(sq.releaseTrainId));
  const pessoas = await db.select().from(s.pessoa);
  return c.json(
    coms.map((com: any) => ({
      ...com,
      releaseTrains: rts
        .filter((r: any) => r.comunidadeId === com.id)
        .map((r: any) => ({
          ...r,
          squads: squads
            .filter((sq: any) => sq.releaseTrainId === r.id)
            .map((sq: any) => ({ ...sq, pessoas: pessoas.filter((p: any) => p.squadId === sq.id).length })),
        })),
    }))
  );
});

app.post("/comunidades", cfg, async (c) => {
  const me = c.get("me");
  const { nome } = await c.req.json<{ nome?: string }>();
  if (!nome || nome.length < 2) return c.json({ error: "nome inválido" }, 400);
  const db = await getDb();
  const [com] = await db.insert(s.comunidade).values({ nome, donoId: me.id }).returning();
  if (!me.comunidadeId) await db.update(s.pessoa).set({ comunidadeId: com.id }).where(eq(s.pessoa.id, me.id));
  await audit(me, "criar_comunidade", `comunidade:${nome}`);
  return c.json(com, 201);
});

app.post("/release-trains", cfg, async (c) => {
  const me = c.get("me");
  const { comunidadeId, nome } = await c.req.json<{ comunidadeId?: string; nome?: string }>();
  if (!comunidadeId || !nome) return c.json({ error: "dados inválidos" }, 400);
  const db = await getDb();
  const [rt] = await db.insert(s.releaseTrain).values({ comunidadeId, nome }).returning();
  await audit(me, "criar_rt", `rt:${nome}`);
  return c.json(rt, 201);
});

app.post("/squads", cfg, async (c) => {
  const me = c.get("me");
  const { releaseTrainId, nome } = await c.req.json<{ releaseTrainId?: string; nome?: string }>();
  if (!releaseTrainId || !nome) return c.json({ error: "dados inválidos" }, 400);
  const db = await getDb();
  const [sq] = await db.insert(s.squad).values({ releaseTrainId, nome, budgetTokensMes: 2_000_000 }).returning();
  await audit(me, "criar_squad", `squad:${nome}`);
  return c.json(sq, 201);
});

const renomear = (tabela: any) => async (c: any) => {
  const { nome } = await c.req.json();
  if (!nome || nome.length < 2) return c.json({ error: "nome inválido" }, 400);
  const db = await getDb();
  await db.update(tabela).set({ nome }).where(eq(tabela.id, c.req.param("id")));
  return c.json({ ok: true });
};
app.put("/comunidades/:id", cfg, renomear(s.comunidade));
app.put("/release-trains/:id", cfg, renomear(s.releaseTrain));
app.put("/squads/:id", cfg, renomear(s.squad));

/* ---------- Blueprints ---------- */

app.post("/blueprints", cfg, async (c) => {
  const me = c.get("me");
  const b = await c.req.json<{ nome?: string; descricao?: string; guardRails?: string[] }>();
  if (!b.nome) return c.json({ error: "nome obrigatório" }, 400);
  const db = await getDb();
  const [bp] = await db
    .insert(s.blueprint)
    .values({ nome: b.nome, descricao: b.descricao ?? null, guardRails: b.guardRails ?? [] })
    .returning();
  await audit(me, "criar_blueprint", `blueprint:${b.nome}`);
  return c.json(bp, 201);
});

app.delete("/blueprints/:id", cfg, async (c) => {
  const db = await getDb();
  await db.delete(s.blueprint).where(eq(s.blueprint.id, c.req.param("id")));
  return c.json({ ok: true });
});

/* ---------- Skills ---------- */

app.get("/skills", async (c) => {
  const db = await getDb();
  const skills = await db.select().from(s.skill).orderBy(asc(s.skill.nome));
  const links = await db.select().from(s.agenteSkill);
  return c.json(skills.map((sk: any) => ({ ...sk, agentes: links.filter((l: any) => l.skillId === sk.id).length })));
});

app.post("/skills", cfg, async (c) => {
  const me = c.get("me");
  const b = await c.req.json<{ nome?: string; emoji?: string; descricao?: string; instrucoes?: string }>();
  if (!b.nome || !b.instrucoes) return c.json({ error: "nome e instruções obrigatórios" }, 400);
  const db = await getDb();
  const [sk] = await db
    .insert(s.skill)
    .values({ nome: b.nome, emoji: b.emoji ?? "✨", descricao: b.descricao ?? null, instrucoes: b.instrucoes })
    .returning();
  await audit(me, "criar_skill", `skill:${b.nome}`);
  return c.json(sk, 201);
});

app.put("/skills/:id", cfg, async (c) => {
  const b = await c.req.json<{ nome?: string; emoji?: string; descricao?: string; instrucoes?: string }>();
  const db = await getDb();
  await db
    .update(s.skill)
    .set({ nome: b.nome, emoji: b.emoji, descricao: b.descricao, instrucoes: b.instrucoes })
    .where(eq(s.skill.id, c.req.param("id")));
  return c.json({ ok: true });
});

app.delete("/skills/:id", cfg, async (c) => {
  const db = await getDb();
  const id = c.req.param("id");
  await db.delete(s.agenteSkill).where(eq(s.agenteSkill.skillId, id));
  await db.delete(s.skill).where(eq(s.skill.id, id));
  return c.json({ ok: true });
});

/* ---------- Agentes (criar/remover) ---------- */

app.post("/agentes", cfg, async (c) => {
  const me = c.get("me");
  const b = await c.req.json<{ nome?: string; papel?: string; emoji?: string; personalidade?: string; nivelModelo?: string }>();
  if (!b.nome || !b.personalidade) return c.json({ error: "nome e personalidade obrigatórios" }, 400);
  const db = await getDb();
  const [ag] = await db
    .insert(s.agente)
    .values({
      nome: b.nome,
      papel: b.papel ?? "Agente",
      emoji: b.emoji ?? "🤖",
      personalidade: b.personalidade,
      nivelModelo: b.nivelModelo ?? "intermediario",
    })
    .returning();
  await audit(me, "criar_agente", `agente:${b.nome}`);
  return c.json(ag, 201);
});

app.delete("/agentes/:id", cfg, async (c) => {
  const db = await getDb();
  const id = c.req.param("id");
  await db.delete(s.agenteSkill).where(eq(s.agenteSkill.agenteId, id));
  await db.delete(s.agenteTool).where(eq(s.agenteTool.agenteId, id));
  await db.delete(s.agente).where(eq(s.agente.id, id));
  return c.json({ ok: true });
});

/* ---------- Métodos (criar/editar fases/escopo) ---------- */

app.get("/metodo-templates", (c) =>
  c.json([
    { nome: "BMAD Method", fases: [
      { nome: "Brief", gera: "Brief do problema" }, { nome: "PRD", gera: "PRD com RF/NFR" },
      { nome: "Arquitetura", gera: "Desenho e ADRs" }, { nome: "Histórias", gera: "Histórias INVEST" },
      { nome: "Desenvolvimento", gera: "Código e PRs" }, { nome: "Esteira & GMUD", gera: "Evidências e GMUD", checkpoint: true } ] },
    { nome: "Shape Up", fases: [
      { nome: "Shaping", gera: "Pitch com apetite e escopo" }, { nome: "Betting", gera: "Aposta do ciclo", checkpoint: true },
      { nome: "Building", gera: "Escopos entregues" }, { nome: "Cool-down", gera: "Ajustes e aprendizados" } ] },
    { nome: "Dual-Track (Discovery+Delivery)", fases: [
      { nome: "Descoberta", gera: "Oportunidade validada" }, { nome: "Definição", gera: "Solução e critérios" },
      { nome: "Entrega", gera: "Incremento em produção" }, { nome: "Medição", gera: "Impacto medido" } ] },
    { nome: "Design Sprint", fases: [
      { nome: "Mapear", gera: "Mapa do problema" }, { nome: "Esboçar", gera: "Soluções" },
      { nome: "Decidir", gera: "Storyboard", checkpoint: true }, { nome: "Prototipar", gera: "Protótipo" },
      { nome: "Testar", gera: "Aprendizados com usuários" } ] },
  ])
);

const EtapaIn = z.object({ nome: z.string().min(1), agenteId: z.string().uuid().optional().nullable(), gera: z.string().optional(), checkpoint: z.boolean().optional() });
const MetodoIn = z.object({
  nome: z.string().min(2),
  descricao: z.string().optional(),
  escopo: z.enum(["publico", "comunidade"]).default("publico"),
  comunidadeId: z.string().uuid().optional().nullable(),
  etapas: z.array(EtapaIn).min(1),
});

async function gravarEtapas(db: any, metodoId: string, etapas: z.infer<typeof EtapaIn>[]) {
  await db.delete(s.metodoEtapa).where(eq(s.metodoEtapa.metodoId, metodoId));
  await db.insert(s.metodoEtapa).values(
    etapas.map((e, i) => ({
      metodoId,
      ordem: i + 1,
      nome: e.nome,
      agenteId: e.agenteId ?? null,
      tipo: e.checkpoint ? "checkpoint" : "automatica",
      descricao: e.gera ?? null,
    }))
  );
}

app.post("/metodos", cfg, async (c) => {
  const me = c.get("me");
  const body = MetodoIn.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos", detalhe: body.error.flatten() }, 400);
  const d = body.data;
  const db = await getDb();
  const [m] = await db
    .insert(s.metodo)
    .values({
      nome: d.nome,
      versao: "v1",
      descricao: d.descricao ?? null,
      escopo: d.escopo,
      comunidadeId: d.escopo === "comunidade" ? d.comunidadeId ?? me.comunidadeId : null,
      ativo: true,
    })
    .returning();
  await gravarEtapas(db, m.id, d.etapas);
  await audit(me, "criar_metodo", `metodo:${d.nome}`, { escopo: d.escopo });
  return c.json(m, 201);
});

app.put("/metodos/:id", cfg, async (c) => {
  const me = c.get("me");
  const body = MetodoIn.partial().safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const d = body.data;
  const db = await getDb();
  const id = c.req.param("id");
  const campos: any = {};
  if (d.nome) campos.nome = d.nome;
  if (d.descricao !== undefined) campos.descricao = d.descricao;
  if (d.escopo) { campos.escopo = d.escopo; campos.comunidadeId = d.escopo === "comunidade" ? d.comunidadeId ?? me.comunidadeId : null; }
  if (Object.keys(campos).length) await db.update(s.metodo).set(campos).where(eq(s.metodo.id, id));
  if (d.etapas && d.etapas.length) await gravarEtapas(db, id, d.etapas as any);
  await audit(me, "editar_metodo", `metodo:${id}`);
  return c.json({ ok: true });
});

app.delete("/metodos/:id", cfg, async (c) => {
  const db = await getDb();
  const id = c.req.param("id");
  await db.delete(s.metodoEtapa).where(eq(s.metodoEtapa.metodoId, id));
  await db.delete(s.metodo).where(eq(s.metodo.id, id));
  return c.json({ ok: true });
});

/* ---------- MCPs (criar/editar/escopo) ---------- */

const McpIn = z.object({
  nome: z.string().min(2),
  sistema: z.string().min(2),
  descricao: z.string().optional(),
  url: z.string().optional(),
  escopo: z.enum(["global", "squad"]).default("global"),
  squadId: z.string().uuid().optional().nullable(),
});

app.post("/mcps", cfg, async (c) => {
  const me = c.get("me");
  const body = McpIn.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const d = body.data;
  const db = await getDb();
  const [m] = await db
    .insert(s.conexaoMcp)
    .values({
      nome: d.nome,
      sistema: d.sistema,
      descricao: d.descricao ?? null,
      url: d.url ?? null,
      escopo: d.escopo,
      squadId: d.escopo === "squad" ? d.squadId ?? null : null,
      comunidadeId: me.comunidadeId,
      status: "configurado",
    })
    .returning();
  await audit(me, "criar_mcp", `mcp:${d.nome}`, { escopo: d.escopo });
  return c.json(m, 201);
});

app.put("/mcps/:id", cfg, async (c) => {
  const body = McpIn.partial().safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const db = await getDb();
  await db.update(s.conexaoMcp).set(body.data as any).where(eq(s.conexaoMcp.id, c.req.param("id")));
  return c.json({ ok: true });
});

app.delete("/mcps/:id", cfg, async (c) => {
  const db = await getDb();
  await db.delete(s.conexaoMcp).where(eq(s.conexaoMcp.id, c.req.param("id")));
  return c.json({ ok: true });
});

export default app;
