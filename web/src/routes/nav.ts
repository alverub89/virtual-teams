// Mapa de navegação — espelha o protótipo e a tabela de rotas do spec (seção 4.1).

export interface NavItem {
  path: string;
  label: string;
  title: string;
  description: string;
  fase: string; // fase do roadmap em que a tela ganha dados reais
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const SQUAD_NAV: NavSection[] = [
  {
    label: "Comunidade",
    items: [
      {
        path: "/comunidade",
        label: "Minha comunidade",
        title: "Comunidade",
        description: "Estrutura, documentações, sistemas e base de conhecimento — consulta.",
        fase: "Fase 3",
      },
    ],
  },
  {
    label: "Squad",
    items: [
      {
        path: "/squad/iniciativas",
        label: "Iniciativas",
        title: "Iniciativas da squad",
        description: "Features em andamento e sua jornada — do brief à GMUD.",
        fase: "Fase 1",
      },
      {
        path: "/squad/okrs",
        label: "OKRs",
        title: "OKRs",
        description: "Cascata de objetivos, planejado × realizado e features associadas.",
        fase: "Fase 1",
      },
      {
        path: "/squad/autonoma",
        label: "Execução autônoma",
        title: "Execução autônoma",
        description: "Squad virtual com humano no loop — runs, passos e checkpoints.",
        fase: "Fase 4",
      },
      {
        path: "/squad/capacidades",
        label: "Capacidades",
        title: "Capacidades",
        description: "Capacidades do negócio e repositórios GitHub conectados.",
        fase: "Fase 1",
      },
      {
        path: "/squad/dev",
        label: "Estação dev",
        title: "Estação dev",
        description: "Contexto do desenvolvedor: histórias, PRs e esteira.",
        fase: "Fase 1",
      },
      {
        path: "/squad/docs",
        label: "Documentação",
        title: "Documentação",
        description: "Documentos da squad, gerados pelos agentes e por pessoas.",
        fase: "Fase 1",
      },
      {
        path: "/squad/kb",
        label: "Base de Conhecimento",
        title: "Base de Conhecimento",
        description: "Artigos por escopo (squad, RT, comunidade) com endosso.",
        fase: "Fase 3",
      },
      {
        path: "/squad/esteira",
        label: "Esteira & GMUDs",
        title: "Esteira & GMUDs",
        description: "Execuções da esteira e mudanças (GMUD) em andamento.",
        fase: "Fase 1",
      },
    ],
  },
];

export const CONSOLE_NAV: NavSection[] = [
  {
    label: "Configuração",
    items: [
      {
        path: "/console",
        label: "Visão geral",
        title: "Console da plataforma",
        description: "Setup da plataforma: estrutura, método, docs base, agentes e convites.",
        fase: "Fase 2",
      },
      {
        path: "/console/estrutura",
        label: "Estrutura",
        title: "Estrutura",
        description: "Comunidades, release trains e squads.",
        fase: "Fase 2",
      },
      {
        path: "/console/convites",
        label: "Convites",
        title: "Convites",
        description: "Convide pessoas para as squads e para a gestão.",
        fase: "Fase 2",
      },
      {
        path: "/console/arquitetura",
        label: "Arquitetura & padrões",
        title: "Arquitetura & padrões",
        description: "Blueprints e padrões herdados pelas squads.",
        fase: "Fase 2",
      },
      {
        path: "/console/esteira",
        label: "Esteiras & GMUD",
        title: "Esteiras & GMUD",
        description: "Configuração da esteira e integração com ServiceNow.",
        fase: "Fase 2",
      },
      {
        path: "/console/metodos",
        label: "Métodos",
        title: "Métodos",
        description: "Métodos de trabalho (BMAD e plugáveis) e suas etapas.",
        fase: "Fase 2",
      },
      {
        path: "/console/agentes",
        label: "Agentes & Skills",
        title: "Agentes, Skills & Tools",
        description: "Catálogo de agentes, skills e tools com permissões.",
        fase: "Fase 2",
      },
      {
        path: "/console/skills",
        label: "Skills",
        title: "Skills",
        description: "Habilidades editáveis usadas pelos agentes.",
        fase: "Fase 2",
      },
      {
        path: "/console/tools",
        label: "Tools",
        title: "Tools do ambiente",
        description: "Tools avulsas (IA ou HTTP) plugáveis direto nos agentes.",
        fase: "Fase 2",
      },
      {
        path: "/console/mcps",
        label: "MCPs & modelos",
        title: "MCPs & modelos",
        description: "Conexões MCP, roteamento de modelos e consumo de tokens.",
        fase: "Fase 2",
      },
      {
        path: "/console/playground",
        label: "Playground",
        title: "Playground de MCP",
        description: "MCP real pronto para demonstração + catálogo de MCPs do mercado.",
        fase: "Fase 2",
      },
    ],
  },
];

export const GESTAO_NAV: NavSection[] = [
  {
    label: "Diretoria",
    items: [
      {
        path: "/gestao",
        label: "Indicadores",
        title: "Indicadores",
        description: "Lead time, GMUDs, consumo de IA e progresso de OKRs.",
        fase: "Fase 3",
      },
      {
        path: "/gestao/features",
        label: "Docs das features",
        title: "Documentação das features",
        description: "Documentos gerados na jornada — somente leitura.",
        fase: "Fase 3",
      },
      {
        path: "/gestao/comunidade",
        label: "Docs da comunidade",
        title: "Documentação da comunidade",
        description: "Visão consolidada por comunidade — somente leitura.",
        fase: "Fase 3",
      },
    ],
  },
];
