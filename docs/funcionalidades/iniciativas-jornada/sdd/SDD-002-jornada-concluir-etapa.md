# SDD — Jornada (stepper) e conclusão de etapa com artefato

| | |
|---|---|
| **Funcionalidade** | Iniciativas & jornada com agente (F2) |
| **História** | Como PM/Dev, quero avançar a jornada concluindo cada etapa com seu artefato, para levar a feature do brief à entrega |
| **Fase / Nível** | Fase 1 · N1 · Especificado |
| **Repo / arquivo(s) alvo** | `aiw-delivery`: `src/routes/iniciativas.ts`, `src/domain/jornada.ts` |
| **Data** | 2026-07-17 |

## Contexto

Adiciona o avanço da jornada sobre o modelo de SDD-001. Concluir uma etapa salva o
`artefato` e move `etapaAtual`. A atomicidade que no Postgres exigia várias tabelas
vira **update condicional de um único documento** (ADR-012), evitando dupla conclusão.

## Escopo (entra / não entra)

- **Entra:** concluir etapa (salvar artefato + avançar), reabrir/editar artefato da
  etapa atual, marcar iniciativa concluída ao terminar a última etapa.
- **Não entra:** geração do artefato por IA (é via chat, SDD-003) — aqui a conclusão
  aceita o artefato pronto (do chat ou manual).

## Especificação técnica

**Componentes e arquivos**
- `domain/jornada.ts` — regras de transição de etapa (só a etapa atual avança;
  validação de artefato mínimo; cálculo do próximo `etapaAtual`/status da iniciativa).
- `routes/iniciativas.ts` — rota de conclusão abaixo.

**Contratos / APIs**
- `POST /api/iniciativas/:id/etapas/:ordem/concluir { artefato }` →
  valida que `:ordem === etapaAtual` e status é `em_andamento`/`pendente`; grava
  `etapas.$.artefato`, `status='concluida'`, `concluidaEm`; avança `etapaAtual`;
  se era a última, `iniciativa.status='concluida'` → `{ etapaAtual, status }`.
  Autorização: escopo squad (pm/tech_lead/dev da squad).

**Dados**
- Update condicional (findAndModify) com filtro
  `{ _id, comunidadeId, "etapas.ordem": ordem, "etapas.status": {$ne:'concluida'} }`
  usando o operador posicional `$` — **idempotente** (reexecução não duplica).

## Plano de testes

- Concluir a etapa atual salva o artefato e avança `etapaAtual`.
- Concluir etapa que não é a atual → 409/400 (fora de ordem).
- Concluir etapa já concluída é no-op idempotente (não regride nem duplica).
- Concluir a última etapa marca a iniciativa como `concluida`.
- Pessoa de outra squad não conclui (403).

## Tarefas

1. Implementar `domain/jornada.ts` (transições e validação de artefato).
2. Implementar a rota de conclusão com update condicional idempotente.
3. Auditar `concluir_etapa` no `audit_log`.
4. Testes de ordem, idempotência e conclusão final.

## Definition of Done

- [ ] Conclusão salva artefato e avança corretamente; última etapa fecha a iniciativa.
- [ ] Update condicional garante idempotência (sem dupla conclusão).
- [ ] Fora de ordem é rejeitado; escopo/RBAC aplicados.
- [ ] Ação auditada; testes verdes.

## Prompt pronto

> Implemente no `aiw-delivery` a conclusão de etapa da jornada conforme este SDD:
> `domain/jornada.ts` (transições: só a etapa atual avança, valida artefato, calcula
> próximo etapaAtual e fecha a iniciativa na última) e a rota
> `POST /iniciativas/:id/etapas/:ordem/concluir` com update condicional idempotente
> (findAndModify com operador posicional e filtro por comunidadeId+ordem+status≠concluida).
> Rejeite conclusão fora de ordem, aplique escopo de squad, audite a ação e cubra com
> testes ordem/idempotência/conclusão final.
