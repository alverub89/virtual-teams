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

## Desenvolvimento

```bash
pnpm install
cp .env.example .env          # preencha DATABASE_URL, SESSION_JWT_SECRET etc.
pnpm dev                      # netlify dev (SPA + functions)
# ou apenas o front:
pnpm --filter web dev
```

- `pnpm build` — build da SPA (o deploy na Netlify empacota as functions).
- `pnpm typecheck` — checagem de tipos do backend e do front.
- `pnpm db:generate` / `pnpm db:migrate` — migrations Drizzle (a migration
  `0000_init` deve ser o `ai_workspace_schema.sql` canônico — ver `db/migrations/README.md`).

## Estado atual — Fase 0 (fundação)

Feito nesta fase (roadmap na spec, seção 15):

- Monorepo + `netlify.toml` (SPA fallback, headers de segurança, functions).
- Design system extraído do protótipo (`web/src/styles/tokens.css` + shell).
- SPA shell com as três visões (Squad / Console / Gestão), rotas da spec e
  telas placeholder indicando a fase em que cada uma ganha dados reais.
- API Hono catch-all em `/api/*` com sessão (cookie httpOnly + JWT), RBAC por
  papel/escopo, callback OAuth GitHub e `/api/me`.
- Camada Drizzle/Neon (HTTP para leituras, Pool para transações) com as
  tabelas de fundação; adapter `LLMProvider` + roteador de modelos; esqueleto
  da execução autônoma (background + sweeper agendado).

Próximo: **Fase 1 — núcleo da squad** (iniciativas + jornada, capacidades/repos,
OKRs, docs, chat de agente com streaming).
