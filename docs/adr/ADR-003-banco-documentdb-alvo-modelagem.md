# ADR-003 — Banco: Amazon DocumentDB como alvo de modelagem (Atlas como relaxação)

- **Status:** Aceita (patamar robusto)
- **Data:** 2026-07-17
- **Contexto da fase:** Entrega 1 (transversal)

## Contexto

O destino exige **MongoDB**. Há duas opções: **MongoDB Atlas** (SaaS, recursos
ricos) e **Amazon DocumentDB** (serviço AWS compatível com a API do Mongo, porém
com um **subconjunto** de recursos/versões). A instrução é adotar o patamar mais
robusto e difícil. Para um banco, "robusto" no sentido corporativo significa: dados
**dentro da própria conta/VPC AWS**, integrados a **IAM/KMS**, **sem processador de
dados externo** (ganho de compliance/LGPD).

## Decisão

Adotar **Amazon DocumentDB** como **alvo de modelagem** — a restrição mais dura.
Modelar evitando recursos que o DocumentDB não suporta, de forma que o mesmo modelo
rode também em Atlas (compatibilidade para cima). Concretamente:

- Usar apenas operadores/índices suportados pelo DocumentDB; validar cada consulta.
- **Transações multi-documento** e **change streams** são usadas de forma
  conservadora (suportadas, com limites); preferir **agregados de documento único**
  para atomicidade sempre que possível.
- **Não** depender de **Atlas Search** (inexistente no DocumentDB) — busca textual
  via índice/serviço dedicado se necessário.
- Criptografia **KMS** em repouso; **field-level** para PII (ADR-010).
- Isolamento multi-tenant por `comunidadeId` em toda coleção (partition/shard key
  lógica), com índices compostos `(comunidadeId, ...)`.

## Consequências

- **Positivas:** dado corporativo permanece in-VPC sob IAM/KMS; menor superfície de
  compliance; portável para Atlas se a política mudar.
- **Negativas / trade-offs:** perde-se recursos ricos do Atlas (Search, alguns
  operadores); modelagem mais disciplinada; atomicidade favorece agregados.
- **Relaxação aceitável:** se a instituição homologar **Atlas**, as restrições de
  recurso caem e podemos usar Search/transações amplas — o modelo continua válido.

## Alternativas consideradas

- **Atlas como alvo primário** — mais poder, porém dado sob processador externo e
  modelagem "solta" que não roda em DocumentDB; escolhido como relaxação, não alvo.
