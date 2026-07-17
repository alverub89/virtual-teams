# ADR-001 — Multi-repo por bounded context + repositório de contratos

- **Status:** Aceita
- **Data:** 2026-07-17
- **Contexto da fase:** Entrega 1 (transversal a todas as fases)

## Contexto

O sistema atual é um **monorepo** Netlify (web + functions + db + ai + integrations
+ shared). A restrição de destino é **multi-repo** — cada peça no seu repositório,
com contratos explícitos. Precisamos de uma decomposição que permita migrar por
fatia vertical (strangler fig), deployar de forma independente e versionar os
contratos entre serviços.

## Decisão

Decompor por **bounded context** de negócio, um repositório por serviço deployável:

- `aiw-web` — SPA React.
- `aiw-identity` — auth, sessão, multi-tenant, pessoas, convites.
- `aiw-delivery` — iniciativas, jornada, histórias, documentos/SDD.
- `aiw-agents` — agentes, skills, tools, composição de prompt, roteamento de
  modelos, MCP.
- `aiw-okr` — OKRs e indicadores de gestão.
- `aiw-capabilities` — capacidades, repositórios, mapa, KB.
- `aiw-pipeline` — esteira e GMUD.
- `aiw-autonomy` — execução autônoma, orquestrador, party.

E três repositórios de plataforma:

- **`aiw-contracts`** — fonte da verdade dos contratos: **OpenAPI** por serviço e
  **JSON Schema** dos eventos assíncronos, versionados semanticamente. Publicado
  como pacote consumível (tipos gerados) pelos serviços e pela SPA.
- `aiw-platform-infra` — módulos Terraform compartilhados (VPC, DocumentDB, filas,
  observabilidade).
- `aiw-docs` — documentação de arquitetura e ADRs (ver ADR-011).

## Consequências

- **Positivas:** deploy e ciclo de vida independentes; fronteiras claras; fatia de
  migração = repositório; contratos versionados evitam quebra silenciosa.
- **Negativas / trade-offs:** o `shared/` atual (tipos + Zod) precisa virar pacote
  publicado em `aiw-contracts`; mudança de contrato exige disciplina de versão
  (semver + testes de contrato). Custo operacional de N pipelines.
- **Mitigação:** testes de contrato (consumer-driven) no CI; um contrato só é
  "breaking" com major version; a façade permite conviver com versões.

## Alternativas consideradas

- **Monorepo com workspaces** — viola a restrição de destino; descartada.
- **Um repo por função (nano-serviços)** — fragmentação excessiva, contratos
  demais; descartada em favor de bounded contexts coesos.
