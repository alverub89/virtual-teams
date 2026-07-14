# Plano — do esqueleto (Fase 0) ao produto usável

**Objetivo:** transformar a fundação já entregue em um produto que uma squad
consegue usar no dia a dia. Ordenado por dependência: cada etapa destrava a
seguinte. Referências: spec técnica (`docs/spec`) e protótipo (`docs/prototipo`).

**Estado atual (feito):** monorepo, SPA shell com design system do protótipo e
as 18 rotas, API Hono com sessão/RBAC, camada Drizzle/Neon, adapter de IA,
esqueleto da execução autônoma. Nada de dados reais ainda.

---

## Etapa A — Infraestrutura mínima (bloqueia tudo; ~1 dia de trabalho + acessos)

Sem isso nada sai do placeholder. São tarefas de provisionamento, não de código:

| # | Tarefa | Onde | Depende de |
|---|---|---|---|
| A1 | Criar site na Netlify conectado ao repo (`main` = produção, PRs = previews) | Netlify | acesso à conta |
| A2 | Criar projeto Neon e aplicar o **`ai_workspace_schema.sql` canônico** como migration `0000_init` | Neon | **arquivo do schema (44 tabelas) — não veio nos anexos; precisa ser fornecido** |
| A3 | Configurar env vars na Netlify (`DATABASE_URL` pooled, `SESSION_JWT_SECRET`, etc. — ver `.env.example`) | Netlify | A1, A2 |
| A4 | Criar **OAuth App** do GitHub (login) e **GitHub App** (tools de repositório) na org | GitHub | admin da org |
| A5 | Obter `AI_BASE_URL`/`AI_API_KEY` do provedor de IA próprio (+ mapa de modelos) | provedor interno | acesso ao provedor |
| A6 | Habilitar Neon branching por deploy preview (banco isolado por PR) | Netlify + Neon | A1, A2 |

> **Fallback enquanto A2/A5 não saem:** seed de demonstração (B2) e um provedor
> de IA "mock" para desenvolver e testar os fluxos sem dependências externas.

## Etapa B — Login real + modo demo (torna o app "entrável"; ~2–3 dias)

| # | Tarefa |
|---|---|
| B1 | Completar o callback OAuth: upsert em `pessoa`, papel/squad reais do banco, refresh token persistido em `sessao`, rotação de sessão |
| B2 | **Seed de demonstração**: script que popula comunidade/RT/squads/pessoas/capacidades/iniciativas/OKRs de exemplo (os mesmos dados do protótipo) — permite testar tudo sem esperar dados reais |
| B3 | **Modo demo sem OAuth** (`DEMO_MODE=1`): botão "entrar como Ana Souza (PM) / Bruno (dev) / arquiteto / diretor" que cria sessão real com pessoa do seed — é como você testa hoje sem configurar o GitHub |
| B4 | Guarda de rotas no front: sem sessão → `/login`; redirect pós-login por papel (dev/pm → squad, arquiteto → console, diretoria → gestão); logout |

**Critério de usável:** entrar, cair na visão certa do seu papel e navegar autenticado.

## Etapa C — Núcleo da squad (Fase 1 da spec; ~3–4 semanas, o maior bloco)

Ordem interna por valor:

| # | Tela + endpoints | Observações |
|---|---|---|
| C1 | **Iniciativas** (`GET/POST /api/squads/:id/iniciativas`) — lista, criação a partir de capacidade | primeira tela com dados reais |
| C2 | **Jornada da iniciativa** — etapas do método (brief → GMUD), stepper, artefatos por etapa | componente `Stepper` do protótipo |
| C3 | **Chat do agente da etapa** com streaming SSE (`POST /api/iniciativas/:id/chat`) | usa adapter + roteador de modelos; persiste mensagens e `consumo_tokens`; **primeiro uso real de IA** |
| C4 | **Capacidades + repositórios** (`POST /api/repos/conectar`) — importar repo do GitHub e associar | usa a GitHub App (A4) |
| C5 | **OKRs** — cascata, medições planejado × realizado (`POST /api/krs/:id/medicoes`), associação de features | componente `KrBar` do protótipo |
| C6 | **Documentação + leitor** (`GET/POST /api/docs`) | `DocReader` do protótipo |
| C7 | **Histórias + sync board** (webhook bidirecional) | pode ficar por último — depende de credencial board |
| C8 | **Estação dev + Esteira & GMUDs** (leitura) — webhooks GitHub push/CI atualizando `execucao_esteira`/`pull_request` | |

**Critério de usável:** uma PM cria uma iniciativa, conversa com o agente da
etapa, gera um artefato, acompanha OKRs — o ciclo básico do produto.
**Este é o marco de MVP.**

## Etapa D — Console e governança (Fase 2; ~2–3 semanas)

- D1 Editor de **Agentes/Skills/Tools** com composição do prompt de sistema (o "Prompt gerado" do protótipo) + `PUT /api/agentes/:id`
- D2 Blueprints e métodos (etapas do BMAD configuráveis)
- D3 MCPs & modelos: rotas de modelo (`modelo_ia_rota`) editáveis + painel de consumo de tokens por squad
- D4 Esteira/GMUD: configuração + webhooks ServiceNow

## Etapa E — Comunidade, KB e gestão (Fase 3; ~2 semanas)

- E1 Visão de comunidade (estrutura, docs, sistemas, KB) — consulta cross-squad
- E2 Base de Conhecimento com escopo (squad/RT/comunidade) e endosso (`POST /api/kb/:id/endossar`)
- E3 Visão de diretoria: indicadores (lead time, GMUDs, custo de IA) + docs somente leitura

## Etapa F — Execução autônoma (Fase 4; ~3–4 semanas, o coração técnico)

- F1 Persistência da máquina de estados (`execucao_autonoma`, `execucao_passo`, `execucao_checkpoint`) e criação de run a partir de OKR/KR
- F2 Implementar o laço do `run-advance-background` (passos automáticos com orçamento de ~13 min, chamadas de agente, tools)
- F3 Checkpoints humanos: UI de decisão (aprovar/ajustar/rejeitar) + retomada do run
- F4 Sweeper: reenfileirar runs travados; idempotência de efeitos externos (chave `run:{id}:passo:{ordem}`)
- F5 Guard-rails no servidor (nunca merge, GMUD só com checkpoint) + teto de custo por run/squad
- F6 Painel da squad virtual (timeline do protótipo)

## Etapa G — Endurecimento (Fase 5; contínuo)

Auditoria (`audit_log`), rate limiting, RLS no Neon, mascaramento de PII nos
prompts, alertas de 80% do budget, Sentry, testes e2e (Playwright), CSP.

---

## Caminho crítico e marcos

```
A (infra) ──► B (login/demo) ──► C (núcleo squad) ══ MVP usável
                                   └─► D (console) ─► E (comunidade/gestão) ─► F (autônoma) ─► G
```

| Marco | O que o usuário consegue fazer | Estimativa acumulada |
|---|---|---|
| **M1 — Entrável** (A+B) | Logar (ou modo demo), navegar autenticado com dados de seed | ~1 semana |
| **M2 — MVP** (C) | Ciclo completo de uma feature com agente de IA | ~5 semanas |
| **M3 — Governança** (D+E) | Arquiteto configura, diretoria acompanha | ~9 semanas |
| **M4 — Squad virtual** (F) | Runs autônomos com humano no loop | ~13 semanas |

## Bloqueios que dependem de terceiros (levantar já)

1. **`ai_workspace_schema.sql`** — o schema canônico de 44 tabelas citado na spec não está no repositório. Sem ele, seguimos com o schema incremental do Drizzle (funciona, mas diverge do "validado").
2. **Credenciais**: org GitHub (OAuth + App), provedor de IA, board, Atlan, ServiceNow, Catálogo — cada uma destrava sua integração; nenhuma bloqueia o MVP além do provedor de IA (para o chat C3).
3. **Conta Netlify + Neon** — sem elas o teste é só local.
