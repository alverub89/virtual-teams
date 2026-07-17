# ADR-002 — Compute: Fargate + Lambda + Step Functions (híbrido robusto)

- **Status:** Aceita (patamar robusto; ver relaxações)
- **Data:** 2026-07-17
- **Contexto da fase:** Entrega 1 (transversal)

## Contexto

Na Netlify, o compute é: Functions v2 síncronas (~10s), Background Functions
(≤15 min) e Scheduled Functions. Dois traços do produto pressionam a escolha na
AWS: **streaming SSE** (chat de agente) e **orquestração longa com pausas humanas**
(execução autônoma). A instrução de projeto é adotar o patamar **mais robusto**.

## Decisão

Modelo de compute híbrido:

- **API síncrona + streaming SSE → ECS Fargate** (container Hono de longa duração).
  Fargate — não Lambda — porque o streaming SSE e o controle de conexão ao
  DocumentDB são mais previsíveis num container persistente.
- **Workers assíncronos (consumidores de fila, webhooks) → Lambda**, disparados por
  **SQS (+DLQ)** e EventBridge.
- **Orquestração longa (runs, orquestrador, party) → AWS Step Functions**, com o
  checkpoint humano como estado `waitForTaskToken` (espera sem custo de compute).
- **Cron (sweeper, fechamento de custos) → EventBridge Scheduler**.
- **Borda:** API Gateway/ALB (façade) + CloudFront + WAF.

## Consequências

- **Positivas:** cada carga no serviço certo; streaming e jobs longos deixam de ser
  contornos e viram nativos; Step Functions dá visibilidade e retry de primeira
  classe à máquina de estados.
- **Negativas / trade-offs:** mais peças que "só Lambda"; custo de container ocioso
  no Fargate; curva de Step Functions.
- **Relaxação aceitável:** onde o time preferir simplicidade, a API pode rodar em
  **Lambda + API Gateway** com response streaming, e a orquestração pode ser um
  **worker Lambda + SQS** sem Step Functions. Registrar a escolha por serviço.

## Alternativas consideradas

- **Só Lambda** — mais simples e barato ocioso, mas SSE longo e jobs >15 min viram
  contorno; adiado para relaxação.
- **Só ECS/Fargate/EKS** — uniforme, mas perde a economia serverless dos workers e
  o scheduler nativo; descartada como padrão único.
