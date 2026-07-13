ALTER TABLE "ai_workspace"."kb_artigo" ADD COLUMN "status" text DEFAULT 'pronto' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_workspace"."kb_artigo" ADD COLUMN "progresso" text;--> statement-breakpoint
ALTER TABLE "ai_workspace"."kb_artigo" ADD COLUMN "origem" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_workspace"."kb_artigo" ADD COLUMN "repo" text;
