# SDD — Contabilização de consumo de tokens (evento + agregação)

| | |
|---|---|
| **Funcionalidade** | Iniciativas & jornada com agente (F2) / transversal |
| **História** | Como plataforma, quero contabilizar tokens por squad/mês, para controlar custo de IA e alertar em 80% do budget |
| **Fase / Nível** | Fase 1 · N1 · Especificado |
| **Repo / arquivo(s) alvo** | `aiw-delivery` (emissão) · `aiw-okr`/worker (agregação): `consumer/tokensConsumidos.ts` |
| **Data** | 2026-07-17 |

## Contexto

Porta `_lib/consumo.ts`. Cada interação de IA emite um evento; um consumidor agrega
em `consumo_tokens` (upsert por squad/mês) e alerta em 80% do budget (o mesmo alerta
que o sweeper emite hoje). Desacopla a contabilização do caminho de request (SQS).

## Escopo (entra / não entra)

- **Entra:** contrato do evento `TokensConsumidos`, consumidor idempotente com upsert
  `$inc`, alerta de budget, exposição do consumo para a UI/gestão.
- **Não entra:** dashboards de gestão (Fase 2), teto por run (Fase 7).

## Especificação técnica

**Componentes e arquivos**
- Emissão: já disparada no fim do chat (SDD-003) e de qualquer geração de IA.
- `consumer/tokensConsumidos.ts` — Lambda worker (SQS) que faz o upsert e checa budget.

**Contratos / APIs**
- Evento (JSON Schema em `aiw-contracts`): `TokensConsumidos { comunidadeId, squadId,
  mes:'YYYY-MM', promptTokens, completionTokens, custo, idempotencyKey }`.
- `GET /api/consumo?squadId=&mes=` → `{ promptTokens, completionTokens, custo, budget, pct }` (escopo).

**Dados**
```
consumo_tokens { _id, comunidadeId, squadId, mes, promptTokens, completionTokens, custo }
```
- Índice único `(squadId, mes)`; upsert com `$inc` (atômico).
- Idempotência: `idempotencyKey` (ex.: `chat:{mensagemId}`) registrada para não somar
  duas vezes em retry da fila.

## Plano de testes

- Evento agrega corretamente (soma prompt/completion/custo) por squad/mês.
- Reentrega do mesmo evento (mesma `idempotencyKey`) não soma duas vezes.
- Ao cruzar 80% do budget da squad, alerta/alarme é emitido uma vez.
- `GET /consumo` retorna os números e o percentual corretos por escopo.

## Tarefas

1. Definir o contrato do evento em `aiw-contracts`.
2. Implementar o consumidor SQS com upsert `$inc` e guarda de idempotência.
3. Implementar `GET /consumo` (leitura por escopo).
4. Configurar alarme de 80% do budget (ADR-009); testes.

## Definition of Done

- [ ] Consumo agregado por squad/mês, idempotente sob retry.
- [ ] Alerta de 80% do budget disparado uma vez por cruzamento.
- [ ] `GET /consumo` correto por escopo; observabilidade (métrica de custo/tokens).

## Prompt pronto

> Implemente a contabilização de tokens conforme este SDD: contrato do evento
> `TokensConsumidos` (com idempotencyKey) em `aiw-contracts`, um consumidor SQS
> (`consumer/tokensConsumidos.ts`) que faz upsert `$inc` em `consumo_tokens` por
> (squadId, mes) com guarda de idempotência, o alarme de 80% do budget da squad, e a
> rota `GET /consumo` de leitura por escopo. Cubra com testes a agregação, a
> idempotência sob reentrega e o disparo único do alerta de budget.
