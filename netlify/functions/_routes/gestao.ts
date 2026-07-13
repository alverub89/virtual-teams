import { Hono } from "hono";
import { rbac } from "../_mw/rbac";
import { getDb, schema as s } from "../../../db/client";

// Visão de diretoria — indicadores consolidados, somente leitura.
const app = new Hono();

app.get("/indicadores", rbac("ver_gestao"), async (c) => {
  const db = await getDb();
  const squads = await db.select().from(s.squad);
  const inis = await db.select().from(s.iniciativa);
  const gmuds = await db.select().from(s.gmud);
  const consumo = await db.select().from(s.consumoTokens);
  const runs = await db.select().from(s.execucaoAutonoma);
  const okrs = await db.select().from(s.okr);
  const krs = await db.select().from(s.keyResult);
  const medicoes = await db.select().from(s.krMedicao);
  const etapas = await db.select().from(s.iniciativaEtapa);

  const etapaNomes = ["Brief", "PRD", "Arquitetura", "Histórias", "Desenvolvimento", "Esteira & GMUD"];
  const fluxo = etapaNomes.map((nome, idx) => ({
    etapa: nome,
    iniciativas: inis.filter((i: any) => i.status === "em_andamento" && i.etapaAtual === idx + 1).length,
  }));

  const gmudsExecutadas = gmuds.filter((g: any) => g.status === "executada").length;
  const gmudsRollback = gmuds.filter((g: any) => g.status === "rollback").length;
  const taxaSucessoGmud =
    gmudsExecutadas + gmudsRollback > 0
      ? Math.round((gmudsExecutadas / (gmudsExecutadas + gmudsRollback)) * 100)
      : null;

  // Progresso dos KRs da squad: realizado mais recente vs meta.
  const progressoKrs = krs.map((k: any) => {
    const meds = medicoes
      .filter((m: any) => m.krId === k.id && m.realizado != null)
      .sort((a: any, b: any) => a.mes.localeCompare(b.mes));
    const ultimo = meds.at(-1)?.realizado ?? k.baseline;
    const span = k.meta - k.baseline;
    const pct = span !== 0 ? Math.round(((ultimo - k.baseline) / span) * 100) : 0;
    return { descricao: k.descricao, progresso: Math.max(0, Math.min(100, pct)) };
  });

  // Lead time real: iniciativas concluídas — dias de criado_em até a última
  // etapa concluída. Sem concluídas, null (frontend mostra "—").
  const concluidas = inis.filter((i: any) => i.status === "concluida");
  const leadTimes = concluidas.map((i: any) => {
    const fim = etapas.filter((e: any) => e.iniciativaId === i.id && e.concluidaEm).map((e: any) => new Date(e.concluidaEm).getTime());
    const ultimo = fim.length ? Math.max(...fim) : null;
    return ultimo ? (ultimo - new Date(i.criadoEm).getTime()) / 86400000 : null;
  }).filter((d: number | null): d is number => d != null);
  const leadTimeDias = leadTimes.length ? Math.round(leadTimes.reduce((a: number, b: number) => a + b, 0) / leadTimes.length) : null;

  // Consumo x orçamento por squad (mês corrente) com alerta de estouro.
  const mesAtual = new Date().toISOString().slice(0, 7);
  const consumoPorSquad = squads.map((sq: any) => {
    const rows = consumo.filter((r: any) => r.squadId === sq.id && r.mes === mesAtual);
    const tokens = rows.reduce((a: number, r: any) => a + r.promptTokens + r.completionTokens, 0);
    const custo = rows.reduce((a: number, r: any) => a + r.custo, 0);
    const budget = sq.budgetTokensMes ?? null;
    const pct = budget ? Math.round((tokens / budget) * 100) : null;
    return { squad: sq.nome, tokens, custo, budget, pct, alerta: pct != null && pct >= 80 };
  }).filter((x: any) => x.tokens > 0 || x.budget).sort((a: any, b: any) => b.tokens - a.tokens);

  return c.json({
    kpis: {
      iniciativasAtivas: inis.filter((i: any) => i.status === "em_andamento").length,
      leadTimeDias,
      taxaSucessoGmud,
      custoIaMes: consumo.filter((r: any) => r.mes === mesAtual).reduce((acc: number, r: any) => acc + r.custo, 0),
      runsAutonomos: runs.length,
      squads: squads.length,
      squadsEmAlerta: consumoPorSquad.filter((x: any) => x.alerta).length,
    },
    fluxo,
    consumoPorSquad,
    gmuds90d: gmuds.map((g: any) => ({ numero: g.numero, titulo: g.titulo, status: g.status, janela: g.janela })),
    okrs: okrs.map((o: any) => ({ escopo: o.escopo, objetivo: o.objetivo })),
    progressoKrs,
  });
});

export default app;
