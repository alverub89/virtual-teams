# SDD — Modo auditoria do CTO (auditar como squad, somente leitura)

| | |
|---|---|
| **Funcionalidade** | Autenticação, sessão & multi-tenant (F1) |
| **História** | Como CTO, quero auditar uma squad da minha comunidade em somente leitura para inspecionar sem poder alterar dados dela |
| **Fase / Nível** | Fase 1 · N1 · Especificado |
| **Repo / arquivo(s) alvo** | `aiw-identity`: `src/routes/audit.ts`, `src/mw/auth.ts` (trava), `@aiw/tenant` |
| **Data** | 2026-07-17 |

## Contexto

Porta o comportamento de `api.ts` (`/me/audit/start|stop`, `/me/squads`) e a trava
de `_mw/auth.ts`. O alvo da auditoria vive **dentro do JWT assinado**
(`auditSquadId`), reemitido no servidor — não é flag do cliente e não pode ser
forjado. Em auditoria, escrita nas rotas de dados da squad é bloqueada (403);
console/gestão do próprio CTO e o controle de auditoria seguem livres.

## Escopo (entra / não entra)

- **Entra:** listar squads auditáveis (só da comunidade do CTO), ligar/desligar
  auditoria reemitindo o cookie, trava de escrita por método nas rotas de dados.
- **Não entra:** UI (é consumo de API). A auditoria é exclusiva do papel `cto`.

## Especificação técnica

**Componentes e arquivos**
- `routes/audit.ts` — `GET /api/me/squads`, `POST /api/me/audit/start`,
  `POST /api/me/audit/stop`.
- `mw/auth.ts` — após validar a sessão: se `me.auditSquadId && me.papel==='cto'` e a
  rota **não** é isenta, então em método ≠ GET retorna 403; em GET, sobrepõe
  `me.squadId = auditSquadId` e marca `me.auditando = true`.
- Regex de rota isenta: `/(console|gestao|convites|onboarding)(\/|$)|\/me\/audit(\/|$)/`.

**Contratos / APIs**
- `GET /api/me/squads` → `{ squads: [{id,nome}] }` (só as da comunidade do CTO; vazio
  para outros papéis).
- `POST /api/me/audit/start { squadId }` → valida que a squad é da comunidade do CTO
  (via `release_train.comunidadeId`), reemite o cookie com `auditSquadId` →
  `{ ok, auditSquadId, squadNome }`.
- `POST /api/me/audit/stop` → reemite o cookie sem `auditSquadId` → `{ ok }`.

**Dados**
- Sem coleção nova. Usa `squad`, `release_train` para validar pertencimento.
- `audit_log`: registra `auditar_start`/`auditar_stop` (ADR-010).

## Plano de testes

- CTO lista apenas squads da própria comunidade.
- `start` em squad de outra comunidade → 403.
- Em auditoria, `GET` de dados da squad funciona; `POST/PUT/DELETE` de dados → 403.
- Em auditoria, console/gestão/onboarding/convites e `audit/stop` seguem permitidos.
- Não-CTO não consegue ligar auditoria.
- O alvo só muda via cookie reemitido (não aceita header/param do cliente).

## Tarefas

1. Implementar `routes/audit.ts` (squads/start/stop) com validação de comunidade.
2. Implementar a trava e a sobreposição de squad em `mw/auth.ts` + regex de isenção.
3. Registrar start/stop no `audit_log`.
4. Testes cobrindo isenções, 403 de escrita e bloqueio cross-comunidade.

## Definition of Done

- [ ] Alvo de auditoria só no JWT assinado; impossível forjar por cliente.
- [ ] Escrita bloqueada nas rotas de dados durante auditoria; isenções corretas.
- [ ] CTO restrito a squads da própria comunidade.
- [ ] start/stop auditados na trilha imutável.

## Prompt pronto

> Implemente no `aiw-identity` o modo auditoria do CTO conforme este SDD:
> `routes/audit.ts` (`/me/squads`, `/me/audit/start`, `/me/audit/stop`) validando que
> a squad pertence à comunidade do CTO, reemitindo o cookie de sessão com
> `auditSquadId`; e a trava em `mw/auth.ts` que, em auditoria, sobrepõe squadId em GET
> e retorna 403 em escrita nas rotas de dados, isentando console/gestão/onboarding/
> convites e o próprio controle de auditoria. Registre start/stop no audit_log e
> cubra com testes os 403 e o bloqueio cross-comunidade.
