import * as s from "./schema";

// Provisionamento do CATÁLOGO da plataforma (agentes, skills, tools, MCPs,
// método BMAD, blueprints, rotas de modelo). NÃO cria dados de negócio —
// comunidade, squads, pessoas, iniciativas e OKRs nascem do cadastro e do
// onboarding do próprio usuário. Idempotente: só provisiona se vazio.

export async function seedIfEmpty(db: any) {
  const existing = await db.select().from(s.agente).limit(1);
  if (existing.length > 0) return;

  /* ---------- agentes ---------- */
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
      { nome: "Slicing de histórias", emoji: "🧩", descricao: "Histórias INVEST com critérios de aceite", instrucoes: "Quebre o escopo em histórias INVEST de até 5 pontos, com critérios de aceite no formato dado/quando/então, e sincronize com o backlog." },
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
      { nome: "Backlog", sistema: "backlog", descricao: "Histórias e planejamento" },
      { nome: "Catálogo de dados", sistema: "atlan", descricao: "Metadados e classificação PII" },
      { nome: "Gestão de mudança", sistema: "servicenow", descricao: "GMUD (mudanças)" },
      { nome: "Catálogo de Sistemas", sistema: "catalogo", descricao: "Siglas e donos de sistemas" },
    ])
    .returning();

  const tools = await db
    .insert(s.tool)
    .values([
      { nome: "Ler repositório", permissao: "leitura", conexaoMcpId: mcps[0].id, descricao: "Lê código e histórico dos repositórios conectados" },
      { nome: "Abrir Pull Request", permissao: "escrita", conexaoMcpId: mcps[0].id, descricao: "Cria branch e abre PR — nunca faz merge" },
      { nome: "Sincronizar histórias", permissao: "escrita", conexaoMcpId: mcps[1].id, descricao: "Cria/atualiza histórias no backlog" },
      { nome: "Consultar metadados", permissao: "leitura", conexaoMcpId: mcps[2].id, descricao: "Consulta classificação de dados e PII" },
      { nome: "Abrir GMUD", permissao: "critica", conexaoMcpId: mcps[3].id, descricao: "Abre mudança — exige checkpoint humano" },
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

  // Método NÃO entra no catálogo: é criado pelo CTO no onboarding (institucional).

  await db.insert(s.blueprint).values([
    { nome: "Microserviço Java padrão", descricao: "Spring Boot + observabilidade + resiliência padrão.", guardRails: ["Mascarar PII em logs e prompts", "Idempotência em toda operação financeira", "Circuit breaker nas integrações externas"] },
    { nome: "Worker de eventos", descricao: "Consumo com retry exponencial, DLQ e schema registry.", guardRails: ["Contrato validado no schema registry", "DLQ monitorada com alerta", "Reprocesso idempotente"] },
    { nome: "Frontend React padrão", descricao: "Design system, telemetria e acessibilidade.", guardRails: ["Sem segredo no bundle", "CSP estrita", "Telemetria de erros obrigatória"] },
  ]);

  // Modelos reais roteáveis pelo gateway (contrato OpenAI); ajustáveis no Console.
  await db.insert(s.modeloIaRota).values([
    { tarefa: "arquitetura", nivel: "avancado", modelo: "gpt-4.1", custoRelativo: 5 },
    { tarefa: "prd", nivel: "avancado", modelo: "gpt-4.1", custoRelativo: 5 },
    { tarefa: "historias", nivel: "intermediario", modelo: "gpt-4o", custoRelativo: 2 },
    { tarefa: "resumo", nivel: "intermediario", modelo: "gpt-4o", custoRelativo: 2 },
    { tarefa: "classificacao", nivel: "leve", modelo: "gpt-4o-mini", custoRelativo: 0.5 },
    { tarefa: "sync", nivel: "leve", modelo: "gpt-4o-mini", custoRelativo: 0.5 },
  ]);

  console.log("[seed] Catálogo da plataforma provisionado.");
}
