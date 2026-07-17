# SDD — aiw-agents: composição de prompt, roteamento de modelos e adapter do gateway de IA

| | |
|---|---|
| **Funcionalidade** | Iniciativas & jornada com agente (F2) / serviço `aiw-agents` |
| **História** | Como plataforma, quero compor o prompt do agente, escolher o modelo por tarefa e falar com o gateway de IA, para servir gerações e streaming aos demais serviços |
| **Fase / Nível** | Fase 1 · N1 · Especificado |
| **Repo / arquivo(s) alvo** | `aiw-agents`: `src/prompt/composer.ts`, `src/router/modelRouter.ts`, `src/provider/{provider,gateway}.ts`, `src/lib/piiMasker.ts` |
| **Data** | 2026-07-17 |

## Contexto

Porta `ai/provider.ts`, `ai/router.ts`, `ai/prompts.ts` e o adapter Omni
(`ai/omni.ts`) para o serviço `aiw-agents`, apontando para o **gateway interno de
IA** (ADR-008). Na Fase 1 é catálogo **seed** (built-in) + composição de prompt +
streaming; o editor de agentes é a Fase 6.

## Escopo (entra / não entra)

- **Entra:** composição do prompt de sistema (identidade + skills + tools +
  guard-rails), `resolveModel(tarefa)`, adapter `LLMProvider` (chat/stream) contra o
  gateway, PII masker reutilizável, catálogo seed de agentes.
- **Não entra:** function calling/execução de tools (Fase 6), embeddings (fora do
  escopo da Fase 1), editor de agentes.

## Especificação técnica

**Componentes e arquivos**
- `prompt/composer.ts` — `composeSystemPrompt(agente, skills, tools, guardRails)`:
  usa `agente.promptSistema` quando definido, senão compõe a partir das partes.
- `router/modelRouter.ts` — `resolveModel(tarefa)`: lê `modelo_ia_rota` (tarefa →
  nível → modelo); fallback ao `AI_MODELS_JSON`. Tarefas: `arquitetura|prd|historias|
  resumo|classificacao|sync`.
- `provider/provider.ts` — interface `LLMProvider { chat(); stream(); }` (contrato
  OpenAI-compatible).
- `provider/gateway.ts` — adapter do **gateway de IA**: base URL + auth do Secrets
  Manager; `stream()` propaga tokens; mock quando sem credencial (dev).
- `lib/piiMasker.ts` — mascaramento reutilizável (consumido por `aiw-delivery`).

**Contratos / APIs** (internos, consumidos por outros serviços via `aiw-contracts`)
- `POST /agents/chat { agenteId, tarefa, system?, messages, maxTokens }` → `{ content, usage }`.
- `POST /agents/stream { ... }` → `text/event-stream` (eventos `token`, `done{usage}`).
- `GET /agents` (catálogo seed) — leitura.

**Dados**
- `agente`, `skill`, `tool`, `modelo_ia_rota` (coleções; catálogo seed via `corte`,
  ADR-012). `agente.guardRails`, `tool.inputSchema/handlerConfig` já são documento.
- Segredo: product key do gateway no Secrets Manager (ADR-007).

## Plano de testes

- `composeSystemPrompt` usa override quando presente e compõe corretamente quando não.
- `resolveModel` retorna o modelo da tabela; sem rota, cai no `AI_MODELS_JSON`; sem
  ambos, erro claro.
- `chat`/`stream` contra um gateway mock retornam conteúdo e `usage`; stream emite deltas.
- `piiMasker` remove/mascara PII conhecida (CPF, email) — cobertura de casos.
- Sem credencial, cai no mock (não quebra o dev).

## Tarefas

1. Portar `composer`, `modelRouter`, `provider`/`gateway` e `piiMasker`.
2. Expor rotas internas `chat`/`stream`/`agents` + contrato.
3. Seed do catálogo de agentes/skills/tools/rotas de modelo (built-in).
4. Testes de composição, roteamento, streaming e mascaramento.

## Definition of Done

- [ ] Composição de prompt, roteamento e streaming funcionam contra o gateway.
- [ ] Product key só do Secrets Manager; mock no dev sem credencial.
- [ ] PII masker reutilizável e testado.
- [ ] Catálogo seed disponível; contrato publicado; traços/consumo observáveis.

## Prompt pronto

> Implemente o serviço `aiw-agents` conforme este SDD, portando `ai/prompts.ts`,
> `ai/router.ts`, `ai/provider.ts` e o adapter Omni para: `prompt/composer.ts`
> (compõe/usa override do prompt de sistema), `router/modelRouter.ts`
> (`resolveModel` lendo modelo_ia_rota com fallback AI_MODELS_JSON),
> `provider/gateway.ts` (adapter LLMProvider OpenAI-compat contra o gateway interno
> de IA, auth do Secrets Manager, streaming, mock sem credencial) e `lib/piiMasker.ts`
> reutilizável. Exponha rotas internas chat/stream/agents com contrato em
> `aiw-contracts`, faça o seed do catálogo de agentes/skills/tools/rotas e cubra tudo
> com testes. Não implemente function calling/execução de tools (Fase 6).
