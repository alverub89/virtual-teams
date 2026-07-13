ALTER TABLE "ai_workspace"."execucao_autonoma" ADD COLUMN "iniciativa_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_workspace"."execucao_autonoma" ADD COLUMN "modo" text DEFAULT 'kr' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_workspace"."execucao_autonoma" ADD COLUMN "progresso" text;
