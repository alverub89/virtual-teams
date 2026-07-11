# Migrations

- `0000_init` deve ser o **`ai_workspace_schema.sql` canônico** (44 tabelas + views, já
  validado). Copie o arquivo para cá como `0000_init.sql` e registre no journal do
  drizzle-kit, ou aplique-o manualmente na branch `main` do Neon antes da primeira
  migration gerada.
- A partir daí, alterações de schema são feitas em `db/schema.ts` e geradas com
  `pnpm db:generate` / aplicadas com `pnpm db:migrate` (usa `DATABASE_URL_UNPOOLED`).
- Previews: cada PR usa uma branch de banco do Neon própria (ver docs/spec, seção 12).
