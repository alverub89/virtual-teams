# Iniciativas & Jornada com agente — Documento Funcional

| | |
|---|---|
| **Funcionalidade** | Iniciativas, jornada BMAD e chat com o agente da etapa (F2) |
| **Fase** | Fase 1 (esqueleto andante) |
| **Nível de maturidade** | N1 · Especificado |
| **Data** | 2026-07-17 |

## Propósito e usuários

Permitir que uma squad conduza uma **feature do brief à entrega** por uma jornada de
etapas (método BMAD), com **um agente de IA em cada etapa** que ajuda a produzir o
artefato daquela etapa (brief, PRD, arquitetura, histórias…). É a fatia que entrega
o **ciclo mínimo de valor do produto** e, por atravessar auth + banco + IA +
streaming, valida a nova stack ponta a ponta.

**Usuários:**
- **PM** — cria a iniciativa (a partir de uma capacidade) e conduz a jornada.
- **Dev / Tech Lead** — participam das etapas técnicas e do chat com o agente.

## Fluxos e jornadas

1. **Criar iniciativa.** A PM cria uma iniciativa a partir de uma capacidade da
   squad, informando título e descrição. A jornada de etapas é instanciada conforme
   o método (ex.: Descoberta → PRD → Arquitetura → Histórias → Desenvolvimento).
2. **Percorrer a jornada (stepper).** Cada etapa tem um agente responsável e um
   estado (pendente / em andamento / concluída) e produz um **artefato**.
3. **Conversar com o agente da etapa (streaming).** Na etapa atual, a pessoa abre o
   chat e conversa com o agente; as respostas chegam **token a token (streaming)**.
   O agente ajuda a redigir/refinar o artefato daquela etapa.
4. **Concluir a etapa.** O artefato é salvo e a etapa marcada como concluída; a
   jornada avança para a próxima.
5. **Acompanhar consumo.** Cada interação registra tokens consumidos (para budget da
   squad).

## Regras de negócio

- Só **pm/tech_lead** criam iniciativa; escopo de escrita = **própria squad**.
- Cada iniciativa tem **código único** (ex.: INI-401).
- A jornada segue as etapas do **método** associado (ou modelo livre).
- O chat sempre ocorre no contexto da **etapa atual** e do **agente** daquela etapa.
- O agente respeita **guard-rails** herdados da plataforma; **nenhuma PII bruta** é
  enviada ao provedor de IA (mascaramento por padrão).
- O **consumo de tokens** é contabilizado por squad/mês; ao atingir o budget, há
  alerta (e teto em execução autônoma).

## Critérios de aceite

- [ ] PM cria uma iniciativa a partir de uma capacidade; o código é único.
- [ ] A jornada aparece como stepper com o estado correto de cada etapa.
- [ ] O chat com o agente da etapa responde em **streaming** (primeiro token rápido).
- [ ] O artefato da etapa é persistido e a etapa pode ser concluída.
- [ ] Dev de outra squad não vê nem edita a iniciativa (isolamento de tenant/escopo).
- [ ] O consumo de tokens da conversa é registrado para a squad.
- [ ] Nenhuma PII bruta aparece no que é enviado ao provedor de IA (verificado).
- [ ] Toda a operação ocorre na stack AWS+MongoDB (sem cair no legado).
