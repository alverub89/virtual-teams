-- Delta do construtor de MCP (migration 0004). Seguro rodar no Neon já provisionado:
-- usa IF NOT EXISTS, não apaga nada, e registra a migration no tracking.
BEGIN;

ALTER TABLE "ai_workspace"."conexao_mcp" ADD COLUMN IF NOT EXISTS "slug" text;
ALTER TABLE "ai_workspace"."conexao_mcp" ADD COLUMN IF NOT EXISTS "proposito" text;
ALTER TABLE "ai_workspace"."conexao_mcp" ADD COLUMN IF NOT EXISTS "gerado_em" timestamp with time zone;

ALTER TABLE "ai_workspace"."tool" ADD COLUMN IF NOT EXISTS "execucao" text DEFAULT 'ia' NOT NULL;
ALTER TABLE "ai_workspace"."tool" ADD COLUMN IF NOT EXISTS "parametros" text;
ALTER TABLE "ai_workspace"."tool" ADD COLUMN IF NOT EXISTS "input_schema" jsonb;
ALTER TABLE "ai_workspace"."tool" ADD COLUMN IF NOT EXISTS "handler_config" jsonb;
ALTER TABLE "ai_workspace"."tool" ADD COLUMN IF NOT EXISTS "comunidade_id" uuid;

-- marca como aplicada para o runtime não repetir
CREATE TABLE IF NOT EXISTS "ai_workspace"."_migrations" (name text PRIMARY KEY, applied_at timestamptz DEFAULT now());
INSERT INTO "ai_workspace"."_migrations"(name) VALUES ('0004_mcp_builder') ON CONFLICT (name) DO NOTHING;

COMMIT;
