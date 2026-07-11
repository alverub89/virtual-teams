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

  return c.json({
    kpis: {
      iniciativasAtivas: inis.filter((i: any) => i.status === "em_andamento").length,
      leadTimeDias: 34, // TODO: calcular de criado_em→deploy quando houver histórico real
      taxaSucessoGmud,
      custoIaMes: consumo.reduce((acc: number, r: any) => acc + r.custo, 0),
      runsAutonomos: runs.length,
      squads: squads.length,
    },
    fluxo,
    consumoPorSquad: consumo
      .map((r: any) => ({
        squad: squads.find((x: any) => x.id === r.squadId)?.nome ?? "?",
        tokens: r.promptTokens + r.completionTokens,
        custo: r.custo,
      }))
      .sort((a: any, b: any) => b.tokens - a.tokens),
    gmuds90d: gmuds.map((g: any) => ({ numero: g.numero, titulo: g.titulo, status: g.status, janela: g.janela })),
    okrs: okrs.map((o: any) => ({ escopo: o.escopo, objetivo: o.objetivo })),
    progressoKrs,
  });
});

export default app;
