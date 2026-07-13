ALTER TABLE "ai_workspace"."skill" ADD COLUMN "origem" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
CREATE TABLE "ai_workspace"."template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"tipo" text DEFAULT 'generico' NOT NULL,
	"emoji" text,
	"descricao" text,
	"conteudo" text NOT NULL,
	"escopo" text DEFAULT 'global' NOT NULL,
	"comunidade_id" uuid,
	"origem" text DEFAULT 'manual' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_workspace"."checklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"emoji" text,
	"descricao" text,
	"categoria" text DEFAULT 'generico' NOT NULL,
	"itens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"escopo" text DEFAULT 'global' NOT NULL,
	"comunidade_id" uuid,
	"origem" text DEFAULT 'manual' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_workspace"."party_sessao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"squad_id" uuid,
	"titulo" text NOT NULL,
	"topico" text NOT NULL,
	"status" text DEFAULT 'em_andamento' NOT NULL,
	"progresso" text,
	"sintese" text,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_workspace"."party_turno" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessao_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"agente_id" uuid,
	"agente_nome" text NOT NULL,
	"emoji" text,
	"conteudo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
