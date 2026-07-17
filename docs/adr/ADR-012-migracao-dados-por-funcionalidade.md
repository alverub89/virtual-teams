# ADR-012 — Migração de dados Postgres→MongoDB por funcionalidade

- **Status:** Aceita
- **Data:** 2026-07-17
- **Contexto da fase:** Transversal (aplicada em cada fase)

## Contexto

O modelo relacional (schema `ai_workspace`, ~40 tabelas) precisa virar documentos.
A migração é por fatia vertical e reversível; os dados de cada funcionalidade têm
perfis diferentes de volume e escrita concorrente.

## Decisão

**Escolher a técnica de dados por funcionalidade**, não uma única para tudo:

- **Corte (cutover):** catálogo/config de baixo volume e sem escrita concorrente na
  janela (agentes, skills, tools, métodos, blueprints, modelos). Backfill único →
  vira a chave na façade → legado read-only.
- **Backfill idempotente:** dados históricos estáveis na janela (iniciativas
  concluídas, OKRs de trimestres fechados, audit_log antigo). ETL re-executável com
  reconciliação por contagem/checksum.
- **Dual-write:** dados quentes com escrita concorrente enquanto a rota ainda pode
  voltar ao legado (iniciativas ativas, chat, medições de KR quentes). O serviço
  novo grava no Mongo **e** replica ao Postgres legado (via evento SQS→Lambda ou
  **CDC com AWS DMS/Debezium**) até o corte final; reconciliação diária.

**Regras de remodelagem relacional→documento:**

- **Agregado natural → documento único:** `iniciativa` + `etapas[]`;
  `execucao_autonoma` + `passos[]` + `checkpoints[]`; `okr` + `keyResults[]` +
  `medicoes[]`; `mapa_capacidade` (já jsonb) 1:1.
- **N:N de baixo volume → lista de referência embutida:** `agente_tool`,
  `agente_skill`, `kr_feature`, `capacidade_repositorio`.
- **Alto volume / consulta independente → coleção própria:** `mensagem_chat`,
  `historia`, `audit_log`, `consumo_tokens`.
- **Tenant:** `comunidadeId` em toda coleção; índice composto `(comunidadeId, …)`.
- **Unicidade transacional** (`iniciativa.codigo`, `convite.token`, `(kr,mes)`,
  `(exec,ordem)`) → índices únicos no Mongo; atomicidade preferencialmente por
  documento único, transação multi-documento só quando inevitável (limites do
  DocumentDB — ADR-003).
- **Idempotência/concorrência** do motor de run → updates condicionais
  (findAndModify) + chave `run:{id}:passo:{ordem}`.

## Consequências

- **Positivas:** cada fatia migra com o menor risco possível; reversível via
  dual-write; modelagem justificada caso a caso no `tecnico.md`.
- **Negativas / trade-offs:** dual-write/CDC exige idempotência e reconciliação;
  conviver com dois modelos durante a janela.
- **Verificação:** toda migração de dados só é "pronta" com reconciliação
  (contagem + amostragem) e plano de rollback testado.

## Alternativas consideradas

- **Uma técnica única para tudo** — ou arrisca dados quentes (corte) ou encarece
  desnecessariamente dados frios (dual-write); descartada.
- **Manter o relacional e só espelhar** — não atende à restrição de destino
  (MongoDB).
