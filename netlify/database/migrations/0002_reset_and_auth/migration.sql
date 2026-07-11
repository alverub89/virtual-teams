-- Cadastro por email/senha + zerar os dados de demonstração.
-- Mantém o catálogo da plataforma (agentes, skills, tools, MCPs, método,
-- blueprints, rotas de modelo); limpa tudo que é dado de negócio, para o
-- workspace começar zerado a partir do cadastro/onboarding do usuário.

ALTER TABLE "ai_workspace"."pessoa" ADD COLUMN IF NOT EXISTS "senha_hash" text;
--> statement-breakpoint
TRUNCATE TABLE
  "ai_workspace"."sessao",
  "ai_workspace"."audit_log",
  "ai_workspace"."consumo_tokens",
  "ai_workspace"."execucao_checkpoint",
  "ai_workspace"."execucao_passo",
  "ai_workspace"."execucao_autonoma",
  "ai_workspace"."pull_request",
  "ai_workspace"."gmud",
  "ai_workspace"."execucao_esteira",
  "ai_workspace"."kr_feature",
  "ai_workspace"."kr_medicao",
  "ai_workspace"."key_result",
  "ai_workspace"."okr",
  "ai_workspace"."kb_endosso",
  "ai_workspace"."kb_artigo",
  "ai_workspace"."documento",
  "ai_workspace"."mensagem_chat",
  "ai_workspace"."historia",
  "ai_workspace"."iniciativa_etapa",
  "ai_workspace"."iniciativa",
  "ai_workspace"."capacidade_repositorio",
  "ai_workspace"."repositorio",
  "ai_workspace"."capacidade",
  "ai_workspace"."pessoa",
  "ai_workspace"."squad",
  "ai_workspace"."release_train",
  "ai_workspace"."comunidade"
CASCADE;
