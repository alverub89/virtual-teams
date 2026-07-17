# Documentação — Migração AI Workspace (Netlify/Neon → AWS/MongoDB)

Este é o **mapa** da documentação. Comece por aqui. Toda a documentação de
estratégia, arquitetura, decisões (ADR) e por funcionalidade vive nesta pasta
`docs/`. Idioma: **português** (nomes de tecnologia/código/endpoints em inglês);
diagramas em **Mermaid**; decisões como **ADR**.

> **Contexto multi-repo (ADR-011):** enquanto estamos no repositório de origem, tudo
> vive aqui. Ao criar os repositórios de destino, o conteúdo transversal
> (estratégia, arquitetura, ADRs, este índice) migra para um repositório dedicado
> **`aiw-docs`**, e cada `funcionalidades/<x>/` acompanha o repositório do serviço
> dono, com este índice apontando para eles.

## Como navegar

- **Decisor / comitê de arquitetura e segurança** → `estrategia-migracao.md` +
  `arquitetura.md` + `adr/`.
- **Quem vai construir uma fatia** → `funcionalidades/<funcionalidade>/` (funcional +
  técnico) da fase correspondente.
- **Quem quer o entendimento do sistema atual** → `descoberta-fase-0.md`.

## Índice de arquivos

| Arquivo / pasta | O que contém | Para quem | Fase / Nível |
|---|---|---|---|
| `README.md` | Este índice — mapa de navegação da documentação | Todos | — |
| `descoberta-fase-0.md` | Fase 0: inventário do sistema atual, integrações, jobs, dados, mapa de equivalência, premissas e perguntas obrigatórias | Todos | Fase 0 · N0 |
| `estrategia-migracao.md` | **Entrega 1**: sequenciamento por valor×risco×dependência×esforço, cartão por fase (DoD, riscos, rollback, métrica), coexistência strangler fig e estratégia de dados Postgres→MongoDB | Comitê, tech leads | Entrega 1 · N1 |
| `arquitetura.md` | **Entrega 1**: desenho da aplicação no destino — C4 níveis 1–3 (contexto, container, componente), fluxo de dados (request→MongoDB com secrets e auth), prosa por bloco | Comitê, arquitetos | Entrega 1 · N1 |
| `adr/` | Decisões de arquitetura, uma por arquivo (ADR-001…012) | Arquitetos, segurança | Entrega 1 · N1 |
| `funcionalidades/<x>/funcional.md` | Doc funcional: propósito, usuários, fluxos, regras, critérios de aceite | PM, negócio, QA | por fase |
| `funcionalidades/<x>/tecnico.md` | Doc técnico: arquitetura da funcionalidade, contratos, modelo Mongo, integrações, segurança/observabilidade, ADRs | Dev, tech lead | por fase |
| `spec/` | Especificação técnica do sistema **atual** (origem) — referência de leitura | Todos | referência |
| `prototipo/` | Protótipo navegável do sistema atual (referência de UX) | Design, PM | referência |
| `plano-de-implementacao.md` | Plano de implementação do sistema **atual** (origem) — referência histórica | Todos | referência |

## Funcionalidades e maturidade

Cada funcionalidade tem um par funcional+técnico que **amadurece por fase**:
**N0 · Rascunho** (hipótese, Fase 0) → **N1 · Especificado** (detalhado o suficiente
para construir, antes da fase executar) → **N2 · Validado** (reflete o que foi
entregue, ADRs fechadas, observabilidade descrita).

| Funcionalidade | Pasta | Fase de entrega | Nível atual |
|---|---|---|---|
| Autenticação, sessão & multi-tenant | `funcionalidades/autenticacao-multi-tenant/` | Fase 1 | **N1** |
| Iniciativas & jornada com agente (streaming) | `funcionalidades/iniciativas-jornada/` | Fase 1 | **N1** |
| OKRs & indicadores de gestão | _(a criar antes da Fase 2)_ | Fase 2 | N0 |
| Capacidades & repositórios + KB | _(a criar antes da Fase 3)_ | Fase 3 | N0 |
| Histórias & documentação/SDD | _(a criar antes da Fase 4)_ | Fase 4 | N0 |
| Esteira & GMUD | _(a criar antes da Fase 5)_ | Fase 5 | N0 |
| Console & governança de agentes/MCP | _(a criar antes da Fase 6)_ | Fase 6 | N0 |
| Execução autônoma & orquestrador (squad virtual) | _(a criar antes da Fase 7)_ | Fase 7 | N0 |

> As funcionalidades ainda em N0 estão descritas no inventário da
> `descoberta-fase-0.md` (§2). Cada uma ganha seu par funcional+técnico em N1 **antes**
> de sua fase entrar em execução, e sobe a N2 ao final da fase.

## Índice de ADRs

| ADR | Decisão |
|---|---|
| [ADR-001](adr/ADR-001-multi-repo-bounded-context.md) | Multi-repo por bounded context + repositório de contratos |
| [ADR-002](adr/ADR-002-compute-fargate-lambda-stepfunctions.md) | Compute: Fargate + Lambda + Step Functions (híbrido robusto) |
| [ADR-003](adr/ADR-003-banco-documentdb-alvo-modelagem.md) | Banco: DocumentDB como alvo de modelagem (Atlas como relaxação) |
| [ADR-004](adr/ADR-004-strangler-fig-facade.md) | Migração strangler fig com façade de borda |
| [ADR-005](adr/ADR-005-execucao-autonoma-step-functions.md) | Execução autônoma em Step Functions + DocumentDB |
| [ADR-006](adr/ADR-006-autenticacao-oidc-corporativa.md) | Autenticação corporativa OIDC/SSO |
| [ADR-007](adr/ADR-007-secrets-iam-vpc.md) | Secrets Manager + IAM least-privilege + VPC |
| [ADR-008](adr/ADR-008-gateways-internos-ia-integracoes.md) | Gateways internos de IA e de integrações |
| [ADR-009](adr/ADR-009-observabilidade-otel.md) | Observabilidade OpenTelemetry + CloudWatch + X-Ray |
| [ADR-010](adr/ADR-010-pii-lgpd.md) | PII/LGPD: mascaramento, tokenização, KMS e trilha imutável |
| [ADR-011](adr/ADR-011-docs-repo-dedicado.md) | Documentação em repositório dedicado + híbrido |
| [ADR-012](adr/ADR-012-migracao-dados-por-funcionalidade.md) | Migração de dados Postgres→MongoDB por funcionalidade |

## Estado e próximos passos

- **Fase 0** concluída (descoberta + premissas). Premissas fixadas no patamar
  **mais robusto** na AWS, a serem confirmadas/ajustadas pelas respostas às
  perguntas obrigatórias (`descoberta-fase-0.md` §9).
- **Entrega 1** (estratégia + arquitetura + ADRs) e **Entrega 2** (docs da Fase 1)
  produzidas.
- **Próximo:** validar as premissas e, ao iniciar cada fase, produzir/atualizar os
  docs N1 da sua funcionalidade e evoluí-los a N2 ao final.
