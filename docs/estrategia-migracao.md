# Estratégia de Migração Faseada — Netlify/Neon → AWS/MongoDB

| | |
|---|---|
| **Fase** | Entrega 1 |
| **Nível de maturidade** | N1 · Especificado |
| **Data** | 2026-07-17 |

> **Princípios inegociáveis desta estratégia:** fatia vertical por funcionalidade ·
> coexistência (strangler fig) durante toda a transição · cada fase reversível ·
> segurança e compliance como **gate em toda fase** (não no fim) · estratégia
> explícita de dados **Postgres → MongoDB** decidida **por funcionalidade**
> (backfill, dual-write ou corte). Sem big-bang.

---

## 1. Sequenciamento

### 1.1 Critério

Cada funcionalidade foi pontuada por **valor × risco × dependência × esforço**:

- **Valor** — quanto a fatia entrega de valor real ao usuário ao final da fase.
- **Risco** — incerteza técnica/compliance (quanto mais alto, mais tarde, **exceto**
  quando validar o risco cedo é o próprio ponto).
- **Dependência** — o que precisa existir antes (auth, agentes, tools).
- **Esforço** — tamanho relativo.

A **Fase 1** é escolhida como a **menor fatia que já entrega valor real e valida o
caminho técnico ponta a ponta** — o "esqueleto andante" da nova stack. Não é a mais
fácil: é a que atravessa todas as camadas difíceis de uma vez (auth corporativa,
DocumentDB, gateway de IA com **streaming**, secrets, VPC, observabilidade,
mascaramento de PII), provando o trilho para todas as fases seguintes.

### 1.2 Ordem e justificativa

| Fase | Fatia vertical | Valor | Risco | Dep. | Esforço | Por que aqui |
|---|---|---|---|---|---|---|
| **1** | **Fundação + Iniciativas & Jornada com agente (streaming)** | Alto | **Alto (validado cedo)** | — | G | Esqueleto andante: prova auth OIDC + DocumentDB + gateway de IA + SSE + secrets + observabilidade + PII de uma vez. Já entrega o ciclo mínimo do produto (PM cria feature, conversa com o agente, gera artefato) |
| **2** | **OKRs & Indicadores de gestão** | Alto | Baixo | F1 | M | Alto valor para a diretoria, baixa dependência externa; consolida os padrões de agregação/leitura no DocumentDB sem risco de integração |
| **3** | **Capacidades & Repositórios + KB** | Médio-alto | Médio | F1, agentes | M-G | Primeiro uso do **caminho assíncrono real** (SQS+Lambda+jobs) e do **gateway de integrações** (GitHub). Valida jobs longos fora do modelo Netlify |
| **4** | **Histórias & Documentação/SDD** | Médio | Médio | F1, F3 | M | Backlog e docs; integra o **board** (sync). Depende de iniciativas e do caminho de integração já provado na F3 |
| **5** | **Esteira & GMUD (ações críticas)** | Médio-alto | **Alto** | F1, F4 | M | Governança de entrega; introduz **ação crítica** (GMUD no ServiceNow, exige checkpoint) e webhooks de entrada. Risco alto isolado numa fase própria |
| **6** | **Console & governança de agentes/MCP** | Médio | Médio | F1, agentes | G | Self-service de agentes/skills/tools/guard-rails/roteamento/MCP. Precisa maturar antes da execução autônoma depender disso |
| **7** | **Execução autônoma & orquestrador & party (squad virtual)** | Alto | **Muito alto** | Todas | G | O coração técnico e o maior risco: máquina de estados em Step Functions, checkpoints, sweeper, idempotência e guard-rails. Depende de todas as tools/agentes já migrados |

> Observação sobre **agentes**: o catálogo de agentes (built-in) e a composição de
> prompt são **pré-requisito da Fase 1** (o chat precisa deles). Entram como
> serviço `aiw-agents` já na Fase 1, porém **somente-leitura/seed**; o **editor**
> completo (self-service) é a Fase 6.

---

## 2. Cartões de fase

Cada cartão traz: objetivo e valor de negócio, funcionalidades, escopo técnico
(repos, serviços AWS, coleções Mongo, contratos), pré-requisitos, **Definition of
Done com critérios de segurança e observabilidade**, riscos+mitigação+**rollback**,
e métrica de sucesso.

### Fase 1 — Fundação + Iniciativas & Jornada com agente (esqueleto andante)

- **Objetivo / valor de negócio:** uma PM entra com identidade corporativa, cria
  uma iniciativa, percorre a jornada BMAD e **conversa com o agente da etapa
  (streaming)**, gerando um artefato — o ciclo mínimo do produto, agora rodando 100%
  na stack AWS+MongoDB. Valor: prova que a plataforma vive no ambiente corporativo.
- **Funcionalidades:** F1 (auth, sessão, multi-tenant, convites), F2 (iniciativas &
  jornada, chat de agente por etapa), agentes (catálogo seed + composição de prompt),
  auditoria e consumo de tokens (transversais).
- **Escopo técnico:**
  - **Repos:** `aiw-web`, `aiw-identity`, `aiw-delivery`, `aiw-agents`,
    `aiw-contracts`, `aiw-platform-infra`, `aiw-docs`.
  - **Serviços AWS:** S3+CloudFront+WAF, API Gateway/ALB (façade), Fargate (3
    serviços), DocumentDB, Secrets Manager, KMS, Cognito/OIDC bridge, OTel→CloudWatch/X-Ray.
  - **Coleções Mongo:** `comunidade`, `release_train`, `squad`, `pessoa`, `convite`,
    `sessao`, `iniciativa` (com `etapas[]` embutidas), `mensagem_chat`, `agente`,
    `skill`, `tool`, `documento`, `consumo_tokens`, `audit_log`.
  - **Contratos:** OpenAPI de `identity` e `delivery`; evento `TokensConsumidos`.
- **Pré-requisitos:** VPC e landing zone; IdP OIDC provisionado; gateway de IA
  acessível; Secrets Manager com as chaves; DocumentDB provisionado.
- **Definition of Done (inclui segurança + observabilidade):**
  - Funcional: login OIDC → redirect por papel → criar iniciativa → chat streaming
    → artefato persistido; isolamento por tenant verificado.
  - **Segurança:** nenhuma credencial em código/banco (tudo em Secrets Manager);
    IAM least-privilege por serviço; cookie httpOnly+Secure+SameSite; PII mascarada
    nos prompts; DocumentDB criptografado (KMS); WAF ativo; pen-test de auth.
  - **Observabilidade:** logs JSON com `requestId`; tracing distribuído web→API→IA;
    métrica de latência de SSE e de consumo de tokens; alarme de erro 5xx.
- **Riscos / mitigação / rollback:**
  - Risco: streaming SSE em Fargate atrás da façade. Mitigação: PoC de streaming no
    início da fase. **Rollback:** façade reaponta `/api/iniciativas/*` e
    `/api/auth/*` para o Netlify legado (dados ainda em dual-write — ver §3).
  - Risco: modelagem de `iniciativa` como agregado. Mitigação: contrato de dados
    revisado; backfill idempotente re-executável.
- **Métrica de sucesso:** 1 squad piloto opera o ciclo iniciativa→chat→artefato na
  AWS por 2 semanas sem cair no legado; p95 de primeiro token do chat < 3 s.

### Fase 2 — OKRs & Indicadores de gestão

- **Objetivo / valor:** diretoria e PMs acompanham OKRs em cascata (planejado ×
  realizado) e indicadores — visão de valor entregue, agora na nova stack.
- **Funcionalidades:** F5 (OKRs), F13 (indicadores/gestão).
- **Escopo técnico:** repo `aiw-okr` (Fargate); coleções `okr` (com `keyResults[]`
  e `medicoes[]` embutidas), `kr_feature` (referências); contrato OpenAPI `okr` +
  leitura de `iniciativa`/`consumo_tokens` via contrato do `delivery`.
- **Pré-requisitos:** Fase 1 (iniciativas existem para associar a KRs).
- **DoD:** cascata e medições corretas; **segurança:** RBAC de escrita só PM/TL,
  leitura por escopo; **observabilidade:** métricas de negócio (progresso de KR,
  custo de IA) publicadas em dashboard.
- **Riscos/rollback:** baixo. **Rollback:** rota `/api/okrs/*` volta ao legado;
  medições em dual-write.
- **Métrica de sucesso:** fechamento mensal de OKRs feito 100% na AWS.

### Fase 3 — Capacidades & Repositórios + KB

- **Objetivo / valor:** mapa de capacidades (arquitetura de negócio) e KB gerados
  por IA lendo repositórios — documentação viva e contexto para os agentes.
- **Funcionalidades:** F4 (capacidades/repos/mapa), F7 (KB por repositório).
- **Escopo técnico:** repo `aiw-capabilities`; **SQS + Lambda workers** (jobs
  longos), Step Functions opcional para leitura profunda; **gateway de integrações**
  → GitHub; coleções `capacidade`, `repositorio`, `mapa_capacidade` (jsonb→documento
  1:1), `kb_artigo`, `kb_endosso`.
- **Pré-requisitos:** Fase 1; gateway de integrações liberado para GitHub Enterprise.
- **DoD:** análise de repo completa em job assíncrono com progresso; **segurança:**
  credencial GitHub em Secrets Manager (nunca em `comunidade.github_token`); egress
  só via gateway; **observabilidade:** métrica de duração/erro de job, DLQ monitorada.
- **Riscos/rollback:** rate limit/erros do GitHub. Mitigação: retry+DLQ, tolerância
  a falha parcial (já existe). **Rollback:** feature flag desliga a análise nova e
  reaponta ao legado; mapas já gerados permanecem legíveis.
- **Métrica de sucesso:** mapa de capacidades de 3 squads regenerado na AWS sem
  intervenção manual.

### Fase 4 — Histórias & Documentação/SDD

- **Objetivo / valor:** backlog de histórias INVEST e documentação técnica (SDD)
  ligados às iniciativas, com sync ao board.
- **Funcionalidades:** F3 (histórias + sync board), F6 (docs/SDD).
- **Escopo técnico:** dentro de `aiw-delivery`; **gateway de integrações** → board
  (sync + webhook); coleções `historia`, `documento` (SDD com `extra`).
- **Pré-requisitos:** Fase 1 e Fase 3 (caminho de integração provado).
- **DoD:** histórias sincronizadas idempotentemente; **segurança:** webhook
  assinado/validado, credencial do board em Secrets Manager; **observabilidade:**
  métrica de divergência de sync.
- **Riscos/rollback:** duplicação no sync. Mitigação: chave de idempotência.
  **Rollback:** desliga sync (histórias locais seguem), rota volta ao legado.
- **Métrica de sucesso:** 0 duplicatas em 1.000 eventos de sync.

### Fase 5 — Esteira & GMUD (ações críticas)

- **Objetivo / valor:** entrega governada — pipeline (GitHub Actions) e mudança
  controlada (GMUD no ServiceNow) com aprovação humana.
- **Funcionalidades:** F8 (esteira & GMUD), hoje simulada → real.
- **Escopo técnico:** repo `aiw-pipeline`; **webhooks** (GitHub Actions, ServiceNow)
  via Lambda; **ação crítica** GMUD exige checkpoint humano aprovado; coleções
  `execucao_esteira`, `gmud`, `pull_request`, `integracao_plataforma`.
- **Pré-requisitos:** Fase 1, Fase 4; contas de serviço GitHub App e ServiceNow.
- **DoD:** GMUD só é aberta após checkpoint aprovado; **segurança:** enforcement de
  permissão `critica` no servidor, credenciais ServiceNow em Secrets Manager,
  auditoria de cada GMUD; **observabilidade:** rastreio ponta a ponta de uma mudança.
- **Riscos/rollback:** abrir GMUD indevida. Mitigação: guard-rail servidor + dry-run.
  **Rollback:** modo simulado (como hoje) reativável por flag; nenhuma GMUD real
  criada sem aprovação.
- **Métrica de sucesso:** 100% das GMUDs com trilha de aprovação auditável.

### Fase 6 — Console & governança de agentes/MCP

- **Objetivo / valor:** arquiteto configura agentes, skills, tools (com permissão),
  guard-rails, blueprints, métodos, roteamento de modelos e MCPs — self-service.
- **Funcionalidades:** F12 (console), F14 (MCP vivo + client), F11 (party mode).
- **Escopo técnico:** amplia `aiw-agents`; **MCP** (servidor vivo `/mcp/:slug` e
  cliente); governança de aprovação (rascunho→pendente→aprovado); coleções
  `metodo`, `metodo_etapa`, `template`, `checklist`, `blueprint`, `modelo_ia_rota`,
  `conexao_mcp` (token→Secrets Manager), `party_sessao`, `party_turno`.
- **Pré-requisitos:** Fase 1 (catálogo seed já existe).
- **DoD:** editor completo com prompt de sistema gerado; **segurança:** aprovação de
  MCP/tool com trilha, token de MCP fora do banco, permissão de tool aplicada no
  servidor; **observabilidade:** auditoria de mudanças de configuração.
- **Riscos/rollback:** config errada de agente/guard-rail. Mitigação: revisão
  pendente + versionamento. **Rollback:** reverter para o catálogo seed.
- **Métrica de sucesso:** arquiteto cria um agente novo + tool aprovada sem deploy.

### Fase 7 — Execução autônoma & orquestrador (squad virtual)

- **Objetivo / valor:** a squad virtual executa runs autônomos com humano no loop —
  o diferencial da plataforma.
- **Funcionalidades:** F9 (execução autônoma), F10 (orquestrador de iniciativa).
- **Escopo técnico:** repo `aiw-autonomy`; **Step Functions** (máquina de estados),
  **SQS** (advance), **EventBridge Scheduler** (sweeper), checkpoints como
  `waitForTaskToken`; coleções `execucao_autonoma`, `execucao_passo`,
  `execucao_checkpoint`, `workflow*`.
- **Pré-requisitos:** todas as fases (agentes, tools, guard-rails, integrações).
- **DoD:** run completa com checkpoint aprovado e retomada; **segurança:**
  idempotência (chave `run:{id}:passo:{ordem}`), guard-rails no servidor (nunca
  merge, GMUD só com checkpoint), teto de tokens por run/squad; **observabilidade:**
  timeline do run rastreável, métrica de runs travados/reenfileirados.
- **Riscos/rollback:** run com efeito colateral duplicado; passo longo. Mitigação:
  Step Functions + idempotência + DLQ + sweeper. **Rollback:** desligar novos runs
  (flag), runs em curso concluídos ou pausados; execução volta a ser assistida.
- **Métrica de sucesso:** 10 runs autônomos concluídos com checkpoints, 0 efeito
  duplicado.

---

## 3. Estratégia de coexistência e de dados

### 3.1 Coexistência (strangler fig)

Durante toda a transição, o sistema **Netlify/Neon** segue no ar. A **façade de
borda** (API Gateway/ALB) roteia por rota:

- Rota **migrada** → serviço AWS correspondente.
- Rota **não migrada** → proxy para o Netlify legado.

Cada fase "estrangula" o legado assumindo suas rotas. A SPA nova (`aiw-web`) e a
SPA legada coexistem atrás do CloudFront; o corte de cada tela acompanha o corte de
suas rotas. **Nada de big-bang; cada fase é reversível** reapontando a rota na
façade (ver ADR-004).

### 3.2 Estratégia de dados por funcionalidade

O modelo relacional (Postgres) é remodelado para documentos (MongoDB) **por
funcionalidade**, escolhendo a técnica pelo perfil de escrita da fatia:

| Técnica | Quando usar | Como |
|---|---|---|
| **Corte (cutover)** | Dados de catálogo/config, baixo volume, sem escrita concorrente durante a migração (ex.: agentes, métodos, blueprints, modelos) | Backfill único → vira a chave na façade → legado read-only |
| **Backfill idempotente** | Dados históricos que não mudam durante a janela (ex.: iniciativas concluídas, OKRs de trimestres fechados) | ETL Postgres→Mongo re-executável; reconciliação por contagem |
| **Dual-write** | Dados quentes com escrita concorrente enquanto a rota ainda pode voltar ao legado (ex.: iniciativas ativas, chat, medições de KR na fase de corte) | O serviço novo escreve em Mongo **e** publica um evento/CDC para manter o Postgres legado em sincronia até o corte final; reconciliação diária |

**Mecânica do dual-write / sincronização.** Duas opções, decididas por fase:

1. **App-level dual-write** através da façade: durante a janela, escritas passam
   pelo serviço novo, que grava no Mongo e replica ao Postgres via evento
   (SQS→Lambda). Simples de reverter; exige idempotência.
2. **CDC (Change Data Capture)** com AWS DMS / Debezium: replica Postgres→Mongo (e
   vice-versa na janela) sem tocar no código legado. Mais robusto para volume;
   registrado como opção em ADR-012.

**Regra de ouro da remodelagem** (detalhe em ADR-012 e nos docs técnicos por
funcionalidade): **agregados naturais viram documentos** (iniciativa+etapas,
run+passos+checkpoints, okr+krs+medições), relações **muitos-para-muitos** de baixo
volume viram **listas de referência embutidas** (agente_tool, kr_feature) e dados de
alto volume/consulta independente permanecem **coleções próprias** (mensagem_chat,
audit_log, historia). Cada decisão de embed-vs-referência é justificada no
`tecnico.md` da funcionalidade.

### 3.3 Segurança como gate em toda fase

Nenhuma fase é considerada "pronta" sem os critérios de segurança do seu DoD:
secrets fora do banco, IAM least-privilege, isolamento de tenant verificado,
mascaramento de PII, criptografia KMS, trilha de auditoria imutável e egress só por
gateway. Compliance/LGPD e auditoria **entram em cada fatia**, não numa fase final
de "endurecimento".

---

## 4. Reversibilidade — resumo

| Nível | Mecanismo de rollback |
|---|---|
| **Rota** | Reapontar a rota na façade para o Netlify legado |
| **Dado** | Dual-write mantém o Postgres legado consistente até o corte final |
| **Funcionalidade** | Feature flag desliga o caminho novo (jobs, sync, runs) |
| **Fase** | Como cada fase é uma fatia vertical isolada, reverter uma não afeta as já migradas |

---

## 5. Arquitetura e decisões

O desenho completo (C4 níveis 1–3 e fluxo de dados) está em
[`arquitetura.md`](arquitetura.md). As decisões estão em [`adr/`](adr/). A
documentação por funcionalidade (funcional + técnico, que amadurece por fase) está
em [`funcionalidades/`](funcionalidades/) — começando pela Fase 1.
