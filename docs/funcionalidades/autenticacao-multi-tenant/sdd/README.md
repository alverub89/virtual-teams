# SDDs — Autenticação, Sessão & Multi-tenant (Fase 1)

Specs executáveis (Spec-Driven Development), prontas para implementação. Cada uma
segue o template do projeto (Contexto · Escopo · Especificação técnica · Plano de
testes · Tarefas · Definition of Done) e traz **repo/arquivo(s) alvo** e **prompt
pronto** para um dev ou agente executar direto.

| SDD | Título | Repo alvo |
|---|---|---|
| [SDD-001](SDD-001-sessao-oidc.md) | Sessão OIDC corporativa (login/callback/logout) | `aiw-identity` |
| [SDD-002](SDD-002-multitenant-rbac.md) | Isolamento multi-tenant + RBAC e escopo de squad | `aiw-identity` / `@aiw/tenant` |
| [SDD-003](SDD-003-modo-auditoria.md) | Modo auditoria do CTO (somente leitura) | `aiw-identity` |
| [SDD-004](SDD-004-convites-onboarding.md) | Onboarding do CTO + convites de membros | `aiw-identity` |

**Ordem de implementação sugerida:** 001 → 002 → 003 → 004 (a sessão habilita o
RBAC/tenant; a auditoria e os convites dependem de ambos).
