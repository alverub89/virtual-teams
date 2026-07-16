# Descoberta — Fase 0

| | |
|---|---|
| **Funcionalidade** | Todas (visão de sistema) |
| **Fase** | Fase 0 — Descoberta |
| **Nível de maturidade** | N0 · Rascunho |
| **Data** | 2026-07-16 |
| **Status** | Aguardando validação do comitê antes da Entrega 1 |

> Esta rodada é **estratégia + documentação**. Nenhum código de implementação foi
> escrito. Ao final desta fase, o objetivo é validar o entendimento do sistema
> atual e fechar as premissas do ambiente de destino (AWS + MongoDB + multi-repo)
> antes de propor a estratégia faseada (Entrega 1).

---

## 1. Resumo do contexto lido

**O que é o sistema.** *AI Workspace* — uma plataforma **AI-First de produto** da
diretoria. Modela a organização em três níveis (**Comunidade → Release Train →
Squad**) e conduz o ciclo de produto ponta a ponta: da estrutura organizacional e
do mapa de capacidades, passando pela jornada de features com agentes de IA
(método BMAD e métodos plugáveis), documentação, base de conhecimento e OKRs, até
a **execução autônoma da squad virtual** com humano no loop (checkpoints).

**Stack atual (a origem desta migração).**

| Camada | Hoje | Detalhe lido no repo |
|---|---|---|
| Frontend | **SPA React 18 + Vite** | `web/` — shell, rotas espelham o protótipo; tokens de design portados |
| API | **Netlify Functions v2 + Hono** (catch-all `/api/*`) | `netlify/functions/api.ts`; middlewares `auth` (JWT httpOnly) e `rbac` |
| Assíncrono | **Background Functions** (até 15 min) + **Scheduled Function** | 5 background + 1 sweeper cron `*/2 * * * *` |
| Banco | **Neon (Postgres serverless)** via Drizzle ORM | schema `ai_workspace`, ~40 tabelas; driver `@neondatabase/serverless` |
| Banco (dev/demo) | **PGlite** (Postgres WASM embarcado) | modo turnkey sem credenciais |
| IA | **Provedor próprio** atrás de adapter `LLMProvider` | Omni AI Gateway (contrato OpenAI-compatible), `x-omni-product-key`; roteador de modelos por tarefa; mock de demonstração |
| Multi-tenant | Isolamento por `comunidadeId` **app-enforced** (sem FK, sem RLS) | CTO pode "auditar como squad" via cookie assinado |

**Consequência arquitetural do modelo atual (documentada na spec §2):** não há
processo de longa duração sempre ligado. Toda orquestração (inclusive a execução
autônoma) é uma **máquina de estados persistida no banco**, avançada por Background
Functions e retomada por um Scheduled Function. Os checkpoints humanos são pausas
naturais que não consomem computação. **Esse padrão é o item mais sensível da
migração** — no destino AWS ele muda de forma (ver mapa de equivalência).

---

## 2. Inventário de funcionalidades (candidatas a fatias verticais)

Extraído das rotas (`netlify/functions/_routes/*`), libs (`_lib/*`) e telas
(`web/src/routes/*`). Cada bloco é candidato a uma fatia vertical de migração.

| # | Funcionalidade | Rotas / libs | O que faz | Toca IA? | Integrações |
|---|---|---|---|---|---|
| F1 | **Auth, sessão e multi-tenant** | `_mw/auth`, `_routes/auth`, `onboarding`, `convites` | Login (OAuth GitHub / email+senha scrypt), sessão JWT httpOnly + refresh, RBAC por papel+escopo, convites por email, isolamento por comunidade | não | GitHub OAuth, Resend |
| F2 | **Iniciativas & Jornada (BMAD)** | `_routes/iniciativas`, `_lib/bmad`, `web/.../Jornada` | Feature com stepper por etapa; artefatos por etapa; **chat com o agente da etapa via streaming SSE** | **sim** | — |
| F3 | **Histórias** | dentro de `iniciativas` | Épicos → histórias INVEST testáveis; critérios de aceite; (sync board previsto) | sim (geração) | board |
| F4 | **Capacidades & Repositórios** | `_routes/capacidades`, `capacidades-mapa`, `_lib/capacidades` | Mapa de capacidades (arquitetura de negócio TOGAF-like) **gerado por IA lendo repositórios GitHub**; versionado | **sim** | GitHub API |
| F5 | **OKRs** | `_routes/okrs`, `_lib/kr` | OKRs em cascata (comunidade/RT/squad), medição planejado×realizado por mês, associação KR↔feature, reconciliação a partir de runs | não | — |
| F6 | **Documentação & SDD** | `_routes/docs` | Documentos (PRD/ADR/API/SDD…) + leitor; SDD ligado a história com prompt pronto | sim | — |
| F7 | **Base de Conhecimento (KB)** | `_routes/kb`, `_lib/kbgen` | Artigos com escopo e endosso; **geração de KB a partir de repositório** (plano de leitura + síntese) | **sim** | GitHub API |
| F8 | **Esteira & GMUD** | `_routes/esteira` | Pipeline de gates (build→…→deploy_prod) e GMUDs. **Hoje simulada no app**; alvo real = GitHub Actions + ServiceNow | não | GitHub Actions, ServiceNow |
| F9 | **Execução autônoma (squad virtual)** | `_lib/run-engine`, `run-advance-background`, `sweeper-scheduled` | Máquina de estados persistida (run→passos→checkpoints); motor `advanceRun` idempotente com orçamento de tempo e teto de tokens; checkpoints humanos; sweeper | **sim** | (via tools) |
| F10 | **Orquestrador de iniciativa** | `_lib/orquestrador`, `orquestrar-background` | Um agente conduz a iniciativa inteira; "Master" crítico revisa cada documento em N rodadas | **sim** | — |
| F11 | **Party mode (mesa-redonda)** | `_lib/party`, `party-run-background` | Vários agentes debatem um tópico em rodadas + síntese | **sim** | — |
| F12 | **Console da plataforma** | `_routes/console`, `lab`, `workflows`, `mcp` | Editor de agentes (personalidade/skills/tools + prompt de sistema gerado), blueprints com guard-rails, métodos, MCPs, roteamento de modelos, consumo de tokens, workflows | sim | MCP servers |
| F13 | **Gestão / Indicadores** | `_routes/gestao` | Fluxo por etapa, lead time, GMUDs, custo de IA, progresso de KRs; docs em consulta | não | — |
| F14 | **MCP vivo + MCP client** | `_routes/mcp`, `_lib/mcpclient`, `_lib/playground` | App age como **servidor MCP** (`/mcp/:slug`) e como **cliente MCP** de servidores externos | sim | MCP (Streamable HTTP) |
| F15 | **Transversal: auditoria & consumo** | `_lib/audit`, `_lib/consumo` | `audit_log` de ações sensíveis; contabilização de tokens por squad/mês com budget | não | — |

---

## 3. Integrações externas (fronteiras do sistema)

| Integração | Uso | Como | Credencial (hoje) |
|---|---|---|---|
| **Provedor de IA (Omni gateway)** | Toda geração/streaming de agentes | `POST {AI_BASE_URL}/api/chat`, contrato OpenAI-compat | `OMNI_PRODUCT_KEY` (header `x-omni-product-key`) |
| **GitHub** | Leitura de repos (mapa de capacidades, KB), login OAuth, tools de repo | REST `api.github.com`; OAuth App; GitHub App | `GITHUB_TOKEN`/PAT, OAuth client, App key |
| **board** | Sync de histórias | API + webhook bidirecional (previsto) | `BOARD_API_URL/_TOKEN` |
| **Atlan** | Metadados de dados / classificação de **PII** | API REST | `ATLAN_API_URL/_TOKEN` |
| **ServiceNow** | Abrir **GMUD** (ação **crítica** — exige checkpoint) | Table/Import API | `SERVICENOW_URL/_USER/_PWD` |
| **Catálogo de Sistemas (CMDB)** | Buscar sigla do sistema | API do catálogo | `CATALOGO_API_URL/_TOKEN` |
| **Resend** | Envio de convites por email | API | `RESEND_API_KEY` |
| **Sentry** | Observabilidade de erros | SDK | `SENTRY_DSN` |

---

## 4. Trabalho assíncrono (jobs)

| Job | Tipo hoje | Gatilho | Função |
|---|---|---|---|
| `run-advance-background` | Background (≤15 min) | enfileirado por API / sweeper | Avança a máquina de estados da execução autônoma |
| `orquestrar-background` | Background | API | Orquestra a iniciativa inteira (fluxo BMAD completo) |
| `capability-analyze-background` | Background | API | Lê repositórios e sintetiza o mapa de capacidades |
| `kb-generate-background` | Background | API | Gera KB a partir de repositório |
| `party-run-background` | Background | API | Conduz a mesa-redonda de agentes |
| `sweeper-scheduled` | Scheduled (`*/2 * * * *`) | cron | Reenfileira runs travados (>5 min sem progresso) + alerta consumo >80% do budget |

**Padrão de enfileiramento atual:** em produção, a API faz `fetch` para a URL da
Background Function (`process.env.URL + /.netlify/functions/...`); em dev/demo, roda
inline no mesmo processo. **Esse acoplamento à Netlify é um ponto central de
remodelagem** (no destino, vira fila/scheduler AWS — ver §7).

---

## 5. Segredos e configuração (de `.env.example`)

`NETLIFY_DATABASE_URL`, `DATABASE_URL(_UNPOOLED)`, `AI_BASE_URL`,
`OMNI_PRODUCT_KEY`/`AI_API_KEY`, `AI_MODELS_JSON`, `GITHUB_TOKEN`/PAT,
`GITHUB_OAUTH_CLIENT_ID/_SECRET`, `GITHUB_APP_ID/_PRIVATE_KEY/_INSTALLATION_ID`,
`RESEND_API_KEY`, `APP_URL`, `SESSION_JWT_SECRET`, `BOARD_*`, `ATLAN_*`,
`SERVICENOW_*`, `CATALOGO_*`, `SENTRY_DSN`.

**Achados de segurança já visíveis (a endereçar na migração):**
- **Tokens persistidos em texto no banco:** `comunidade.github_token` e
  `conexao_mcp.token` guardam credenciais na tabela. No destino corporativo isso
  deve migrar para **secret manager**, nunca em coluna de banco.
- Sessão via `SESSION_JWT_SECRET` (HS256) — no destino, candidato a rotação
  gerenciada / IdP corporativo.
- Senha local por **scrypt** (`pessoa.senha_hash`) — coexiste com OAuth; no
  destino tende a ser substituída por **autenticação corporativa (OIDC/SSO)**.
- **RLS ausente**: isolamento multi-tenant é **app-enforced** por `comunidadeId`
  (sem FK circular). Defesa em profundidade fica a cargo da aplicação.

---

## 6. Modelo de dados atual (Postgres → candidato a remodelagem para documentos)

Schema `ai_workspace`, ~40 tabelas (`db/schema.ts`). Agrupadas por domínio, com
anotação do que é **transacional** e da **hipótese de modelagem** para MongoDB.

### 6.1 Estrutura organizacional & identidade
`comunidade`, `release_train`, `squad`, `pessoa`, `convite`, `sessao`.
- **Transacional:** unicidade de `pessoa.email`, `convite.token`.
- **Hipótese Mongo:** `comunidade` como **raiz de tenant** (shard/partition key
  `comunidadeId` em todas as coleções). `release_train`/`squad` podem ser
  coleções próprias (referência) — hierarquia rasa e consultada em cruzamento.

### 6.2 Capacidades & repositórios
`capacidade`, `repositorio`, `capacidade_repositorio` (N:N), `mapa_capacidade`
(já usa `jsonb` para `conteudo`/`repos_analisados`/`impacto`).
- **Hipótese Mongo:** `mapa_capacidade` é praticamente um documento hoje →
  mapeia 1:1. N:N `capacidade_repositorio`: decidir **embed** (lista de repos na
  capacidade, como já ocorre em `capacidade.repos`) vs coleção de ligação.

### 6.3 Método, agentes & acervo
`metodo`, `metodo_etapa`, `agente`, `agente_skill`/`_tool`/`_template`/`_checklist`
(N:N), `skill`, `template`, `checklist`, `blueprint`, `modelo_ia_rota`,
`conexao_mcp`, `tool`.
- **Hipótese Mongo:** `agente` como documento com **skills/tools embutidas ou
  referenciadas** (catálogo global vs isolado por comunidade). Guard-rails e
  `input_schema`/`handler_config` já são `jsonb` → naturais em documento.

### 6.4 Iniciativas & jornada
`iniciativa`, `iniciativa_etapa` (1:N, `UNIQUE(iniciativa,ordem)`), `historia`,
`mensagem_chat`.
- **Transacional:** criar iniciativa + etapas + histórias **atomicamente**;
  `iniciativa.codigo` único.
- **Hipótese Mongo:** **agregado natural** — `iniciativa` como documento com
  `etapas[]` embutidas (artefato por etapa já é `jsonb`). `historia` e
  `mensagem_chat` podem ser coleções próprias (volume/consulta independente).
  **A atomicidade multi-tabela vira atualização de um único documento** (ganho),
  ou **transação multi-documento** (Mongo suporta — restrição a confirmar).

### 6.5 Documentação & KB
`documento`, `kb_artigo` (com `plano` jsonb), `kb_endosso` (N:N pessoa↔artigo).
- **Hipótese Mongo:** documentos e artigos mapeiam bem; `kb_endosso` como
  subdocumento/lista de endossos no artigo.

### 6.6 OKRs
`okr` (auto-referência `pai_id`), `key_result`, `kr_medicao`
(`UNIQUE(kr,mes)`), `kr_feature` (N:N).
- **Transacional:** upsert de medição por `(kr,mes)`.
- **Hipótese Mongo:** `okr` com `keyResults[]` e cada KR com `medicoes[]`
  embutidas; `kr_feature` como lista de referências.

### 6.7 Esteira, GMUD, PRs
`execucao_esteira`, `gmud`, `pull_request`, `integracao_plataforma`.
- **Hipótese Mongo:** coleções próprias; hoje a esteira é **simulada** (status
  calculado por tempo decorrido) — no destino, alimentada por eventos reais.

### 6.8 Execução autônoma (o coração técnico)
`execucao_autonoma`, `execucao_passo` (`UNIQUE(exec,ordem)`),
`execucao_checkpoint`.
- **Transacional + idempotência:** avanço de passo com verificação de estado;
  efeitos externos usam chave `run:{id}:passo:{ordem}`.
- **Hipótese Mongo:** documento de run com `passos[]` embutidos, ou coleção de
  passos referenciada (volume por run é pequeno). **Idempotência e concorrência**
  (dois avanços simultâneos) precisam de estratégia explícita no Mongo
  (updates condicionais / findAndModify).

### 6.9 Workflows da squad
`workflow`, `workflow_passo`, `workflow_run`, `workflow_run_passo`.
- **Hipótese Mongo:** definição (workflow+passos) como um documento; execução
  (run+passos) como outro. Mesmo padrão de máquina de estados de F9.

### 6.10 Transversais
`consumo_tokens` (`UNIQUE(squad,mes)`), `audit_log`.
- **Hipótese Mongo:** `consumo_tokens` com upsert por `(squad,mes)`; `audit_log`
  como coleção append-only (candidata a TTL/retenção e a **trilha de auditoria
  imutável** exigida por compliance).

---

## 7. Mapa de equivalência provável (a confirmar na discovery)

| Peça hoje (Netlify/Neon) | Provável destino AWS | A confirmar |
|---|---|---|
| SPA React estática (Netlify CDN) | **S3 + CloudFront** (ou host web corporativo) | qual é o padrão de hosting de SPA homologado |
| API Hono `/api/*` (Functions v2, síncronas) | **Lambda (API Gateway)** ou **ECS/Fargate** | qual compute está homologado e o padrão de deploy |
| Chat streaming SSE | Lambda response streaming / **Fargate** (SSE longo) | se streaming em Lambda é homologado, ou exige container |
| Background Functions (≤15 min) | **SQS + Lambda worker** ou **Fargate task**; passos longos → **Step Functions** | limite de tempo/serviço homologado para jobs |
| Scheduled Function (sweeper cron) | **EventBridge Scheduler + Lambda** | — |
| Enfileiramento via `fetch` interno | **SQS/EventBridge** (fila real) | padrão de mensageria corporativo |
| Neon/Postgres (relacional) | **MongoDB** (Atlas **ou** DocumentDB) | qual é o padrão e restrições de versão/recurso |
| PGlite (dev/demo embarcado) | Mongo local/container ou Atlas ephemeral para dev | padrão de ambiente de desenvolvimento |
| Env vars / secrets (Netlify) | **AWS Secrets Manager / Parameter Store** ou gateway interno | padrão corporativo de secrets |
| Tokens em coluna de banco | **Secrets Manager** (fora do banco) | política de credenciais |
| OAuth GitHub / login | **IdP corporativo (OIDC/SSO — ex. Azure AD/Keycloak)** | fluxo de auth homologado |
| Chamadas ao provedor de IA (direto) | **Gateway interno de IA** | endpoint/fluxo homologado para IA |
| Chamadas a GitHub/board/Atlan/SNOW/Catálogo | **Gateway interno de integrações** (egress controlado) | rota de saída homologada |
| Sentry | Stack de observabilidade corporativa (**CloudWatch / OpenTelemetry / ELK**) | padrão de logs, métricas e tracing |
| Monorepo Netlify | **Multi-repo** (um repo por serviço + contratos) | naming, pipelines, versionamento de contratos |

---

## 8. Premissas assumidas (explícitas — a validar)

Enquanto as perguntas obrigatórias (§9) não forem respondidas, a Entrega 1
assumirá as premissas abaixo. Cada uma vira uma ADR se confirmada, ou é revista.

- **P1 — Compute:** default **Lambda + API Gateway** para a API síncrona e workers
  de fila; **Fargate** reservado para casos que Lambda não atende (streaming SSE
  longo, jobs >15 min). Step Functions para orquestração de runs longos.
- **P2 — Banco:** default **MongoDB Atlas** (recursos ricos: transações
  multi-documento, change streams, Atlas Search). Se o padrão for **DocumentDB**,
  a modelagem evita recursos não suportados (ver decisões de §6).
- **P3 — Gateway de IA:** existe um **gateway interno** para chamadas de IA; o
  adapter `LLMProvider` aponta para ele (troca só do adapter, como hoje com o Omni).
- **P4 — Integrações externas:** todo egress (GitHub, board, Atlan, ServiceNow,
  Catálogo) passa por **gateway interno de saída**; sem acesso direto à internet.
- **P5 — Secrets/IAM/rede:** **Secrets Manager** + **IAM roles por serviço**
  (menor privilégio); serviços em **VPC privada** com subnets isoladas; sem
  credencial em coluna de banco.
- **P6 — Auth corporativa:** login por **OIDC/SSO corporativo**; OAuth GitHub e
  senha local saem de cena (GitHub App permanece só como conta de serviço das tools).
- **P7 — Observabilidade:** **CloudWatch Logs (JSON estruturado)** + métricas +
  **tracing (OpenTelemetry)**, com `requestId`/`runId` correlacionados.
- **P8 — PII/LGPD:** o domínio (PIX, cobrança, consentimento) **contém PII** (ex.:
  identificação do pagador, email). Assume-se **mascaramento por padrão nos
  prompts de IA**, classificação via Atlan, retenção definida por política e
  trilha de auditoria imutável.
- **P9 — CI/CD & multi-repo:** um **repositório por serviço** + um repositório de
  **contratos** (schemas de API/eventos versionados); pipelines corporativas
  (a nomear). Documentação de arquitetura em **repo dedicado** (a decidir em ADR).
- **P10 — Coexistência:** a migração é **strangler fig** — o sistema Netlify atual
  segue no ar enquanto fatias verticais migram para AWS uma a uma, com corte
  controlado por funcionalidade.

---

## 9. Perguntas obrigatórias (bloqueiam a Entrega 1)

1. **Compute homologado:** quais serviços de compute estão homologados
   (**Lambda? Fargate/ECS?** ambos?) e qual o **padrão de deploy** (IaC:
   Terraform/CDK/CloudFormation; pipeline)?
2. **MongoDB:** é **Atlas** ou **DocumentDB**? Há restrição de **versão/recurso**
   (transações multi-documento, change streams, Atlas Search, TTL)?
3. **Gateway interno de IA:** como funciona o gateway para chamadas de IA (e de
   integrações externas)? Endpoint, autenticação, contrato — é OpenAI-compatible?
4. **Secrets / IAM / rede:** qual o padrão de **gestão de secrets** (Secrets
   Manager? Vault? gateway?), de **IAM** (roles/limites) e de **rede**
   (VPC/subnets, egress controlado)?
5. **Observabilidade:** qual o padrão corporativo de **logs, métricas e tracing**
   (CloudWatch? OpenTelemetry? ELK? Datadog?)?
6. **PII / LGPD:** quais dados são **PII**? Qual a política de **retenção,
   mascaramento e minimização**, e as regras para **enviar (ou não) dados ao
   provedor de IA**?
7. **CI/CD & multi-repo:** qual o padrão de **CI/CD** e de organização
   **multi-repo** — convenção de **naming**, pipelines, e **versionamento de
   contratos** entre serviços?

---

## 10. Próximo passo

**Parada para validação.** Confirmadas (ou ajustadas) as premissas de §8 e
respondidas as perguntas de §9, seguimos para a **Entrega 1 — Estratégia de
migração faseada** (sequenciamento por valor×risco×dependência×esforço, cartão por
fase, coexistência strangler fig, estratégia de dados Postgres→MongoDB e o desenho
de arquitetura C4 em `docs/arquitetura.md`).
