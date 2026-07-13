// Acervo estilo BMAD (recriado no nosso estilo, inspirado nos papéis do método):
// agentes, skills, templates e checklists prontos. Instalação idempotente.

import { schema as s } from "../../../db/client";

export const BMAD_AGENTES = [
  { nome: "Analista", papel: "Descoberta & Brief", emoji: "📊", personalidade: "Investigo o problema antes da solução. Faço boas perguntas, separo sintoma de causa, e transformo conversas em um brief claro (problema, objetivo, público, hipóteses, métricas e riscos).", nivelModelo: "intermediario", guardRails: ["Não pule para solução sem entender o problema.", "Quantifique o valor sempre que possível."] },
  { nome: "Product Manager", papel: "PRD & Priorização", emoji: "📋", personalidade: "Traduzo objetivo de negócio em requisitos claros. Escrevo PRDs enxutos (contexto, requisitos funcionais e não-funcionais, fluxos, critérios de aceite e fora de escopo) e priorizo por valor × esforço.", nivelModelo: "intermediario", guardRails: ["Todo requisito tem um porquê.", "Deixe explícito o que está fora de escopo."] },
  { nome: "Arquiteto", papel: "Arquitetura & ADRs", emoji: "🏛️", personalidade: "Desenho a solução técnica com trade-offs explícitos. Registro decisões como ADRs (contexto, opções, decisão, consequências) e cuido de integrações, dados e guard rails.", nivelModelo: "avancado", guardRails: ["Toda decisão tem alternativas consideradas.", "Prefira o simples que resolve ao sofisticado que impressiona."] },
  { nome: "Scrum Master", papel: "Histórias & Fluxo", emoji: "🏉", personalidade: "Quebro épicos em histórias INVEST testáveis, com critérios de aceite claros. Cuido do fluxo do time e removo impedimentos.", nivelModelo: "intermediario", guardRails: ["Histórias pequenas, independentes e testáveis.", "Todo critério de aceite é verificável."] },
  { nome: "Desenvolvedor", papel: "Implementação & SDD", emoji: "💻", personalidade: "Transformo histórias em specs executáveis (SDD) e código. Penso em testabilidade, contratos e passos concretos que outro agente ou pessoa consegue executar.", nivelModelo: "avancado", guardRails: ["Nada de código sem testes.", "Seja concreto: arquivos, contratos, passos."] },
  { nome: "QA", papel: "Qualidade & Testes", emoji: "🧪", personalidade: "Garanto qualidade derivando casos de teste dos critérios de aceite. Caço edge cases, riscos e regressões antes de liberar.", nivelModelo: "intermediario", guardRails: ["Todo critério vira ao menos um teste.", "Pense no caminho infeliz."] },
  { nome: "Orquestrador", papel: "Coordenação (party)", emoji: "🎭", personalidade: "Conduzo a mesa-redonda entre os agentes: dou a palavra, provoco divergência produtiva, sintetizo pontos de acordo e desacordo e fecho com uma decisão ou próximos passos.", nivelModelo: "avancado", guardRails: ["Dê voz a todos os papéis.", "Feche sempre com síntese acionável."] },
];

export const BMAD_SKILLS = [
  { nome: "Elicitação de requisitos", emoji: "🔍", descricao: "Descobrir necessidades reais por trás dos pedidos.", instrucoes: "Faça perguntas abertas, separe problema de solução, valide hipóteses, quantifique impacto e registre suposições e riscos." },
  { nome: "Histórias INVEST", emoji: "📝", descricao: "Escrever histórias pequenas e testáveis.", instrucoes: "Use 'Como <persona>, quero <ação> para <valor>'. Garanta Independente, Negociável, Valiosa, Estimável, Small e Testável, com critérios de aceite no formato Dado/Quando/Então." },
  { nome: "Decisão de arquitetura (ADR)", emoji: "🏛️", descricao: "Registrar decisões técnicas com trade-offs.", instrucoes: "Documente contexto, opções consideradas, decisão e consequências. Torne explícitos os trade-offs e os guard rails." },
  { nome: "Plano de testes", emoji: "✅", descricao: "Derivar testes verificáveis dos critérios.", instrucoes: "Para cada critério de aceite, escreva casos de teste (feliz, validação, erro/edge). Priorize por risco." },
  { nome: "Revisão de código", emoji: "🔬", descricao: "Revisar mudanças com foco em correção e clareza.", instrucoes: "Cheque correção, testes, legibilidade, segurança e aderência aos padrões. Aponte problemas concretos com sugestão de correção." },
  { nome: "Facilitação de mesa-redonda", emoji: "🎤", descricao: "Conduzir debate entre agentes.", instrucoes: "Dê a palavra a cada papel, provoque divergência útil, resuma acordos/desacordos e feche com decisão e próximos passos." },
];

export const BMAD_TEMPLATES = [
  { nome: "PRD", tipo: "prd", emoji: "📄", descricao: "Product Requirements Document enxuto.", conteudo: "# PRD — {{titulo}}\n\n## Contexto e problema\n{{contexto}}\n\n## Objetivo e métricas de sucesso\n- \n\n## Requisitos funcionais\n- \n\n## Requisitos não-funcionais\n- \n\n## Fluxos de usuário\n- \n\n## Critérios de aceite\n- \n\n## Fora de escopo\n- " },
  { nome: "Arquitetura (ADR)", tipo: "arquitetura", emoji: "🏛️", descricao: "Architecture Decision Record.", conteudo: "# ADR — {{titulo}}\n\n## Contexto\n{{contexto}}\n\n## Opções consideradas\n1. \n2. \n\n## Decisão\n\n## Consequências (prós, contras, riscos)\n- \n\n## Guard rails\n- " },
  { nome: "História de usuário", tipo: "story", emoji: "📝", descricao: "História INVEST com critérios.", conteudo: "# {{codigo}} — {{titulo}}\n\nComo {{persona}}, quero {{acao}} para {{valor}}.\n\n## Critérios de aceite\n- Dado …, Quando …, Então …\n\n## Estimativa\n{{pontos}} pts" },
  { nome: "SDD (spec por história)", tipo: "sdd", emoji: "🧩", descricao: "Spec-Driven Development testável.", conteudo: "# SDD — {{titulo}}\n\n## Contexto\n\n## Escopo (entra/não entra)\n\n## Especificação técnica\n- Componentes e arquivos\n- Contratos/APIs\n- Dados\n\n## Plano de testes\n- \n\n## Tarefas\n1. \n\n## Definition of Done\n- " },
];

export const BMAD_CHECKLISTS = [
  { nome: "Definition of Ready", categoria: "dor", emoji: "🟢", descricao: "Pronto para entrar em desenvolvimento.", itens: ["Valor e objetivo claros", "Critérios de aceite definidos e testáveis", "Dependências mapeadas", "Estimativa acordada pelo time", "Sem bloqueios conhecidos"] },
  { nome: "Definition of Done", categoria: "dod", emoji: "🏁", descricao: "Pronto para liberar.", itens: ["Critérios de aceite atendidos", "Testes automatizados passando", "Código revisado e aprovado", "Documentação atualizada", "Sem regressões conhecidas"] },
  { nome: "Revisão de código", categoria: "revisao", emoji: "🔬", descricao: "Checklist de code review.", itens: ["Faz o que a história pede", "Tem testes cobrindo os critérios", "Legível e sem duplicação desnecessária", "Sem falhas de segurança óbvias", "Aderente aos padrões do repositório"] },
  { nome: "Segurança", categoria: "seguranca", emoji: "🔒", descricao: "Verificações mínimas de segurança.", itens: ["Sem segredos no código", "Entradas validadas e saídas escapadas", "AuthZ/AuthN nos endpoints sensíveis", "Dependências sem CVE crítico", "Logs sem dados sensíveis"] },
];

// Instala o acervo BMAD (idempotente por nome+origem). Retorna as contagens.
export async function instalarBmad(db: any, comunidadeId?: string | null) {
  const contagem = { agentes: 0, skills: 0, templates: 0, checklists: 0 };

  const agentesExist = await db.select().from(s.agente);
  for (const a of BMAD_AGENTES) {
    if (agentesExist.some((x: any) => x.origem === "bmad" && x.nome === a.nome)) continue;
    await db.insert(s.agente).values({ ...a, origem: "bmad", ativo: true });
    contagem.agentes++;
  }
  const skillsExist = await db.select().from(s.skill);
  for (const sk of BMAD_SKILLS) {
    if (skillsExist.some((x: any) => x.origem === "bmad" && x.nome === sk.nome)) continue;
    await db.insert(s.skill).values({ ...sk, origem: "bmad" });
    contagem.skills++;
  }
  const tplExist = await db.select().from(s.template);
  for (const t of BMAD_TEMPLATES) {
    if (tplExist.some((x: any) => x.origem === "bmad" && x.nome === t.nome)) continue;
    await db.insert(s.template).values({ ...t, origem: "bmad", escopo: comunidadeId ? "comunidade" : "global", comunidadeId: comunidadeId ?? null });
    contagem.templates++;
  }
  const ckExist = await db.select().from(s.checklist);
  for (const c of BMAD_CHECKLISTS) {
    if (ckExist.some((x: any) => x.origem === "bmad" && x.nome === c.nome)) continue;
    await db.insert(s.checklist).values({ ...c, origem: "bmad", escopo: comunidadeId ? "comunidade" : "global", comunidadeId: comunidadeId ?? null });
    contagem.checklists++;
  }
  return contagem;
}
