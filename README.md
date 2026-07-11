# AI Workspace

Plataforma **AI-First de produto** da diretoria — da estrutura organizacional
(Comunidade → Release Train → Squad) à execução autônoma da squad virtual com
humano no loop.

**Stack:** Netlify (SPA + Functions) · Neon (Postgres serverless) · provedor de
IA próprio (contrato OpenAI-compatible).

- 📄 **Especificação técnica completa:** [`docs/spec/ai-workspace-especificacao-tecnica.md`](docs/spec/ai-workspace-especificacao-tecnica.md)
- 🎨 **Protótipo navegável (referência de UX/design):** [`docs/prototipo/ai-workspace-prototipo.html`](docs/prototipo/ai-workspace-prototipo.html) — não é servido em produção; é a referência pixel a pixel da portabilidade (spec, seção 4.0).

## Estrutura

```
web/                  SPA React + Vite (tokens e shell portados do protótipo)
netlify/functions/    API Hono (/api/*), background e scheduled functions
db/                   Drizzle (schema ai_workspace) + migrations
ai/                   Adapter LLMProvider + roteador de modelos + prompts
integrations/         Adapters de tools (GitHub, IU Click, Atlan, ServiceNow, Catálogo)
shared/               Tipos + schemas Zod compartilhados (web ↔ functions)
docs/                 Spec + protótipo (referência viva)
```

## Rodar agora (modo demonstração — zero configuração)

```bash
pnpm install
pnpm dev        # API em :8888 + SPA em :5173
```

Abra **http://localhost:5173** e entre como uma das personas (Ana Souza · PM,
Bruno Lima · dev, Carlos Menezes · arquiteto, Rubens Alves · diretor). Sem
`DATABASE_URL`, o produto sobe com **Postgres embarcado (PGlite)**, migrations e
um **seed de demonstração** — e sem `AI_BASE_URL`, os agentes respondem por um
**provedor simulado**. Nenhuma credencial é necessária para testar tudo.

## Modo produção

Preencha o `.env` (ver `.env.example`): `DATABASE_URL` (Neon pooled) troca o
banco embarcado pelo Neon; `AI_BASE_URL`/`AI_API_KEY` trocam o mock pelo
provedor de IA próprio; `GITHUB_OAUTH_CLIENT_ID/SECRET` habilitam o login real
(o modo demo desliga sozinho, ou force com `DEMO_MODE=1`). O deploy é o site
Netlify apontado para este repo — build da SPA + Functions já configurados.

- `pnpm build` — build da SPA · `pnpm typecheck` — tipos do back e do front.
- `pnpm db:generate` / `pnpm db:migrate` — migrations Drizzle.

## O que está implementado

- **Squad**: iniciativas com jornada BMAD (stepper por etapa), **chat com o
  agente de cada etapa via streaming SSE**, artefatos, histórias, OKRs em
  cascata com planejado × realizado e associação de features, capacidades +
  repositórios, estação dev, documentação com leitor, base de conhecimento com
  escopo e endosso, esteira & GMUDs.
- **Execução autônoma**: máquina de estados persistida (runs → passos →
  checkpoints), motor `advanceRun` idempotente com orçamento de tempo e teto de
  tokens, checkpoints humanos (aprovar/ajustar/rejeitar) que retomam o run,
  sweeper agendado, timeline da squad virtual na UI.
- **Console**: visão geral com trilha de auditoria, editor de agentes
  (personalidade, skills, tools com permissão) com **prompt de sistema gerado**,
  métodos, blueprints com guard-rails, MCPs, roteamento de modelos por tarefa e
  consumo de tokens por squad com budget.
- **Gestão**: indicadores (fluxo por etapa, lead time, GMUDs, custo de IA,
  progresso de KRs) e documentações em consulta.
- **Transversal**: RBAC por papel/escopo no servidor, sessão httpOnly+JWT,
  auditoria de ações sensíveis, contabilização de tokens por squad/mês.

Pendências para produção (detalhe em `docs/plano-de-implementacao.md`):
provisionamento (Neon com o schema canônico, OAuth, provedor de IA), tools
reais das integrações (GitHub App, IU Click, Atlan, ServiceNow), RLS, rate
limiting e testes e2e contínuos.
