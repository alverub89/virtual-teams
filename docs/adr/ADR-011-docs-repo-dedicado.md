# ADR-011 — Documentação em repositório dedicado (`aiw-docs`) + híbrido

- **Status:** Aceita
- **Data:** 2026-07-17
- **Contexto da fase:** Entrega 1

## Contexto

A instrução pede que, num mundo multi-repo, se decida e justifique se a pasta
`docs/` vive num repositório dedicado de arquitetura ou acompanha cada serviço.

## Decisão

Modelo **híbrido com hub dedicado**:

- **`aiw-docs` (repositório dedicado)** é a **fonte da verdade transversal**:
  `estrategia-migracao.md`, `arquitetura.md` (C4 + fluxo de dados), `adr/`
  (decisões que cruzam serviços) e o `README.md` índice. É por onde o comitê e
  qualquer novo integrante começam. Esta pasta `docs/` atual evolui para esse repo.
- **Documentação por funcionalidade** (`funcional.md` + `tecnico.md`) **acompanha o
  serviço dono** no seu repositório (ex.: os docs de iniciativas vivem em
  `aiw-delivery/docs/`), porque amadurecem junto com o código e o contrato daquela
  fatia. O `aiw-docs` **indexa/aponta** para eles (índice único, conteúdo local).
- ADRs **locais** a um serviço vivem no repo do serviço; ADRs **transversais** (as
  deste diretório) vivem no `aiw-docs`.

## Consequências

- **Positivas:** visão de conjunto centralizada para governança + proximidade
  código-documento para manutenção; cada doc versiona junto do que descreve.
- **Negativas / trade-offs:** índice no `aiw-docs` precisa ser mantido em dia
  (automatizável no CI); risco de link quebrado entre repos.
- **Nesta rodada:** como ainda estamos no monorepo de origem, **toda a
  documentação vive em `docs/`** aqui; ao criar os repos, `funcionalidades/<x>/`
  migra para o repo do serviço dono e o restante para `aiw-docs`.

## Alternativas consideradas

- **Tudo em repo dedicado** — afasta doc do código, tende a desatualizar.
- **Tudo distribuído por serviço** — perde a visão de conjunto que o comitê exige.
