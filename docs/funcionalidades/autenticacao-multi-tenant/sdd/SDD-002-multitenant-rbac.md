# SDD — Isolamento multi-tenant + RBAC e escopo de squad

| | |
|---|---|
| **Funcionalidade** | Autenticação, sessão & multi-tenant (F1) |
| **História** | Como plataforma, quero que cada request só acesse dados da comunidade da pessoa e só escreva na squad dela, para garantir isolamento e menor privilégio |
| **Fase / Nível** | Fase 1 · N1 · Especificado |
| **Repo / arquivo(s) alvo** | `aiw-identity` (biblioteca compartilhada `@aiw/tenant`): `src/mw/tenant.ts`, `src/mw/rbac.ts`, `src/db/scoped.ts` |
| **Data** | 2026-07-17 |

## Contexto

Porta `_mw/rbac.ts` e a regra "cria/edita só na própria squad; consulta o resto",
elevando o isolamento de tenant (hoje app-enforced por `comunidadeId`) a um
middleware obrigatório e a um **repositório com escopo** que injeta o filtro em toda
query. Publicado como pacote `@aiw/tenant` consumido pelos demais serviços.

## Escopo (entra / não entra)

- **Entra:** middleware `tenant` (injeta `comunidadeId` do `me`), `rbac(acao)`,
  `mesmaSquad(param)`, e um helper `scopedCollection` que garante o filtro por
  `comunidadeId` em leitura/escrita.
- **Não entra:** modo auditoria (SDD-003). A definição de papéis por ação segue a
  tabela existente em `_mw/rbac.ts`.

## Especificação técnica

**Componentes e arquivos**
- `mw/tenant.ts` — lê `me.comunidadeId`; 401/403 se ausente; expõe `c.get("tenant")`.
- `mw/rbac.ts` — `rbac(acao)` valida `me.papel ∈ PAPEIS_POR_ACAO[acao]`;
  `mesmaSquad(param)` valida `me.squadId === alvo` em escrita.
- `db/scoped.ts` — `scopedCollection(db, name, comunidadeId)`: envelopa `find`,
  `updateOne`, `insertOne`, etc., **sempre** compondo `{ comunidadeId }` no filtro e
  carimbando `comunidadeId` no insert. Bloqueia query sem tenant em runtime.

**Contratos / APIs**
- Não expõe rota própria; é infraestrutura consumida por todas as rotas de dados.
- `PAPEIS_POR_ACAO`: `criar_iniciativa`/`imputar_kr`/`decidir_checkpoint`/
  `iniciar_run` → `pm,tech_lead`; `endossar_kb`/`configurar_plataforma` → `cto`;
  `ver_gestao` → `gestao,cto` (idêntico ao atual).

**Dados**
- Índices compostos `(comunidadeId, _id)` e `(comunidadeId, squadId)` nas coleções.
- Nenhuma coleção é consultada sem `comunidadeId` no filtro (garantido por `scoped.ts`).

## Plano de testes

- Pessoa da comunidade A não lê documento da comunidade B (retorno vazio/404).
- Escrita em squad diferente da própria retorna 403 (`mesmaSquad`).
- `rbac`: papel sem permissão para a ação retorna 403; com permissão, segue.
- Teste de "tenant leak": qualquer chamada a `scopedCollection` sem `comunidadeId`
  lança erro (falha rápida, não vaza).
- Índices compostos existem e são usados (explain).

## Tarefas

1. Implementar `mw/tenant.ts`, `mw/rbac.ts`, `db/scoped.ts` no pacote `@aiw/tenant`.
2. Criar índices compostos por `comunidadeId` nas coleções da Fase 1.
3. Ligar os middlewares no `aiw-identity` e documentar o consumo pelos demais repos.
4. Teste automatizado de isolamento de tenant (matriz A×B) no CI.

## Definition of Done

- [ ] Toda query de dados passa pelo `scopedCollection` (revisão + teste de leak).
- [ ] RBAC e `mesmaSquad` aplicados no servidor; cliente nunca decide.
- [ ] Índices de tenant criados e verificados.
- [ ] Matriz de isolamento A×B verde no CI.
- [ ] Métrica/log de 403 por tentativa de acesso cross-tenant.

## Prompt pronto

> Implemente o pacote `@aiw/tenant` (repo `aiw-identity`) com `mw/tenant.ts`
> (injeta comunidadeId do `me`), `mw/rbac.ts` (rbac(acao) + mesmaSquad, mesma tabela
> de papéis do sistema atual) e `db/scoped.ts` (`scopedCollection` que força o filtro
> por comunidadeId em toda leitura/escrita e falha se ausente). Crie índices
> compostos por comunidadeId e um teste de matriz A×B provando isolamento. Não
> implemente modo auditoria aqui (SDD-003).
