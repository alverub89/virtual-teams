import {
  pgSchema,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Schema `ai_workspace` — o modelo completo (44 tabelas + views) já validado
// deve ser aplicado como migration 0000_init (ai_workspace_schema.sql).
// Aqui ficam as tabelas necessárias à Fase 0 (fundação): identidade, sessão
// e estrutura organizacional. As demais entram conforme as fases avançam,
// sempre espelhando o SQL canônico.
export const aiWorkspace = pgSchema("ai_workspace");

export const comunidade = aiWorkspace.table("comunidade", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const releaseTrain = aiWorkspace.table("release_train", {
  id: uuid("id").primaryKey().defaultRandom(),
  comunidadeId: uuid("comunidade_id")
    .notNull()
    .references(() => comunidade.id),
  nome: text("nome").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const squad = aiWorkspace.table("squad", {
  id: uuid("id").primaryKey().defaultRandom(),
  releaseTrainId: uuid("release_train_id")
    .notNull()
    .references(() => releaseTrain.id),
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
    githubLogin: text("github_login"),
    papel: text("papel").notNull(), // dev|pm|arquiteto|coordenador|gerente|diretor
    squadId: uuid("squad_id").references(() => squad.id),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pessoa_email_uq").on(t.email)]
);

export const sessao = aiWorkspace.table("sessao", {
  id: uuid("id").primaryKey().defaultRandom(),
  pessoaId: uuid("pessoa_id")
    .notNull()
    .references(() => pessoa.id),
  refreshToken: text("refresh_token").notNull(),
  expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});
