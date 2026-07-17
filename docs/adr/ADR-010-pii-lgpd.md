# ADR-010 — PII/LGPD: mascaramento, tokenização, KMS e trilha imutável

- **Status:** Aceita (patamar robusto)
- **Data:** 2026-07-17
- **Contexto da fase:** Fase 1 (transversal a todas as fases)

## Contexto

O domínio (PIX, cobrança, consentimento do pagador, email de pessoas) **contém
PII**. A instrução trata segurança/compliance de banco como requisito de primeira
classe, em toda fase. A spec já prevê mascaramento por padrão e classificação via
Atlan; elevamos ao patamar robusto.

## Decisão

- **Classificação de dados** via Atlan; cada campo PII é marcado no modelo e no
  `tecnico.md` da funcionalidade.
- **Mascaramento por padrão nos prompts de IA:** nenhum dado PII bruto sai pelo
  gateway de IA (ADR-008); guard-rail de blueprint aplica o mascaramento no servidor.
- **Tokenização / field-level encryption** para PII em repouso no DocumentDB
  (chaves KMS dedicadas), além da criptografia de volume.
- **Minimização:** só se coleta/persiste o necessário; retenção por política
  (a confirmar — **pergunta obrigatória #6**), com TTL/expurgo onde couber.
- **Trilha de auditoria imutável:** `audit_log` como coleção append-only, com
  export para armazenamento **WORM** (object lock) para ações sensíveis (decisões de
  checkpoint, endossos, mudanças de blueprint, execução de tools de escrita/crítica).
- **Direitos do titular (LGPD):** processos de acesso/eliminação previstos no
  modelo (mapa de onde cada PII vive), respeitando a imutabilidade da trilha
  (pseudonimização em vez de deleção onde a auditoria exigir retenção).

## Consequências

- **Positivas:** conformidade LGPD desde a Fase 1; risco de vazamento de PII para a
  IA eliminado por padrão; trilha confiável para o comitê.
- **Negativas / trade-offs:** overhead de tokenização/criptografia; complexidade de
  atender direito de eliminação sem quebrar a trilha (resolvido por pseudonimização).
- **Dependência:** a política concreta de retenção/mascaramento é **pergunta
  obrigatória #6**.

## Alternativas consideradas

- **Mascarar só no fim (fase de endurecimento)** — proibido: compliance é gate de
  toda fase.
- **Deleção física para atender LGPD** — conflita com auditoria imutável;
  substituída por pseudonimização + retenção legal.
