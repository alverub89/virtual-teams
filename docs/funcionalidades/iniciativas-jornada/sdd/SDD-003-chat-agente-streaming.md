# SDD — Chat com o agente da etapa (streaming SSE)

| | |
|---|---|
| **Funcionalidade** | Iniciativas & jornada com agente (F2) |
| **História** | Como PM/Dev, quero conversar com o agente da etapa e ver a resposta em streaming, para produzir o artefato com apoio de IA |
| **Fase / Nível** | Fase 1 · N1 · Especificado |
| **Repo / arquivo(s) alvo** | `aiw-delivery`: `src/routes/chat.ts`, `src/lib/sse.ts` · consome `aiw-agents` (SDD-004) |
| **Data** | 2026-07-17 |

## Contexto

Primeiro uso real de IA na nova stack e a razão de a API rodar em **Fargate** (SSE
longo). Porta o chat de `_routes/iniciativas.ts`. A composição de prompt, o
roteamento de modelo e o adapter do gateway ficam em `aiw-agents` (SDD-004); aqui é a
rota de streaming, persistência da mensagem e disparo da contabilização de tokens.

## Escopo (entra / não entra)

- **Entra:** rota SSE de chat da etapa atual, persistência das mensagens
  (`mensagem_chat`), mascaramento de PII antes de sair, emissão do evento de consumo.
- **Não entra:** `PromptComposer`/`ModelRouter`/adapter (SDD-004); tools/function
  calling (Fase 6); execução autônoma (Fase 7).

## Especificação técnica

**Componentes e arquivos**
- `lib/sse.ts` — helper de `text/event-stream` (headers, `ReadableStream`, flush).
- `routes/chat.ts` — `POST /api/iniciativas/:id/chat`.
- Cliente para `aiw-agents`: `agents.stream({ agenteId, etapa, historico, entrada })`.

**Contratos / APIs**
- `POST /api/iniciativas/:id/chat { etapaOrdem, mensagem }` → responde
  `text/event-stream`: eventos `token` (delta), `done` (com `usage`). Autorização:
  escopo squad.
- Fluxo: carrega iniciativa+etapa+agente (escopo/tenant) → grava mensagem do usuário
  → **mascara PII** (guard-rail) → `aiw-agents.stream(...)` → repassa tokens por SSE
  → ao encerrar, grava a mensagem do agente e emite `TokensConsumidos`.

**Dados**
```
mensagem_chat { _id, comunidadeId, iniciativaId, etapaOrdem, autor:'user'|'agente',
                autorNome, conteudo, tokens, criadoEm }   // coleção própria (alto volume)
```
- Índice `(comunidadeId, iniciativaId, etapaOrdem, criadoEm)`.

## Plano de testes

- Chat responde em SSE; primeiro `token` chega rapidamente; `done` traz `usage`.
- Mensagens do usuário e do agente são persistidas com os tokens corretos.
- Nenhuma PII bruta é enviada ao gateway (teste com payload contendo PII → mascarado).
- Escopo/tenant respeitados (outra squad → 403).
- Falha do gateway de IA encerra o stream com evento de erro e não corrompe estado.
- Evento `TokensConsumidos` é emitido uma vez por interação.

## Tarefas

1. Implementar `lib/sse.ts` (streaming em Fargate/Hono).
2. Implementar `routes/chat.ts` (carregar contexto, mascarar PII, stream, persistir).
3. Integrar cliente `aiw-agents.stream` (SDD-004) e emissão de `TokensConsumidos`.
4. Testes de streaming, persistência, PII e erro; métrica de latência do 1º token.

## Definition of Done

- [ ] Chat streaming ponta a ponta em Fargate atrás da façade.
- [ ] Mensagens e tokens persistidos; evento de consumo emitido.
- [ ] Mascaramento de PII verificado; nada bruto sai ao gateway (ADR-010).
- [ ] p95 do 1º token medido (< 3 s alvo) e alarme configurado.
- [ ] Erro do gateway tratado sem corromper estado.

## Prompt pronto

> Implemente no `aiw-delivery` o chat streaming da etapa conforme este SDD:
> `lib/sse.ts` (text/event-stream em Hono/Fargate) e `routes/chat.ts`
> (`POST /iniciativas/:id/chat`) que carrega iniciativa+etapa+agente com escopo/tenant,
> grava a mensagem do usuário, **mascara PII** antes de chamar `aiw-agents.stream(...)`,
> repassa tokens por SSE, e ao final persiste a mensagem do agente em `mensagem_chat` e
> emite o evento `TokensConsumidos`. Meça a latência do primeiro token, trate erro do
> gateway sem corromper estado e cubra PII/streaming/persistência com testes.
