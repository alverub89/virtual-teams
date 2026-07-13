import { Hono } from "hono";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { audit } from "../_lib/audit";

// Laboratório da squad — o time (PM/Tech Lead) cria tools e MCPs, testa, e
// PUBLICA para aprovação do CTO. Governança: rascunho → pendente → aprovado.
const app = new Hono();

const podeCriar = (me: any) => me.papel === "pm" || me.papel === "tech_lead" || me.papel === "cto";

// O que a squad criou (para gerenciar/publicar) + o que está disponível para ela
// usar (aprovados: globais + os da própria squad).
app.get("/", async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const base = process.env.APP_URL ?? process.env.URL ?? "";
  const semTk = ({ token, ...m }: any) => ({ ...m, temToken: !!token, endpoint: m.slug ? `${base}/api/mcp/${m.slug}` : null });

  const todasTools = await db.select().from(s.tool);
  const todosMcps = await db.select().from(s.conexaoMcp);

  const meuMcp = (m: any) => m.squadId === me.squadId || m.criadoPor === me.id;
  const disponivelMcp = (m: any) => m.aprovacao === "aprovado" && (m.escopo === "global" || m.squadId === me.squadId);

  return c.json({
    podeCriar: podeCriar(me),
    squadId: me.squadId,
    // "meus" = criados pela squad e ainda não aprovados (rascunho/pendente/rejeitado)
    tools: todasTools.filter((t: any) => (t.squadId === me.squadId || t.criadoPor === me.id) && t.aprovacao !== "aprovado").map((t: any) => ({ ...t })),
    mcps: todosMcps.filter((m: any) => meuMcp(m) && m.aprovacao !== "aprovado").map(semTk),
    // "disponíveis" = aprovados que a squad pode usar (globais + da squad)
    disponiveis: todosMcps.filter(disponivelMcp).map(semTk),
    toolsDisponiveis: todasTools.filter((t: any) => t.aprovacao === "aprovado" && (t.comunidadeId === me.comunidadeId || t.squadId === me.squadId)).length,
  });
});

const ToolIn = z.object({
  nome: z.string().min(2),
  descricao: z.string().optional(),
  permissao: z.enum(["leitura", "escrita", "critica"]).default("leitura"),
  execucao: z.enum(["ia", "http"]).default("ia"),
  parametros: z.string().optional(),
  handlerConfig: z.record(z.any()).optional(),
  conexaoMcpId: z.string().uuid().nullish(),
});

app.post("/tools", async (c) => {
  const me = c.get("me");
  if (!podeCriar(me) || !me.squadId) return c.json({ error: "sem permissão" }, 403);
  const body = ToolIn.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const d = body.data;
  const db = await getDb();
  const [t] = await db.insert(s.tool).values({
    nome: d.nome, descricao: d.descricao ?? null, permissao: d.permissao, execucao: d.execucao,
    parametros: d.parametros ?? null, handlerConfig: d.handlerConfig ?? null, conexaoMcpId: d.conexaoMcpId ?? null,
    comunidadeId: me.comunidadeId, squadId: me.squadId, criadoPor: me.id, aprovacao: "rascunho",
  }).returning();
  await audit(me, "criar_tool_squad", `tool:${d.nome}`);
  return c.json(t, 201);
});

const McpIn = z.object({
  nome: z.string().min(2),
  sistema: z.string().min(2),
  descricao: z.string().optional(),
  url: z.string().url().optional(),
  token: z.string().optional(), // credencial p/ MCP remoto (ex.: PAT da Netlify)
  escopo: z.enum(["squad", "comunidade"]).default("squad"),
});

// Cria/registra um MCP da squad (inclui registrar um MCP remoto, ex.: Netlify).
app.post("/mcps", async (c) => {
  const me = c.get("me");
  if (!podeCriar(me) || !me.squadId) return c.json({ error: "sem permissão" }, 403);
  const body = McpIn.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const d = body.data;
  const db = await getDb();
  const [m] = await db.insert(s.conexaoMcp).values({
    nome: d.nome, sistema: d.sistema, descricao: d.descricao ?? null, url: d.url ?? null, token: d.token ?? null,
    escopo: d.escopo === "comunidade" ? "squad" : "squad", // vira global só se o CTO aprovar como tal
    squadId: me.squadId, comunidadeId: me.comunidadeId, criadoPor: me.id, status: "configurado", aprovacao: "rascunho",
  }).returning();
  await audit(me, "criar_mcp_squad", `mcp:${d.nome}`);
  return c.json(m, 201);
});

// Publicar = enviar para aprovação do CTO.
const publicar = (tbl: any) => async (c: any) => {
  const me = c.get("me");
  if (!podeCriar(me)) return c.json({ error: "sem permissão" }, 403);
  const db = await getDb();
  const id = c.req.param("id");
  const [row] = await db.select().from(tbl).where(eq(tbl.id, id));
  if (!row || (row.squadId !== me.squadId && row.criadoPor !== me.id)) return c.json({ error: "não encontrado" }, 404);
  if (row.aprovacao === "aprovado") return c.json({ error: "já aprovado" }, 409);
  await db.update(tbl).set({ aprovacao: "pendente", submetidoEm: new Date(), motivoRejeicao: null }).where(eq(tbl.id, id));
  await audit(me, "publicar_para_aprovacao", `${tbl === s.tool ? "tool" : "mcp"}:${id}`);
  return c.json({ ok: true });
};
app.post("/tools/:id/publicar", publicar(s.tool));
app.post("/mcps/:id/publicar", publicar(s.conexaoMcp));

// Excluir rascunho/rejeitado próprio.
const excluir = (tbl: any) => async (c: any) => {
  const me = c.get("me");
  const db = await getDb();
  const id = c.req.param("id");
  const [row] = await db.select().from(tbl).where(eq(tbl.id, id));
  if (!row || (row.squadId !== me.squadId && row.criadoPor !== me.id)) return c.json({ error: "não encontrado" }, 404);
  if (row.aprovacao === "aprovado") return c.json({ error: "aprovado não pode ser excluído aqui" }, 409);
  if (tbl === s.tool) await db.delete(s.agenteTool).where(eq(s.agenteTool.toolId, id));
  await db.delete(tbl).where(eq(tbl.id, id));
  return c.json({ ok: true });
};
app.delete("/tools/:id", excluir(s.tool));
app.delete("/mcps/:id", excluir(s.conexaoMcp));

// Conectar (cliente MCP) a um MCP disponível para a squad — resolve url+token no
// servidor. Só permite MCPs aprovados globais/da squad ou criados pela pessoa.
async function mcpAcessivel(db: any, me: any, mcpId: string) {
  const [m] = await db.select().from(s.conexaoMcp).where(eq(s.conexaoMcp.id, mcpId));
  if (!m) return null;
  const ok = m.criadoPor === me.id || (m.aprovacao === "aprovado" && (m.escopo === "global" || m.squadId === me.squadId));
  return ok ? m : null;
}

app.post("/mcp-client/tools", async (c) => {
  const me = c.get("me");
  const { mcpId } = (await c.req.json().catch(() => ({}))) as { mcpId?: string };
  const db = await getDb();
  const m = mcpId ? await mcpAcessivel(db, me, mcpId) : null;
  if (!m?.url) return c.json({ ok: false, erro: "MCP não acessível ou sem URL" }, 403);
  const { listarToolsRemoto } = await import("../_lib/mcpclient");
  return c.json(await listarToolsRemoto(m.url, m.token ?? undefined));
});

app.post("/mcp-client/call", async (c) => {
  const me = c.get("me");
  const { mcpId, name, arguments: args } = (await c.req.json().catch(() => ({}))) as { mcpId?: string; name?: string; arguments?: Record<string, unknown> };
  const db = await getDb();
  const m = mcpId ? await mcpAcessivel(db, me, mcpId) : null;
  if (!m?.url || !name) return c.json({ ok: false, erro: "MCP não acessível ou name ausente" }, 403);
  const { chamarToolRemoto } = await import("../_lib/mcpclient");
  return c.json(await chamarToolRemoto(m.url, name, args ?? {}, m.token ?? undefined));
});

export default app;
