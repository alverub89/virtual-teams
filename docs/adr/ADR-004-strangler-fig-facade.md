# ADR-004 — Migração strangler fig com façade de borda

- **Status:** Aceita
- **Data:** 2026-07-17
- **Contexto da fase:** Entrega 1 (transversal a todas as fases)

## Contexto

A migração não pode ser big-bang e cada fase precisa ser reversível. O sistema
atual (Netlify/Neon) deve continuar servindo enquanto fatias verticais migram.

## Decisão

Adotar o padrão **strangler fig** com uma **façade de borda** (API Gateway/ALB atrás
do CloudFront) que roteia por rota:

- Rota **migrada** → serviço AWS do bounded context.
- Rota **não migrada** → proxy para o app Netlify legado.

Cada fase assume (estrangula) as rotas da sua fatia. O corte de tela na SPA nova
acompanha o corte das rotas. Reverter uma fase = reapontar suas rotas para o legado.

## Consequências

- **Positivas:** migração incremental, reversível por rota, sem janela de big-bang;
  usuários não percebem o corte.
- **Negativas / trade-offs:** enquanto durar, há dois sistemas no ar (custo e
  disciplina de sincronização de dados — ver ADR-012); a façade é um componente
  crítico (precisa de HA).
- **Mitigação:** façade gerenciada (API Gateway/ALB, multi-AZ); feature flags por
  rota; observabilidade de qual backend serve cada rota.

## Alternativas consideradas

- **Big-bang cutover** — proibido pela estratégia; risco inaceitável num banco.
- **Fork e reescrita paralela** — perde continuidade de produto e duplica esforço.
