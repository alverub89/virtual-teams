import {
  pgSchema,
  text,
  timestamp,
  uuid,
  integer,
  real,
  boolean,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Schema `ai_workspace`. Espelha o modelo da spec; quando o
// ai_workspace_schema.sql canônico for fornecido, este arquivo converge
// para ele (ver db/migrations/README.md).
export const aiWorkspace = pgSchema("ai_workspace");

/* ---------- estrutura organizacional ---------- */

export const comunidade = aiWorkspace.table("comunidade", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  donoId: uuid("dono_id"), // CTO dono deste tenant (app-enforced, sem FK circular)
  githubToken: text("github_token"), // PAT p/ ler repositórios (mapa de capacidades) — Bearer
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

// Mapa de capacidades da squad — arquitetura de negócio (fluxo de valor →
// capacidades L1/L2 → repositórios) gerada por IA lendo os repos. Cada linha é
// uma VERSÃO (foto no tempo): mostra o sistema evoluindo.
export const mapaCapacidade = aiWorkspace.table("mapa_capacidade", {
  id: uuid("id").primaryKey().defaultRandom(),
  squadId: uuid("squad_id").notNull(),
  versao: integer("versao").notNull().default(1),
  status: text("status").notNull().default("analisando"), // analisando|pronto|erro
  progresso: text("progresso"), // texto do passo atual (para o aviso "analisando…")
  motivo: text("motivo"), // inicial | regeneracao | impacto:<repo>
  conteudo: jsonb("conteudo").$type<Record<string, unknown> | null>(), // { fluxosValor, capacidades, resumo }
  reposAnalisados: jsonb("repos_analisados").$type<string[]>().notNull().default([]),
  impacto: jsonb("impacto").$type<Record<string, unknown> | null>(), // avaliação de impacto (reavaliação)
  criadoPor: uuid("criado_por"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  concluidoEm: timestamp("concluido_em", { withTimezone: true }),
});

export const releaseTrain = aiWorkspace.table("release_train", {
  id: uuid("id").primaryKey().defaultRandom(),
  comunidadeId: uuid("comunidade_id").notNull().references(() => comunidade.id),
  nome: text("nome").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const squad = aiWorkspace.table("squad", {
  id: uuid("id").primaryKey().defaultRandom(),
  releaseTrainId: uuid("release_train_id").notNull().references(() => releaseTrain.id),
  nome: text("nome").notNull(),
  budgetTokensMes: integer("budget_tokens_mes"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const pessoa = aiWorkspace.table(
  "pessoa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: text("nome").notNull(),
    email: text("email").notNull(),
    senhaHash: text("senha_hash"), // cadastro por email/senha (scrypt)
    githubLogin: text("github_login"),
    papel: text("papel").notNull(), // cto|pm|tech_lead|dev|gestao
    comunidadeId: uuid("comunidade_id"), // tenant (app-enforced)
    squadId: uuid("squad_id").references(() => squad.id),
    onboardingConcluido: boolean("onboarding_concluido").notNull().default(false),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pessoa_email_uq").on(t.email)]
);

export const convite = aiWorkspace.table(
  "convite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    comunidadeId: uuid("comunidade_id").notNull(),
    squadId: uuid("squad_id"), // null para papel gestao
    email: text("email").notNull(),
    papel: text("papel").notNull(), // pm|tech_lead|dev|gestao
    token: text("token").notNull(),
    status: text("status").notNull().default("pendente"), // pendente|aceito|cancelado
    convidadoPor: uuid("convidado_por"),
    convidadoNome: text("convidado_nome"),
    emailEnviado: boolean("email_enviado").notNull().default(false),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    aceitoEm: timestamp("aceito_em", { withTimezone: true }),
  },
  (t) => [uniqueIndex("convite_token_uq").on(t.token)]
);

export const sessao = aiWorkspace.table("sessao", {
  id: uuid("id").primaryKey().defaultRandom(),
  pessoaId: uuid("pessoa_id").notNull().references(() => pessoa.id),
  refreshToken: text("refresh_token").notNull(),
  expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- capacidades e repositórios ---------- */

export const capacidade = aiWorkspace.table("capacidade", {
  id: uuid("id").primaryKey().defaultRandom(),
  squadId: uuid("squad_id").notNull().references(() => squad.id),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  sigla: text("sigla"), // sigla do sistema no catálogo (CMDB)
  // Base de capacidades (arquitetura de negócio) — usada em outros lugares.
  nivel: integer("nivel").notNull().default(1), // 1 (macro) | 2 (sub)
  pai: text("pai"), // nome da capacidade L1 pai (quando nivel 2)
  fluxoValor: text("fluxo_valor"),
  repos: jsonb("repos").$type<string[]>().notNull().default([]),
  origem: text("origem").notNull().default("manual"), // manual | ia
});

export const repositorio = aiWorkspace.table("repositorio", {
  id: uuid("id").primaryKey().defaultRandom(),
  squadId: uuid("squad_id").notNull().references(() => squad.id),
  nome: text("nome").notNull(), // org/repo
  url: text("url"),
  linguagem: text("linguagem"),
});

export const capacidadeRepositorio = aiWorkspace.table("capacidade_repositorio", {
  id: uuid("id").primaryKey().defaultRandom(),
  capacidadeId: uuid("capacidade_id").notNull().references(() => capacidade.id),
  repositorioId: uuid("repositorio_id").notNull().references(() => repositorio.id),
});

/* ---------- método e agentes ---------- */

export const metodo = aiWorkspace.table("metodo", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  versao: text("versao").notNull(),
  descricao: text("descricao"),
  escopo: text("escopo").notNull().default("publico"), // publico|comunidade
  comunidadeId: uuid("comunidade_id"),
  ativo: boolean("ativo").notNull().default(true),
});

export const agente = aiWorkspace.table("agente", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  papel: text("papel").notNull(), // descrição curta do papel
  emoji: text("emoji"),
  personalidade: text("personalidade").notNull(),
  nivelModelo: text("nivel_modelo").notNull().default("intermediario"),
  maxTokens: integer("max_tokens").notNull().default(4096),
  ativo: boolean("ativo").notNull().default(true),
});

export const metodoEtapa = aiWorkspace.table("metodo_etapa", {
  id: uuid("id").primaryKey().defaultRandom(),
  metodoId: uuid("metodo_id").notNull().references(() => metodo.id),
  ordem: integer("ordem").notNull(),
  nome: text("nome").notNull(),
  agenteId: uuid("agente_id").references(() => agente.id),
  tipo: text("tipo").notNull().default("automatica"), // automatica|checkpoint
  descricao: text("descricao"),
});

export const skill = aiWorkspace.table("skill", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  emoji: text("emoji"),
  descricao: text("descricao"),
  instrucoes: text("instrucoes").notNull(),
});

export const agenteSkill = aiWorkspace.table("agente_skill", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenteId: uuid("agente_id").notNull().references(() => agente.id),
  skillId: uuid("skill_id").notNull().references(() => skill.id),
});

export const conexaoMcp = aiWorkspace.table("conexao_mcp", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  sistema: text("sistema").notNull(),
  status: text("status").notNull().default("configurado"), // configurado|conectado|erro|desativado
  descricao: text("descricao"),
  url: text("url"),
  escopo: text("escopo").notNull().default("global"), // global|squad
  squadId: uuid("squad_id"),
  comunidadeId: uuid("comunidade_id"),
  slug: text("slug"), // endpoint vivo: /mcp/:slug (único quando gerado pela plataforma)
  proposito: text("proposito"), // o que este MCP entrega, para a IA compor o manifesto
  geradoEm: timestamp("gerado_em", { withTimezone: true }), // quando a IA gerou o manifesto+handlers
  // Governança: squad cria (rascunho) → publica (pendente) → CTO aprova/rejeita.
  aprovacao: text("aprovacao").notNull().default("aprovado"), // rascunho|pendente|aprovado|rejeitado
  criadoPor: uuid("criado_por"),
  submetidoEm: timestamp("submetido_em", { withTimezone: true }),
  motivoRejeicao: text("motivo_rejeicao"),
  token: text("token"), // credencial p/ conectar a um MCP remoto (ex.: PAT da Netlify) — enviada como Bearer
});

export const tool = aiWorkspace.table("tool", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  permissao: text("permissao").notNull(), // leitura|escrita|critica
  conexaoMcpId: uuid("conexao_mcp_id").references(() => conexaoMcp.id),
  execucao: text("execucao").notNull().default("ia"), // ia|http — como a tool roda quando chamada
  parametros: text("parametros"), // descrição em linguagem natural dos parâmetros (fonte p/ a IA gerar o schema)
  inputSchema: jsonb("input_schema").$type<Record<string, unknown>>(), // JSON Schema gerado p/ tools/list
  handlerConfig: jsonb("handler_config").$type<Record<string, unknown>>(), // ia: {prompt}; http: {metodo,url,headers,body}
  comunidadeId: uuid("comunidade_id"),
  squadId: uuid("squad_id"), // tool criada por uma squad
  aprovacao: text("aprovacao").notNull().default("aprovado"), // rascunho|pendente|aprovado|rejeitado
  criadoPor: uuid("criado_por"),
  submetidoEm: timestamp("submetido_em", { withTimezone: true }),
  motivoRejeicao: text("motivo_rejeicao"),
});

export const agenteTool = aiWorkspace.table("agente_tool", {
  id: uuid("id").primaryKey().defaultRandom(),
  agenteId: uuid("agente_id").notNull().references(() => agente.id),
  toolId: uuid("tool_id").notNull().references(() => tool.id),
});

export const blueprint = aiWorkspace.table("blueprint", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  guardRails: jsonb("guard_rails").$type<string[]>().notNull().default([]),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const modeloIaRota = aiWorkspace.table("modelo_ia_rota", {
  id: uuid("id").primaryKey().defaultRandom(),
  tarefa: text("tarefa").notNull(),
  nivel: text("nivel").notNull(), // avancado|intermediario|leve
  modelo: text("modelo").notNull(),
  custoRelativo: real("custo_relativo").notNull().default(1),
});

/* ---------- iniciativas e jornada ---------- */

export const iniciativa = aiWorkspace.table(
  "iniciativa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codigo: text("codigo").notNull(),
    squadId: uuid("squad_id").notNull().references(() => squad.id),
    capacidadeId: uuid("capacidade_id").references(() => capacidade.id),
    titulo: text("titulo").notNull(),
    descricao: text("descricao"),
    status: text("status").notNull().default("em_andamento"), // em_andamento|concluida|pausada
    etapaAtual: integer("etapa_atual").notNull().default(1),
    criadoPor: uuid("criado_por").references(() => pessoa.id),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("iniciativa_codigo_uq").on(t.codigo)]
);

export const iniciativaEtapa = aiWorkspace.table(
  "iniciativa_etapa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    iniciativaId: uuid("iniciativa_id").notNull().references(() => iniciativa.id),
    ordem: integer("ordem").notNull(),
    nome: text("nome").notNull(),
    agenteId: uuid("agente_id").references(() => agente.id),
    status: text("status").notNull().default("pendente"), // pendente|em_andamento|concluida
    artefato: jsonb("artefato").$type<{ titulo: string; secoes: { h: string; itens: string[] }[] } | null>(),
    concluidaEm: timestamp("concluida_em", { withTimezone: true }),
  },
  (t) => [uniqueIndex("iniciativa_etapa_uq").on(t.iniciativaId, t.ordem)]
);

export const historia = aiWorkspace.table("historia", {
  id: uuid("id").primaryKey().defaultRandom(),
  iniciativaId: uuid("iniciativa_id").notNull().references(() => iniciativa.id),
  codigo: text("codigo").notNull(), // ex.: PAG-2311 (IU Click)
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  pontos: integer("pontos"),
  status: text("status").notNull().default("backlog"), // backlog|em_dev|review|concluida
  responsavelId: uuid("responsavel_id").references(() => pessoa.id),
});

export const mensagemChat = aiWorkspace.table("mensagem_chat", {
  id: uuid("id").primaryKey().defaultRandom(),
  iniciativaId: uuid("iniciativa_id").notNull().references(() => iniciativa.id),
  etapaOrdem: integer("etapa_ordem").notNull(),
  autor: text("autor").notNull(), // user|agente
  autorNome: text("autor_nome").notNull(),
  conteudo: text("conteudo").notNull(),
  tokens: integer("tokens").notNull().default(0),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- documentação e KB ---------- */

export const documento = aiWorkspace.table("documento", {
  id: uuid("id").primaryKey().defaultRandom(),
  squadId: uuid("squad_id").references(() => squad.id),
  iniciativaId: uuid("iniciativa_id").references(() => iniciativa.id),
  titulo: text("titulo").notNull(),
  tipo: text("tipo").notNull().default("doc"), // prd|adr|api|guia|postmortem|doc
  emoji: text("emoji"),
  resumo: text("resumo"),
  conteudo: text("conteudo").notNull(), // markdown
  autorNome: text("autor_nome").notNull(),
  escopo: text("escopo").notNull().default("squad"), // squad|release_train|comunidade
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const kbArtigo = aiWorkspace.table("kb_artigo", {
  id: uuid("id").primaryKey().defaultRandom(),
  escopo: text("escopo").notNull().default("squad"),
  squadId: uuid("squad_id").references(() => squad.id),
  titulo: text("titulo").notNull(),
  resumo: text("resumo"),
  conteudo: text("conteudo").notNull(),
  autorId: uuid("autor_id").references(() => pessoa.id),
  autorNome: text("autor_nome").notNull(),
  // Geração de KB a partir de repositório (documentação para contexto).
  status: text("status").notNull().default("pronto"), // pronto|gerando|erro
  progresso: text("progresso"),
  origem: text("origem").notNull().default("manual"), // manual|ia
  repo: text("repo"), // owner/repo documentado (quando origem = ia)
  tipoDoc: text("tipo_doc"), // funcional|tecnico|dados|api|operacao (docs de repo)
  editadoPor: uuid("editado_por"),
  editadoNome: text("editado_nome"),
  editadoEm: timestamp("editado_em", { withTimezone: true }),
  // Checklist de leitura planejado pela IA (o que ler no repo) + progresso.
  plano: jsonb("plano").$type<{ path: string; motivo: string; lido: boolean }[] | null>(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const kbEndosso = aiWorkspace.table("kb_endosso", {
  id: uuid("id").primaryKey().defaultRandom(),
  artigoId: uuid("artigo_id").notNull().references(() => kbArtigo.id),
  pessoaId: uuid("pessoa_id").notNull().references(() => pessoa.id),
  nivel: text("nivel").notNull(), // release_train|comunidade
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- OKRs ---------- */

export const okr = aiWorkspace.table("okr", {
  id: uuid("id").primaryKey().defaultRandom(),
  escopo: text("escopo").notNull(), // comunidade|release_train|squad
  squadId: uuid("squad_id").references(() => squad.id),
  releaseTrainId: uuid("release_train_id").references(() => releaseTrain.id),
  objetivo: text("objetivo").notNull(),
  dono: text("dono"),
  trimestre: text("trimestre").notNull(),
  paiId: uuid("pai_id"),
});

export const keyResult = aiWorkspace.table("key_result", {
  id: uuid("id").primaryKey().defaultRandom(),
  okrId: uuid("okr_id").notNull().references(() => okr.id),
  ordem: integer("ordem").notNull().default(1),
  descricao: text("descricao").notNull(),
  unidade: text("unidade").notNull().default("%"), // %|numero|dias
  baseline: real("baseline").notNull().default(0),
  meta: real("meta").notNull(),
  invertido: boolean("invertido").notNull().default(false), // true = menor é melhor
});

export const krMedicao = aiWorkspace.table(
  "kr_medicao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    krId: uuid("kr_id").notNull().references(() => keyResult.id),
    mes: text("mes").notNull(), // YYYY-MM
    planejado: real("planejado"),
    realizado: real("realizado"),
  },
  (t) => [uniqueIndex("kr_medicao_uq").on(t.krId, t.mes)]
);

export const krFeature = aiWorkspace.table("kr_feature", {
  id: uuid("id").primaryKey().defaultRandom(),
  krId: uuid("kr_id").notNull().references(() => keyResult.id),
  iniciativaId: uuid("iniciativa_id").notNull().references(() => iniciativa.id),
});

/* ---------- esteira, GMUD, PRs ---------- */

export const execucaoEsteira = aiWorkspace.table("execucao_esteira", {
  id: uuid("id").primaryKey().defaultRandom(),
  squadId: uuid("squad_id").notNull().references(() => squad.id),
  iniciativaId: uuid("iniciativa_id").references(() => iniciativa.id),
  repositorio: text("repositorio").notNull(),
  etapa: text("etapa").notNull(), // build|testes|seguranca|deploy_hml|gmud|deploy_prod
  status: text("status").notNull(), // ok|em_execucao|falha|pendente
  detalhe: text("detalhe"),
  iniciadoEm: timestamp("iniciado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const gmud = aiWorkspace.table("gmud", {
  id: uuid("id").primaryKey().defaultRandom(),
  squadId: uuid("squad_id").notNull().references(() => squad.id),
  iniciativaId: uuid("iniciativa_id").references(() => iniciativa.id),
  numero: text("numero").notNull(), // CHG…
  titulo: text("titulo").notNull(),
  status: text("status").notNull(), // rascunho|aguardando_aprovacao|agendada|executada|rollback
  risco: text("risco").notNull().default("baixo"),
  janela: text("janela"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const pullRequest = aiWorkspace.table("pull_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  repositorioId: uuid("repositorio_id").notNull().references(() => repositorio.id),
  iniciativaId: uuid("iniciativa_id").references(() => iniciativa.id),
  numero: integer("numero").notNull(),
  titulo: text("titulo").notNull(),
  autorNome: text("autor_nome").notNull(),
  status: text("status").notNull().default("aberto"), // aberto|aprovado|merged|fechado
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- execução autônoma ---------- */

export const execucaoAutonoma = aiWorkspace.table("execucao_autonoma", {
  id: uuid("id").primaryKey().defaultRandom(),
  squadId: uuid("squad_id").notNull().references(() => squad.id),
  krId: uuid("kr_id").references(() => keyResult.id),
  objetivo: text("objetivo").notNull(),
  status: text("status").notNull().default("em_andamento"),
  passoAtual: integer("passo_atual").notNull().default(0),
  tokensGastos: integer("tokens_gastos").notNull().default(0),
  tetoTokens: integer("teto_tokens").notNull().default(200000),
  criadoPor: uuid("criado_por").references(() => pessoa.id),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const execucaoPasso = aiWorkspace.table(
  "execucao_passo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    execucaoId: uuid("execucao_id").notNull().references(() => execucaoAutonoma.id),
    ordem: integer("ordem").notNull(),
    nome: text("nome").notNull(),
    agenteNome: text("agente_nome"),
    tipo: text("tipo").notNull().default("automatica"), // automatica|checkpoint
    status: text("status").notNull().default("pendente"), // pendente|em_execucao|concluido|aguardando|rejeitado
    saida: jsonb("saida").$type<{ resumo?: string; itens?: string[] } | null>(),
    concluidoEm: timestamp("concluido_em", { withTimezone: true }),
  },
  (t) => [uniqueIndex("execucao_passo_uq").on(t.execucaoId, t.ordem)]
);

export const execucaoCheckpoint = aiWorkspace.table("execucao_checkpoint", {
  id: uuid("id").primaryKey().defaultRandom(),
  execucaoId: uuid("execucao_id").notNull().references(() => execucaoAutonoma.id),
  passoOrdem: integer("passo_ordem").notNull(),
  titulo: text("titulo").notNull(),
  resumo: text("resumo"),
  status: text("status").notNull().default("aberto"), // aberto|decidido
  decisao: text("decisao"), // aprovado|ajustar|rejeitado
  ajuste: text("ajuste"),
  aprovadorId: uuid("aprovador_id").references(() => pessoa.id),
  decididoEm: timestamp("decidido_em", { withTimezone: true }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- fluxos de trabalho (workflows da squad) ---------- */

// Um fluxo de trabalho que a squad monta para o que ela faz: uma sequência de
// passos onde cada passo é um agente (roda a IA) ou uma validação humana (porta
// que pausa até alguém aprovar) — ou aciona um MCP. Reutilizável: gera runs.
export const workflow = aiWorkspace.table("workflow", {
  id: uuid("id").primaryKey().defaultRandom(),
  squadId: uuid("squad_id").notNull().references(() => squad.id),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  status: text("status").notNull().default("rascunho"), // rascunho|ativo|arquivado
  criadoPor: uuid("criado_por"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const workflowPasso = aiWorkspace.table("workflow_passo", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowId: uuid("workflow_id").notNull().references(() => workflow.id),
  ordem: integer("ordem").notNull(),
  tipo: text("tipo").notNull().default("agente"), // agente|validacao|mcp
  nome: text("nome").notNull(),
  instrucao: text("instrucao"), // o que o agente faz / orientação da validação / objetivo do MCP
  agenteId: uuid("agente_id").references(() => agente.id),
  config: jsonb("config").$type<Record<string, unknown> | null>(), // mcp: { mcpId }
});

export const workflowRun = aiWorkspace.table("workflow_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowId: uuid("workflow_id").notNull().references(() => workflow.id),
  squadId: uuid("squad_id").notNull(),
  titulo: text("titulo").notNull(),
  entrada: text("entrada"), // contexto/entrada informado ao iniciar a run
  status: text("status").notNull().default("em_andamento"), // em_andamento|aguardando|concluido|cancelado
  passoAtual: integer("passo_atual").notNull().default(0),
  criadoPor: uuid("criado_por"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const workflowRunPasso = aiWorkspace.table("workflow_run_passo", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => workflowRun.id),
  ordem: integer("ordem").notNull(),
  tipo: text("tipo").notNull(),
  nome: text("nome").notNull(),
  agenteNome: text("agente_nome"),
  instrucao: text("instrucao"),
  config: jsonb("config").$type<Record<string, unknown> | null>(),
  status: text("status").notNull().default("pendente"), // pendente|em_execucao|concluido|aguardando|aprovado|rejeitado
  saida: jsonb("saida").$type<{ resumo?: string; detalhe?: string; passos?: unknown[] } | null>(),
  comentario: text("comentario"), // feedback humano na validação
  decididoPor: uuid("decidido_por"),
  decididoEm: timestamp("decidido_em", { withTimezone: true }),
});

/* ---------- consumo, auditoria ---------- */

export const consumoTokens = aiWorkspace.table(
  "consumo_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    squadId: uuid("squad_id").notNull().references(() => squad.id),
    mes: text("mes").notNull(), // YYYY-MM
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    custo: real("custo").notNull().default(0),
  },
  (t) => [uniqueIndex("consumo_tokens_uq").on(t.squadId, t.mes)]
);

export const auditLog = aiWorkspace.table("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  pessoaId: uuid("pessoa_id").references(() => pessoa.id),
  pessoaNome: text("pessoa_nome"),
  acao: text("acao").notNull(),
  alvo: text("alvo"),
  detalhe: jsonb("detalhe").$type<Record<string, unknown> | null>(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});
