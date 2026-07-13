// Dados do Playground — um MCP real, pronto para demonstração, com tools que
// batem em APIs públicas (sem chave) e retornam dados de verdade. Foco em dados
// financeiros/cadastrais brasileiros (BrasilAPI) + câmbio (Frankfurter/ECB),
// que é o terreno do Itaú Meios de Pagamento.
//
// Os schemas já vêm prontos (não dependem do gateway de IA), então o playground
// funciona de forma determinística numa demo.

export const PLAYGROUND_SLUG = "playground-financeiro-br";

export interface SeedTool {
  nome: string;
  descricao: string;
  permissao: "leitura" | "escrita" | "critica";
  execucao: "ia" | "http";
  parametros: string;
  inputSchema: Record<string, unknown>;
  handlerConfig: Record<string, unknown>;
  exemplo: Record<string, unknown>; // args de exemplo para o botão "preencher"
}

const obj = (props: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties: props,
  ...(required.length ? { required } : {}),
});
const str = (description: string) => ({ type: "string", description });

export const PLAYGROUND_MCP = {
  nome: "Playground — Dados Financeiros BR",
  sistema: "brasilapi + frankfurter",
  descricao:
    "MCP de demonstração com tools reais sobre dados financeiros e cadastrais brasileiros " +
    "(bancos, PIX, CEP, CNPJ, câmbio, feriados, taxas). APIs públicas, sem chave — dados de verdade.",
  proposito:
    "Expor, via MCP, consultas reais a dados financeiros e cadastrais do Brasil para agentes e clientes MCP.",
};

export const PLAYGROUND_TOOLS: SeedTool[] = [
  {
    nome: "listar_bancos",
    descricao: "Lista todos os bancos do Brasil (código de compensação, ISPB, nome).",
    permissao: "leitura",
    execucao: "http",
    parametros: "sem parâmetros",
    inputSchema: obj({}),
    handlerConfig: { metodo: "GET", url: "https://brasilapi.com.br/api/banks/v1", headers: {} },
    exemplo: {},
  },
  {
    nome: "consultar_banco",
    descricao: "Detalha um banco pelo código de compensação (ex.: 341 = Itaú Unibanco).",
    permissao: "leitura",
    execucao: "http",
    parametros: "codigo (código de compensação do banco, ex.: 341)",
    inputSchema: obj({ codigo: str("código de compensação, ex.: 341") }, ["codigo"]),
    handlerConfig: { metodo: "GET", url: "https://brasilapi.com.br/api/banks/v1/{{codigo}}", headers: {} },
    exemplo: { codigo: "341" },
  },
  {
    nome: "participantes_pix",
    descricao: "Lista os participantes do PIX (instituições integradas ao arranjo).",
    permissao: "leitura",
    execucao: "http",
    parametros: "sem parâmetros",
    inputSchema: obj({}),
    handlerConfig: { metodo: "GET", url: "https://brasilapi.com.br/api/pix/v1/participants", headers: {} },
    exemplo: {},
  },
  {
    nome: "consultar_cep",
    descricao: "Resolve um CEP em endereço (estado, cidade, bairro, rua).",
    permissao: "leitura",
    execucao: "http",
    parametros: "cep (8 dígitos, só números)",
    inputSchema: obj({ cep: str("CEP com 8 dígitos, ex.: 01310930") }, ["cep"]),
    handlerConfig: { metodo: "GET", url: "https://brasilapi.com.br/api/cep/v2/{{cep}}", headers: {} },
    exemplo: { cep: "01310930" },
  },
  {
    nome: "consultar_cnpj",
    descricao: "Consulta dados cadastrais de uma empresa pelo CNPJ.",
    permissao: "leitura",
    execucao: "http",
    parametros: "cnpj (14 dígitos, só números)",
    inputSchema: obj({ cnpj: str("CNPJ com 14 dígitos, ex.: 60701190000104") }, ["cnpj"]),
    handlerConfig: { metodo: "GET", url: "https://brasilapi.com.br/api/cnpj/v1/{{cnpj}}", headers: {} },
    exemplo: { cnpj: "60701190000104" },
  },
  {
    nome: "cotacao_moeda",
    descricao: "Cotação de câmbio atual entre duas moedas (dados do Banco Central Europeu via Frankfurter).",
    permissao: "leitura",
    execucao: "http",
    parametros: "de (moeda origem, ex.: USD), para (moeda destino, ex.: BRL)",
    inputSchema: obj({ de: str("moeda origem, ex.: USD"), para: str("moeda destino, ex.: BRL") }, ["de", "para"]),
    handlerConfig: { metodo: "GET", url: "https://api.frankfurter.app/latest?from={{de}}&to={{para}}", headers: {} },
    exemplo: { de: "USD", para: "BRL" },
  },
  {
    nome: "feriados_nacionais",
    descricao: "Feriados nacionais de um ano (útil para janelas de GMUD e liquidação).",
    permissao: "leitura",
    execucao: "http",
    parametros: "ano (ex.: 2026)",
    inputSchema: obj({ ano: str("ano com 4 dígitos, ex.: 2026") }, ["ano"]),
    handlerConfig: { metodo: "GET", url: "https://brasilapi.com.br/api/feriados/v1/{{ano}}", headers: {} },
    exemplo: { ano: "2026" },
  },
  {
    nome: "taxas_juros",
    descricao: "Taxas de referência atuais (Selic, CDI, IPCA).",
    permissao: "leitura",
    execucao: "http",
    parametros: "sem parâmetros",
    inputSchema: obj({}),
    handlerConfig: { metodo: "GET", url: "https://brasilapi.com.br/api/taxas/v1", headers: {} },
    exemplo: {},
  },
  {
    nome: "perguntar_sobre_repo",
    descricao: "Responde uma pergunta sobre um repositório GitHub usando o README real + a SUA IA (Omni). Dado processado na sua infra.",
    permissao: "leitura",
    execucao: "ia",
    parametros: "repo (owner/repo, ex.: bmad-code-org/BMAD-METHOD), pergunta",
    inputSchema: obj({ repo: str("owner/repo, ex.: bmad-code-org/BMAD-METHOD"), pergunta: str("o que você quer saber sobre o repositório") }, ["repo", "pergunta"]),
    handlerConfig: {
      prompt:
        "Você é um engenheiro que analisa repositórios. Responda a pergunta APENAS com base no contexto real fornecido " +
        "(o README do repositório). Se a resposta não estiver no contexto, diga que não encontrou. Seja objetivo e cite trechos quando útil.",
      contextoUrl: "https://api.github.com/repos/{{repo}}/readme",
      contextoHeaders: { Accept: "application/vnd.github.raw+json", "User-Agent": "AI-Workspace" },
      maxTokens: 900,
    },
    exemplo: { repo: "bmad-code-org/BMAD-METHOD", pergunta: "Quais são as fases e os agentes do método?" },
  },
  {
    nome: "explicar_para_cliente",
    descricao: "Explica um conceito financeiro em linguagem simples para um público (tool de IA).",
    permissao: "leitura",
    execucao: "ia",
    parametros: "conceito (o que explicar), publico (perfil do cliente, opcional)",
    inputSchema: obj({ conceito: str("conceito a explicar, ex.: como funciona o PIX"), publico: str("perfil do cliente, ex.: MEI") }, ["conceito"]),
    handlerConfig: {
      prompt:
        "Você é um educador financeiro do Itaú. Explique o conceito pedido de forma simples, correta e acolhedora " +
        "para o público informado. No máximo 6 linhas, sem jargão desnecessário.",
    },
    exemplo: { conceito: "como funciona o PIX", publico: "MEI" },
  },
];

// Catálogo de MCPs reais do mercado — registrados como referência (não vivos aqui),
// para o CTO enxergar o ecossistema e decidir o que plugar.
export interface MarketMcp {
  nome: string;
  sistema: string;
  url: string;
  descricao: string;
  categoria: string;
}

// MCPs remotos REAIS e públicos (sem auth) — dá para registrar a URL e o app,
// agindo como cliente MCP, conecta e chama as tools de verdade.
export interface RemoteMcp {
  nome: string;
  sistema: string;
  url: string;
  descricao: string;
  dica: string; // exemplo de uso para a demo
  exemplos: Record<string, Record<string, unknown>>; // tool → args de exemplo (pré-preenche o formulário)
}

export const REMOTE_MCPS: RemoteMcp[] = [
  {
    nome: "DeepWiki",
    sistema: "deepwiki",
    url: "https://mcp.deepwiki.com/mcp",
    descricao: "Pergunta em linguagem natural sobre qualquer repositório público do GitHub (docs geradas).",
    dica: "repoName no formato owner/repo — ex.: bmad-code-org/BMAD-METHOD",
    exemplos: {
      read_wiki_structure: { repoName: "bmad-code-org/BMAD-METHOD" },
      read_wiki_contents: { repoName: "bmad-code-org/BMAD-METHOD" },
      ask_question: { repoName: "bmad-code-org/BMAD-METHOD", question: "Quais são as fases e os agentes do método?" },
    },
  },
  {
    nome: "Context7",
    sistema: "context7",
    url: "https://mcp.context7.com/mcp",
    descricao: "Documentação atualizada de bibliotecas e frameworks, pronta para LLM.",
    dica: "resolve-library-id (libraryName) → get-library-docs",
    exemplos: {
      "resolve-library-id": { libraryName: "react" },
      "get-library-docs": { context7CompatibleLibraryID: "/facebook/react", topic: "hooks" },
    },
  },
  {
    nome: "GitMCP (servers)",
    sistema: "gitmcp",
    url: "https://gitmcp.io/modelcontextprotocol/servers",
    descricao: "MCP instantâneo sobre a documentação de um repositório GitHub (aqui: modelcontextprotocol/servers).",
    dica: "search_documentation (query) / fetch_documentation",
    exemplos: {
      search_documentation: { query: "how to build a server with tools" },
    },
  },
];

export const MARKET_MCPS: MarketMcp[] = [
  { nome: "GitHub", sistema: "github", categoria: "DevOps", url: "https://github.com/github/github-mcp-server", descricao: "Servidor MCP oficial do GitHub: issues, pull requests, Actions e repositórios." },
  { nome: "Filesystem", sistema: "filesystem", categoria: "Reference", url: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem", descricao: "Operações de arquivo seguras com controle de acesso configurável (servidor de referência)." },
  { nome: "Git", sistema: "git", categoria: "Reference", url: "https://github.com/modelcontextprotocol/servers/tree/main/src/git", descricao: "Ler, buscar e manipular repositórios Git." },
  { nome: "Fetch", sistema: "fetch", categoria: "Reference", url: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch", descricao: "Busca conteúdo web e converte para consumo eficiente por LLM." },
  { nome: "Memory", sistema: "memory", categoria: "Reference", url: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory", descricao: "Memória persistente baseada em grafo de conhecimento." },
  { nome: "Time", sistema: "time", categoria: "Reference", url: "https://github.com/modelcontextprotocol/servers/tree/main/src/time", descricao: "Conversão de horário e fuso horário." },
  { nome: "Sequential Thinking", sistema: "sequentialthinking", categoria: "Reference", url: "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking", descricao: "Resolução de problemas por sequências de pensamento reflexivo." },
  { nome: "Slack", sistema: "slack", categoria: "Colaboração", url: "https://github.com/modelcontextprotocol/servers/tree/main/src/slack", descricao: "Postar e ler mensagens em canais do Slack." },
  { nome: "PostgreSQL", sistema: "postgres", categoria: "Dados", url: "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres", descricao: "Consultas somente-leitura a bancos PostgreSQL com inspeção de schema." },
  { nome: "Sentry", sistema: "sentry", categoria: "Observabilidade", url: "https://github.com/getsentry/sentry-mcp", descricao: "Servidor MCP oficial do Sentry: erros, issues e performance." },
];
