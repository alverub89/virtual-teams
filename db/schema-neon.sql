-- AI Workspace — schema completo (ai_workspace) para o seu Neon.
-- Rode uma vez (psql ou SQL editor do Neon). Idempotente-friendly: se já rodou,
-- basta ignorar erros de "already exists". Os dados (catálogo de agentes) são
-- populados automaticamente pela aplicação na primeira conexão.

CREATE SCHEMA "ai_workspace";
CREATE TABLE "ai_workspace"."agente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"papel" text NOT NULL,
	"emoji" text,
	"personalidade" text NOT NULL,
	"nivel_modelo" text DEFAULT 'intermediario' NOT NULL,
	"max_tokens" integer DEFAULT 4096 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
CREATE TABLE "ai_workspace"."agente_skill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agente_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL
);
CREATE TABLE "ai_workspace"."agente_tool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agente_id" uuid NOT NULL,
	"tool_id" uuid NOT NULL
);
CREATE TABLE "ai_workspace"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pessoa_id" uuid,
	"pessoa_nome" text,
	"acao" text NOT NULL,
	"alvo" text,
	"detalhe" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "ai_workspace"."blueprint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"guard_rails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "ai_workspace"."capacidade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"squad_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"sigla" text
);
CREATE TABLE "ai_workspace"."capacidade_repositorio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capacidade_id" uuid NOT NULL,
	"repositorio_id" uuid NOT NULL
);
CREATE TABLE "ai_workspace"."comunidade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "ai_workspace"."conexao_mcp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"sistema" text NOT NULL,
	"status" text DEFAULT 'conectado' NOT NULL,
	"descricao" text
);
CREATE TABLE "ai_workspace"."consumo_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"squad_id" uuid NOT NULL,
	"mes" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"custo" real DEFAULT 0 NOT NULL
);
CREATE TABLE "ai_workspace"."documento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"squad_id" uuid,
	"iniciativa_id" uuid,
	"titulo" text NOT NULL,
	"tipo" text DEFAULT 'doc' NOT NULL,
	"emoji" text,
	"resumo" text,
	"conteudo" text NOT NULL,
	"autor_nome" text NOT NULL,
	"escopo" text DEFAULT 'squad' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "ai_workspace"."execucao_autonoma" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"squad_id" uuid NOT NULL,
	"kr_id" uuid,
	"objetivo" text NOT NULL,
	"status" text DEFAULT 'em_andamento' NOT NULL,
	"passo_atual" integer DEFAULT 0 NOT NULL,
	"tokens_gastos" integer DEFAULT 0 NOT NULL,
	"teto_tokens" integer DEFAULT 200000 NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "ai_workspace"."execucao_checkpoint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execucao_id" uuid NOT NULL,
	"passo_ordem" integer NOT NULL,
	"titulo" text NOT NULL,
	"resumo" text,
	"status" text DEFAULT 'aberto' NOT NULL,
	"decisao" text,
	"ajuste" text,
	"aprovador_id" uuid,
	"decidido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "ai_workspace"."execucao_esteira" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"squad_id" uuid NOT NULL,
	"iniciativa_id" uuid,
	"repositorio" text NOT NULL,
	"etapa" text NOT NULL,
	"status" text NOT NULL,
	"detalhe" text,
	"iniciado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "ai_workspace"."execucao_passo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execucao_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"nome" text NOT NULL,
	"agente_nome" text,
	"tipo" text DEFAULT 'automatica' NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"saida" jsonb,
	"concluido_em" timestamp with time zone
);
CREATE TABLE "ai_workspace"."gmud" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"squad_id" uuid NOT NULL,
	"iniciativa_id" uuid,
	"numero" text NOT NULL,
	"titulo" text NOT NULL,
	"status" text NOT NULL,
	"risco" text DEFAULT 'baixo' NOT NULL,
	"janela" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "ai_workspace"."historia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"iniciativa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text,
	"pontos" integer,
	"status" text DEFAULT 'backlog' NOT NULL,
	"responsavel_id" uuid
);
CREATE TABLE "ai_workspace"."iniciativa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"squad_id" uuid NOT NULL,
	"capacidade_id" uuid,
	"titulo" text NOT NULL,
	"descricao" text,
	"status" text DEFAULT 'em_andamento' NOT NULL,
	"etapa_atual" integer DEFAULT 1 NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "ai_workspace"."iniciativa_etapa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"iniciativa_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"nome" text NOT NULL,
	"agente_id" uuid,
	"status" text DEFAULT 'pendente' NOT NULL,
	"artefato" jsonb,
	"concluida_em" timestamp with time zone
);
CREATE TABLE "ai_workspace"."kb_artigo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"escopo" text DEFAULT 'squad' NOT NULL,
	"squad_id" uuid,
	"titulo" text NOT NULL,
	"resumo" text,
	"conteudo" text NOT NULL,
	"autor_id" uuid,
	"autor_nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "ai_workspace"."kb_endosso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artigo_id" uuid NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"nivel" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "ai_workspace"."key_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"okr_id" uuid NOT NULL,
	"ordem" integer DEFAULT 1 NOT NULL,
	"descricao" text NOT NULL,
	"unidade" text DEFAULT '%' NOT NULL,
	"baseline" real DEFAULT 0 NOT NULL,
	"meta" real NOT NULL,
	"invertido" boolean DEFAULT false NOT NULL
);
CREATE TABLE "ai_workspace"."kr_feature" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kr_id" uuid NOT NULL,
	"iniciativa_id" uuid NOT NULL
);
CREATE TABLE "ai_workspace"."kr_medicao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kr_id" uuid NOT NULL,
	"mes" text NOT NULL,
	"planejado" real,
	"realizado" real
);
CREATE TABLE "ai_workspace"."mensagem_chat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"iniciativa_id" uuid NOT NULL,
	"etapa_ordem" integer NOT NULL,
	"autor" text NOT NULL,
	"autor_nome" text NOT NULL,
	"conteudo" text NOT NULL,
	"tokens" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "ai_workspace"."metodo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"versao" text NOT NULL,
	"descricao" text,
	"ativo" boolean DEFAULT true NOT NULL
);
CREATE TABLE "ai_workspace"."metodo_etapa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metodo_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"nome" text NOT NULL,
	"agente_id" uuid,
	"tipo" text DEFAULT 'automatica' NOT NULL,
	"descricao" text
);
CREATE TABLE "ai_workspace"."modelo_ia_rota" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tarefa" text NOT NULL,
	"nivel" text NOT NULL,
	"modelo" text NOT NULL,
	"custo_relativo" real DEFAULT 1 NOT NULL
);
CREATE TABLE "ai_workspace"."okr" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"escopo" text NOT NULL,
	"squad_id" uuid,
	"release_train_id" uuid,
	"objetivo" text NOT NULL,
	"dono" text,
	"trimestre" text NOT NULL,
	"pai_id" uuid
);
CREATE TABLE "ai_workspace"."pessoa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"github_login" text,
	"papel" text NOT NULL,
	"squad_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "ai_workspace"."pull_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repositorio_id" uuid NOT NULL,
	"iniciativa_id" uuid,
	"numero" integer NOT NULL,
	"titulo" text NOT NULL,
	"autor_nome" text NOT NULL,
	"status" text DEFAULT 'aberto' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "ai_workspace"."release_train" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comunidade_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "ai_workspace"."repositorio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"squad_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"url" text,
	"linguagem" text
);
CREATE TABLE "ai_workspace"."sessao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"refresh_token" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "ai_workspace"."skill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"emoji" text,
	"descricao" text,
	"instrucoes" text NOT NULL
);
CREATE TABLE "ai_workspace"."squad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_train_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"budget_tokens_mes" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "ai_workspace"."tool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"permissao" text NOT NULL,
	"conexao_mcp_id" uuid
);
ALTER TABLE "ai_workspace"."agente_skill" ADD CONSTRAINT "agente_skill_agente_id_agente_id_fk" FOREIGN KEY ("agente_id") REFERENCES "ai_workspace"."agente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."agente_skill" ADD CONSTRAINT "agente_skill_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "ai_workspace"."skill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."agente_tool" ADD CONSTRAINT "agente_tool_agente_id_agente_id_fk" FOREIGN KEY ("agente_id") REFERENCES "ai_workspace"."agente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."agente_tool" ADD CONSTRAINT "agente_tool_tool_id_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "ai_workspace"."tool"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."audit_log" ADD CONSTRAINT "audit_log_pessoa_id_pessoa_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "ai_workspace"."pessoa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."capacidade" ADD CONSTRAINT "capacidade_squad_id_squad_id_fk" FOREIGN KEY ("squad_id") REFERENCES "ai_workspace"."squad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."capacidade_repositorio" ADD CONSTRAINT "capacidade_repositorio_capacidade_id_capacidade_id_fk" FOREIGN KEY ("capacidade_id") REFERENCES "ai_workspace"."capacidade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."capacidade_repositorio" ADD CONSTRAINT "capacidade_repositorio_repositorio_id_repositorio_id_fk" FOREIGN KEY ("repositorio_id") REFERENCES "ai_workspace"."repositorio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."consumo_tokens" ADD CONSTRAINT "consumo_tokens_squad_id_squad_id_fk" FOREIGN KEY ("squad_id") REFERENCES "ai_workspace"."squad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."documento" ADD CONSTRAINT "documento_squad_id_squad_id_fk" FOREIGN KEY ("squad_id") REFERENCES "ai_workspace"."squad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."documento" ADD CONSTRAINT "documento_iniciativa_id_iniciativa_id_fk" FOREIGN KEY ("iniciativa_id") REFERENCES "ai_workspace"."iniciativa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."execucao_autonoma" ADD CONSTRAINT "execucao_autonoma_squad_id_squad_id_fk" FOREIGN KEY ("squad_id") REFERENCES "ai_workspace"."squad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."execucao_autonoma" ADD CONSTRAINT "execucao_autonoma_kr_id_key_result_id_fk" FOREIGN KEY ("kr_id") REFERENCES "ai_workspace"."key_result"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."execucao_autonoma" ADD CONSTRAINT "execucao_autonoma_criado_por_pessoa_id_fk" FOREIGN KEY ("criado_por") REFERENCES "ai_workspace"."pessoa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."execucao_checkpoint" ADD CONSTRAINT "execucao_checkpoint_execucao_id_execucao_autonoma_id_fk" FOREIGN KEY ("execucao_id") REFERENCES "ai_workspace"."execucao_autonoma"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."execucao_checkpoint" ADD CONSTRAINT "execucao_checkpoint_aprovador_id_pessoa_id_fk" FOREIGN KEY ("aprovador_id") REFERENCES "ai_workspace"."pessoa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."execucao_esteira" ADD CONSTRAINT "execucao_esteira_squad_id_squad_id_fk" FOREIGN KEY ("squad_id") REFERENCES "ai_workspace"."squad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."execucao_esteira" ADD CONSTRAINT "execucao_esteira_iniciativa_id_iniciativa_id_fk" FOREIGN KEY ("iniciativa_id") REFERENCES "ai_workspace"."iniciativa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."execucao_passo" ADD CONSTRAINT "execucao_passo_execucao_id_execucao_autonoma_id_fk" FOREIGN KEY ("execucao_id") REFERENCES "ai_workspace"."execucao_autonoma"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."gmud" ADD CONSTRAINT "gmud_squad_id_squad_id_fk" FOREIGN KEY ("squad_id") REFERENCES "ai_workspace"."squad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."gmud" ADD CONSTRAINT "gmud_iniciativa_id_iniciativa_id_fk" FOREIGN KEY ("iniciativa_id") REFERENCES "ai_workspace"."iniciativa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."historia" ADD CONSTRAINT "historia_iniciativa_id_iniciativa_id_fk" FOREIGN KEY ("iniciativa_id") REFERENCES "ai_workspace"."iniciativa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."historia" ADD CONSTRAINT "historia_responsavel_id_pessoa_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "ai_workspace"."pessoa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."iniciativa" ADD CONSTRAINT "iniciativa_squad_id_squad_id_fk" FOREIGN KEY ("squad_id") REFERENCES "ai_workspace"."squad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."iniciativa" ADD CONSTRAINT "iniciativa_capacidade_id_capacidade_id_fk" FOREIGN KEY ("capacidade_id") REFERENCES "ai_workspace"."capacidade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."iniciativa" ADD CONSTRAINT "iniciativa_criado_por_pessoa_id_fk" FOREIGN KEY ("criado_por") REFERENCES "ai_workspace"."pessoa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."iniciativa_etapa" ADD CONSTRAINT "iniciativa_etapa_iniciativa_id_iniciativa_id_fk" FOREIGN KEY ("iniciativa_id") REFERENCES "ai_workspace"."iniciativa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."iniciativa_etapa" ADD CONSTRAINT "iniciativa_etapa_agente_id_agente_id_fk" FOREIGN KEY ("agente_id") REFERENCES "ai_workspace"."agente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."kb_artigo" ADD CONSTRAINT "kb_artigo_squad_id_squad_id_fk" FOREIGN KEY ("squad_id") REFERENCES "ai_workspace"."squad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."kb_artigo" ADD CONSTRAINT "kb_artigo_autor_id_pessoa_id_fk" FOREIGN KEY ("autor_id") REFERENCES "ai_workspace"."pessoa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."kb_endosso" ADD CONSTRAINT "kb_endosso_artigo_id_kb_artigo_id_fk" FOREIGN KEY ("artigo_id") REFERENCES "ai_workspace"."kb_artigo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."kb_endosso" ADD CONSTRAINT "kb_endosso_pessoa_id_pessoa_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "ai_workspace"."pessoa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."key_result" ADD CONSTRAINT "key_result_okr_id_okr_id_fk" FOREIGN KEY ("okr_id") REFERENCES "ai_workspace"."okr"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."kr_feature" ADD CONSTRAINT "kr_feature_kr_id_key_result_id_fk" FOREIGN KEY ("kr_id") REFERENCES "ai_workspace"."key_result"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."kr_feature" ADD CONSTRAINT "kr_feature_iniciativa_id_iniciativa_id_fk" FOREIGN KEY ("iniciativa_id") REFERENCES "ai_workspace"."iniciativa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."kr_medicao" ADD CONSTRAINT "kr_medicao_kr_id_key_result_id_fk" FOREIGN KEY ("kr_id") REFERENCES "ai_workspace"."key_result"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."mensagem_chat" ADD CONSTRAINT "mensagem_chat_iniciativa_id_iniciativa_id_fk" FOREIGN KEY ("iniciativa_id") REFERENCES "ai_workspace"."iniciativa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."metodo_etapa" ADD CONSTRAINT "metodo_etapa_metodo_id_metodo_id_fk" FOREIGN KEY ("metodo_id") REFERENCES "ai_workspace"."metodo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."metodo_etapa" ADD CONSTRAINT "metodo_etapa_agente_id_agente_id_fk" FOREIGN KEY ("agente_id") REFERENCES "ai_workspace"."agente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."okr" ADD CONSTRAINT "okr_squad_id_squad_id_fk" FOREIGN KEY ("squad_id") REFERENCES "ai_workspace"."squad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."okr" ADD CONSTRAINT "okr_release_train_id_release_train_id_fk" FOREIGN KEY ("release_train_id") REFERENCES "ai_workspace"."release_train"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."pessoa" ADD CONSTRAINT "pessoa_squad_id_squad_id_fk" FOREIGN KEY ("squad_id") REFERENCES "ai_workspace"."squad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."pull_request" ADD CONSTRAINT "pull_request_repositorio_id_repositorio_id_fk" FOREIGN KEY ("repositorio_id") REFERENCES "ai_workspace"."repositorio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."pull_request" ADD CONSTRAINT "pull_request_iniciativa_id_iniciativa_id_fk" FOREIGN KEY ("iniciativa_id") REFERENCES "ai_workspace"."iniciativa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."release_train" ADD CONSTRAINT "release_train_comunidade_id_comunidade_id_fk" FOREIGN KEY ("comunidade_id") REFERENCES "ai_workspace"."comunidade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."repositorio" ADD CONSTRAINT "repositorio_squad_id_squad_id_fk" FOREIGN KEY ("squad_id") REFERENCES "ai_workspace"."squad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."sessao" ADD CONSTRAINT "sessao_pessoa_id_pessoa_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "ai_workspace"."pessoa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."squad" ADD CONSTRAINT "squad_release_train_id_release_train_id_fk" FOREIGN KEY ("release_train_id") REFERENCES "ai_workspace"."release_train"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace"."tool" ADD CONSTRAINT "tool_conexao_mcp_id_conexao_mcp_id_fk" FOREIGN KEY ("conexao_mcp_id") REFERENCES "ai_workspace"."conexao_mcp"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consumo_tokens_uq" ON "ai_workspace"."consumo_tokens" USING btree ("squad_id","mes");--> statement-breakpoint
CREATE UNIQUE INDEX "execucao_passo_uq" ON "ai_workspace"."execucao_passo" USING btree ("execucao_id","ordem");--> statement-breakpoint
CREATE UNIQUE INDEX "iniciativa_codigo_uq" ON "ai_workspace"."iniciativa" USING btree ("codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "iniciativa_etapa_uq" ON "ai_workspace"."iniciativa_etapa" USING btree ("iniciativa_id","ordem");--> statement-breakpoint
CREATE UNIQUE INDEX "kr_medicao_uq" ON "ai_workspace"."kr_medicao" USING btree ("kr_id","mes");--> statement-breakpoint
CREATE UNIQUE INDEX "pessoa_email_uq" ON "ai_workspace"."pessoa" USING btree ("email");
ALTER TABLE "ai_workspace"."pessoa" ADD COLUMN "senha_hash" text;
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
ALTER TABLE "ai_workspace"."comunidade" ADD COLUMN "dono_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_workspace"."pessoa" ADD COLUMN "comunidade_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_workspace"."pessoa" ADD COLUMN "onboarding_concluido" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "convite_token_uq" ON "ai_workspace"."convite" USING btree ("token");
