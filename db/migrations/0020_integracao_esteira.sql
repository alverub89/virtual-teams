CREATE TABLE "ai_workspace"."integracao_plataforma" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comunidade_id" uuid NOT NULL,
	"github_org" text,
	"github_repo_padrao" text,
	"github_workflow" text DEFAULT 'deploy.yml',
	"service_now_instance" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_workspace"."integracao_plataforma" ADD CONSTRAINT "integracao_plataforma_comunidade_id_comunidade_id_fk" FOREIGN KEY ("comunidade_id") REFERENCES "ai_workspace"."comunidade"("id") ON DELETE no action ON UPDATE no action;
