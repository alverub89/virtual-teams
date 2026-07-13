import { Hono } from "hono";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { setCookie } from "hono/cookie";
import { getDb, schema as s } from "../../../db/client";
import { rbac } from "../_mw/rbac";
import { audit } from "../_lib/audit";
import { composeSystemPrompt, promptDoAgente } from "../../../ai/prompts";
import { signSession, sessionCookieName, cookieOpts } from "../_mw/auth";
import { meDaPessoa } from "./auth";

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
      budgetTokensMes: sq.budgetTokensMes ?? null,
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

// Trilha de auditoria completa (quem fez o quê, quando) — versionamento das
// mudanças de plataforma: métodos, agentes, decisões, orçamentos, runs.
app.get("/auditoria", rbac("configurar_plataforma"), async (c) => {
  const db = await getDb();
  const filtro = c.req.query("q")?.toLowerCase().trim();
  const limit = Math.min(500, Math.max(1, parseInt(c.req.query("limit") ?? "200", 10) || 200));
  let linhas = (await db.select().from(s.auditLog))
    .sort((a: any, b: any) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
  if (filtro) {
    linhas = linhas.filter((l: any) =>
      [l.acao, l.alvo, l.pessoaNome].filter(Boolean).some((v: string) => v.toLowerCase().includes(filtro))
    );
  }
  // Famílias de ação para os filtros rápidos do front.
  const familia = (acao: string) =>
    /metodo/.test(acao) ? "método" : /agente|skill|tool|blueprint|mcp/.test(acao) ? "agente/config"
      : /run|orquestr|checkpoint/.test(acao) ? "orquestração" : /budget|token/.test(acao) ? "orçamento"
      : /aprov|reprov|decis|convite/.test(acao) ? "decisões" : "outros";
  return c.json({
    total: linhas.length,
    linhas: linhas.slice(0, limit).map((l: any) => ({
      id: l.id,
      pessoaNome: l.pessoaNome,
      acao: l.acao,
      alvo: l.alvo,
      familia: familia(l.acao),
      detalhe: l.detalhe,
      criadoEm: l.criadoEm,
    })),
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
  const templates = await db.select().from(s.template).orderBy(asc(s.template.nome));
  const checklists = await db.select().from(s.checklist).orderBy(asc(s.checklist.nome));
  const mcps = await db.select().from(s.conexaoMcp);
  const agSkills = await db.select().from(s.agenteSkill).where(eq(s.agenteSkill.agenteId, a.id));
  const agTools = await db.select().from(s.agenteTool).where(eq(s.agenteTool.agenteId, a.id));
  const agTpls = await db.select().from(s.agenteTemplate).where(eq(s.agenteTemplate.agenteId, a.id));
  const agCks = await db.select().from(s.agenteChecklist).where(eq(s.agenteChecklist.agenteId, a.id));

  const minhasSkills = skills.filter((sk: any) => agSkills.some((l: any) => l.skillId === sk.id));
  const minhasTools = tools.filter((t: any) => agTools.some((l: any) => l.toolId === t.id));
  const meusTpls = templates.filter((t: any) => agTpls.some((l: any) => l.templateId === t.id));
  const meusCks = checklists.filter((ck: any) => agCks.some((l: any) => l.checklistId === ck.id));
  const prompt = promptDoAgente(a, {
    nome: a.nome,
    personalidade: a.personalidade,
    skills: minhasSkills.map((sk: any) => ({ nome: sk.nome, instrucoes: sk.instrucoes })),
    tools: minhasTools.map((t: any) => ({ nome: t.nome, descricao: t.descricao ?? "", permissao: t.permissao })),
    guardRails: a.guardRails ?? [],
    templates: meusTpls.map((t: any) => ({ nome: t.nome, conteudo: t.conteudo })),
    checklists: meusCks.map((ck: any) => ({ nome: ck.nome, itens: ck.itens ?? [] })),
  });

  return c.json({
    ...a,
    skillIds: agSkills.map((l: any) => l.skillId),
    toolIds: agTools.map((l: any) => l.toolId),
    templateIds: agTpls.map((l: any) => l.templateId),
    checklistIds: agCks.map((l: any) => l.checklistId),
    catalogoSkills: skills,
    catalogoTools: tools.map((t: any) => ({
      ...t,
      mcp: mcps.find((m: any) => m.id === t.conexaoMcpId)?.nome ?? "interno",
    })),
    catalogoTemplates: templates.map((t: any) => ({ id: t.id, nome: t.nome, emoji: t.emoji, tipo: t.tipo })),
    catalogoChecklists: checklists.map((ck: any) => ({ id: ck.id, nome: ck.nome, emoji: ck.emoji, categoria: ck.categoria })),
    promptGerado: prompt,
  });
});

const AtualizarAgente = z.object({
  nome: z.string().min(2).optional(),
  papel: z.string().min(2).optional(),
  emoji: z.string().optional(),
  personalidade: z.string().min(10).optional(),
  nivelModelo: z.enum(["avancado", "intermediario", "leve"]).optional(),
  maxTokens: z.number().int().min(256).max(64000).optional(),
  guardRails: z.array(z.string()).optional(),
  promptSistema: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
  skillIds: z.array(z.string().uuid()).optional(),
  toolIds: z.array(z.string().uuid()).optional(),
  templateIds: z.array(z.string().uuid()).optional(),
  checklistIds: z.array(z.string().uuid()).optional(),
});

app.put("/agentes/:id", rbac("configurar_plataforma"), async (c) => {
  const me = c.get("me");
  const body = AtualizarAgente.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const id = c.req.param("id");
  const db = await getDb();
  const { skillIds, toolIds, templateIds, checklistIds, ...campos } = body.data;
  if ("promptSistema" in campos && !campos.promptSistema?.trim()) campos.promptSistema = null; // vazio = restaurar padrão

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
  if (templateIds) {
    await db.delete(s.agenteTemplate).where(eq(s.agenteTemplate.agenteId, id));
    if (templateIds.length)
      await db.insert(s.agenteTemplate).values(templateIds.map((templateId) => ({ agenteId: id, templateId })));
  }
  if (checklistIds) {
    await db.delete(s.agenteChecklist).where(eq(s.agenteChecklist.agenteId, id));
    if (checklistIds.length)
      await db.insert(s.agenteChecklist).values(checklistIds.map((checklistId) => ({ agenteId: id, checklistId })));
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
    mcps.map(({ token, ...m }: any) => ({
      ...m,
      temToken: !!token,
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

const EtapaIn = z.object({
  nome: z.string().min(1),
  agenteId: z.string().uuid().optional().nullable(),
  gera: z.string().optional(),
  checkpoint: z.boolean().optional(),
  instrucao: z.string().optional().nullable(),
  config: z.object({ iteracoes: z.number().int().min(1).max(10).optional(), minSaidas: z.number().int().min(1).max(20).optional(), maxSaidas: z.number().int().min(1).max(30).optional() }).optional().nullable(),
});
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
      instrucao: e.instrucao ?? null,
      config: e.config ?? null,
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
  await audit(me, "editar_metodo", `metodo:${id}`, {
    campos: Object.keys(campos),
    etapas: d.etapas?.length ?? undefined,
  });
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
  token: z.string().optional(), // credencial p/ MCP remoto (Bearer). Em branco no PUT = mantém.
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
      token: d.token || null,
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
  const patch = { ...body.data } as any;
  if (!patch.token) delete patch.token; // token em branco = mantém o atual
  const db = await getDb();
  await db.update(s.conexaoMcp).set(patch).where(eq(s.conexaoMcp.id, c.req.param("id")));
  return c.json({ ok: true });
});

app.delete("/mcps/:id", cfg, async (c) => {
  const db = await getDb();
  const id = c.req.param("id");
  await db.delete(s.tool).where(eq(s.tool.conexaoMcpId, id));
  await db.delete(s.conexaoMcp).where(eq(s.conexaoMcp.id, id));
  return c.json({ ok: true });
});

/* ---------- Tools (registro rico) + geração de MCP com IA ---------- */

// Detalhe de um MCP com suas tools — base da tela do construtor.
app.get("/mcps/:id", async (c) => {
  const db = await getDb();
  const id = c.req.param("id");
  const [m] = await db.select().from(s.conexaoMcp).where(eq(s.conexaoMcp.id, id));
  if (!m) return c.json({ error: "não encontrado" }, 404);
  const tools = (await db.select().from(s.tool)).filter((t: any) => t.conexaoMcpId === id);
  const base = process.env.APP_URL ?? process.env.URL ?? "";
  const { token, ...mSemToken } = m as any;
  return c.json({ ...mSemToken, temToken: !!token, endpoint: m.slug ? `${base}/api/mcp/${m.slug}` : null, tools });
});

const ToolIn = z.object({
  nome: z.string().min(2),
  descricao: z.string().optional(),
  permissao: z.enum(["leitura", "escrita", "critica"]).default("leitura"),
  conexaoMcpId: z.string().uuid().nullish(), // opcional: tool avulsa (do ambiente) não precisa de MCP
  execucao: z.enum(["ia", "http"]).default("ia"),
  parametros: z.string().optional(),
  handlerConfig: z.record(z.any()).optional(),
});

// Catálogo de tools do ambiente — avulsas (sem MCP) e as que vieram de um MCP.
app.get("/tools", async (c) => {
  const db = await getDb();
  const tools = await db.select().from(s.tool).orderBy(asc(s.tool.nome));
  const mcps = await db.select().from(s.conexaoMcp);
  const agTools = await db.select().from(s.agenteTool);
  return c.json(
    tools.map((t: any) => ({
      ...t,
      origem: mcps.find((m: any) => m.id === t.conexaoMcpId)?.nome ?? null, // null = avulsa
      agentes: agTools.filter((l: any) => l.toolId === t.id).length,
    }))
  );
});

app.post("/tools", cfg, async (c) => {
  const me = c.get("me");
  const body = ToolIn.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const d = body.data;
  const db = await getDb();
  const [t] = await db
    .insert(s.tool)
    .values({
      nome: d.nome,
      descricao: d.descricao ?? null,
      permissao: d.permissao,
      conexaoMcpId: d.conexaoMcpId ?? null,
      execucao: d.execucao,
      parametros: d.parametros ?? null,
      handlerConfig: d.handlerConfig ?? null,
      comunidadeId: me.comunidadeId,
    })
    .returning();
  await audit(me, "criar_tool", `tool:${d.nome}`, { execucao: d.execucao, avulsa: !d.conexaoMcpId });
  return c.json(t, 201);
});

app.put("/tools/:id", cfg, async (c) => {
  const body = ToolIn.partial().safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const db = await getDb();
  await db.update(s.tool).set(body.data as any).where(eq(s.tool.id, c.req.param("id")));
  return c.json({ ok: true });
});

app.delete("/tools/:id", cfg, async (c) => {
  const db = await getDb();
  const id = c.req.param("id");
  await db.delete(s.agenteTool).where(eq(s.agenteTool.toolId, id));
  await db.delete(s.tool).where(eq(s.tool.id, id));
  return c.json({ ok: true });
});

// Gera com IA o input_schema (e, para tools ia, o prompt do handler) de UMA tool
// avulsa — sem depender de um MCP. Deixa a tool pronta para uso/execução.
app.post("/tools/:id/gerar-schema", cfg, async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const [t] = await db.select().from(s.tool).where(eq(s.tool.id, c.req.param("id")));
  if (!t) return c.json({ error: "não encontrada" }, 404);
  const { gerarJson } = await import("../_lib/aigen");
  let g: any;
  try {
    g = await gerarJson({
      tarefa: "arquitetura",
      system:
        "Você projeta tools no padrão MCP. A partir da descrição e dos parâmetros em linguagem natural, " +
        "produza um JSON Schema de entrada (draft-07: objeto com properties/required). Responda SOMENTE JSON.",
      instrucao:
        `MCP: "tool avulsa" — sistema/integração: ambiente. Descrição: ${t.descricao ?? "-"}.\n` +
        `Tools:\n${JSON.stringify([{ nome: t.nome, descricao: t.descricao ?? "", execucao: t.execucao, parametros: t.parametros ?? "" }], null, 2)}\n\n` +
        'Retorne JSON: { "tools": [ { "nome": "igual ao informado", "inputSchema": {...}, "promptHandler": "instrução de sistema se a tool for ia, senão \\"\\"" } ] }',
      maxTokens: 1000,
    });
  } catch (e) {
    return c.json({ error: `falha na geração: ${e instanceof Error ? e.message : e}` }, 502);
  }
  const info = (g?.tools ?? [])[0] ?? {};
  const patch: any = { inputSchema: info.inputSchema ?? { type: "object", properties: {} } };
  if (t.execucao === "ia") patch.handlerConfig = { ...((t.handlerConfig as any) ?? {}), prompt: info.promptHandler || `Execute a tool "${t.nome}": ${t.descricao ?? ""}.` };
  await db.update(s.tool).set(patch).where(eq(s.tool.id, t.id));
  await audit(me, "gerar_schema_tool", `tool:${t.nome}`);
  return c.json({ ok: true, inputSchema: patch.inputSchema });
});

// Testa uma tool com argumentos, no console (mesma execução do endpoint vivo).
app.post("/tools/:id/testar", cfg, async (c) => {
  const db = await getDb();
  const [t] = await db.select().from(s.tool).where(eq(s.tool.id, c.req.param("id")));
  if (!t) return c.json({ error: "não encontrada" }, 404);
  const args = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const { executarTool } = await import("../_lib/aigen");
  const r = await executarTool(t as any, args?.arguments ? (args.arguments as any) : args);
  return c.json(r);
});

// Gera o MCP com IA: slug + propósito (manifesto) e, por tool, um JSON Schema
// de entrada e — para tools "ia" — um prompt de handler. Persiste tudo e marca
// gerado_em. É o "uma IA gera o MCP" do fluxo.
const slugify = (txt: string) =>
  txt.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "mcp";

app.post("/mcps/:id/gerar", cfg, async (c) => {
  const me = c.get("me");
  const id = c.req.param("id");
  const db = await getDb();
  const [m] = await db.select().from(s.conexaoMcp).where(eq(s.conexaoMcp.id, id));
  if (!m) return c.json({ error: "não encontrado" }, 404);
  const tools = (await db.select().from(s.tool)).filter((t: any) => t.conexaoMcpId === id);
  if (!tools.length) return c.json({ error: "cadastre ao menos uma tool antes de gerar" }, 400);

  const { gerarJson } = await import("../_lib/aigen");
  const listaTools = tools.map((t: any) => ({
    nome: t.nome,
    descricao: t.descricao ?? "",
    execucao: t.execucao,
    parametros: t.parametros ?? "",
  }));

  let plano: any;
  try {
    plano = await gerarJson({
      tarefa: "arquitetura",
      system:
        "Você é um engenheiro que projeta servidores MCP (Model Context Protocol). " +
        "A partir de um conjunto de tools descritas em linguagem natural, você produz um manifesto " +
        "e, para cada tool, um JSON Schema de entrada (draft-07, objeto com properties/required) " +
        "coerente com os parâmetros descritos. Responda SOMENTE JSON.",
      instrucao:
        `MCP: "${m.nome}" — sistema/integração: ${m.sistema}. Descrição: ${m.descricao ?? "-"}.\n` +
        `Tools:\n${JSON.stringify(listaTools, null, 2)}\n\n` +
        "Retorne JSON no formato:\n" +
        '{ "proposito": "string curta do que este MCP entrega", ' +
        '"tools": [ { "nome": "igual ao informado", "inputSchema": { "type":"object", "properties": {...}, "required":[...] }, ' +
        '"promptHandler": "instrução de sistema para executar a tool quando ela for do tipo ia (senão string vazia)" } ] }',
      maxTokens: 1800,
    });
  } catch (e) {
    return c.json({ error: `falha na geração com IA: ${e instanceof Error ? e.message : e}` }, 502);
  }

  const porNome = new Map<string, any>((plano?.tools ?? []).map((t: any) => [String(t.nome), t]));
  for (const t of tools) {
    const g = porNome.get(t.nome);
    if (!g) continue;
    const patch: any = { inputSchema: g.inputSchema ?? { type: "object", properties: {} } };
    if (t.execucao === "ia") {
      const prompt = g.promptHandler || `Execute a tool "${t.nome}": ${t.descricao ?? ""}.`;
      patch.handlerConfig = { ...(t.handlerConfig ?? {}), prompt };
    }
    await db.update(s.tool).set(patch).where(eq(s.tool.id, t.id));
  }

  // slug único (sufixa se colidir com outro MCP).
  let slug = m.slug ?? slugify(m.nome);
  const existentes = new Set(
    (await db.select().from(s.conexaoMcp)).filter((x: any) => x.id !== id && x.slug).map((x: any) => x.slug)
  );
  if (existentes.has(slug)) slug = `${slug}-${id.slice(0, 6)}`;

  await db
    .update(s.conexaoMcp)
    .set({ slug, proposito: plano?.proposito ?? m.descricao ?? m.nome, geradoEm: new Date(), status: "conectado" })
    .where(eq(s.conexaoMcp.id, id));
  await audit(me, "gerar_mcp", `mcp:${m.nome}`, { slug, tools: tools.length });

  const base = process.env.APP_URL ?? process.env.URL ?? "";
  return c.json({ ok: true, slug, endpoint: `${base}/api/mcp/${slug}`, tools: tools.length });
});

/* ---------- Cliente MCP: conectar e testar um servidor MCP externo ---------- */

// Resolve a URL e o token de um MCP: por mcpId (busca no banco, token fica no
// servidor) ou por url/token direto (ad-hoc, ex.: presets públicos sem auth).
async function resolverMcp(body: { mcpId?: string; url?: string; token?: string }) {
  if (body.mcpId) {
    const db = await getDb();
    const [m] = await db.select().from(s.conexaoMcp).where(eq(s.conexaoMcp.id, body.mcpId));
    if (m?.url) return { url: m.url as string, token: (m.token as string) ?? undefined };
  }
  return { url: body.url, token: body.token };
}

// Conecta (como cliente) a um servidor MCP remoto e lista as tools reais dele.
app.post("/mcp-client/tools", cfg, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { mcpId?: string; url?: string; token?: string };
  const { url, token } = await resolverMcp(body);
  if (!url || !/^https?:\/\//.test(url)) return c.json({ ok: false, erro: "informe uma URL http(s) do servidor MCP" }, 400);
  const { listarToolsRemoto } = await import("../_lib/mcpclient");
  return c.json(await listarToolsRemoto(url, token));
});

// Chama uma tool de um servidor MCP remoto (tools/call) e devolve o resultado.
app.post("/mcp-client/call", cfg, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { mcpId?: string; url?: string; token?: string; name?: string; arguments?: Record<string, unknown> };
  const { url, token } = await resolverMcp(body);
  if (!url || !body.name) return c.json({ ok: false, erro: "url/mcpId e name são obrigatórios" }, 400);
  const { chamarToolRemoto } = await import("../_lib/mcpclient");
  return c.json(await chamarToolRemoto(url, body.name, body.arguments ?? {}, token));
});

/* ---------- Playground: MCP real pronto para demonstração ---------- */

// Estado do playground: o MCP vivo (se já provisionado) + o catálogo de MCPs
// reais do mercado para o CTO navegar.
app.get("/playground", async (c) => {
  const db = await getDb();
  const { PLAYGROUND_SLUG, PLAYGROUND_TOOLS, MARKET_MCPS, REMOTE_MCPS } = await import("../_lib/playground");
  const [m] = await db.select().from(s.conexaoMcp).where(eq(s.conexaoMcp.slug, PLAYGROUND_SLUG));
  const base = process.env.APP_URL ?? process.env.URL ?? "";
  let mcp: any = null;
  if (m) {
    const exemplos = new Map(PLAYGROUND_TOOLS.map((t) => [t.nome, t.exemplo]));
    const tools = (await db.select().from(s.tool))
      .filter((t: any) => t.conexaoMcpId === m.id)
      .map((t: any) => ({ ...t, exemplo: exemplos.get(t.nome) ?? {} }));
    const { token, ...mSemToken } = m as any;
    mcp = { ...mSemToken, temToken: !!token, endpoint: m.slug ? `${base}/api/mcp/${m.slug}` : null, tools };
  }
  const registrados = new Set((await db.select().from(s.conexaoMcp)).map((x: any) => x.nome));
  return c.json({
    provisionado: !!m,
    mcp,
    remotos: REMOTE_MCPS.map((rm) => ({ ...rm, registrado: registrados.has(rm.nome) })),
    market: MARKET_MCPS.map((mm) => ({ ...mm, registrado: registrados.has(mm.nome) })),
  });
});

// Provisiona (idempotente) o MCP do playground com tools reais e schemas prontos.
app.post("/playground/provisionar", cfg, async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const { PLAYGROUND_SLUG, PLAYGROUND_MCP, PLAYGROUND_TOOLS } = await import("../_lib/playground");
  const base = process.env.APP_URL ?? process.env.URL ?? "";

  let [m] = await db.select().from(s.conexaoMcp).where(eq(s.conexaoMcp.slug, PLAYGROUND_SLUG));
  if (!m) {
    [m] = await db
      .insert(s.conexaoMcp)
      .values({
        nome: PLAYGROUND_MCP.nome,
        sistema: PLAYGROUND_MCP.sistema,
        descricao: PLAYGROUND_MCP.descricao,
        proposito: PLAYGROUND_MCP.proposito,
        escopo: "global",
        comunidadeId: me.comunidadeId,
        status: "conectado",
        slug: PLAYGROUND_SLUG,
        geradoEm: new Date(),
      })
      .returning();
  }
  const existentes = new Set((await db.select().from(s.tool)).filter((t: any) => t.conexaoMcpId === m.id).map((t: any) => t.nome));
  const novas = PLAYGROUND_TOOLS.filter((t) => !existentes.has(t.nome));
  if (novas.length)
    await db.insert(s.tool).values(
      novas.map((t) => ({
        nome: t.nome,
        descricao: t.descricao,
        permissao: t.permissao,
        conexaoMcpId: m.id,
        execucao: t.execucao,
        parametros: t.parametros,
        inputSchema: t.inputSchema,
        handlerConfig: t.handlerConfig,
        comunidadeId: me.comunidadeId,
      }))
    );
  await audit(me, "provisionar_playground", `mcp:${PLAYGROUND_SLUG}`, { toolsNovas: novas.length });
  return c.json({ ok: true, slug: PLAYGROUND_SLUG, endpoint: `${base}/api/mcp/${PLAYGROUND_SLUG}`, toolsNovas: novas.length, total: PLAYGROUND_TOOLS.length });
});

// Registra um MCP do catálogo de mercado como conexão de referência (idempotente).
app.post("/playground/registrar-mercado", cfg, async (c) => {
  const me = c.get("me");
  const body = (await c.req.json().catch(() => ({}))) as { nome?: string };
  const { MARKET_MCPS, REMOTE_MCPS } = await import("../_lib/playground");
  const mm = [...REMOTE_MCPS, ...MARKET_MCPS].find((x) => x.nome === body?.nome);
  if (!mm) return c.json({ error: "MCP não encontrado no catálogo" }, 404);
  const db = await getDb();
  const [existe] = await db.select().from(s.conexaoMcp).where(eq(s.conexaoMcp.nome, mm.nome));
  if (existe) return c.json({ ok: true, jaRegistrado: true });
  await db.insert(s.conexaoMcp).values({
    nome: mm.nome,
    sistema: mm.sistema,
    descricao: mm.descricao,
    url: mm.url,
    escopo: "global",
    comunidadeId: me.comunidadeId,
    status: "configurado",
  });
  await audit(me, "registrar_mcp_mercado", `mcp:${mm.nome}`);
  return c.json({ ok: true });
});

/* ---------- Seed de demonstração: popula a squad e renova a sessão ---------- */

// Popula o time + a squad de demo na comunidade do usuário logado, torna o
// usuário tech lead dessa squad e RENOVA o cookie de sessão (sem precisar
// deslogar). Roda dentro do app — usa o mesmo banco que a aplicação lê.
app.post("/seed-demo", async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const { seedDemoSquad } = await import("../_lib/seed-demo");
  const { squadId, counts } = await seedDemoSquad(db, me.id);

  await db.update(s.pessoa).set({ papel: "tech_lead", squadId, onboardingConcluido: true }).where(eq(s.pessoa.id, me.id));
  const [p] = await db.select().from(s.pessoa).where(eq(s.pessoa.id, me.id));
  const novoMe = await meDaPessoa(db, p);
  setCookie(c, sessionCookieName, await signSession(novoMe), cookieOpts());
  counts.membros = (await db.select().from(s.pessoa)).filter((x: any) => x.squadId === squadId).length;
  await audit(me, "seed_demo", `squad:${squadId}`, counts);
  return c.json({ ok: true, counts, me: novoMe });
});

// Volta o usuário para CTO (renova a sessão). Reversão leve do seed-demo.
app.post("/voltar-cto", async (c) => {
  const me = c.get("me");
  const db = await getDb();
  await db.update(s.pessoa).set({ papel: "cto", squadId: null }).where(eq(s.pessoa.id, me.id));
  const [p] = await db.select().from(s.pessoa).where(eq(s.pessoa.id, me.id));
  const novoMe = await meDaPessoa(db, p);
  setCookie(c, sessionCookieName, await signSession(novoMe), cookieOpts());
  return c.json({ ok: true, me: novoMe });
});

// Rollback COMPLETO do seed: apaga a squad de demo + o time, volta a pessoa
// para CTO e renova a sessão. Não apaga a comunidade nem a própria pessoa.
app.post("/rollback-demo", async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const { rollbackDemoSquad } = await import("../_lib/seed-demo");
  const deleted = await rollbackDemoSquad(db, me.id);
  await db.update(s.pessoa).set({ papel: "cto", squadId: null }).where(eq(s.pessoa.id, me.id));
  const [p] = await db.select().from(s.pessoa).where(eq(s.pessoa.id, me.id));
  const novoMe = await meDaPessoa(db, p);
  setCookie(c, sessionCookieName, await signSession(novoMe), cookieOpts());
  await audit(me, "rollback_demo", "seed-demo", deleted);
  return c.json({ ok: true, deleted, me: novoMe });
});

/* ---------- Aprovações do CTO (tools/MCPs publicados por squads) ---------- */

// Fila de aprovação: tudo que as squads publicaram (aprovacao = pendente).
app.get("/aprovacoes", cfg, async (c) => {
  const db = await getDb();
  const squads = await db.select().from(s.squad);
  const nomeSquad = (id: string | null) => squads.find((sq: any) => sq.id === id)?.nome ?? null;
  const tools = (await db.select().from(s.tool)).filter((t: any) => t.aprovacao === "pendente");
  const mcps = (await db.select().from(s.conexaoMcp)).filter((m: any) => m.aprovacao === "pendente");
  return c.json({
    tools: tools.map((t: any) => ({ ...t, squadNome: nomeSquad(t.squadId) })),
    mcps: mcps.map(({ token, ...m }: any) => ({ ...m, temToken: !!token, squadNome: nomeSquad(m.squadId) })),
  });
});

const Decisao = z.object({
  decisao: z.enum(["aprovar", "rejeitar"]),
  motivo: z.string().optional(),
  escopo: z.enum(["squad", "global"]).optional(), // só MCP: CTO escolhe abrangência ao aprovar
});

const decidir = (tbl: any, tipo: string) => async (c: any) => {
  const me = c.get("me");
  const body = Decisao.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const db = await getDb();
  const id = c.req.param("id");
  const [row] = await db.select().from(tbl).where(eq(tbl.id, id));
  if (!row) return c.json({ error: "não encontrado" }, 404);
  if (body.data.decisao === "aprovar") {
    const patch: any = { aprovacao: "aprovado", motivoRejeicao: null };
    if (tbl === s.conexaoMcp && body.data.escopo) {
      patch.escopo = body.data.escopo;
      patch.squadId = body.data.escopo === "global" ? null : row.squadId;
    }
    await db.update(tbl).set(patch).where(eq(tbl.id, id));
  } else {
    await db.update(tbl).set({ aprovacao: "rejeitado", motivoRejeicao: body.data.motivo ?? "sem motivo informado" }).where(eq(tbl.id, id));
  }
  await audit(me, `${body.data.decisao}_${tipo}`, `${tipo}:${id}`, { motivo: body.data.motivo, escopo: body.data.escopo });
  return c.json({ ok: true });
};
app.post("/aprovacoes/tool/:id", cfg, decidir(s.tool, "tool"));
app.post("/aprovacoes/mcp/:id", cfg, decidir(s.conexaoMcp, "mcp"));

/* ---------- acervo (estilo BMAD): agentes, skills, templates, checklists ---------- */

app.get("/acervo", async (c) => {
  const db = await getDb();
  const [agentes, skills, templates, checklists] = await Promise.all([
    db.select().from(s.agente),
    db.select().from(s.skill),
    db.select().from(s.template),
    db.select().from(s.checklist),
  ]);
  const jaTemBmad = agentes.some((a: any) => a.origem === "bmad") || templates.some((t: any) => t.origem === "bmad");
  return c.json({
    jaTemBmad,
    contagem: { agentes: agentes.length, skills: skills.length, templates: templates.length, checklists: checklists.length },
    agentes: agentes.map((a: any) => ({ id: a.id, nome: a.nome, papel: a.papel, emoji: a.emoji, origem: a.origem ?? "manual" })),
    skills: skills.map((sk: any) => ({ id: sk.id, nome: sk.nome, emoji: sk.emoji, descricao: sk.descricao, origem: sk.origem ?? "manual" })),
    templates: templates.map((t: any) => ({ id: t.id, nome: t.nome, tipo: t.tipo, emoji: t.emoji, descricao: t.descricao, conteudo: t.conteudo, origem: t.origem })),
    checklists: checklists.map((ck: any) => ({ id: ck.id, nome: ck.nome, categoria: ck.categoria, emoji: ck.emoji, descricao: ck.descricao, itens: ck.itens, origem: ck.origem })),
  });
});

app.post("/acervo/instalar-bmad", cfg, async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const { instalarBmad } = await import("../_lib/bmad");
  const contagem = await instalarBmad(db, me.comunidadeId ?? null);
  await audit(me, "instalar_acervo_bmad", "acervo", contagem);
  return c.json({ ok: true, ...contagem });
});

// Gerador por IA: descreve o item e a IA cria o agente/skill/template/checklist.
app.post("/acervo/gerar", cfg, async (c) => {
  const me = c.get("me");
  const body = z.object({ tipo: z.enum(["agente", "skill", "template", "checklist"]), descricao: z.string().min(4).max(600) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const db = await getDb();
  const { gerarJson } = await import("../_lib/aigen");
  const { tipo, descricao } = body.data;

  const specs: Record<string, { system: string; formato: string }> = {
    agente: { system: "Você cria PERSONAS de agentes de IA para um time de produto (estilo BMAD).", formato: '{ "nome": "curto", "papel": "descrição curta", "emoji": "1 emoji", "personalidade": "como pensa e age (2-4 frases)", "nivelModelo": "avancado|intermediario|leve", "guardRails": ["regra", "…"] }' },
    skill: { system: "Você cria SKILLS (instruções reutilizáveis) para agentes de IA.", formato: '{ "nome": "curto", "emoji": "1 emoji", "descricao": "1 frase", "instrucoes": "instrução acionável de como executar a skill" }' },
    template: { system: "Você cria TEMPLATES de documento em Markdown com placeholders {{...}}.", formato: '{ "nome": "curto", "tipo": "prd|arquitetura|story|sdd|generico", "emoji": "1 emoji", "descricao": "1 frase", "conteudo": "markdown com seções e placeholders {{...}}" }' },
    checklist: { system: "Você cria CHECKLISTS de verificação para um time de produto.", formato: '{ "nome": "curto", "categoria": "dor|dod|revisao|seguranca|generico", "emoji": "1 emoji", "descricao": "1 frase", "itens": ["item verificável", "…"] }' },
  };
  const sp = specs[tipo];
  let obj: any = null;
  try {
    obj = await gerarJson({ tarefa: "arquitetura", system: `${sp.system} Responda SOMENTE JSON.`, instrucao: `Descrição do que criar: ${descricao}\n\nFormato JSON: ${sp.formato}`, maxTokens: 1200 });
  } catch { return c.json({ error: "a IA não retornou um item válido — tente detalhar a descrição" }, 502); }
  if (!obj?.nome) return c.json({ error: "item inválido gerado" }, 502);

  let criado: any;
  if (tipo === "agente") {
    [criado] = await db.insert(s.agente).values({ nome: obj.nome, papel: obj.papel ?? "Agente", emoji: obj.emoji ?? "🤖", personalidade: obj.personalidade ?? descricao, nivelModelo: ["avancado", "intermediario", "leve"].includes(obj.nivelModelo) ? obj.nivelModelo : "intermediario", guardRails: Array.isArray(obj.guardRails) ? obj.guardRails.map(String) : [], origem: "ia", ativo: true }).returning();
  } else if (tipo === "skill") {
    [criado] = await db.insert(s.skill).values({ nome: obj.nome, emoji: obj.emoji ?? "🧩", descricao: obj.descricao ?? null, instrucoes: obj.instrucoes ?? descricao, origem: "ia" }).returning();
  } else if (tipo === "template") {
    [criado] = await db.insert(s.template).values({ nome: obj.nome, tipo: ["prd", "arquitetura", "story", "sdd", "generico"].includes(obj.tipo) ? obj.tipo : "generico", emoji: obj.emoji ?? "📄", descricao: obj.descricao ?? null, conteudo: obj.conteudo ?? `# ${obj.nome}`, escopo: me.comunidadeId ? "comunidade" : "global", comunidadeId: me.comunidadeId ?? null, origem: "ia" }).returning();
  } else {
    [criado] = await db.insert(s.checklist).values({ nome: obj.nome, categoria: ["dor", "dod", "revisao", "seguranca", "generico"].includes(obj.categoria) ? obj.categoria : "generico", emoji: obj.emoji ?? "✅", descricao: obj.descricao ?? null, itens: Array.isArray(obj.itens) ? obj.itens.map(String) : [], escopo: me.comunidadeId ? "comunidade" : "global", comunidadeId: me.comunidadeId ?? null, origem: "ia" }).returning();
  }
  await audit(me, "gerar_item_acervo", `${tipo}:${obj.nome}`);
  return c.json({ ok: true, tipo, item: criado }, 201);
});

// CRUD mínimo de templates e checklists.
const TemplateIn = z.object({ nome: z.string().min(2), tipo: z.string().optional(), emoji: z.string().optional(), descricao: z.string().optional(), conteudo: z.string().min(1) });
app.post("/acervo/templates", cfg, async (c) => {
  const me = c.get("me"); const db = await getDb();
  const b = TemplateIn.safeParse(await c.req.json()); if (!b.success) return c.json({ error: "dados inválidos" }, 400);
  const [t] = await db.insert(s.template).values({ ...b.data, tipo: b.data.tipo ?? "generico", escopo: me.comunidadeId ? "comunidade" : "global", comunidadeId: me.comunidadeId ?? null, origem: "manual" }).returning();
  return c.json(t, 201);
});
app.put("/acervo/templates/:id", cfg, async (c) => {
  const db = await getDb(); const b = TemplateIn.partial().safeParse(await c.req.json());
  if (!b.success) return c.json({ error: "dados inválidos" }, 400);
  await db.update(s.template).set(b.data).where(eq(s.template.id, c.req.param("id")));
  return c.json({ ok: true });
});
app.delete("/acervo/templates/:id", cfg, async (c) => {
  const db = await getDb(); await db.delete(s.template).where(eq(s.template.id, c.req.param("id"))); return c.json({ ok: true });
});
const ChecklistIn = z.object({ nome: z.string().min(2), categoria: z.string().optional(), emoji: z.string().optional(), descricao: z.string().optional(), itens: z.array(z.string()).default([]) });
app.post("/acervo/checklists", cfg, async (c) => {
  const me = c.get("me"); const db = await getDb();
  const b = ChecklistIn.safeParse(await c.req.json()); if (!b.success) return c.json({ error: "dados inválidos" }, 400);
  const [ck] = await db.insert(s.checklist).values({ ...b.data, categoria: b.data.categoria ?? "generico", escopo: me.comunidadeId ? "comunidade" : "global", comunidadeId: me.comunidadeId ?? null, origem: "manual" }).returning();
  return c.json(ck, 201);
});
app.put("/acervo/checklists/:id", cfg, async (c) => {
  const db = await getDb(); const b = ChecklistIn.partial().safeParse(await c.req.json());
  if (!b.success) return c.json({ error: "dados inválidos" }, 400);
  await db.update(s.checklist).set(b.data as any).where(eq(s.checklist.id, c.req.param("id")));
  return c.json({ ok: true });
});
app.delete("/acervo/checklists/:id", cfg, async (c) => {
  const db = await getDb(); await db.delete(s.checklist).where(eq(s.checklist.id, c.req.param("id"))); return c.json({ ok: true });
});

/* Orçamento de tokens por squad (mês) — teto com alerta na Gestão. */
app.put("/squads/:id/budget", cfg, async (c) => {
  const me = c.get("me");
  const body = z.object({ budgetTokensMes: z.number().int().min(0).nullable() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "valor inválido" }, 400);
  const db = await getDb();
  await db.update(s.squad).set({ budgetTokensMes: body.data.budgetTokensMes }).where(eq(s.squad.id, c.req.param("id")));
  await audit(me, "set_budget_tokens", `squad:${c.req.param("id")}`, { budgetTokensMes: body.data.budgetTokensMes });
  return c.json({ ok: true });
});

export default app;
