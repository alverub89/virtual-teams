ALTER TABLE "ai_workspace"."kb_artigo" ADD COLUMN "editado_por" uuid;--> statement-breakpoint
ALTER TABLE "ai_workspace"."kb_artigo" ADD COLUMN "editado_nome" text;--> statement-breakpoint
ALTER TABLE "ai_workspace"."kb_artigo" ADD COLUMN "editado_em" timestamp with time zone;
