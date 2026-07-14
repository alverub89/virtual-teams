import { eq, inArray } from "drizzle-orm";
import { schema as s } from "../../../db/client";
import { hashPassword } from "./password";

// Popula (idempotente) o time + a squad de demonstração para a comunidade da
// pessoa. Roda DENTRO do app, então usa exatamente o banco que a aplicação lê.
// Retorna o squadId e as contagens para confirmação.
export async function seedDemoSquad(db: any, pessoaId: string) {
  const [me] = await db.select().from(s.pessoa).where(eq(s.pessoa.id, pessoaId));
  if (!me) throw new Error("pessoa não encontrada");

  // Comunidade (cria se o CTO ainda não fez onboarding)
  let comId = me.comunidadeId;
  if (!comId) {
    const [com] = await db.insert(s.comunidade).values({ nome: "Comunidade Meios de Pagamento", donoId: me.id }).returning();
    comId = com.id;
    await db.update(s.pessoa).set({ comunidadeId: comId }).where(eq(s.pessoa.id, me.id));
  }

  // Release train
  const rts = (await db.select().from(s.releaseTrain)).filter((r: any) => r.comunidadeId === comId);
  let rt = rts[0];
  if (!rt) [rt] = await db.insert(s.releaseTrain).values({ comunidadeId: comId, nome: "RT Meios de Pagamento" }).returning();
  const rtIds = new Set([...rts, rt].map((r: any) => r.id));

  // Squad (por nome, dentro da comunidade)
  let squad = (await db.select().from(s.squad)).find((sq: any) => rtIds.has(sq.releaseTrainId) && sq.nome === "Squad Pix Cobranca");
  if (!squad) [squad] = await db.insert(s.squad).values({ releaseTrainId: rt.id, nome: "Squad Pix Cobranca", budgetTokensMes: 5_000_000 }).returning();
  const sqId = squad.id;

  // Time (idempotente por email)
  const hash = hashPassword("Demo@2026");
  const upsertPessoa = async (nome: string, email: string, papel: string, squadId: string | null) => {
    const [ex] = await db.select().from(s.pessoa).where(eq(s.pessoa.email, email));
    if (ex) return ex;
    const [p] = await db.insert(s.pessoa).values({ nome, email, senhaHash: hash, papel, comunidadeId: comId, squadId, onboardingConcluido: true }).returning();
    return p;
  };
  const pm = await upsertPessoa("Ana Souza", "ana.souza@acme-demo.com", "pm", sqId);
  const dev1 = await upsertPessoa("Bruno Lima", "bruno.lima@acme-demo.com", "dev", sqId);
  const dev2 = await upsertPessoa("Carla Nunes", "carla.nunes@acme-demo.com", "dev", sqId);
  const dev3 = await upsertPessoa("Diego Alves", "diego.alves@acme-demo.com", "dev", sqId);
  await upsertPessoa("Eduardo Ramos", "eduardo.ramos@acme-demo.com", "gestao", null);

  // Capacidade + repositório
  let cap = (await db.select().from(s.capacidade)).find((c: any) => c.squadId === sqId);
  if (!cap) [cap] = await db.insert(s.capacidade).values({ squadId: sqId, nome: "PIX Cobranca", descricao: "Cobrancas e recorrencias via PIX", sigla: "PIXCOB" }).returning();
  let repo = (await db.select().from(s.repositorio)).find((r: any) => r.squadId === sqId);
  if (!repo) [repo] = await db.insert(s.repositorio).values({ squadId: sqId, nome: "acme/pix-cobranca" }).returning();

  // Iniciativas + etapas + histórias (distribuídas no time)
  const jaTemIni = (await db.select().from(s.iniciativa)).some((i: any) => i.squadId === sqId);
  if (!jaTemIni) {
    const [ini1] = await db.insert(s.iniciativa).values({ codigo: "INI-401", squadId: sqId, capacidadeId: cap.id, titulo: "PIX Automatico para recorrencias", descricao: "Cobrancas recorrentes via PIX Automatico.", status: "em_andamento", etapaAtual: 3, criadoPor: pm.id }).returning();
    await db.insert(s.iniciativaEtapa).values([
      { iniciativaId: ini1.id, ordem: 1, nome: "Descoberta", status: "concluida", artefato: { titulo: "Brief", secoes: [{ h: "Problema", itens: ["Recorrencias dependem de cartao", "Churn por falha de cobranca"] }] }, concluidaEm: new Date() },
      { iniciativaId: ini1.id, ordem: 2, nome: "PRD", status: "concluida", artefato: { titulo: "PRD", secoes: [{ h: "Requisitos", itens: ["Autorizacao unica", "Trilha de auditoria", "Notificacao"] }] }, concluidaEm: new Date() },
      { iniciativaId: ini1.id, ordem: 3, nome: "Arquitetura", status: "em_andamento" },
      { iniciativaId: ini1.id, ordem: 4, nome: "Historias", status: "pendente" },
      { iniciativaId: ini1.id, ordem: 5, nome: "Desenvolvimento", status: "pendente" },
    ]);
    await db.insert(s.historia).values([
      { iniciativaId: ini1.id, codigo: "PIXCOB-101", titulo: "Autorizacao de recorrencia", descricao: "Consentimento do pagador", pontos: 5, status: "em_dev", responsavelId: dev1.id },
      { iniciativaId: ini1.id, codigo: "PIXCOB-102", titulo: "Motor de agendamento", descricao: "Agenda e dispara cobrancas", pontos: 5, status: "backlog", responsavelId: dev2.id },
      { iniciativaId: ini1.id, codigo: "PIXCOB-103", titulo: "Trilha de auditoria", descricao: "Registra alteracoes", pontos: 3, status: "review", responsavelId: dev3.id },
    ]);
    await db.insert(s.mensagemChat).values([
      { iniciativaId: ini1.id, etapaOrdem: 3, autor: "user", autorNome: "Rubens", conteudo: "Podemos reusar o servico de consentimento do Open Finance?", tokens: 20 },
      { iniciativaId: ini1.id, etapaOrdem: 3, autor: "agente", autorNome: "Agente Arquiteto", conteudo: "Sim, proponho um modulo novo com eventos. Registro como ADR?", tokens: 120 },
    ]);

    const [ini2] = await db.insert(s.iniciativa).values({ codigo: "INI-388", squadId: sqId, capacidadeId: cap.id, titulo: "Split de pagamento para marketplaces", descricao: "Divisao automatica entre vendedores.", status: "concluida", etapaAtual: 5, criadoPor: pm.id }).returning();
    await db.insert(s.iniciativaEtapa).values(
      ["Descoberta", "PRD", "Arquitetura", "Historias", "Desenvolvimento"].map((nome, i) => ({ iniciativaId: ini2.id, ordem: i + 1, nome, status: "concluida", concluidaEm: new Date() }))
    );
    await db.insert(s.historia).values([
      { iniciativaId: ini2.id, codigo: "PIXCOB-090", titulo: "Regras de split", pontos: 3, status: "concluida", responsavelId: dev1.id },
      { iniciativaId: ini2.id, codigo: "PIXCOB-091", titulo: "Liquidacao por vendedor", pontos: 5, status: "concluida", responsavelId: dev2.id },
    ]);
    await db.insert(s.execucaoEsteira).values([
      { squadId: sqId, iniciativaId: ini1.id, repositorio: "acme/pix-cobranca", etapa: "build", status: "ok", detalhe: "build #128 verde" },
      { squadId: sqId, iniciativaId: ini1.id, repositorio: "acme/pix-cobranca", etapa: "testes", status: "ok", detalhe: "cobertura 87%" },
      { squadId: sqId, iniciativaId: ini1.id, repositorio: "acme/pix-cobranca", etapa: "seguranca", status: "em_execucao", detalhe: "SAST em andamento" },
    ]);
    await db.insert(s.gmud).values({ squadId: sqId, iniciativaId: ini1.id, numero: "CHG-2026-0912", titulo: "Deploy PIX Automatico - fase 1", status: "aguardando_aprovacao", risco: "medio", janela: "2026-07-20 02:00 as 04:00" });
    await db.insert(s.pullRequest).values([
      { repositorioId: repo.id, iniciativaId: ini1.id, numero: 42, titulo: "feat: consentimento de recorrencia", autorNome: "Bruno Lima", status: "aberto" },
      { repositorioId: repo.id, iniciativaId: ini1.id, numero: 43, titulo: "test: casos de borda do agendador", autorNome: "Carla Nunes", status: "aprovado" },
    ]);
  }

  // OKR + KRs + medições + feature
  const ini1Now = (await db.select().from(s.iniciativa)).find((i: any) => i.squadId === sqId && i.codigo === "INI-401");
  if (!(await db.select().from(s.okr)).some((o: any) => o.squadId === sqId)) {
    const [okr] = await db.insert(s.okr).values({ escopo: "squad", squadId: sqId, objetivo: "Elevar a adesao ao PIX Automatico", dono: "Ana Souza", trimestre: "2026-Q3" }).returning();
    const [kr1] = await db.insert(s.keyResult).values({ okrId: okr.id, ordem: 1, descricao: "Percentual de recorrencias migradas para PIX Automatico", unidade: "%", baseline: 5, meta: 40, invertido: false }).returning();
    const [kr2] = await db.insert(s.keyResult).values({ okrId: okr.id, ordem: 2, descricao: "Custo medio por transacao (centavos)", unidade: "numero", baseline: 12, meta: 7, invertido: true }).returning();
    await db.insert(s.krMedicao).values([
      { krId: kr1.id, mes: "2026-07", planejado: 12, realizado: 10 }, { krId: kr1.id, mes: "2026-08", planejado: 22 }, { krId: kr1.id, mes: "2026-09", planejado: 40 },
      { krId: kr2.id, mes: "2026-07", planejado: 11, realizado: 11 }, { krId: kr2.id, mes: "2026-08", planejado: 9 }, { krId: kr2.id, mes: "2026-09", planejado: 7 },
    ]);
    if (ini1Now) await db.insert(s.krFeature).values({ krId: kr1.id, iniciativaId: ini1Now.id });
  }

  // Execução autônoma (run + passos + checkpoint)
  if (!(await db.select().from(s.execucaoAutonoma)).some((e: any) => e.squadId === sqId)) {
    const okrsSquad = (await db.select().from(s.okr)).filter((o: any) => o.squadId === sqId).map((o: any) => o.id);
    const krRow = (await db.select().from(s.keyResult)).find((k: any) => okrsSquad.includes(k.okrId));
    const [run] = await db.insert(s.execucaoAutonoma).values({ squadId: sqId, krId: krRow?.id ?? null, objetivo: "Migrar recorrencias piloto para PIX Automatico", status: "aguardando_aprovacao", passoAtual: 3, tokensGastos: 45000, tetoTokens: 200000, criadoPor: me.id }).returning();
    await db.insert(s.execucaoPasso).values([
      { execucaoId: run.id, ordem: 1, nome: "Planejamento da migracao", agenteNome: "Agente PM", tipo: "automatica", status: "concluido", saida: { resumo: "Plano em 3 ondas por porte de cliente", itens: ["Onda 1: MEIs", "Onda 2: PMEs", "Onda 3: grandes contas"], revisao: { nota: 9, rodadas: 1, problemas: [] } }, concluidoEm: new Date() },
      { execucaoId: run.id, ordem: 2, nome: "Analise de impacto tecnico", agenteNome: "Agente Arquiteto", tipo: "automatica", status: "concluido", saida: { resumo: "Impacto baixo; reuso do servico de consentimento", itens: ["Sem breaking change", "Rollback por feature flag"], revisao: { nota: 7, rodadas: 2, problemas: ["Faltava plano de rollback explicito — corrigido na 2a rodada"] } }, concluidoEm: new Date() },
      { execucaoId: run.id, ordem: 3, nome: "Aprovar plano de migracao", tipo: "checkpoint", status: "aguardando" },
      { execucaoId: run.id, ordem: 4, nome: "Executar migracao piloto", agenteNome: "Agente Dev", tipo: "automatica", status: "pendente" },
    ]);
    await db.insert(s.execucaoCheckpoint).values({ execucaoId: run.id, passoOrdem: 3, titulo: "Aprovar plano de migracao", resumo: "Revisar as 3 ondas antes de executar o piloto com MEIs.", status: "aberto" });
  }

  // Tool publicada por uma squad, aguardando aprovacao do CTO (para o CTO poder
  // exercer o fluxo de governanca sem precisar logar como membro de squad).
  if (!(await db.select().from(s.tool)).some((t: any) => t.squadId === sqId && t.aprovacao === "pendente")) {
    await db.insert(s.tool).values({
      nome: "consultar_limite_pix",
      descricao: "Consulta o limite de PIX disponivel de um cliente antes de agendar a recorrencia",
      permissao: "leitura",
      execucao: "http",
      parametros: "clienteId (obrigatorio), canal",
      inputSchema: { type: "object", properties: { clienteId: { type: "string" }, canal: { type: "string" } }, required: ["clienteId"] },
      squadId: sqId,
      aprovacao: "pendente",
      criadoPor: pm.id,
      submetidoEm: new Date(),
    });
  }

  // Mesa-redonda concluida (para o CTO auditar o debate encadeado + a decisao).
  if (!(await db.select().from(s.partySessao)).some((p: any) => p.squadId === sqId)) {
    const [sess] = await db.insert(s.partySessao).values({
      squadId: sqId,
      titulo: "PIX Automatico deve ter leaderboard de adesao por gerente?",
      topico: "Vale expor um ranking de adesao ao PIX Automatico por carteira de gerentes?",
      status: "concluido",
      sintese: "## 🎯 Decisao\nRanking **opt-in por regional**, sem exposicao individual publica — foco em meta de carteira, nao competicao entre pessoas.\n\n## ✅ Acordos\n- Metrica: % de recorrencias migradas por regional\n- Atualizacao semanal\n\n## ⚖️ Divergencias\n- Exposicao individual (rejeitada por risco de pressao indevida)\n\n## ▶️ Proximos passos\n1. Definir corte de regional (PM)\n2. Evento de telemetria de adesao (Dev)",
      criadoPor: me.id,
    }).returning();
    await db.insert(s.partyTurno).values([
      { sessaoId: sess.id, ordem: 1, agenteNome: "Agente PM", emoji: "📋", conteudo: "Proponho ranking por regional, nao por pessoa: mede adesao da carteira sem expor gerente individual." },
      { sessaoId: sess.id, ordem: 2, agenteNome: "Agente Arquiteto", emoji: "🏛️", conteudo: "Pegando o que o PM disse: agrego a telemetria por regional no evento de adesao que ja existe — custo zero de infra, sem PII individual." },
      { sessaoId: sess.id, ordem: 3, agenteNome: "Consolidação — rodada 1", emoji: "🧩", conteudo: "**Decidido:** ranking opt-in por regional, semanal, sem exposicao individual.\n\n**Ainda em aberto:** corte exato de regional." },
    ]);
  }

  // Documentos + KB
  if (!(await db.select().from(s.documento)).some((d: any) => d.squadId === sqId)) {
    await db.insert(s.documento).values([
      { squadId: sqId, iniciativaId: ini1Now?.id ?? null, titulo: "PRD - PIX Automatico", tipo: "prd", resumo: "Requisitos do PIX Automatico", conteudo: "# PRD\n\nRequisitos e criterios de aceite.", autorNome: "Ana Souza", escopo: "squad" },
      { squadId: sqId, iniciativaId: ini1Now?.id ?? null, titulo: "ADR - Reuso do servico de consentimento", tipo: "adr", resumo: "Decisao de arquitetura", conteudo: "# ADR\n\nReusar o servico existente com modulo novo.", autorNome: "Rubens", escopo: "squad" },
      { squadId: sqId, titulo: "Guia de operacao da esteira", tipo: "guia", resumo: "Como acompanhar build/testes/GMUD", conteudo: "# Esteira\n\nPasso a passo dos gates ate a GMUD.", autorNome: "Rubens", escopo: "squad" },
    ]);
  }
  if (!(await db.select().from(s.kbArtigo)).some((k: any) => k.squadId === sqId)) {
    await db.insert(s.kbArtigo).values([
      { escopo: "squad", squadId: sqId, titulo: "Padrao de idempotencia em cobrancas", resumo: "Idempotencia ponta a ponta", conteudo: "# Idempotencia\n\nUse chave de idempotencia por operacao...", autorId: me.id, autorNome: "Rubens" },
      { escopo: "squad", squadId: sqId, titulo: "Checklist de PII para GMUD", resumo: "O que revisar antes de subir", conteudo: "# PII\n\nMascaramento, base legal e retencao...", autorId: pm.id, autorNome: "Ana Souza" },
    ]);
  }

  // Consumo do mês (indicadores)
  if (!(await db.select().from(s.consumoTokens)).some((ct: any) => ct.squadId === sqId && ct.mes === "2026-07")) {
    await db.insert(s.consumoTokens).values({ squadId: sqId, mes: "2026-07", promptTokens: 1_250_000, completionTokens: 480_000, custo: 92 });
  }

  const cont = async (tbl: any, pred: (r: any) => boolean) => (await db.select().from(tbl)).filter(pred).length;
  return {
    squadId: sqId,
    counts: {
      membros: await cont(s.pessoa, (p: any) => p.squadId === sqId),
      iniciativas: await cont(s.iniciativa, (i: any) => i.squadId === sqId),
      okrs: await cont(s.okr, (o: any) => o.squadId === sqId),
      runs: await cont(s.execucaoAutonoma, (e: any) => e.squadId === sqId),
      docs: await cont(s.documento, (d: any) => d.squadId === sqId),
    },
  };
}

// Remove TUDO que o seed criou (squad de demo + time @acme-demo.com) na
// comunidade da pessoa, na ordem correta das FKs. Não apaga a comunidade nem a
// própria pessoa. Retorna contagens do que foi apagado.
export async function rollbackDemoSquad(db: any, pessoaId: string) {
  const [me] = await db.select().from(s.pessoa).where(eq(s.pessoa.id, pessoaId));
  if (!me?.comunidadeId) return { squads: 0 };
  const comId = me.comunidadeId;

  const rts = (await db.select().from(s.releaseTrain)).filter((r: any) => r.comunidadeId === comId);
  const rtIds = new Set(rts.map((r: any) => r.id));
  const squads = (await db.select().from(s.squad)).filter((sq: any) => rtIds.has(sq.releaseTrainId) && sq.nome === "Squad Pix Cobranca");
  const squadIds = squads.map((sq: any) => sq.id);

  const del = async (tbl: any, col: any, ids: string[]) => { if (ids.length) await db.delete(tbl).where(inArray(col, ids)); };

  if (squadIds.length) {
    const iniIds = (await db.select().from(s.iniciativa)).filter((i: any) => squadIds.includes(i.squadId)).map((i: any) => i.id);
    const okrIds = (await db.select().from(s.okr)).filter((o: any) => squadIds.includes(o.squadId)).map((o: any) => o.id);
    const krIds = (await db.select().from(s.keyResult)).filter((k: any) => okrIds.includes(k.okrId)).map((k: any) => k.id);
    const runIds = (await db.select().from(s.execucaoAutonoma)).filter((e: any) => squadIds.includes(e.squadId)).map((e: any) => e.id);
    const repoIds = (await db.select().from(s.repositorio)).filter((r: any) => squadIds.includes(r.squadId)).map((r: any) => r.id);
    const kbIds = (await db.select().from(s.kbArtigo)).filter((k: any) => squadIds.includes(k.squadId)).map((k: any) => k.id);

    // runs primeiro: execucao_autonoma.kr_id referencia key_result
    await del(s.execucaoCheckpoint, s.execucaoCheckpoint.execucaoId, runIds);
    await del(s.execucaoPasso, s.execucaoPasso.execucaoId, runIds);
    await del(s.execucaoAutonoma, s.execucaoAutonoma.id, runIds);

    await del(s.krMedicao, s.krMedicao.krId, krIds);
    await del(s.krFeature, s.krFeature.krId, krIds);
    await del(s.keyResult, s.keyResult.okrId, okrIds);
    await del(s.okr, s.okr.id, okrIds);

    await del(s.mensagemChat, s.mensagemChat.iniciativaId, iniIds);
    await del(s.historia, s.historia.iniciativaId, iniIds);
    await del(s.iniciativaEtapa, s.iniciativaEtapa.iniciativaId, iniIds);
    await del(s.pullRequest, s.pullRequest.repositorioId, repoIds);
    await del(s.execucaoEsteira, s.execucaoEsteira.squadId, squadIds);
    await del(s.gmud, s.gmud.squadId, squadIds);
    await del(s.documento, s.documento.squadId, squadIds);
    await del(s.kbEndosso, s.kbEndosso.artigoId, kbIds);
    await del(s.kbArtigo, s.kbArtigo.id, kbIds);
    await del(s.iniciativa, s.iniciativa.id, iniIds);
    await del(s.capacidade, s.capacidade.squadId, squadIds);
    await del(s.repositorio, s.repositorio.id, repoIds);
    await del(s.consumoTokens, s.consumoTokens.squadId, squadIds);
  }

  // Time de demo (@acme-demo.com nesta comunidade + qualquer um ligado às squads),
  // exceto a própria pessoa.
  const team = (await db.select().from(s.pessoa)).filter(
    (p: any) => p.id !== pessoaId && p.comunidadeId === comId && (String(p.email).toLowerCase().endsWith("@acme-demo.com") || squadIds.includes(p.squadId))
  );
  const teamIds = team.map((p: any) => p.id);
  await del(s.sessao, s.sessao.pessoaId, teamIds);
  await del(s.auditLog, s.auditLog.pessoaId, teamIds);
  await del(s.pessoa, s.pessoa.id, teamIds);

  // Desliga a pessoa da squad antes de apagá-la e remove as squads de demo.
  await db.update(s.pessoa).set({ squadId: null }).where(eq(s.pessoa.id, pessoaId));
  await del(s.squad, s.squad.id, squadIds);

  return { squads: squadIds.length, membros: teamIds.length };
}
