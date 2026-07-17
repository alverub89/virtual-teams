# ADR-005 — Execução autônoma em Step Functions + DocumentDB (idempotência)

- **Status:** Aceita
- **Data:** 2026-07-17
- **Contexto da fase:** Fase 7 (decisão tomada cedo por ser estrutural)

## Contexto

Hoje a execução autônoma é uma máquina de estados persistida no Postgres, avançada
por um laço dentro de uma Background Function com **orçamento de tempo de ~13 min**
(margem sob o teto de 15) e retomada por um **sweeper** cron a cada 2 min. O
checkpoint humano é uma pausa que não consome computação. Na AWS, sem o limite de
15 min como fator, queremos preservar essa semântica com mais robustez.

## Decisão

Modelar a execução autônoma como **AWS Step Functions**:

- Cada **passo automático** é uma tarefa (invoca o agente/tool via o serviço
  `aiw-agents`/adapters).
- O **checkpoint humano** é um estado **`waitForTaskToken`** — o run espera a
  decisão (aprovar/ajustar/rejeitar) sem custar computação, preservando a "pausa
  gratuita" atual de forma nativa.
- O **estado e a trilha** (run, passos, checkpoints) permanecem no **DocumentDB**
  como fonte de verdade de negócio; o Step Functions guarda o estado de execução.
- **Idempotência** mantida pela chave `run:{id}:passo:{ordem}` e por updates
  condicionais (findAndModify) no DocumentDB; efeitos externos (PR, GMUD, história)
  usam a mesma chave para não duplicar em retry.
- **Sweeper** vira **EventBridge Scheduler** que reenfileira/reconcilia runs presos
  (defesa em profundidade, além do retry do Step Functions).
- Teto de tokens por run/squad como guard-rail duro no motor.

## Consequências

- **Positivas:** retry, visibilidade e tratamento de erro de primeira classe; sem o
  contorno do orçamento de 13 min; pausa humana nativa.
- **Negativas / trade-offs:** acoplamento ao Step Functions; mapear o laço atual
  para uma state machine exige cuidado com idempotência.
- **Relaxação aceitável:** um **worker Lambda + SQS** replicando o laço atual (com
  orçamento de tempo e sweeper) é aceitável onde Step Functions for excessivo.

## Alternativas consideradas

- **Portar o laço para um worker com orçamento de tempo** (como hoje) — mais
  próximo do atual, porém menos observável e sem waitForTaskToken nativo; fica como
  relaxação.
- **Fila de tarefas dedicada (ex.: worker sempre ligado)** — reintroduz processo
  persistente que a arquitetura evita; descartada.
