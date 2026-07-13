ALTER TABLE "ai_workspace"."agente" ADD COLUMN "prompt_sistema" text;--> statement-breakpoint
CREATE TABLE "ai_workspace"."agente_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agente_id" uuid NOT NULL,
	"template_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_workspace"."agente_checklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agente_id" uuid NOT NULL,
	"checklist_id" uuid NOT NULL
);
