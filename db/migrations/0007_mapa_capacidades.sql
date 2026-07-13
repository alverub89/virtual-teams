ALTER TABLE "ai_workspace"."comunidade" ADD COLUMN "github_token" text;--> statement-breakpoint
CREATE TABLE "ai_workspace"."mapa_capacidade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"squad_id" uuid NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'analisando' NOT NULL,
	"progresso" text,
	"motivo" text,
	"conteudo" jsonb,
	"repos_analisados" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"impacto" jsonb,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"concluido_em" timestamp with time zone
);
