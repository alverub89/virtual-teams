# Autenticação, Sessão & Multi-tenant — Documento Técnico

| | |
|---|---|
| **Funcionalidade** | Autenticação, sessão e isolamento multi-tenant (F1) |
| **Fase** | Fase 1 |
| **Nível de maturidade** | N1 · Especificado |
| **Data** | 2026-07-17 |

## 1. Arquitetura da funcionalidade no destino

- **Repositório / serviço:** `aiw-identity` (container **Fargate**, framework Hono,
  como hoje).
- **Serviços AWS:** API Gateway/ALB (façade) · Fargate · **DocumentDB** · **Secrets
  Manager** (JWT secret, client secret OIDC) · **KMS** · **IdP corporativo (OIDC)**
  possivelmente via bridge Cognito · OTel→CloudWatch/X-Ray.
- **Middlewares** (portados de `_mw/auth` e `_mw/rbac`): `auth` (valida sessão),
  `tenant` (injeta `comunidadeId`), `rbac(acao)` e `mesmaSquad(escopo)`.

## 2. Contratos de API / interfaces

Publicados em `aiw-contracts` (OpenAPI). Principais rotas:

| Método + rota | Descrição | Autorização |
|---|---|---|
| `GET /api/auth/login` | Inicia OIDC (Authorization Code + PKCE) | pública |
| `GET /api/auth/callback` | Troca `code` por tokens, resolve pessoa, cria sessão | pública |
| `POST /api/auth/logout` | Encerra a sessão | sessão |
| `GET /api/me` | Usuário, papel, squad, escopos | sessão |
| `GET /api/me/squads` | Squads auditáveis (só CTO) | cto |
| `POST /api/me/audit/start` | Liga auditoria de uma squad (reemite cookie) | cto |
| `POST /api/me/audit/stop` | Desliga auditoria | cto |
| `POST /api/onboarding` | Cria comunidade/RT/squads (CTO) | cto |
| `POST /api/convites` · `POST /api/convites/:token/aceitar` | Convidar / aceitar | cto / público c/ token |

**Sessão:** cookie `httpOnly + Secure + SameSite=Lax` com JWT curto (HS256, segredo
no Secrets Manager) + refresh opaco persistido. O alvo de auditoria vive **dentro
do JWT assinado** (`auditSquadId`), não em header do cliente.

## 3. Modelo de dados MongoDB

Coleções (técnica de migração: **corte** para estrutura/pessoas — baixo volume, ver
ADR-012). Índice de tenant `comunidadeId` em todas.

```
comunidade    { _id, nome, donoId, criadoEm }            // githubToken → ref Secrets Manager (ADR-007)
release_train { _id, comunidadeId, nome, criadoEm }
squad         { _id, releaseTrainId, comunidadeId, nome, budgetTokensMes, criadoEm }
pessoa        { _id, nome, email(uniq), papel, comunidadeId, squadId, onboardingConcluido, ativo }
convite       { _id, comunidadeId, squadId, email, papel, token(uniq), status, ... }
sessao        { _id, pessoaId, refreshToken, expiraEm, criadoEm }  // refresh opaco
```

**Decisões de modelagem (vindas do Postgres):**
- `pessoa.senha_hash` **removido** — autenticação passa ao IdP (ADR-006).
- `comunidade.github_token` deixa de guardar o valor: passa a **referência** ao
  segredo no Secrets Manager (ADR-007).
- Adicionado `comunidadeId` **desnormalizado** em `squad` (e demais coleções) para o
  filtro de tenant não exigir join com `release_train` a cada request.
- Hierarquia Comunidade→RT→Squad permanece por **referência** (rasa, consultada em
  cruzamento) — não embutida.
- Índices únicos: `pessoa.email`, `convite.token`.

## 4. Integrações e autenticação

- **IdP corporativo (OIDC):** Authorization Code + PKCE; validação por **JWKS**;
  claims mapeiam papel/tenant (fallback ao cadastro em `pessoa`).
- **GitHub App** permanece só como **conta de serviço** das tools (não é login).
- **Email (convites):** via serviço corporativo/Resend, credencial no Secrets Manager.

## 5. Segurança e observabilidade

- **Segredos:** JWT secret, client secret OIDC, credencial de email → Secrets
  Manager; nenhum no banco/bundle (ADR-007).
- **Isolamento de tenant:** middleware injeta `comunidadeId` do JWT; **toda query
  filtra por `comunidadeId`**. Defesa em profundidade: revisão de que nenhuma rota
  lê sem o filtro (teste automatizado de tenant).
- **RBAC** no servidor (`PAPEIS_POR_ACAO`); escopo de escrita = própria squad.
- **Modo auditoria** somente leitura: trava de escrita (403) por método, alvo no
  cookie assinado; rotas de console/gestão/onboarding/audit isentas da trava.
- **PII:** `pessoa.email` é PII → tratada conforme ADR-010 (não vaza para IA).
- **Observabilidade:** logs JSON com `requestId` e `pessoaId`/`comunidadeId`;
  métricas de login (sucesso/falha), auditoria de start/stop; traços de auth.
- **Auditoria imutável:** login, aceitar convite, start/stop de auditoria e mudanças
  de estrutura registram em `audit_log` (append-only, ADR-010).

## 6. ADRs relevantes

- **ADR-006** — Autenticação corporativa OIDC/SSO.
- **ADR-007** — Secrets Manager + IAM + VPC (fim do token em banco).
- **ADR-003** — DocumentDB como alvo (índices de tenant).
- **ADR-010** — PII/LGPD (email como PII, trilha imutável).
- **ADR-012** — Migração de dados (corte para estrutura/pessoas).

## 7. Pendências para N2 (validado)

- Mapeamento concreto de grupos do IdP → papéis do produto (depende da pergunta #4).
- Estratégia de vinculação de contas existentes (por email) no primeiro login OIDC.
- Confirmar se haverá bridge Cognito ou OIDC direto ao IdP corporativo.
