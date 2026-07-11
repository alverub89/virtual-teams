import * as s from "./schema";

// Seed de demonstração — espelha os dados ilustrativos do protótipo
// (docs/prototipo). Roda uma única vez (idempotente por checagem de vazio).
// Também usado nas personas do modo demo de login.

const MES_ATUAL = "2026-07";

export async function seedIfEmpty(db: any) {
  const existing = await db.select().from(s.comunidade).limit(1);
  if (existing.length > 0) return;

  /* ---------- estrutura ---------- */
  const [com] = await db
    .insert(s.comunidade)
    .values({ nome: "Meios de Pagamento" })
    .returning();

  const rts = await db
    .insert(s.releaseTrain)
    .values([
      { comunidadeId: com.id, nome: "RT Adquirência" },
      { comunidadeId: com.id, nome: "RT Emissão" },
      { comunidadeId: com.id, nome: "RT Pix" },
    ])
    .returning();
  const [rtAdq, rtEmi, rtPix] = rts;

  const squads = await db
    .insert(s.squad)
    .values([
      { releaseTrainId: rtAdq.id, nome: "Squad Pagamentos", budgetTokensMes: 2_000_000 },
      { releaseTrainId: rtAdq.id, nome: "Squad Conciliação", budgetTokensMes: 1_200_000 },
      { releaseTrainId: rtEmi.id, nome: "Squad Cartões", budgetTokensMes: 1_500_000 },
      { releaseTrainId: rtEmi.id, nome: "Squad Faturas", budgetTokensMes: 900_000 },
      { releaseTrainId: rtPix.id, nome: "Squad Pix", budgetTokensMes: 1_800_000 },
      { releaseTrainId: rtPix.id, nome: "Squad Antifraude", budgetTokensMes: 1_000_000 },
    ])
    .returning();
  const sqPag = squads[0];

  const pessoas = await db
    .insert(s.pessoa)
    .values([
      { nome: "Ana Souza", email: "ana.souza@example.com", githubLogin: "anasouza", papel: "pm", squadId: sqPag.id },
      { nome: "Bruno Lima", email: "bruno.lima@example.com", githubLogin: "brunolima", papel: "dev", squadId: sqPag.id },
      { nome: "Carlos Menezes", email: "carlos.menezes@example.com", githubLogin: "cmenezes", papel: "arquiteto", squadId: null },
      { nome: "Rubens Alves", email: "rubens.alves@example.com", githubLogin: "rubao", papel: "diretor", squadId: null },
      { nome: "Marina Costa", email: "marina.costa@example.com", githubLogin: "marinac", papel: "dev", squadId: sqPag.id },
    ])
    .returning();
  const [ana, bruno, , rubens] = pessoas;

  /* ---------- capacidades e repositórios ---------- */
  const caps = await db
    .insert(s.capacidade)
    .values([
      { squadId: sqPag.id, nome: "Split de pagamento", sigla: "SPL", descricao: "Divisão de valores entre marketplace e vendedores parceiros." },
      { squadId: sqPag.id, nome: "Repasses & liquidação", sigla: "RPS", descricao: "Agenda e liquidação de repasses aos lojistas." },
      { squadId: sqPag.id, nome: "Extrato do lojista", sigla: "EXT", descricao: "Visão consolidada de vendas, taxas e repasses." },
      { squadId: sqPag.id, nome: "Antifraude de transações", sigla: "AFR", descricao: "Score e regras de bloqueio em tempo real." },
      { squadId: sqPag.id, nome: "Conciliação de recebíveis", sigla: "CNC", descricao: "Bate de agenda de recebíveis com as bandeiras." },
    ])
    .returning();

  const repos = await db
    .insert(s.repositorio)
    .values([
      { squadId: sqPag.id, nome: "itau-mp/pag-split-service", linguagem: "Java", url: "https://github.example.com/itau-mp/pag-split-service" },
      { squadId: sqPag.id, nome: "itau-mp/pag-repasse-worker", linguagem: "Kotlin", url: "https://github.example.com/itau-mp/pag-repasse-worker" },
      { squadId: sqPag.id, nome: "itau-mp/pag-extrato-api", linguagem: "Node.js", url: "https://github.example.com/itau-mp/pag-extrato-api" },
      { squadId: sqPag.id, nome: "itau-mp/pag-web-portal", linguagem: "TypeScript", url: "https://github.example.com/itau-mp/pag-web-portal" },
    ])
    .returning();

  await db.insert(s.capacidadeRepositorio).values([
    { capacidadeId: caps[0].id, repositorioId: repos[0].id },
    { capacidadeId: caps[1].id, repositorioId: repos[1].id },
    { capacidadeId: caps[2].id, repositorioId: repos[2].id },
    { capacidadeId: caps[2].id, repositorioId: repos[3].id },
    { capacidadeId: caps[0].id, repositorioId: repos[3].id },
  ]);

  /* ---------- agentes, skills, tools, método ---------- */
  const agentes = await db
    .insert(s.agente)
    .values([
      { nome: "Agente Analista", papel: "Descoberta e brief", emoji: "🔍", nivelModelo: "intermediario", personalidade: "Curioso e estruturado. Faz as perguntas certas para transformar uma ideia vaga num brief acionável, sempre citando dados do domínio." },
      { nome: "Agente PM", papel: "PRD e priorização", emoji: "📋", nivelModelo: "avancado", personalidade: "Pragmático e orientado a valor. Escreve PRDs enxutos com métricas de sucesso claras e recorta escopo sem dó." },
      { nome: "Agente Arquiteto", papel: "Arquitetura e ADRs", emoji: "🏛️", nivelModelo: "avancado", personalidade: "Rigoroso com trade-offs. Propõe a arquitetura mais simples que atende os NFRs e registra decisões em ADRs." },
      { nome: "Agente SM", papel: "Histórias e planejamento", emoji: "🧩", nivelModelo: "intermediario", personalidade: "Metódico no slicing. Quebra o PRD em histórias INVEST com critérios de aceite testáveis e estima com a squad." },
      { nome: "Agente Dev", papel: "Código e PRs", emoji: "⌨️", nivelModelo: "avancado", personalidade: "Objetivo e idiomático. Implementa seguindo o blueprint da capacidade, abre PRs pequenos e nunca faz merge." },
      { nome: "Agente QA", papel: "Qualidade e gates", emoji: "🧪", nivelModelo: "intermediario", personalidade: "Cético construtivo. Cobre casos de borda, valida gates da esteira e prepara a evidência da GMUD." },
    ])
    .returning();
  const [agAnalista, agPm, agArq, agSm, agDev, agQa] = agentes;

  const skills = await db
    .insert(s.skill)
    .values([
      { nome: "Descoberta de produto", emoji: "🔍", descricao: "Perguntas de descoberta e síntese de brief", instrucoes: "Conduza a descoberta com perguntas abertas sobre problema, público e métrica de sucesso. Sintetize em um brief com objetivo, contexto e riscos." },
      { nome: "Escrita de PRD", emoji: "📋", descricao: "PRD enxuto com RF/NFR e métricas", instrucoes: "Estruture o PRD em objetivo, requisitos funcionais, NFRs e métricas de sucesso. Marque o que está fora de escopo explicitamente." },
      { nome: "Design de arquitetura", emoji: "🏛️", descricao: "Arquitetura, ADRs e trade-offs", instrucoes: "Avalie ao menos duas alternativas com trade-offs. Registre a decisão como ADR (contexto, decisão, consequências) e respeite os blueprints da plataforma." },
      { nome: "Slicing de histórias", emoji: "🧩", descricao: "Histórias INVEST com critérios de aceite", instrucoes: "Quebre o escopo em histórias INVEST de até 5 pontos, com critérios de aceite no formato dado/quando/então, e sincronize com o IU Click." },
      { nome: "Codegen & PR", emoji: "⌨️", descricao: "Implementação e abertura de PRs", instrucoes: "Implemente seguindo o padrão do repositório. Commits pequenos, PR com descrição do porquê. Nunca faça merge — humanos revisam." },
      { nome: "Qualidade & gates", emoji: "🧪", descricao: "Testes, gates de esteira e evidências", instrucoes: "Garanta cobertura dos fluxos críticos, rode os gates da esteira e monte a evidência exigida pela GMUD antes de propor a janela." },
    ])
    .returning();

  await db.insert(s.agenteSkill).values([
    { agenteId: agAnalista.id, skillId: skills[0].id },
    { agenteId: agPm.id, skillId: skills[1].id },
    { agenteId: agPm.id, skillId: skills[0].id },
    { agenteId: agArq.id, skillId: skills[2].id },
    { agenteId: agSm.id, skillId: skills[3].id },
    { agenteId: agDev.id, skillId: skills[4].id },
    { agenteId: agQa.id, skillId: skills[5].id },
  ]);

  const mcps = await db
    .insert(s.conexaoMcp)
    .values([
      { nome: "GitHub Enterprise", sistema: "github", descricao: "Repositórios, PRs e esteira" },
      { nome: "IU Click", sistema: "iuclick", descricao: "Comunidade, squads e histórias" },
      { nome: "Atlan", sistema: "atlan", descricao: "Metadados e classificação PII" },
      { nome: "ServiceNow", sistema: "servicenow", descricao: "GMUD (mudanças)" },
      { nome: "Catálogo de Sistemas", sistema: "catalogo", descricao: "Siglas e donos de sistemas" },
    ])
    .returning();

  const tools = await db
    .insert(s.tool)
    .values([
      { nome: "Ler repositório", permissao: "leitura", conexaoMcpId: mcps[0].id, descricao: "Lê código e histórico dos repositórios conectados" },
      { nome: "Abrir Pull Request", permissao: "escrita", conexaoMcpId: mcps[0].id, descricao: "Cria branch e abre PR — nunca faz merge" },
      { nome: "Sincronizar histórias", permissao: "escrita", conexaoMcpId: mcps[1].id, descricao: "Cria/atualiza histórias no IU Click" },
      { nome: "Consultar metadados", permissao: "leitura", conexaoMcpId: mcps[2].id, descricao: "Consulta classificação de dados e PII no Atlan" },
      { nome: "Abrir GMUD", permissao: "critica", conexaoMcpId: mcps[3].id, descricao: "Abre mudança no ServiceNow — exige checkpoint humano" },
      { nome: "Buscar sistema (sigla)", permissao: "leitura", conexaoMcpId: mcps[4].id, descricao: "Resolve sigla → sistema/dono no catálogo" },
      { nome: "Publicar documentação", permissao: "escrita", conexaoMcpId: null, descricao: "Publica documento no repositório de conhecimento" },
    ])
    .returning();

  await db.insert(s.agenteTool).values([
    { agenteId: agAnalista.id, toolId: tools[3].id },
    { agenteId: agAnalista.id, toolId: tools[5].id },
    { agenteId: agPm.id, toolId: tools[6].id },
    { agenteId: agArq.id, toolId: tools[0].id },
    { agenteId: agArq.id, toolId: tools[3].id },
    { agenteId: agArq.id, toolId: tools[6].id },
    { agenteId: agSm.id, toolId: tools[2].id },
    { agenteId: agDev.id, toolId: tools[0].id },
    { agenteId: agDev.id, toolId: tools[1].id },
    { agenteId: agQa.id, toolId: tools[0].id },
    { agenteId: agQa.id, toolId: tools[4].id },
  ]);

  const [bmad] = await db
    .insert(s.metodo)
    .values({ nome: "BMAD Method", versao: "v6", descricao: "Jornada padrão da diretoria: brief → PRD → arquitetura → histórias → desenvolvimento → esteira & GMUD, com um agente por etapa." })
    .returning();

  await db.insert(s.metodoEtapa).values([
    { metodoId: bmad.id, ordem: 1, nome: "Brief", agenteId: agAnalista.id, descricao: "Descoberta e alinhamento do problema" },
    { metodoId: bmad.id, ordem: 2, nome: "PRD", agenteId: agPm.id, descricao: "Objetivo, RF/NFR e métricas de sucesso" },
    { metodoId: bmad.id, ordem: 3, nome: "Arquitetura", agenteId: agArq.id, descricao: "Desenho, ADRs e mapeamento de repositórios" },
    { metodoId: bmad.id, ordem: 4, nome: "Histórias", agenteId: agSm.id, descricao: "Slicing INVEST e sync com IU Click" },
    { metodoId: bmad.id, ordem: 5, nome: "Desenvolvimento", agenteId: agDev.id, descricao: "Implementação assistida e PRs" },
    { metodoId: bmad.id, ordem: 6, nome: "Esteira & GMUD", agenteId: agQa.id, descricao: "Gates de qualidade e mudança", tipo: "checkpoint" },
  ]);

  await db.insert(s.blueprint).values([
    { nome: "Microserviço Java padrão", descricao: "Spring Boot + observabilidade + resiliência padrão da comunidade.", guardRails: ["Mascarar PII em logs e prompts", "Idempotência em toda operação financeira", "Circuit breaker nas integrações externas"] },
    { nome: "Worker de eventos Kafka", descricao: "Consumo com retry exponencial, DLQ e schema registry.", guardRails: ["Contrato validado no schema registry", "DLQ monitorada com alerta", "Reprocesso idempotente"] },
    { nome: "Frontend React padrão", descricao: "Design system da diretoria, telemetria e acessibilidade.", guardRails: ["Sem segredo no bundle", "CSP estrita", "Telemetria de erros obrigatória"] },
  ]);

  await db.insert(s.modeloIaRota).values([
    { tarefa: "arquitetura", nivel: "avancado", modelo: "modelo-avancado-v3", custoRelativo: 5 },
    { tarefa: "prd", nivel: "avancado", modelo: "modelo-avancado-v3", custoRelativo: 5 },
    { tarefa: "historias", nivel: "intermediario", modelo: "modelo-intermediario-v2", custoRelativo: 2 },
    { tarefa: "resumo", nivel: "intermediario", modelo: "modelo-intermediario-v2", custoRelativo: 2 },
    { tarefa: "classificacao", nivel: "leve", modelo: "modelo-leve-v2", custoRelativo: 0.5 },
    { tarefa: "sync", nivel: "leve", modelo: "modelo-leve-v2", custoRelativo: 0.5 },
  ]);

  /* ---------- iniciativas + jornada ---------- */
  const artefatoBrief = {
    titulo: "Brief aprovado",
    secoes: [
      { h: "Problema", itens: ["Marketplaces precisam dividir o valor de uma venda entre parceiros no momento da captura", "Hoje o split é manual via planilha, com erro médio de 2,3% nos repasses"] },
      { h: "Métrica de sucesso", itens: ["90% dos splits sem intervenção manual", "Erro de repasse < 0,1%"] },
    ],
  };
  const artefatoPrd = {
    titulo: "PRD — Split de pagamento",
    secoes: [
      { h: "Requisitos funcionais", itens: ["Regras de split por parceiro (percentual e valor fixo)", "Split na captura com estorno proporcional", "Extrato de repasses por vendedor"] },
      { h: "NFRs", itens: ["Liquidação D+1", "Idempotência ponta a ponta", "Auditoria completa de cada divisão"] },
    ],
  };

  const inis = await db
    .insert(s.iniciativa)
    .values([
      { codigo: "INI-142", squadId: sqPag.id, capacidadeId: caps[0].id, titulo: "Split de pagamento para marketplaces", descricao: "Dividir o valor de uma venda entre o marketplace e vendedores parceiros na captura.", etapaAtual: 3, criadoPor: ana.id },
      { codigo: "INI-138", squadId: sqPag.id, capacidadeId: caps[2].id, titulo: "Extrato de repasses em tempo real", descricao: "Lojista acompanha vendas, taxas e repasses sem esperar o fechamento do dia.", etapaAtual: 5, criadoPor: ana.id },
      { codigo: "INI-151", squadId: sqPag.id, capacidadeId: caps[0].id, titulo: "Configuração de regras de split por parceiro", descricao: "Self-service para o marketplace configurar percentuais e valores fixos por parceiro.", etapaAtual: 1, criadoPor: ana.id },
      { codigo: "INI-127", squadId: sqPag.id, capacidadeId: caps[3].id, titulo: "Antifraude com score em tempo real", descricao: "Score de risco na autorização com bloqueio automático acima do limiar.", status: "concluida", etapaAtual: 6, criadoPor: ana.id },
    ])
    .returning();
  const [iniSplit, iniExtrato, iniRegras, iniAntifraude] = inis;

  const etapaNomes = ["Brief", "PRD", "Arquitetura", "Histórias", "Desenvolvimento", "Esteira & GMUD"];
  const etapaAgentes = [agAnalista, agPm, agArq, agSm, agDev, agQa];
  const etapasValues: any[] = [];
  const pushEtapas = (ini: any, atual: number, artefatos: Record<number, any> = {}) => {
    for (let o = 1; o <= 6; o++) {
      etapasValues.push({
        iniciativaId: ini.id,
        ordem: o,
        nome: etapaNomes[o - 1],
        agenteId: etapaAgentes[o - 1].id,
        status: o < atual ? "concluida" : o === atual && ini.status !== "concluida" ? "em_andamento" : ini.status === "concluida" ? "concluida" : "pendente",
        artefato: artefatos[o] ?? null,
        concluidaEm: o < atual || ini.status === "concluida" ? new Date() : null,
      });
    }
  };
  pushEtapas(iniSplit, 3, { 1: artefatoBrief, 2: artefatoPrd });
  pushEtapas(iniExtrato, 5, { 1: { titulo: "Brief aprovado", secoes: [{ h: "Problema", itens: ["Extrato consolidado só fecha em D+1; lojista liga na central para saber o saldo do dia"] }] } });
  pushEtapas(iniRegras, 1);
  pushEtapas(iniAntifraude, 7);
  await db.insert(s.iniciativaEtapa).values(etapasValues);

  await db.insert(s.historia).values([
    { iniciativaId: iniExtrato.id, codigo: "PAG-2311", titulo: "Stream de eventos de captura no extrato", descricao: "Consumir eventos de captura e projetar no extrato em tempo real.", pontos: 5, status: "em_dev", responsavelId: bruno.id },
    { iniciativaId: iniExtrato.id, codigo: "PAG-2312", titulo: "Saldo do dia com taxas destacadas", descricao: "Endpoint de saldo intradiário com decomposição de taxas.", pontos: 3, status: "review", responsavelId: bruno.id },
    { iniciativaId: iniExtrato.id, codigo: "PAG-2313", titulo: "Webhook de repasse liquidado", descricao: "Notificar o lojista quando o repasse liquida.", pontos: 3, status: "backlog", responsavelId: null },
    { iniciativaId: iniSplit.id, codigo: "PAG-2290", titulo: "Modelo de regras de split", descricao: "Entidade de regra com percentual e valor fixo por parceiro.", pontos: 5, status: "backlog", responsavelId: null },
  ]);

  await db.insert(s.mensagemChat).values([
    { iniciativaId: iniSplit.id, etapaOrdem: 3, autor: "agente", autorNome: "Agente Arquiteto", conteudo: "Analisei os repositórios da capacidade Split de pagamento. Proponho isolar o split num serviço próprio (pag-split-service), com o portal consumindo via API. Registrei os trade-offs no ADR-017 — quer revisar?", tokens: 240 },
    { iniciativaId: iniSplit.id, etapaOrdem: 3, autor: "user", autorNome: "Ana Souza", conteudo: "Faz sentido. Como fica o estorno proporcional nesse desenho?", tokens: 0 },
    { iniciativaId: iniSplit.id, etapaOrdem: 3, autor: "agente", autorNome: "Agente Arquiteto", conteudo: "O estorno vira um evento de compensação: o serviço recalcula as parcelas do split original e emite ajustes com a mesma chave de idempotência da captura. Isso mantém a auditoria 1:1 com a transação.", tokens: 310 },
  ]);

  /* ---------- documentação ---------- */
  await db.insert(s.documento).values([
    { squadId: sqPag.id, iniciativaId: iniSplit.id, titulo: "PRD — Split de pagamento", tipo: "prd", emoji: "📋", autorNome: "Agente PM", resumo: "Objetivo, RF/NFR e métricas do split para marketplaces.", escopo: "squad", conteudo: "## Objetivo\nPermitir que marketplaces dividam o valor de uma venda entre parceiros na captura, sem intervenção manual.\n\n## Requisitos funcionais\n- Regras de split por parceiro (percentual e valor fixo)\n- Split aplicado na captura, com estorno proporcional\n- Extrato de repasses por vendedor\n\n## NFRs\n- Liquidação D+1\n- Idempotência ponta a ponta\n- Auditoria completa de cada divisão\n\n## Métricas de sucesso\n- 90% dos splits sem intervenção manual\n- Erro de repasse < 0,1%" },
    { squadId: sqPag.id, iniciativaId: iniSplit.id, titulo: "ADR-017 — Split como serviço isolado", tipo: "adr", emoji: "🏛️", autorNome: "Agente Arquiteto", resumo: "Decisão de isolar o split em serviço próprio.", escopo: "squad", conteudo: "## Contexto\nO cálculo de split estava acoplado ao fluxo de captura, dificultando evolução e auditoria.\n\n## Decisão\nIsolar o split no serviço pag-split-service, consumido via API síncrona na captura e eventos para liquidação.\n\n## Consequências\n- Auditoria e reprocesso independentes\n- Um salto de rede a mais na captura (mitigado com timeout curto + fallback)\n- Estorno modelado como evento de compensação com a mesma chave de idempotência" },
    { squadId: sqPag.id, iniciativaId: iniExtrato.id, titulo: "API — Extrato de repasses v2", tipo: "api", emoji: "🔌", autorNome: "Bruno Lima", resumo: "Contrato da API de extrato em tempo real.", escopo: "squad", conteudo: "## Endpoints\n- GET /extrato/{lojista}/saldo — saldo intradiário com decomposição de taxas\n- GET /extrato/{lojista}/eventos — stream paginado de capturas, taxas e repasses\n- POST /webhooks/repasse-liquidado — assinatura de notificação\n\n## Convenções\n- Paginação por cursor\n- Idempotency-Key obrigatória em webhooks\n- Valores sempre em centavos (integer)" },
    { squadId: sqPag.id, titulo: "Guia de onboarding da squad", tipo: "guia", emoji: "🧭", autorNome: "Ana Souza", resumo: "Primeiros 3 dias na Squad Pagamentos.", escopo: "squad", conteudo: "## Dia 1 — contexto\nLeia o mapa de capacidades e o último PRD ativo. Peça acesso aos repositórios da squad.\n\n## Dia 2 — ambiente\nSuba o pag-extrato-api local e rode a esteira em um PR de teste.\n\n## Dia 3 — primeira entrega\nPegue uma história `good-first` no IU Click e acompanhe o fluxo completo até a esteira." },
    { squadId: sqPag.id, iniciativaId: iniAntifraude.id, titulo: "Post-mortem — rollback CHG0047820", tipo: "postmortem", emoji: "🩹", autorNome: "Agente QA", resumo: "Rollback do score em tempo real por timeout na autorização.", escopo: "release_train", conteudo: "## O que houve\nO score em tempo real elevou o p99 da autorização acima do SLA e a GMUD CHG0047820 foi revertida.\n\n## Causa raiz\nChamada síncrona ao serviço de score sem circuit breaker; degradação do provedor externo propagou.\n\n## Ações\n- Circuit breaker com fallback para score assíncrono\n- Gate de latência na esteira antes de nova janela\n- Alerta de p99 por endpoint" },
    { titulo: "Padrões de Arquitetura da Comunidade", tipo: "guia", emoji: "🏛️", autorNome: "Carlos Menezes", resumo: "Blueprints e padrões herdados por todas as squads.", escopo: "comunidade", conteudo: "## Blueprints ativos\n- Microserviço Java padrão\n- Worker de eventos Kafka\n- Frontend React padrão\n\n## Regras transversais\n- PII mascarada por padrão em logs e prompts de IA\n- Idempotência obrigatória em operação financeira\n- Toda mudança de produção via GMUD com evidência da esteira" },
  ]);

  /* ---------- base de conhecimento ---------- */
  const artigos = await db
    .insert(s.kbArtigo)
    .values([
      { escopo: "comunidade", titulo: "Padrão de idempotência em operações financeiras", resumo: "Chave de idempotência, janela de deduplicação e reprocesso seguro.", autorId: bruno.id, autorNome: "Bruno Lima", conteudo: "## Padrão\nToda operação financeira recebe uma Idempotency-Key derivada do evento de negócio (ex.: `captura:{id}:split`).\n\n## Regras\n- Janela de deduplicação de 7 dias\n- Reprocesso sempre idempotente (verificar estado antes de efeito externo)\n- A mesma chave em retry deve retornar a resposta original" },
      { escopo: "squad", squadId: sqPag.id, titulo: "Erros comuns no contrato Kafka de captura", resumo: "Armadilhas do schema de eventos de captura e como evitá-las.", autorId: bruno.id, autorNome: "Bruno Lima", conteudo: "## Armadilhas\n- `amount` é em centavos; consumir como decimal quebra a conciliação\n- Eventos de estorno chegam fora de ordem: projetar por versão, não por timestamp\n- O campo `merchant_id` muda de formato entre adquirentes — normalizar na entrada" },
      { escopo: "release_train", squadId: sqPag.id, titulo: "Checklist de PII antes de abrir GMUD", resumo: "O que verificar de dados pessoais antes de qualquer mudança.", autorId: ana.id, autorNome: "Ana Souza", conteudo: "## Checklist\n1. Classificação Atlan atualizada para as tabelas tocadas\n2. Logs novos sem CPF/PAN em claro\n3. Prompts de IA com mascaramento ativo\n4. Evidência anexada à GMUD" },
      { escopo: "comunidade", titulo: "Convenções de GMUD & janelas", resumo: "Janelas padrão, risco e evidências mínimas por tipo de mudança.", autorId: ana.id, autorNome: "Ana Souza", conteudo: "## Janelas\n- Padrão: terça e quinta, 22h–00h\n- Emergencial: sob aprovação do coordenador\n\n## Evidências mínimas\n- Esteira verde completa\n- Plano de rollback testado\n- Checklist de PII" },
    ])
    .returning();

  const [carlos] = pessoas.filter((p: any) => p.papel === "arquiteto");
  await db.insert(s.kbEndosso).values([
    { artigoId: artigos[0].id, pessoaId: carlos.id, nivel: "comunidade" },
    { artigoId: artigos[3].id, pessoaId: carlos.id, nivel: "comunidade" },
    { artigoId: artigos[2].id, pessoaId: carlos.id, nivel: "release_train" },
  ]);

  /* ---------- OKRs ---------- */
  const [okrCom] = await db
    .insert(s.okr)
    .values({ escopo: "comunidade", objetivo: "Ser a plataforma de pagamentos mais confiável e rentável do mercado", dono: "Diretoria de Meios de Pagamento", trimestre: "2026-Q3" })
    .returning();
  const [okrRt] = await db
    .insert(s.okr)
    .values({ escopo: "release_train", releaseTrainId: rtAdq.id, objetivo: "Dobrar o volume de marketplaces sem crescer a operação", dono: "RT Adquirência", trimestre: "2026-Q3", paiId: okrCom.id })
    .returning();
  const [okrSq] = await db
    .insert(s.okr)
    .values({ escopo: "squad", squadId: sqPag.id, objetivo: "Tornar o split de pagamento self-service e confiável", dono: "Ana Souza", trimestre: "2026-Q3", paiId: okrRt.id })
    .returning();

  const krs = await db
    .insert(s.keyResult)
    .values([
      { okrId: okrSq.id, ordem: 1, descricao: "Reduzir chamados de repasse na operação", unidade: "chamados/mês", baseline: 480, meta: 120, invertido: true },
      { okrId: okrSq.id, ordem: 2, descricao: "Splits liquidados em D+1", unidade: "%", baseline: 62, meta: 95 },
      { okrId: okrSq.id, ordem: 3, descricao: "Lojistas usando o extrato em tempo real / mês", unidade: "lojistas", baseline: 0, meta: 8000 },
      { okrId: okrRt.id, ordem: 1, descricao: "Marketplaces ativos na plataforma", unidade: "marketplaces", baseline: 45, meta: 90 },
      { okrId: okrCom.id, ordem: 1, descricao: "NPS de lojistas da plataforma", unidade: "pontos", baseline: 41, meta: 60 },
    ])
    .returning();

  const med = (krId: string, rows: [string, number | null, number | null][]) =>
    rows.map(([mes, planejado, realizado]) => ({ krId, mes, planejado, realizado }));
  await db.insert(s.krMedicao).values([
    ...med(krs[0].id, [["2026-04", 420, 455], ["2026-05", 340, 380], ["2026-06", 260, 265], ["2026-07", 200, 210], ["2026-08", 150, null], ["2026-09", 120, null]]),
    ...med(krs[1].id, [["2026-04", 68, 66], ["2026-05", 75, 74], ["2026-06", 82, 84], ["2026-07", 88, 87], ["2026-08", 92, null], ["2026-09", 95, null]]),
    ...med(krs[2].id, [["2026-04", 500, 320], ["2026-05", 1500, 1100], ["2026-06", 3000, 2650], ["2026-07", 4500, 4820], ["2026-08", 6500, null], ["2026-09", 8000, null]]),
  ]);

  await db.insert(s.krFeature).values([
    { krId: krs[0].id, iniciativaId: iniSplit.id },
    { krId: krs[1].id, iniciativaId: iniSplit.id },
    { krId: krs[2].id, iniciativaId: iniExtrato.id },
    { krId: krs[0].id, iniciativaId: iniRegras.id },
  ]);

  /* ---------- esteira, GMUD, PRs ---------- */
  await db.insert(s.execucaoEsteira).values([
    { squadId: sqPag.id, iniciativaId: iniExtrato.id, repositorio: "itau-mp/pag-extrato-api", etapa: "build", status: "ok" },
    { squadId: sqPag.id, iniciativaId: iniExtrato.id, repositorio: "itau-mp/pag-extrato-api", etapa: "testes", status: "ok", detalhe: "412 testes · cobertura 87%" },
    { squadId: sqPag.id, iniciativaId: iniExtrato.id, repositorio: "itau-mp/pag-extrato-api", etapa: "seguranca", status: "em_execucao", detalhe: "SAST + análise de dependências" },
    { squadId: sqPag.id, iniciativaId: iniExtrato.id, repositorio: "itau-mp/pag-extrato-api", etapa: "deploy_hml", status: "pendente" },
    { squadId: sqPag.id, iniciativaId: iniExtrato.id, repositorio: "itau-mp/pag-extrato-api", etapa: "gmud", status: "pendente" },
  ]);

  await db.insert(s.gmud).values([
    { squadId: sqPag.id, iniciativaId: iniExtrato.id, numero: "CHG0048231", titulo: "Extrato de repasses em tempo real — rollout 1ª onda", status: "aguardando_aprovacao", risco: "medio", janela: "2026-07-15 22:00" },
    { squadId: sqPag.id, iniciativaId: iniAntifraude.id, numero: "CHG0048104", titulo: "Score em tempo real — reativação com circuit breaker", status: "executada", risco: "medio", janela: "2026-06-24 22:00" },
    { squadId: sqPag.id, iniciativaId: iniAntifraude.id, numero: "CHG0047988", titulo: "Ajuste de limiar de bloqueio antifraude", status: "executada", risco: "baixo", janela: "2026-06-10 22:00" },
    { squadId: sqPag.id, iniciativaId: iniAntifraude.id, numero: "CHG0047820", titulo: "Antifraude com score em tempo real — 1ª tentativa", status: "rollback", risco: "alto", janela: "2026-05-28 22:00" },
  ]);

  await db.insert(s.pullRequest).values([
    { repositorioId: repos[2].id, iniciativaId: iniExtrato.id, numero: 482, titulo: "feat: stream de eventos de captura no extrato (PAG-2311)", autorNome: "Bruno Lima", status: "aberto" },
    { repositorioId: repos[2].id, iniciativaId: iniExtrato.id, numero: 479, titulo: "feat: saldo intradiário com decomposição de taxas (PAG-2312)", autorNome: "Agente Dev", status: "aprovado" },
    { repositorioId: repos[3].id, iniciativaId: iniExtrato.id, numero: 218, titulo: "feat: tela de extrato em tempo real", autorNome: "Marina Costa", status: "merged" },
  ]);

  /* ---------- execução autônoma (um run aguardando decisão) ---------- */
  const [run] = await db
    .insert(s.execucaoAutonoma)
    .values({ squadId: sqPag.id, krId: krs[0].id, objetivo: "Reduzir chamados de repasse: preparar a iniciativa de regras de split self-service", status: "aguardando_aprovacao", passoAtual: 4, tokensGastos: 48210, criadoPor: ana.id })
    .returning();

  await db.insert(s.execucaoPasso).values([
    { execucaoId: run.id, ordem: 1, nome: "Analisar KR e histórico de chamados", agenteNome: "Agente Analista", status: "concluido", saida: { resumo: "72% dos chamados de repasse vêm de marketplaces ajustando percentuais manualmente por planilha.", itens: ["480 chamados/mês na operação", "Top 3 causas mapeadas"] }, concluidoEm: new Date() },
    { execucaoId: run.id, ordem: 2, nome: "Mapear capacidades e repositórios envolvidos", agenteNome: "Agente Arquiteto", status: "concluido", saida: { resumo: "Capacidade Split de pagamento; repositórios pag-split-service e pag-web-portal.", itens: ["Sem dependência de outras squads"] }, concluidoEm: new Date() },
    { execucaoId: run.id, ordem: 3, nome: "Gerar PRD preliminar", agenteNome: "Agente PM", status: "concluido", saida: { resumo: "PRD com self-service de regras, simulação de split e trilha de auditoria.", itens: ["3 RFs, 4 NFRs", "Métrica: -60% de chamados em 2 meses"] }, concluidoEm: new Date() },
    { execucaoId: run.id, ordem: 4, nome: "Checkpoint: aprovar PRD e escopo", agenteNome: null, tipo: "checkpoint", status: "aguardando" },
    { execucaoId: run.id, ordem: 5, nome: "Criar histórias no IU Click", agenteNome: "Agente SM", status: "pendente" },
    { execucaoId: run.id, ordem: 6, nome: "Preparar branch e esqueleto no repositório", agenteNome: "Agente Dev", status: "pendente" },
  ]);

  await db.insert(s.execucaoCheckpoint).values({
    execucaoId: run.id,
    passoOrdem: 4,
    titulo: "Aprovar PRD e escopo da iniciativa",
    resumo: "O Agente PM gerou o PRD preliminar de regras de split self-service (3 RFs, 4 NFRs). Aprovar libera a criação de histórias no IU Click e o esqueleto no repositório.",
  });

  /* ---------- consumo ---------- */
  await db.insert(s.consumoTokens).values([
    { squadId: squads[0].id, mes: MES_ATUAL, promptTokens: 1_240_000, completionTokens: 310_000, custo: 812.4 },
    { squadId: squads[1].id, mes: MES_ATUAL, promptTokens: 420_000, completionTokens: 98_000, custo: 261.1 },
    { squadId: squads[2].id, mes: MES_ATUAL, promptTokens: 830_000, completionTokens: 205_000, custo: 540.7 },
    { squadId: squads[3].id, mes: MES_ATUAL, promptTokens: 310_000, completionTokens: 74_000, custo: 195.2 },
    { squadId: squads[4].id, mes: MES_ATUAL, promptTokens: 1_020_000, completionTokens: 260_000, custo: 668.9 },
    { squadId: squads[5].id, mes: MES_ATUAL, promptTokens: 380_000, completionTokens: 91_000, custo: 240.6 },
  ]);

  await db.insert(s.auditLog).values([
    { pessoaId: ana.id, pessoaNome: "Ana Souza", acao: "iniciar_run", alvo: `run:${run.id}`, detalhe: { kr: "KR1 · Reduzir chamados de repasse" } },
    { pessoaId: carlos.id, pessoaNome: "Carlos Menezes", acao: "endossar_kb", alvo: "kb:Padrão de idempotência", detalhe: { nivel: "comunidade" } },
  ]);

  console.log("[seed] Banco de demonstração populado.");
}
