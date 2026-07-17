# SDDs — Iniciativas & Jornada com agente (Fase 1)

Specs executáveis (Spec-Driven Development), prontas para implementação. Cada uma
segue o template do projeto (Contexto · Escopo · Especificação técnica · Plano de
testes · Tarefas · Definition of Done) e traz **repo/arquivo(s) alvo** e **prompt
pronto** para um dev ou agente executar direto.

| SDD | Título | Repo alvo |
|---|---|---|
| [SDD-001](SDD-001-modelo-e-crud-iniciativa.md) | Modelo e CRUD de iniciativa (etapas embutidas) | `aiw-delivery` |
| [SDD-002](SDD-002-jornada-concluir-etapa.md) | Jornada (stepper) e conclusão de etapa | `aiw-delivery` |
| [SDD-003](SDD-003-chat-agente-streaming.md) | Chat com o agente da etapa (streaming SSE) | `aiw-delivery` |
| [SDD-004](SDD-004-aiw-agents-prompt-roteamento.md) | aiw-agents: prompt, roteamento e adapter do gateway | `aiw-agents` |
| [SDD-005](SDD-005-consumo-tokens.md) | Contabilização de consumo de tokens | `aiw-delivery` / worker |

**Ordem de implementação sugerida:** SDD-004 (aiw-agents) em paralelo → 001 → 002 →
003 (chat depende de aiw-agents) → 005 (consumo fecha o ciclo). Depende dos SDDs de
autenticação (sessão + tenant + RBAC).
