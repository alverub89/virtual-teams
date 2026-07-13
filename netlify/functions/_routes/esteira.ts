import { Hono } from "hono";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { rbac } from "../_mw/rbac";
import { audit } from "../_lib/audit";

const app = new Hono();

// A esteira roda SIMULADA dentro do app: cada gate leva alguns segundos e o
// status é calculado no read a partir do tempo decorrido — assim a pipeline
// "anda" na tela sem job de fundo nem sistema externo.
const GATES = ["build", "testes", "seguranca", "deploy_hml", "gmud", "deploy_prod"] as const;
const DUR_GATE_MS = 2500;
const DETALHE_GATE: Record<string, string> = {
  build: "compilação + cache",
  testes: "cobertura 84% · 312 testes",
  seguranca: "SAST + dependências",
  deploy_hml: "homologação + smoke test",
  gmud: "mudança aprovada",
  deploy_prod: "canário 10% → 100%",
};

// Status de um gate dado o instante de início da esteira.
function statusGate(etapa: string, inicioMs: number, agoraMs: number): "pendente" | "em_execucao" | "ok" {
  const i = GATES.indexOf(etapa as (typeof GATES)[number]);
  const decorrido = agoraMs - inicioMs;
  if (decorrido >= (i + 1) * DUR_GATE_MS) return "ok";
  if (decorrido >= i * DUR_GATE_MS) return "em_execucao";
  return "pendente";
}

// Projeta as execuções: rows simuladas (detalhe "sim:<start>|msg") têm o
// status recalculado pelo tempo decorrido; as demais (seed) ficam como estão.
function projetarExecucoes(rows: any[]) {
  const agora = Date.now();
  return rows.map((r: any) => {
    if (typeof r.detalhe === "string" && r.detalhe.startsWith("sim:")) {
      const [meta, msg] = r.detalhe.slice(4).split("|");
      const inicio = Number(meta) || agora;
      return { ...r, status: statusGate(r.etapa, inicio, agora), detalhe: msg ?? "" };
    }
    return r;
  });
}

// Resolve a config (nome do repo/instância) da comunidade dona da squad.
async function configDaSquad(db: any, squadId: string) {
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
  const brutas = await db
    .select()
    .from(s.execucaoEsteira)
    .where(eq(s.execucaoEsteira.squadId, squadId));
  const execucoes = projetarExecucoes(brutas);
  // Ativa = existe uma simulação com algum gate ainda não concluído (o front
  // faz polling só enquanto isso for verdade).
  const agora = Date.now();
  const ativa = brutas.some((r: any) => {
    if (typeof r.detalhe !== "string" || !r.detalhe.startsWith("sim:")) return false;
    const inicio = Number(r.detalhe.slice(4).split("|")[0]) || agora;
    return statusGate(r.etapa, inicio, agora) !== "ok";
  });
  const gmuds = await db
    .select()
    .from(s.gmud)
    .where(eq(s.gmud.squadId, squadId))
    .orderBy(desc(s.gmud.criadoEm));
  return c.json({ execucoes, gmuds, ativa });
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

/* Dispara a esteira (simulada) de um repositório da squad — os gates avançam
   sozinhos ao longo de ~15s e o front acompanha o progresso. */
app.post("/disparar", rbac("iniciar_run"), async (c) => {
  const me = c.get("me");
  if (!me.squadId) return c.json({ error: "usuário sem squad" }, 400);
  const body = z.object({
    repositorio: z.string().optional(),
    iniciativaId: z.string().uuid().optional(),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const db = await getDb();
  const cfg = await configDaSquad(db, me.squadId);
  const org = cfg?.githubOrg?.trim();
  const repoPadrao = cfg?.githubRepoPadrao?.trim();
  const repo = body.data.repositorio?.trim() || (org && repoPadrao ? `${org}/${repoPadrao}` : repoPadrao) || "itau/demo-service";

  // Remove uma simulação anterior (mantém as execuções fixas do seed) e cria
  // os 6 gates com o mesmo instante de início; o status é calculado no read.
  const antigas = (await db.select().from(s.execucaoEsteira).where(eq(s.execucaoEsteira.squadId, me.squadId)))
    .filter((r: any) => typeof r.detalhe === "string" && r.detalhe.startsWith("sim:"));
  for (const a of antigas) await db.delete(s.execucaoEsteira).where(eq(s.execucaoEsteira.id, a.id));

  const inicio = Date.now();
  await db.insert(s.execucaoEsteira).values(GATES.map((etapa) => ({
    squadId: me.squadId!,
    iniciativaId: body.data.iniciativaId ?? null,
    repositorio: repo,
    etapa,
    status: "pendente",
    detalhe: `sim:${inicio}|${DETALHE_GATE[etapa]}`,
  })));
  await audit(me, "disparar_esteira", `repo:${repo}`, { simulada: true });
  return c.json({ ok: true, repositorio: repo, mensagem: `Esteira disparada em ${repo} — acompanhe os gates.` }, 202);
});

/* Abre uma GMUD (simulada) para uma mudança da squad. */
app.post("/gmud", rbac("iniciar_run"), async (c) => {
  const me = c.get("me");
  if (!me.squadId) return c.json({ error: "usuário sem squad" }, 400);
  const body = z.object({
    titulo: z.string().min(4).max(200),
    risco: z.enum(["baixo", "medio", "alto"]).optional(),
    iniciativaId: z.string().uuid().optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "título obrigatório" }, 400);
  const db = await getDb();

  const ano = new Date().getUTCFullYear();
  const numero = `CHG-${ano}-${Date.now().toString().slice(-4)}`;
  await db.insert(s.gmud).values({
    squadId: me.squadId,
    iniciativaId: body.data.iniciativaId ?? null,
    numero,
    titulo: body.data.titulo,
    status: "aguardando_aprovacao",
    risco: body.data.risco ?? "baixo",
  });
  await audit(me, "abrir_gmud", `gmud:${numero}`, { simulada: true });
  return c.json({ ok: true, numero, mensagem: `GMUD ${numero} aberta e aguardando aprovação.` }, 202);
});

export default app;
