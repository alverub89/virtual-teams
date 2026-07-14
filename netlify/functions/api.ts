import { Hono } from "hono";
import { auth } from "./_mw/auth";
import authRoutes from "./_routes/auth";
import onboarding from "./_routes/onboarding";
import convites from "./_routes/convites";
import iniciativas from "./_routes/iniciativas";
import okrs from "./_routes/okrs";
import capacidades from "./_routes/capacidades";
import capacidadesMapa from "./_routes/capacidades-mapa";
import docs from "./_routes/docs";
import kb from "./_routes/kb";
import esteira from "./_routes/esteira";
import estrutura from "./_routes/estrutura";
import comunidade from "./_routes/comunidade";
import time from "./_routes/time";
import assistente from "./_routes/assistente";
import lab from "./_routes/lab";
import workflows from "./_routes/workflows";
import party from "./_routes/party";
import runs from "./_routes/runs";
import consoleRoutes from "./_routes/console";
import gestao from "./_routes/gestao";
import mcpLive from "./_routes/mcp";

// API do AI Workspace — Hono catch-all em /api/* (docs/spec §5).
const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ ok: true, service: "ai-workspace" }));
app.get("/health/db", async (c) => {
  const { dbDiagnostics } = await import("../../db/client");
  return c.json(await dbDiagnostics());
});

// Diagnóstico do provedor de IA: mostra qual provedor está ativo e faz uma
// chamada REAL de teste ao gateway (latência + erro exato se falhar).
app.get("/health/ai", async (c) => {
  const kind = process.env.AI_GATEWAY_KIND ?? "omni";
  const temChave = !!(process.env.OMNI_PRODUCT_KEY || process.env.AI_API_KEY);
  const baseUrl = process.env.AI_BASE_URL ?? null;
  const usaMock = !baseUrl || (kind === "omni" && !temChave);
  const info = {
    provedor: usaMock ? "mock" : kind,
    baseUrl,
    gatewayProvider: process.env.AI_GATEWAY_PROVIDER ?? "openai",
    temChave,
    usaMock,
  };
  if (usaMock) {
    return c.json({ ...info, ok: false, aviso: "Rodando no MOCK (sem OMNI_PRODUCT_KEY ou AI_BASE_URL). Respostas não são reais." });
  }
  try {
    const { getProvider } = await import("../../ai/provider");
    const { resolveModel } = await import("../../ai/router");
    const provider = await getProvider();
    const t0 = Date.now();
    const res = await provider.chat({
      model: await resolveModel("resumo"),
      system: "Responda em 1 palavra.",
      messages: [{ role: "user", content: "Diga: ok" }],
      maxTokens: 5,
    });
    return c.json({ ...info, ok: true, latenciaMs: Date.now() - t0, amostra: (res.content ?? "").slice(0, 60), tokens: res.usage });
  } catch (e) {
    return c.json({ ...info, ok: false, erro: e instanceof Error ? e.message : String(e) }, 502);
  }
});
app.route("/auth", authRoutes); // públicas (config, demo, callback OAuth, logout)
app.route("/mcp", mcpLive); // servidor MCP vivo por slug — público (clientes MCP externos)

app.use("*", auth); // tudo abaixo exige sessão

app.get("/me", (c) => c.json(c.get("me")));

// Squads que o CTO pode auditar ("auditar como squad"). Só o CTO enxerga a
// lista; os demais papéis já estão presos à própria squad.
app.get("/me/squads", async (c) => {
  const me = c.get("me");
  if (me.papel !== "cto") return c.json({ squads: [] });
  const { getDb, schema } = await import("../../db/client");
  const db = await getDb();
  // Só as squads da PRÓPRIA comunidade do CTO (isolamento multi-tenant).
  const rts = await db.select().from(schema.releaseTrain);
  const meusRtIds = new Set(rts.filter((rt: any) => rt.comunidadeId === me.comunidadeId).map((rt: any) => rt.id));
  const squads = (await db.select().from(schema.squad)).filter((sq: any) => meusRtIds.has(sq.releaseTrainId));
  return c.json({ squads: squads.map((s: any) => ({ id: s.id, nome: s.nome })) });
});

// Liga/desliga o modo auditoria REEMITINDO o cookie de sessão. O alvo e o
// "somente leitura" passam a viver no token assinado — não é flag de cliente.
app.post("/me/audit/start", async (c) => {
  const me = c.get("me");
  if (me.papel !== "cto") return c.json({ error: "apenas o CTO pode auditar squads" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const squadId = typeof body?.squadId === "string" ? body.squadId : null;
  if (!squadId) return c.json({ error: "squadId obrigatório" }, 400);
  const { getDb, schema } = await import("../../db/client");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  const [sq] = await db.select().from(schema.squad).where(eq(schema.squad.id, squadId));
  if (!sq) return c.json({ error: "squad não encontrada" }, 404);
  // A squad tem de ser da comunidade do CTO (isolamento multi-tenant).
  const [rt] = await db.select().from(schema.releaseTrain).where(eq(schema.releaseTrain.id, sq.releaseTrainId));
  if (!rt || rt.comunidadeId !== me.comunidadeId) return c.json({ error: "squad fora da sua comunidade" }, 403);
  const { setCookie } = await import("hono/cookie");
  const { signSession, cookieOpts, sessionCookieName } = await import("./_mw/auth");
  const { meDaPessoa } = await import("./_routes/auth");
  const [p] = await db.select().from(schema.pessoa).where(eq(schema.pessoa.id, me.id));
  const base = await meDaPessoa(db, p); // identidade real do CTO (sem override)
  setCookie(c, sessionCookieName, await signSession({ ...base, auditSquadId: squadId }), cookieOpts());
  return c.json({ ok: true, auditSquadId: squadId, squadNome: sq.nome });
});
app.post("/me/audit/stop", async (c) => {
  const me = c.get("me");
  const { getDb, schema } = await import("../../db/client");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  const { setCookie } = await import("hono/cookie");
  const { signSession, cookieOpts, sessionCookieName } = await import("./_mw/auth");
  const { meDaPessoa } = await import("./_routes/auth");
  const [p] = await db.select().from(schema.pessoa).where(eq(schema.pessoa.id, me.id));
  setCookie(c, sessionCookieName, await signSession(await meDaPessoa(db, p)), cookieOpts());
  return c.json({ ok: true });
});
app.route("/onboarding", onboarding);
app.route("/convites", convites);
app.route("/iniciativas", iniciativas);
app.route("/okrs", okrs);
app.route("/capacidades", capacidades);
app.route("/capacidades-mapa", capacidadesMapa);
app.route("/docs", docs);
app.route("/kb", kb);
app.route("/esteira", esteira);
app.route("/estrutura", estrutura);
app.route("/comunidade", comunidade);
app.route("/time", time);
app.route("/assistente", assistente);
app.route("/lab", lab);
app.route("/workflows", workflows);
app.route("/party", party);
app.route("/runs", runs);
app.route("/console", consoleRoutes);
app.route("/gestao", gestao);

export { app };
export default app.fetch;
export const config = { path: "/api/*" };
