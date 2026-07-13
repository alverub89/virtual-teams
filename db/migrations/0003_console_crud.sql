ALTER TABLE "ai_workspace"."conexao_mcp" ALTER COLUMN "status" SET DEFAULT 'configurado';--> statement-breakpoint
ALTER TABLE "ai_workspace"."conexao_mcp" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "ai_workspace"."conexao_mcp" ADD COLUMN "escopo" text DEFAULT 'global' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_workspace"."conexao_mcp" ADD COLUMN "squad_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_workspace"."conexao_mcp" ADD COLUMN "comunidade_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_workspace"."metodo" ADD COLUMN "escopo" text DEFAULT 'publico' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_workspace"."metodo" ADD COLUMN "comunidade_id" uuid;