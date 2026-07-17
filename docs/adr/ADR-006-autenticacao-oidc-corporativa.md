# ADR-006 — Autenticação corporativa OIDC/SSO

- **Status:** Aceita
- **Data:** 2026-07-17
- **Contexto da fase:** Fase 1

## Contexto

O sistema atual autentica por **OAuth GitHub** e **email/senha (scrypt)**, com
sessão JWT httpOnly (HS256) + refresh no banco. Num banco, identidade é
centralizada, federada e auditável.

## Decisão

Delegar toda autenticação ao **IdP corporativo via OIDC/SSO** (ex.: Azure AD /
Keycloak), pelo mesmo mecanismo de sessão:

- Login = fluxo OIDC (Authorization Code + PKCE); o serviço `aiw-identity` valida o
  token contra o **JWKS** do IdP e resolve `pessoa`/papel/tenant.
- Sessão = cookie **httpOnly + Secure + SameSite** com JWT curto + refresh; rotação
  no login.
- **OAuth GitHub e senha local saem de cena** para login de pessoas. O **GitHub App
  permanece** apenas como **conta de serviço** das tools de repositório (automação
  auditável, desacoplada da sessão do usuário) — como já é a intenção no sistema.
- Papel/escopo (RBAC) continuam aplicados no servidor; claims do IdP alimentam o
  papel quando disponível, com fallback ao cadastro.

## Consequências

- **Positivas:** identidade corporativa única, MFA e offboarding centralizados,
  auditoria alinhada à instituição; fim do armazenamento de senha.
- **Negativas / trade-offs:** dependência do IdP; mapeamento de grupos do IdP para
  papéis do produto exige configuração.
- **Migração:** `pessoa.senha_hash` é descontinuada; `sessao` passa a guardar
  refresh opaco; contas existentes são vinculadas por email.

## Alternativas consideradas

- **Manter OAuth GitHub** — inadequado como identidade corporativa primária;
  rebaixado a conta de serviço de tools.
- **Cognito como IdP primário** — possível, mas a diretriz é usar o **SSO
  corporativo**; Cognito pode atuar só como bridge/OIDC broker se necessário.
