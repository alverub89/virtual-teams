# SDD — Sessão OIDC corporativa (login/callback/logout)

| | |
|---|---|
| **Funcionalidade** | Autenticação, sessão & multi-tenant (F1) |
| **História** | Como pessoa da instituição, quero entrar com minha identidade corporativa (SSO) para acessar o AI Workspace sem senha própria do produto |
| **Fase / Nível** | Fase 1 · N1 · Especificado |
| **Repo / arquivo(s) alvo** | `aiw-identity`: `src/routes/auth.ts`, `src/mw/auth.ts`, `src/lib/oidc.ts`, `src/lib/session.ts` |
| **Data** | 2026-07-17 |

## Contexto

Substitui o login OAuth GitHub / email+senha do sistema atual por **OIDC/SSO
corporativo** (ADR-006). A sessão continua sendo cookie httpOnly + JWT curto +
refresh opaco, mas o segredo do JWT vem do Secrets Manager (ADR-007) e a identidade
vem do IdP. Porta o comportamento de `netlify/functions/_mw/auth.ts` e
`_routes/auth.ts` para o serviço `aiw-identity`.

## Escopo (entra / não entra)

- **Entra:** fluxo OIDC Authorization Code + PKCE; validação por JWKS; upsert de
  `pessoa` por email; emissão/validação/rotação da sessão; logout; `GET /me`.
- **Não entra:** RBAC e filtro de tenant (SDD-002), modo auditoria (SDD-003),
  convites/onboarding (SDD-004). Mapeamento de grupos→papel fica em pendência N2.

## Especificação técnica

**Componentes e arquivos**
- `lib/oidc.ts` — descoberta do IdP (`.well-known/openid-configuration`), geração de
  `state`+PKCE, troca de `code` por tokens, cache de JWKS, validação de `id_token`.
- `lib/session.ts` — `signSession(me)`, `verifySession(token)`, `cookieOpts()`;
  segredo lido do Secrets Manager com cache curto em memória.
- `mw/auth.ts` — valida o cookie; injeta `me` no contexto; 401 se ausente/inválido.
- `routes/auth.ts` — `GET /api/auth/login`, `GET /api/auth/callback`,
  `POST /api/auth/logout`, `GET /api/me`.

**Contratos / APIs** (OpenAPI em `aiw-contracts`)
- `GET /api/auth/login` → 302 para o IdP (seta cookie `state`+`pkce_verifier` curtos).
- `GET /api/auth/callback?code&state` → valida `state`, troca `code`, valida
  `id_token` (JWKS, `iss`, `aud`, `exp`, `nonce`), faz upsert de `pessoa`, cria
  `sessao`, seta cookie de sessão, redireciona ao destino por papel.
- `POST /api/auth/logout` → apaga `sessao` (refresh) e limpa o cookie → 204.
- `GET /api/me` → `Me { id, nome, email, papel, squadId, squadNome, comunidadeId,
  onboardingConcluido, escopos }`.

**Dados** (DocumentDB)
- `pessoa { _id, nome, email(uniq), papel, comunidadeId, squadId, onboardingConcluido, ativo, criadoEm }` — **sem** `senha_hash`.
- `sessao { _id, pessoaId, refreshToken(opaco), expiraEm, criadoEm }`.
- Segredos: `oidc/client_secret`, `session/jwt_secret` no Secrets Manager.

## Plano de testes

- Login redireciona ao IdP com `state` e PKCE presentes.
- Callback com `id_token` válido cria/atualiza `pessoa` e emite cookie httpOnly+Secure.
- Callback rejeita `state` inválido, assinatura inválida, `aud`/`iss` errados e token expirado (401).
- `GET /me` retorna 401 sem cookie e o `Me` correto com cookie válido.
- Logout invalida o refresh (segundo uso falha).
- Nenhum segredo aparece em log ou resposta.

## Tarefas

1. Implementar `lib/oidc.ts` (discovery, PKCE, troca de code, cache JWKS, validação).
2. Implementar `lib/session.ts` (sign/verify/cookieOpts + leitura de segredo).
3. Implementar `mw/auth.ts` e ligar em todas as rotas autenticadas.
4. Implementar `routes/auth.ts` (login/callback/logout/me) + upsert de `pessoa`.
5. Publicar contrato OpenAPI em `aiw-contracts`.
6. Testes (unidade + integração com IdP mock) e instrumentação OTel.

## Definition of Done

- [ ] Login OIDC ponta a ponta funciona; destino por papel correto.
- [ ] Cookie httpOnly+Secure+SameSite; JWT curto; refresh rotacionado no login.
- [ ] Segredos só do Secrets Manager; nenhum em código/log.
- [ ] Casos de token inválido cobertos por teste.
- [ ] Traço e logs JSON com `requestId`/`pessoaId`; `GET /me` observável.

## Prompt pronto

> Implemente no repositório `aiw-identity` a sessão OIDC corporativa conforme este
> SDD: `lib/oidc.ts` (Authorization Code + PKCE, discovery, cache de JWKS, validação
> de id_token), `lib/session.ts` (JWT httpOnly curto + refresh opaco, segredo do AWS
> Secrets Manager com cache curto), `mw/auth.ts` e `routes/auth.ts`
> (login/callback/logout/me) com upsert de `pessoa` por email no DocumentDB (sem
> senha_hash). Gere o OpenAPI em `aiw-contracts` e testes cobrindo os casos de token
> inválido. Instrumente com OpenTelemetry. Não implemente RBAC/tenant aqui (SDD-002).
