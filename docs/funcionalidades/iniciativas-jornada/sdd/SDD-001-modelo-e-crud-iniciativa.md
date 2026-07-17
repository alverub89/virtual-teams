# SDD — Modelo e CRUD de iniciativa (agregado com etapas embutidas)

| | |
|---|---|
| **Funcionalidade** | Iniciativas & jornada com agente (F2) |
| **História** | Como PM, quero criar e listar iniciativas da minha squad a partir de uma capacidade, para organizar o trabalho de produto |
| **Fase / Nível** | Fase 1 · N1 · Especificado |
| **Repo / arquivo(s) alvo** | `aiw-delivery`: `src/routes/iniciativas.ts`, `src/domain/iniciativa.ts`, `src/db/iniciativaRepo.ts` |
| **Data** | 2026-07-17 |

## Contexto

Porta `_routes/iniciativas.ts` para o `aiw-delivery` com o modelo remodelado para
documento: `iniciativa` com `etapas[]` **embutidas** (ADR-012). Instancia a jornada
do método ao criar. Consome `@aiw/tenant` (SDD-002 de auth) para isolamento.

## Escopo (entra / não entra)

- **Entra:** criar iniciativa (a partir de capacidade), listar por squad, obter por
  código (com etapas), modelo Mongo e índices.
- **Não entra:** concluir etapa/artefato (SDD-002), chat (SDD-003), histórias (Fase 4).

## Especificação técnica

**Componentes e arquivos**
- `domain/iniciativa.ts` — tipo `Iniciativa` + fábrica que instancia `etapas[]` do
  método (ou modelo livre) e gera `codigo` único.
- `db/iniciativaRepo.ts` — usa `scopedCollection` (filtro por `comunidadeId`).
- `routes/iniciativas.ts` — rotas abaixo.

**Contratos / APIs** (OpenAPI em `aiw-contracts`)
- `GET /api/squads/:id/iniciativas` → `[{ codigo, titulo, status, etapaAtual }]` — escopo squad.
- `POST /api/iniciativas { squadId, capacidadeId, titulo, descricao, metodoId? }` →
  cria iniciativa + etapas; `codigo` único → `{ codigo }`. Autorização: `pm,tech_lead` + `mesmaSquad`.
- `GET /api/iniciativas/:codigo` → iniciativa com `etapas[]` (+ histórias/repos quando existirem) — escopo.

**Dados** (DocumentDB)
```
iniciativa {
  _id, codigo(uniq), comunidadeId, squadId, capacidadeId,
  titulo, descricao, status:'em_andamento'|'concluida'|'pausada',
  etapaAtual, metodoId, livre, criadoPor, criadoEm,
  etapas: [ { ordem, nome, agenteId, status:'pendente'|'em_andamento'|'concluida',
              artefato: { titulo, secoes:[{h,itens:[]}] }|null, tokensGastos, concluidaEm } ]
}
```
- Índice único `codigo`; índice `(comunidadeId, squadId)`.
- Geração de `codigo` (ex.: `INI-<seq>`) com estratégia sem colisão (contador por
  comunidade ou sufixo aleatório verificado).

## Plano de testes

- PM cria iniciativa; `etapas[]` instanciadas conforme o método; `codigo` único.
- Criar com `codigo` colidente é impedido (índice único / retry).
- Listagem só retorna iniciativas da squad; outra squad não vê.
- `GET /:codigo` retorna etapas na ordem correta.
- Dev/gestao não conseguem criar (403).

## Tarefas

1. Definir tipo/fábrica em `domain/iniciativa.ts` (instanciar etapas do método).
2. Implementar `iniciativaRepo` com `scopedCollection` + índices.
3. Implementar as 3 rotas + validação Zod + RBAC/mesmaSquad.
4. Publicar OpenAPI; testes de unicidade, escopo e RBAC.

## Definition of Done

- [ ] Criar/listar/obter funcionam com etapas embutidas e isolamento por tenant.
- [ ] `codigo` único garantido; colisão tratada.
- [ ] RBAC (pm/tech_lead) e `mesmaSquad` aplicados.
- [ ] OpenAPI publicado; testes verdes; logs/traços com `requestId`.

## Prompt pronto

> Implemente no `aiw-delivery` o modelo e o CRUD de iniciativa conforme este SDD:
> documento `iniciativa` com `etapas[]` embutidas no DocumentDB, `domain/iniciativa.ts`
> (fábrica que instancia etapas do método e gera código único), `db/iniciativaRepo.ts`
> usando o `scopedCollection` de `@aiw/tenant`, e `routes/iniciativas.ts`
> (`GET /squads/:id/iniciativas`, `POST /iniciativas`, `GET /iniciativas/:codigo`) com
> Zod + RBAC(pm,tech_lead) + mesmaSquad. Índice único de código e índice por
> (comunidadeId, squadId). Gere OpenAPI e testes de unicidade/escopo/RBAC. Não faça
> conclusão de etapa nem chat aqui.
