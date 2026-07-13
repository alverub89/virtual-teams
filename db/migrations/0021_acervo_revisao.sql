ALTER TABLE "ai_workspace"."agente" ADD COLUMN "revisao_pendente" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_workspace"."skill" ADD COLUMN "revisao_pendente" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_workspace"."template" ADD COLUMN "revisao_pendente" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_workspace"."checklist" ADD COLUMN "revisao_pendente" boolean DEFAULT false NOT NULL;
