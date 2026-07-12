import { Hono } from "hono";
import { z } from "zod";
import { setCookie } from "hono/cookie";
import { asc, eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { signSession, sessionCookieName, cookieOpts } from "../_mw/auth";
import { meDaPessoa } from "./auth";
import { audit } from "../_lib/audit";

// Onboarding do CTO: monta a plataforma da instituição — estrutura
// (Comunidade → RT → Squad), método default (fases + agente + o que gera) e
// uma documentação base herdada pelas squads. Depois convida pessoas.
const app = new Hono();

async function reemitir(c: any, db: any, pessoaId: string) {
  const [p] = await db.select().from(s.pessoa).where(eq(s.pessoa.id, pessoaId));
  const me = await meDaPessoa(db, p);
  setCookie(c, sessionCookieName, await signSession(me), cookieOpts());
  return me;
}

const EtapaMetodo = z.object({
  nome: z.string().min(2).max(60),
  agenteId: z.string().uuid().optional(),
  gera: z.string().max(120).optional(),
  checkpoint: z.boolean().optional(),
});

const Onboarding = z.object({
  comunidadeNome: z.string().min(2).max(80),
  releaseTrainNome: z.string().min(2).max(80),
  squadNome: z.string().min(2).max(80),
  metodoNome: z.string().min(2).max(80),
  metodoEtapas: z.array(EtapaMetodo).min(1).max(12).optional(),
  docTitulo: z.string().min(3).max(120),
  docConteudo: z.string().min(10),
});

app.post("/", async (c) => {
  const me = c.get("me");
  if (me.papel !== "cto") return c.json({ error: "apenas o CTO faz o setup" }, 403);
  if (me.comunidadeId) return c.json({ error: "setup já iniciado" }, 409);
  const body = Onboarding.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos", detalhe: body.error.flatten() }, 400);
  const d = body.data;
  const db = await getDb();

  const [com] = await db.insert(s.comunidade).values({ nome: d.comunidadeNome, donoId: me.id }).returning();
  const [rt] = await db.insert(s.releaseTrain).values({ comunidadeId: com.id, nome: d.releaseTrainNome }).returning();
  const [squad] = await db
    .insert(s.squad)
    .values({ releaseTrainId: rt.id, nome: d.squadNome, budgetTokensMes: 2_000_000 })
    .returning();

  // Método default da instituição.
  const [metodo] = await db.insert(s.metodo).values({ nome: d.metodoNome, versao: "v1", ativo: true }).returning();
  let etapas = d.metodoEtapas;
  if (!etapas || etapas.length === 0) {
    const ags = await db.select().from(s.agente).orderBy(asc(s.agente.nome));
    const byNome = (n: string) => ags.find((a: any) => a.nome.includes(n))?.id;
    etapas = [
      { nome: "Brief", agenteId: byNome("Analista"), gera: "Brief do problema" },
      { nome: "PRD", agenteId: byNome("PM"), gera: "PRD com RF/NFR e métricas" },
      { nome: "Arquitetura", agenteId: byNome("Arquiteto"), gera: "Desenho e ADRs" },
      { nome: "Histórias", agenteId: byNome("SM"), gera: "Histórias INVEST" },
      { nome: "Desenvolvimento", agenteId: byNome("Dev"), gera: "Código e PRs" },
      { nome: "Esteira & GMUD", agenteId: byNome("QA"), gera: "Evidências e GMUD", checkpoint: true },
    ];
  }
  await db.insert(s.metodoEtapa).values(
    etapas.map((e, i) => ({
      metodoId: metodo.id,
      ordem: i + 1,
      nome: e.nome,
      agenteId: e.agenteId ?? null,
      tipo: e.checkpoint ? "checkpoint" : "automatica",
      descricao: e.gera ?? null,
    }))
  );

  // Documentação base (guardrail) herdada pelas squads.
  await db.insert(s.documento).values({
    titulo: d.docTitulo,
    tipo: "guia",
    emoji: "🏛️",
    resumo: "Documento base da comunidade, herdado pelas squads.",
    conteudo: d.docConteudo,
    autorNome: me.nome,
    escopo: "comunidade",
  });

  await db
    .update(s.pessoa)
    .set({ comunidadeId: com.id, onboardingConcluido: true })
    .where(eq(s.pessoa.id, me.id));

  const meAtualizado = await reemitir(c, db, me.id);
  await audit(meAtualizado, "onboarding_cto", `comunidade:${com.nome}`, { squad: squad.nome, metodo: metodo.nome });
  return c.json({ me: meAtualizado, comunidadeId: com.id, squadId: squad.id, squadNome: squad.nome }, 201);
});

// Pular: marca onboarding como visto; o CTO monta tudo pelo checklist.
app.post("/pular", async (c) => {
  const me = c.get("me");
  if (me.papel !== "cto") return c.json({ error: "apenas o CTO" }, 403);
  const db = await getDb();
  await db.update(s.pessoa).set({ onboardingConcluido: true }).where(eq(s.pessoa.id, me.id));
  const meAtualizado = await reemitir(c, db, me.id);
  return c.json({ me: meAtualizado });
});

export default app;
