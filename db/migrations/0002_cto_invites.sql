CREATE TABLE "ai_workspace"."convite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comunidade_id" uuid NOT NULL,
	"squad_id" uuid,
	"email" text NOT NULL,
	"papel" text NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"convidado_por" uuid,
	"convidado_nome" text,
	"email_enviado" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"aceito_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ai_workspace"."comunidade" ADD COLUMN "dono_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_workspace"."pessoa" ADD COLUMN "comunidade_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_workspace"."pessoa" ADD COLUMN "onboarding_concluido" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "convite_token_uq" ON "ai_workspace"."convite" USING btree ("token");