# ADR-008 — Gateways internos de IA e de integrações (egress controlado)

- **Status:** Aceita
- **Data:** 2026-07-17
- **Contexto da fase:** Fase 1 (IA) e Fase 3+ (integrações)

## Contexto

Serviços em VPC privada não têm rota direta à internet. O sistema já isola a IA
atrás de um adapter (`LLMProvider` → Omni gateway) e chama GitHub/board/Atlan/
ServiceNow/CMDB diretamente. No destino, todo egress deve ser **controlado**.

## Decisão

- **Gateway interno de IA:** ponto único de saída para o provedor de IA próprio. O
  adapter `LLMProvider` aponta para ele (contrato OpenAI-compatible, como hoje).
  Concentra **DLP/mascaramento de PII**, quota/custo, e auditoria das chamadas.
  Trocar de provedor muda só o gateway/adapter.
- **Gateway interno de integrações:** todo egress para GitHub, board, Atlan,
  ServiceNow e CMDB passa por ele — allow-list, credenciais de serviço,
  observabilidade e rate limiting centralizados. Os adapters de tool falam com o
  gateway, não com a internet.
- Sem gateway disponível para um destino, usa-se **egress controlado** (VPC egress
  via proxy/NAT com allow-list) como equivalente.

## Consequências

- **Positivas:** superfície de saída mínima e auditável; DLP e custo de IA num só
  lugar; portabilidade de provedor.
- **Negativas / trade-offs:** o gateway é caminho crítico (precisa de HA e
  observabilidade); latência extra de um hop.
- **Dependência:** o contrato e a autenticação do gateway são **pergunta
  obrigatória #3** — enquanto não confirmados, o adapter assume OpenAI-compat.

## Alternativas consideradas

- **Acesso direto à internet dos serviços** — inaceitável no ambiente corporativo.
- **Um proxy genérico sem DLP** — não atende ao mascaramento de PII exigido (ADR-010).
