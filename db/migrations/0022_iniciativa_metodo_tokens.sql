ALTER TABLE "ai_workspace"."iniciativa" ADD COLUMN "metodo_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_workspace"."iniciativa" ADD COLUMN "livre" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_workspace"."iniciativa_etapa" ADD COLUMN "tokens_gastos" integer DEFAULT 0 NOT NULL;
