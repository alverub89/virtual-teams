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
  const execPassos = await db.select().from(s.execucaoPasso);
  const tools = await db.select().from(s.tool);
  const mcps = await db.select().from(s.conexaoMcp);
  const agentes = await db.select().from(s.agente);

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

  // Lead time POR ETAPA: como não há "iniciada em", a duração de cada etapa é
  // o intervalo entre a conclusão da anterior (ou a criação da iniciativa) e a
  // sua própria conclusão. Média por nome de etapa, em dias.
  const acumEtapa: Record<string, { soma: number; n: number }> = {};
  for (const i of inis as any[]) {
    const ets = etapas.filter((e: any) => e.iniciativaId === i.id && e.concluidaEm)
      .sort((a: any, b: any) => a.ordem - b.ordem);
    let prev = new Date(i.criadoEm).getTime();
    for (const e of ets) {
      const fim = new Date(e.concluidaEm).getTime();
      const dias = Math.max(0, (fim - prev) / 86400000);
      (acumEtapa[e.nome] ??= { soma: 0, n: 0 });
      acumEtapa[e.nome].soma += dias;
      acumEtapa[e.nome].n += 1;
      prev = fim;
    }
  }
  const leadTimePorEtapa = etapaNomes
    .filter((nome) => acumEtapa[nome])
    .map((nome) => ({ etapa: nome, dias: Math.round((acumEtapa[nome].soma / acumEtapa[nome].n) * 10) / 10, amostra: acumEtapa[nome].n }));

  // Cobertura do Agente Master: dos passos concluídos na execução autônoma,
  // quantos passaram pela crítica do Master (têm parecer/nota registrado).
  const passosConcluidos = execPassos.filter((p: any) => p.status === "concluido");
  const comMaster = passosConcluidos.filter((p: any) => p.saida?.revisao);
  const notas = comMaster.map((p: any) => p.saida.revisao.nota).filter((n: any) => typeof n === "number");
  const masterCobertura = {
    total: passosConcluidos.length,
    revisados: comMaster.length,
    pct: passosConcluidos.length ? Math.round((comMaster.length / passosConcluidos.length) * 100) : null,
    notaMedia: notas.length ? Math.round((notas.reduce((a: number, b: number) => a + b, 0) / notas.length) * 10) / 10 : null,
  };

  // Fila de aprovações (governança): tamanho, idade da mais antiga e taxa de
  // rejeição entre os itens que já passaram pela fila (têm submetidoEm).
  const governanca = [...tools, ...mcps];
  const pendentes = governanca.filter((x: any) => x.aprovacao === "pendente");
  const idadesDias = pendentes
    .filter((x: any) => x.submetidoEm)
    .map((x: any) => (Date.now() - new Date(x.submetidoEm).getTime()) / 86400000);
  const decididos = governanca.filter((x: any) => x.submetidoEm && (x.aprovacao === "aprovado" || x.aprovacao === "rejeitado"));
  const rejeitados = decididos.filter((x: any) => x.aprovacao === "rejeitado");
  const filaAprovacoes = {
    pendentes: pendentes.length,
    maisAntigaDias: idadesDias.length ? Math.round(Math.max(...idadesDias)) : null,
    idadeMediaDias: idadesDias.length ? Math.round((idadesDias.reduce((a: number, b: number) => a + b, 0) / idadesDias.length) * 10) / 10 : null,
    taxaRejeicao: decididos.length ? Math.round((rejeitados.length / decididos.length) * 100) : null,
    decididos: decididos.length,
  };

  // Cobertura de guard-rails: agentes ativos com guard-rails customizados.
  const agentesAtivos = agentes.filter((a: any) => a.ativo);
  const comGuardRails = agentesAtivos.filter((a: any) => Array.isArray(a.guardRails) && a.guardRails.length > 0);
  const coberturaGuardRails = {
    ativos: agentesAtivos.length,
    comGuardRails: comGuardRails.length,
    pct: agentesAtivos.length ? Math.round((comGuardRails.length / agentesAtivos.length) * 100) : null,
  };

  // Tokens por iniciativa (execução autônoma): ajuda a prever o custo de uma
  // iniciativa antes de aprová-la. Agrega os runs de orquestração por código.
  const porIni: Record<string, number> = {};
  for (const r of runs as any[]) {
    if (r.modo === "iniciativa" && r.iniciativaId) porIni[r.iniciativaId] = (porIni[r.iniciativaId] ?? 0) + (r.tokensGastos ?? 0);
  }
  const tokensPorIniciativa = Object.entries(porIni)
    .map(([iniId, tokens]) => ({ codigo: (inis as any[]).find((i: any) => i.id === iniId)?.codigo ?? "?", tokens: tokens as number }))
    .filter((x) => x.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 8);

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
    leadTimePorEtapa,
    masterCobertura,
    filaAprovacoes,
    coberturaGuardRails,
    tokensPorIniciativa,
    consumoPorSquad,
    gmuds90d: gmuds.map((g: any) => ({ numero: g.numero, titulo: g.titulo, status: g.status, janela: g.janela })),
    okrs: okrs.map((o: any) => ({ escopo: o.escopo, objetivo: o.objetivo })),
    progressoKrs,
  });
});

export default app;
