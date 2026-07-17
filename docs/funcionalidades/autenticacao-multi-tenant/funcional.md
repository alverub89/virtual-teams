# Autenticação, Sessão & Multi-tenant — Documento Funcional

| | |
|---|---|
| **Funcionalidade** | Autenticação, sessão e isolamento multi-tenant (F1) |
| **Fase** | Fase 1 |
| **Nível de maturidade** | N1 · Especificado |
| **Data** | 2026-07-17 |

## Propósito e usuários

Dar a cada pessoa acesso ao AI Workspace com **identidade corporativa** e garantir
que ela só veja e altere o que pertence à **sua comunidade e squad**. É a fundação
de segurança sobre a qual todas as outras funcionalidades operam.

**Usuários:**
- **CTO / Arquiteto** — dono da plataforma; monta a estrutura (Comunidade → Release
  Train → Squad), convida pessoas e pode **auditar como squad** (somente leitura).
- **PM / Tech Lead / Dev** — membros de squad; entram por convite e operam a squad.
- **Gestão / Diretoria** — acesso de leitura aos indicadores.

## Fluxos e jornadas

1. **Login corporativo (OIDC/SSO).** A pessoa acessa o app → é redirecionada ao IdP
   corporativo → autentica (com MFA da instituição) → volta autenticada. Sem
   usuário/senha próprios do produto.
2. **Direcionamento por papel.** Após o login, o destino inicial depende do papel:
   dev/pm/tech_lead → squad; CTO/arquiteto → console; gestão/diretoria → gestão.
3. **Onboarding do CTO.** No primeiro acesso, o CTO cria a Comunidade, o Release
   Train e as Squads, tornando-se dono do tenant.
4. **Convite de membros.** O CTO convida por email (papel + squad). A pessoa
   convidada aceita por um link e passa a pertencer àquela squad/comunidade.
5. **Auditar como squad (CTO).** O CTO ativa o modo auditoria sobre uma squad da sua
   comunidade e passa a **enxergar** os dados dela em **somente leitura**; ao sair,
   volta à sua visão. A troca é assinada no servidor, não escolhida pelo cliente.
6. **Logout.** Encerra a sessão; o próximo acesso exige novo login.

## Regras de negócio

- **Identidade** é fornecida pelo IdP corporativo; o produto não guarda senha.
- **Isolamento multi-tenant:** toda leitura/escrita é restrita à **comunidade** da
  pessoa. Uma pessoa nunca acessa dados de outra comunidade.
- **Escopo de escrita:** cria/edita **apenas na própria squad**; consulta o restante
  conforme o escopo (squad / release train / comunidade).
- **Papéis e permissões** (RBAC) são aplicados **no servidor**, nunca no cliente:
  - criar iniciativa / imputar KR / decidir checkpoint / iniciar run → pm, tech_lead.
  - endossar KB / configurar plataforma → cto.
  - ver gestão → gestão, cto.
- **Modo auditoria** é exclusivo do CTO, restrito a squads da sua comunidade e
  **somente leitura**; qualquer escrita é bloqueada (exceto o próprio controle de
  auditoria e as áreas de console/gestão do CTO).
- **Convite** tem estado (pendente/aceito/cancelado) e token de uso único.

## Critérios de aceite

- [ ] Login só ocorre via IdP corporativo; não há tela de senha própria.
- [ ] Após login, a pessoa cai na visão correta do seu papel.
- [ ] Uma pessoa da comunidade A não consegue ler nem escrever dados da comunidade B
      (verificado por teste).
- [ ] Uma pessoa não consegue escrever em squad que não é a sua (403).
- [ ] O CTO consegue auditar uma squad da sua comunidade em somente leitura e
      qualquer tentativa de escrita é bloqueada.
- [ ] O CTO não consegue auditar squad de outra comunidade.
- [ ] Convite gera acesso correto (papel + squad) e o token não pode ser reutilizado.
- [ ] Logout invalida a sessão.
- [ ] Nenhuma credencial trafega para o cliente; cookie de sessão é httpOnly.
