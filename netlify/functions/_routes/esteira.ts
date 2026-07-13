import { Hono } from "hono";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { rbac } from "../_mw/rbac";
import { audit } from "../_lib/audit";

const app = new Hono();

// Resolve a config de integração da comunidade dona da squad.
async function integracaoDaSquad(db: any, squadId: string) {
  const [sq] = await db.select().from(s.squad).where(eq(s.squad.id, squadId));
  if (!sq) return null;
  const [rt] = await db.select().from(s.releaseTrain).where(eq(s.releaseTrain.id, sq.releaseTrainId));
  if (!rt) return null;
  const [cfg] = (await db.select().from(s.integracaoPlataforma)).filter((i: any) => i.comunidadeId === rt.comunidadeId);
  return cfg ?? null;
}

/* Esteira & GMUDs da squad. */
app.get("/", async (c) => {
  const me = c.get("me");
  const squadId = c.req.query("squadId") ?? me.squadId;
  if (!squadId) return c.json({ execucoes: [], gmuds: [] });
  const db = await getDb();
  const execucoes = await db
    .select()
    .from(s.execucaoEsteira)
    .where(eq(s.execucaoEsteira.squadId, squadId));
  const gmuds = await db
    .select()
    .from(s.gmud)
    .where(eq(s.gmud.squadId, squadId))
    .orderBy(desc(s.gmud.criadoEm));
  return c.json({ execucoes, gmuds });
});

/* Estação dev: minhas histórias, PRs e esteira. */
app.get("/dev", async (c) => {
  const me = c.get("me");
  if (!me.squadId) return c.json({ historias: [], prs: [], execucoes: [] });
  const db = await getDb();
  const inis = await db.select().from(s.iniciativa).where(eq(s.iniciativa.squadId, me.squadId));
  const iniIds = new Set(inis.map((i: any) => i.id));
  const historias = (await db.select().from(s.historia)).filter((h: any) =>
    iniIds.has(h.iniciativaId)
  );
  const repos = await db.select().from(s.repositorio).where(eq(s.repositorio.squadId, me.squadId));
  const repoIds = new Set(repos.map((r: any) => r.id));
  const prs = (await db.select().from(s.pullRequest).orderBy(desc(s.pullRequest.criadoEm))).filter(
    (p: any) => repoIds.has(p.repositorioId)
  );
  const execucoes = await db
    .select()
    .from(s.execucaoEsteira)
    .where(eq(s.execucaoEsteira.squadId, me.squadId));
  return c.json({
    historias: historias.map((h: any) => ({
      ...h,
      iniciativaCodigo: inis.find((i: any) => i.id === h.iniciativaId)?.codigo,
      minha: h.responsavelId === me.id,
    })),
    prs: prs.map((p: any) => ({
      ...p,
      repositorio: repos.find((r: any) => r.id === p.repositorioId)?.nome,
    })),
    execucoes,
  });
});

/* Dispara a esteira (GitHub Actions) de um repositório da squad. */
app.post("/disparar", rbac("iniciar_run"), async (c) => {
  const me = c.get("me");
  if (!me.squadId) return c.json({ error: "usuário sem squad" }, 400);
  const body = z.object({
    repositorio: z.string().optional(),
    ref: z.string().optional(),
    iniciativaId: z.string().uuid().optional(),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const db = await getDb();
  const cfg = await integracaoDaSquad(db, me.squadId);
  const org = cfg?.githubOrg ?? "";
  const repo = body.data.repositorio || cfg?.githubRepoPadrao || "";
  const workflow = cfg?.githubWorkflow || "deploy.yml";
  const ref = body.data.ref || "main";

  const { dispararWorkflow } = await import("../_lib/integracoes");
  const r = await dispararWorkflow(org, repo, workflow, ref);

  await db.insert(s.execucaoEsteira).values({
    squadId: me.squadId,
    iniciativaId: body.data.iniciativaId ?? null,
    repositorio: repo || "(sem repo)",
    etapa: "build",
    status: r.ok ? "em_execucao" : r.pendente ? "pendente" : "falha",
    detalhe: r.mensagem,
  });
  await audit(me, "disparar_esteira", `repo:${org}/${repo}`, { ok: r.ok, pendente: r.pendente });
  return c.json(r, r.ok ? 202 : r.pendente ? 200 : 502);
});

/* Abre uma GMUD (ServiceNow, quando conectado) para uma mudança. */
app.post("/gmud", rbac("iniciar_run"), async (c) => {
  const me = c.get("me");
  if (!me.squadId) return c.json({ error: "usuário sem squad" }, 400);
  const body = z.object({
    titulo: z.string().min(4).max(200),
    descricao: z.string().max(4000).optional(),
    risco: z.enum(["baixo", "medio", "alto"]).optional(),
    iniciativaId: z.string().uuid().optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "título obrigatório" }, 400);
  const db = await getDb();

  const { abrirGmudServiceNow } = await import("../_lib/integracoes");
  const r = await abrirGmudServiceNow(body.data.titulo, body.data.descricao ?? body.data.titulo, body.data.risco ?? "baixo");

  // Registra a GMUD localmente sempre — com o número real do ServiceNow quando
  // veio, ou como rascunho (pendente de conexão) para não travar o fluxo.
  const numero = r.numero ?? `CHG-local-${Date.now().toString().slice(-6)}`;
  await db.insert(s.gmud).values({
    squadId: me.squadId,
    iniciativaId: body.data.iniciativaId ?? null,
    numero,
    titulo: body.data.titulo,
    status: r.ok ? "aguardando_aprovacao" : "rascunho",
    risco: body.data.risco ?? "baixo",
  });
  await audit(me, "abrir_gmud", `gmud:${numero}`, { ok: r.ok, pendente: r.pendente });
  return c.json({ ...r, numero });
});

export default app;
