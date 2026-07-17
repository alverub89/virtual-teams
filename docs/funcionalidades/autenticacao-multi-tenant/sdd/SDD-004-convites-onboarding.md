# SDD — Onboarding do CTO + convites de membros

| | |
|---|---|
| **Funcionalidade** | Autenticação, sessão & multi-tenant (F1) |
| **História** | Como CTO, quero montar a estrutura (Comunidade → RT → Squad) e convidar pessoas por email para formar as squads |
| **Fase / Nível** | Fase 1 · N1 · Especificado |
| **Repo / arquivo(s) alvo** | `aiw-identity`: `src/routes/onboarding.ts`, `src/routes/convites.ts`, `src/lib/email.ts` |
| **Data** | 2026-07-17 |

## Contexto

Porta `_routes/onboarding.ts` e `_routes/convites.ts`. Cria a estrutura
organizacional e o fluxo de convite por email (token de uso único), com o serviço de
email por credencial no Secrets Manager.

## Escopo (entra / não entra)

- **Entra:** criar comunidade/RT/squads (onboarding do CTO), criar convite, aceitar
  convite (vincula pessoa à squad/comunidade com o papel), listar/cancelar convites.
- **Não entra:** edição avançada de estrutura (Console, Fase 6). Papéis convidáveis:
  `pm`, `tech_lead`, `gestao`.

## Especificação técnica

**Componentes e arquivos**
- `routes/onboarding.ts` — `POST /api/onboarding` cria `comunidade` (dono = CTO),
  `release_train` e `squad`(s); marca `pessoa.onboardingConcluido`.
- `routes/convites.ts` — `POST /api/convites`, `GET /api/convites`,
  `POST /api/convites/:token/aceitar`, `POST /api/convites/:id/cancelar`.
- `lib/email.ts` — envio via serviço corporativo/Resend; sem credencial → gera link
  manual (fallback), como hoje.

**Contratos / APIs**
- `POST /api/onboarding { comunidadeNome, releaseTrainNome, squads:[nome] }` → cria
  estrutura → `{ comunidadeId, squads:[{id,nome}] }`. Autorização: `cto`.
- `POST /api/convites { email, papel, squadId? }` → cria convite (token único),
  dispara email → `{ id, token, emailEnviado }`. Autorização: `cto`.
- `POST /api/convites/:token/aceitar` → upsert/atualiza `pessoa` (papel, squadId,
  comunidadeId), marca convite `aceito` → sessão. Autorização: pública com token válido.
- `GET /api/convites` (cto) · `POST /api/convites/:id/cancelar` (cto).

**Dados**
- `comunidade`, `release_train`, `squad` (ver SDD/tecnico da funcionalidade).
- `convite { _id, comunidadeId, squadId, email, papel, token(uniq), status, convidadoPor, emailEnviado, criadoEm, aceitoEm }`.
- Índice único `convite.token`; token gerado com aleatoriedade forte.

## Plano de testes

- Onboarding cria estrutura e marca `onboardingConcluido`.
- Convite gera token único e dispara email (ou link de fallback sem credencial).
- Aceitar convite vincula a pessoa com papel/squad/comunidade corretos.
- Token não pode ser reutilizado (segundo aceite falha) nem aceito se `cancelado`.
- Só `cto` cria/cancela convites; papel não convidável é rejeitado.

## Tarefas

1. Implementar `routes/onboarding.ts` (transação lógica: comunidade+RT+squads).
2. Implementar `routes/convites.ts` (criar/listar/aceitar/cancelar) + token único.
3. Implementar `lib/email.ts` com credencial do Secrets Manager e fallback de link.
4. Registrar `aceitar_convite`/onboarding no `audit_log`; testes.

## Definition of Done

- [ ] CTO monta estrutura e convida; pessoa aceita e entra na squad certa.
- [ ] Token de uso único; convite cancelado não aceita.
- [ ] Credencial de email no Secrets Manager; fallback de link sem credencial.
- [ ] Ações registradas na trilha imutável; testes cobrindo reuso/cancelamento.

## Prompt pronto

> Implemente no `aiw-identity` o onboarding e os convites conforme este SDD:
> `routes/onboarding.ts` (cria comunidade/RT/squads e marca onboardingConcluido),
> `routes/convites.ts` (criar/listar/aceitar/cancelar com token único de uso único
> vinculando pessoa a papel/squad/comunidade) e `lib/email.ts` (Resend/serviço
> corporativo com credencial do Secrets Manager e fallback de link). Restrinja
> criação/cancelamento ao papel cto, registre no audit_log e teste reuso e
> cancelamento de token.
