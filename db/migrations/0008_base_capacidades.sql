ALTER TABLE "ai_workspace"."capacidade" ADD COLUMN "nivel" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_workspace"."capacidade" ADD COLUMN "pai" text;--> statement-breakpoint
ALTER TABLE "ai_workspace"."capacidade" ADD COLUMN "fluxo_valor" text;--> statement-breakpoint
ALTER TABLE "ai_workspace"."capacidade" ADD COLUMN "repos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_workspace"."capacidade" ADD COLUMN "origem" text DEFAULT 'manual' NOT NULL;
