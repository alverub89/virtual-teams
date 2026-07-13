ALTER TABLE "ai_workspace"."conexao_mcp" ADD COLUMN "aprovacao" text DEFAULT 'aprovado' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_workspace"."conexao_mcp" ADD COLUMN "criado_por" uuid;--> statement-breakpoint
ALTER TABLE "ai_workspace"."conexao_mcp" ADD COLUMN "submetido_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_workspace"."conexao_mcp" ADD COLUMN "motivo_rejeicao" text;--> statement-breakpoint
ALTER TABLE "ai_workspace"."tool" ADD COLUMN "squad_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_workspace"."tool" ADD COLUMN "aprovacao" text DEFAULT 'aprovado' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_workspace"."tool" ADD COLUMN "criado_por" uuid;--> statement-breakpoint
ALTER TABLE "ai_workspace"."tool" ADD COLUMN "submetido_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_workspace"."tool" ADD COLUMN "motivo_rejeicao" text;
