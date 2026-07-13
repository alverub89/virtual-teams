CREATE TABLE "ai_workspace"."workflow" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"squad_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_workspace"."workflow_passo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"tipo" text DEFAULT 'agente' NOT NULL,
	"nome" text NOT NULL,
	"instrucao" text,
	"agente_id" uuid,
	"config" jsonb
);
--> statement-breakpoint
CREATE TABLE "ai_workspace"."workflow_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"squad_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"entrada" text,
	"status" text DEFAULT 'em_andamento' NOT NULL,
	"passo_atual" integer DEFAULT 0 NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_workspace"."workflow_run_passo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"tipo" text NOT NULL,
	"nome" text NOT NULL,
	"agente_nome" text,
	"instrucao" text,
	"config" jsonb,
	"status" text DEFAULT 'pendente' NOT NULL,
	"saida" jsonb,
	"comentario" text,
	"decidido_por" uuid,
	"decidido_em" timestamp with time zone
);
