# ADR-007 — Secrets Manager + IAM least-privilege + VPC (fim do token em banco)

- **Status:** Aceita
- **Data:** 2026-07-17
- **Contexto da fase:** Fase 1 (transversal)

## Contexto

Achado na descoberta: o sistema atual guarda **credenciais em texto no banco**
(`comunidade.github_token`, `conexao_mcp.token`) e usa env vars da Netlify para o
resto. Num banco, credencial em coluna é um antipadrão de compliance.

## Decisão

- **Todas as credenciais em AWS Secrets Manager** (segredos rotacionáveis) e
  **Parameter Store** (config não-sensível). **Nenhuma credencial em coluna de
  banco nem no bundle do cliente.** As colunas `github_token`/`conexao_mcp.token`
  passam a guardar apenas uma **referência** ao segredo (ARN/handle), não o valor.
- **IAM least-privilege por serviço:** cada serviço Fargate/Lambda tem uma role com
  o mínimo necessário (só os segredos e coleções que usa).
- **Rede:** serviços em **VPC privada**, subnets isoladas; acesso a DocumentDB/
  Secrets Manager via **VPC endpoints**; egress externo só pelo gateway (ADR-008).
- **Criptografia:** KMS em repouso (DocumentDB, segredos) e TLS em trânsito.
- **Sessão:** `SESSION_JWT_SECRET` vira segredo rotacionável no Secrets Manager.

## Consequências

- **Positivas:** superfície de credencial mínima; rotação central; auditoria de
  acesso a segredo; isolamento de rede.
- **Negativas / trade-offs:** latência de leitura de segredo (mitigada por cache
  curto em memória); disciplina de IAM por serviço.
- **Migração:** script único move os tokens do banco para o Secrets Manager e
  substitui o valor pela referência; a coluna antiga é zerada.

## Alternativas consideradas

- **HashiCorp Vault** — válido se for o padrão corporativo homologado; a decisão de
  ferramenta específica fica em aberto (pergunta obrigatória #4). O princípio
  (segredo fora do banco, IAM mínimo, VPC) não muda.
- **Manter env vars** — insuficiente para rotação/auditoria corporativa.
