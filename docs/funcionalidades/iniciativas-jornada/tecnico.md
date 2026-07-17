# Iniciativas & Jornada com agente — Documento Técnico

| | |
|---|---|
| **Funcionalidade** | Iniciativas, jornada BMAD e chat com o agente da etapa (F2) |
| **Fase** | Fase 1 (esqueleto andante) |
| **Nível de maturidade** | N1 · Especificado |
| **Data** | 2026-07-17 |

## 1. Arquitetura da funcionalidade no destino

- **Repositórios / serviços:** `aiw-delivery` (iniciativas, jornada, chat — Fargate)
  + `aiw-agents` (composição de prompt, roteamento de modelos, adapter de IA).
- **Serviços AWS:** Fargate (streaming SSE), DocumentDB, Secrets Manager, KMS,
  **Gateway de IA** (via adapter), OTel→CloudWatch/X-Ray.
- **Por que Fargate:** o chat usa **SSE** (resposta em stream) e latência de modelo;
  container de longa duração é o alvo robusto (ADR-002).
- Componentes (C4 nível 3): ver `arquitetura.md` §3.1.

## 2. Contratos de API / interfaces

Publicados em `aiw-contracts` (OpenAPI de `delivery`).

| Método + rota | Descrição | Autorização |
|---|---|---|
| `GET /api/squads/:id/iniciativas` | Lista iniciativas da squad | escopo squad |
| `POST /api/iniciativas` | Cria iniciativa a partir de capacidade | pm/tech_lead |
| `GET /api/iniciativas/:codigo` | Jornada + etapas + histórias + repos | escopo |
| `POST /api/iniciativas/:id/etapas/:ordem/concluir` | Salva artefato e avança | escopo squad |
| `POST /api/iniciativas/:id/chat` | **Chat com o agente da etapa (SSE)** | escopo |

**Streaming:** a rota de chat responde `text/event-stream`; o adapter `LLMProvider`
(aiw-agents) transmite tokens conforme chegam do **gateway de IA**; ao encerrar,
persiste a mensagem e o consumo de tokens.

**Evento assíncrono:** `TokensConsumidos { squadId, mes, promptTokens,
completionTokens, custo }` (JSON Schema em `aiw-contracts`) para agregação.

## 3. Modelo de dados MongoDB

Técnica de migração: **dual-write** para iniciativas ativas + **backfill** das
concluídas (ADR-012). Índices por `comunidadeId`/`squadId`.

```
iniciativa {
  _id, codigo(uniq), comunidadeId, squadId, capacidadeId,
  titulo, descricao, status, etapaAtual, metodoId, livre, criadoPor, criadoEm,
  etapas: [                                   // AGREGADO EMBUTIDO (era iniciativa_etapa)
    { ordem, nome, agenteId, status,
      artefato: { titulo, secoes: [{ h, itens: [] }] },
      tokensGastos, concluidaEm }
  ]
}
mensagem_chat {                               // COLEÇÃO PRÓPRIA (alto volume)
  _id, comunidadeId, iniciativaId, etapaOrdem, autor, autorNome, conteudo, tokens, criadoEm
}
documento { _id, comunidadeId, squadId, iniciativaId, historiaId, titulo, tipo, conteudo, extra, ... }
consumo_tokens { _id, comunidadeId, squadId, mes, promptTokens, completionTokens, custo }  // uniq (squad,mes)
```

**Decisões de modelagem (Postgres → documento):**
- `iniciativa_etapa` (1:N com `UNIQUE(iniciativa,ordem)`) → **embutido** em
  `iniciativa.etapas[]`: é um agregado natural, sempre lido/escrito junto com a
  iniciativa; `artefato` já era `jsonb`. A atomicidade de "concluir etapa" vira
  **atualização de um único documento** (ganho vs. transação multi-tabela).
- `mensagem_chat` → **coleção própria**: alto volume e crescimento independente;
  embutir estouraria o documento da iniciativa.
- `historia` → coleção própria (detalhada na Fase 4).
- Unicidade `iniciativa.codigo` → índice único; `consumo_tokens (squad,mes)` → índice
  único com **upsert atômico** (`$inc`) por interação.
- Concorrência de "concluir etapa" → update condicional por `etapas.ordem` +
  `status` (evita dupla conclusão).

## 4. Integrações e autenticação

- **Auth:** herda a sessão OIDC + tenant + RBAC do `aiw-identity` (ADR-006).
- **IA:** `aiw-agents` compõe o prompt de sistema (identidade + skills + tools +
  guard-rails) e resolve o modelo por tarefa (`modelo_ia_rota` → nível → modelo);
  chama o **gateway de IA** pelo adapter (contrato OpenAI-compat) — ADR-008.
- **Agentes:** na Fase 1, catálogo **seed** (built-in) + composição de prompt; o
  editor completo é a Fase 6.

## 5. Segurança e observabilidade

- **PII:** antes de qualquer chamada de IA, o **PII Masker** (guard-rail de
  blueprint) mascara dados sensíveis; nenhuma PII bruta sai pelo gateway (ADR-010).
- **Segredos:** product key do gateway de IA no Secrets Manager (ADR-007).
- **Isolamento:** toda query filtra por `comunidadeId`/`squadId`; escrita só na
  própria squad (RBAC + `mesmaSquad`).
- **Teto de custo:** consumo por squad/mês contabilizado; alerta em 80% do budget
  (métrica/alarme — ADR-009).
- **Observabilidade:** traço distribuído web→delivery→agents→gateway de IA
  correlacionado por `requestId`; métrica de **latência do primeiro token (SSE)** e
  de tokens/custo; logs JSON; auditoria de criação de iniciativa e conclusão de etapa.

## 6. ADRs relevantes

- **ADR-002** — Compute (Fargate para SSE).
- **ADR-003 / ADR-012** — DocumentDB e modelagem (etapas embutidas, chat em coleção).
- **ADR-008** — Gateway de IA.
- **ADR-010** — PII/LGPD (mascaramento nos prompts).

## 7. Pendências para N2 (validado)

- PoC de streaming SSE em Fargate atrás da façade (confirmar p95 do primeiro token).
- Contrato final do gateway de IA (auth/headers) — pergunta obrigatória #3.
- Reconciliação do dual-write de iniciativas ativas durante a janela de coexistência.
