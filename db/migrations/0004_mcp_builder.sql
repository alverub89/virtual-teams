ALTER TABLE "ai_workspace"."conexao_mcp" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "ai_workspace"."conexao_mcp" ADD COLUMN "proposito" text;--> statement-breakpoint
ALTER TABLE "ai_workspace"."conexao_mcp" ADD COLUMN "gerado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_workspace"."tool" ADD COLUMN "execucao" text DEFAULT 'ia' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_workspace"."tool" ADD COLUMN "parametros" text;--> statement-breakpoint
ALTER TABLE "ai_workspace"."tool" ADD COLUMN "input_schema" jsonb;--> statement-breakpoint
ALTER TABLE "ai_workspace"."tool" ADD COLUMN "handler_config" jsonb;--> statement-breakpoint
ALTER TABLE "ai_workspace"."tool" ADD COLUMN "comunidade_id" uuid;
