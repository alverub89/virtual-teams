ALTER TABLE "ai_workspace"."agente" ADD COLUMN "guard_rails" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_workspace"."agente" ADD COLUMN "origem" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_workspace"."metodo_etapa" ADD COLUMN "instrucao" text;--> statement-breakpoint
ALTER TABLE "ai_workspace"."metodo_etapa" ADD COLUMN "config" jsonb;
