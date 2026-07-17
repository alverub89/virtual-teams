# ADR-009 — Observabilidade: OpenTelemetry + CloudWatch + X-Ray

- **Status:** Aceita (patamar robusto)
- **Data:** 2026-07-17
- **Contexto da fase:** Fase 1 (transversal)

## Contexto

Hoje: logs de Function e Sentry para erros. A spec pede logs estruturados com
`requestId`/`runId`, métricas de produto e tracing. Num sistema multi-serviço +
assíncrono, correlação ponta a ponta é essencial.

## Decisão

- **Instrumentação com OpenTelemetry** em todos os serviços e workers (traces +
  métricas), exportando via **OTel Collector**.
- **Traces → AWS X-Ray** (ou coletor corporativo), correlacionados por
  `requestId` (síncrono) e `runId` (execução autônoma) atravessando web → API →
  fila → worker → IA.
- **Logs JSON estruturados → CloudWatch Logs**, com o mesmo id de correlação.
- **Métricas de produto e de infra → CloudWatch Metrics**: latência de SSE
  (primeiro token), consumo de tokens/custo por squad, duração/erro de job, DLQ,
  runs travados/reenfileirados, progresso de KR.
- **Alarmes**: 5xx, DLQ não vazia, budget de tokens > 80% (o alerta que o sweeper
  já emite), latência de p95.

## Consequências

- **Positivas:** correlação ponta a ponta; padrão aberto (portável); métricas de
  negócio e de infra num só lugar.
- **Negativas / trade-offs:** custo de ingestão/retenção; instrumentação disciplinada.
- **Relaxação aceitável:** se o padrão corporativo for **Datadog/ELK**, o OTel
  Collector exporta para lá sem trocar a instrumentação (**pergunta obrigatória #5**).

## Alternativas consideradas

- **Só Sentry + logs de Function** — insuficiente para tracing distribuído.
- **Vendor lock-in direto (SDK proprietário)** — evitado; OTel preserva portabilidade.
