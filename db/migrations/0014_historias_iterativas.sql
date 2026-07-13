ALTER TABLE "ai_workspace"."historia" ADD COLUMN "epico" text;--> statement-breakpoint
ALTER TABLE "ai_workspace"."historia" ADD COLUMN "criterios_aceite" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_workspace"."historia" ADD COLUMN "ordem" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_workspace"."historia" ADD COLUMN "origem" text DEFAULT 'manual' NOT NULL;
