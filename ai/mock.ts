import type { ChatChunk, ChatRequest, ChatResponse, LLMProvider } from "./provider";

// Provedor simulado — usado quando AI_BASE_URL não está configurada (modo
// demo). Gera respostas plausíveis por etapa para a experiência ser
// navegável de ponta a ponta sem o provedor corporativo.

const RESPOSTAS: [RegExp, string][] = [
  [/brief|descoberta/i, "Boa! Para fechar o brief, deixa eu confirmar o que entendi: o problema central é reduzir intervenção manual e dar autonomia ao usuário final. Sugiro estas métricas de sucesso:\n\n1. Percentual de operações sem toque humano\n2. Tempo médio até a primeira configuração completa\n3. Volume de chamados evitados na operação\n\nQuer que eu registre o brief com esse recorte, ou prefere ajustar o público-alvo antes?"],
  [/prd|requisito/i, "Rascunhei a estrutura do PRD com base no brief e no histórico da capacidade:\n\n**Requisitos funcionais**\n1. Configuração self-service com simulação antes de ativar\n2. Trilha de auditoria de toda alteração\n3. Notificação aos afetados a cada mudança\n\n**NFRs**: idempotência ponta a ponta, p99 < 300ms na consulta, LGPD (dados mascarados).\n\nPosso detalhar os critérios de aceite de cada RF ou você quer cortar escopo primeiro?"],
  [/arquitetur|adr|repositório/i, "Analisei os repositórios da capacidade e o blueprint da plataforma. Proponho:\n\n- Reusar o serviço existente com um módulo novo, em vez de criar outro deploy\n- Eventos para propagar mudanças (contrato já no schema registry)\n- Cache de leitura com invalidação por evento\n\nTrade-off principal: acoplamos o ciclo de deploy, mas evitamos mais um serviço para operar. Registro como ADR e mapeio os repositórios afetados?"],
  [/históri|slicing|backlog/i, "Quebrei o escopo em histórias INVEST — nenhuma acima de 5 pontos:\n\n1. **Modelo de dados e migração** (3 pts)\n2. **API de configuração com validação** (5 pts)\n3. **Simulação antes de ativar** (5 pts)\n4. **Trilha de auditoria** (3 pts)\n5. **Tela de configuração no portal** (5 pts)\n\nCada uma já tem critérios dado/quando/então. Sincronizo com o IU Click?"],
  [/dev|código|pr\b|implement/i, "Implementei seguindo o padrão do repositório. O PR está pronto com:\n\n- Commits pequenos com o porquê no corpo\n- Testes cobrindo o fluxo feliz e os 3 casos de borda do contrato\n- Sem mudança de schema fora da migração\n\nLembrando o guard-rail: eu **não faço merge** — a revisão é de vocês. Quer que eu abra o PR agora?"],
  [/gmud|esteira|qualidade|gate/i, "Rodei os gates da esteira: build ✅, testes ✅ (cobertura 87%), segurança em execução. Para a GMUD preciso de:\n\n1. Evidência da esteira verde completa\n2. Plano de rollback testado em HML\n3. Checklist de PII preenchido\n\nAbrir GMUD é ação **crítica** — vou preparar tudo e te chamo no checkpoint para aprovar a janela."],
];

const FALLBACK =
  "Entendi. Com o contexto desta etapa e o histórico da iniciativa, sugiro seguirmos assim:\n\n1. Valido as premissas com os dados da capacidade\n2. Preparo o artefato desta etapa para sua revisão\n3. Deixo registrado o racional para auditoria\n\nQuer que eu detalhe algum ponto antes de gerar o artefato?";

// Deriva um JSON Schema simples a partir da descrição em linguagem natural dos
// parâmetros (fragmentos separados por vírgula/;/quebra de linha viram campos).
function schemaDeTexto(parametros: string): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const req: string[] = [];
  // Protege vírgulas dentro de parênteses (são descrição, não separador de campos).
  const protegido = String(parametros).replace(/\([^)]*\)/g, (m) => m.replace(/,/g, "§"));
  for (const bruto of protegido.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)) {
    const parte = bruto.replace(/§/g, ",");
    const nome = (parte.split(/[:=(-]/)[0] || parte).trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_|_$/g, "");
    if (!nome) continue;
    const tipo = /\b(quant|número|numero|valor|idade|total|count)\b/i.test(parte)
      ? "number"
      : /\b(lista|array|itens)\b/i.test(parte)
        ? "array"
        : /\b(sim\/não|booleano|flag|ativo)\b/i.test(parte)
          ? "boolean"
          : "string";
    props[nome] = tipo === "array" ? { type: "array", items: { type: "string" }, description: parte } : { type: tipo, description: parte };
    if (!/opcional|optional/i.test(parte)) req.push(nome);
  }
  return { type: "object", properties: props, ...(req.length ? { required: req } : {}) };
}

// Detecta o pedido do construtor de MCP e devolve um manifesto JSON válido —
// para o fluxo "gerar com IA" funcionar em modo demo (sem gateway real).
function talvezMcpJson(req: ChatRequest): string | null {
  const ultima = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  // Dispara para o construtor de MCP e para a geração de schema de tool avulsa:
  // system menciona MCP e a instrução pede um inputSchema a partir de uma lista de tools.
  if (!/\bMCP\b|Model Context Protocol/i.test(req.system) || !/inputSchema/i.test(ultima)) return null;
  const m = ultima.match(/Tools:\s*(\[[\s\S]*?\])\s*\n\n/);
  let tools: any[] = [];
  try { tools = m ? JSON.parse(m[1]) : []; } catch { tools = []; }
  const nomeMcp = (ultima.match(/MCP:\s*"([^"]+)"/) || [])[1] ?? "MCP";
  return JSON.stringify({
    proposito: `Conjunto de tools de ${nomeMcp} exposto via MCP para os agentes.`,
    tools: tools.map((t: any) => ({
      nome: t.nome,
      inputSchema: schemaDeTexto(t.parametros ?? ""),
      promptHandler:
        t.execucao === "ia"
          ? `Você executa a tool "${t.nome}": ${t.descricao ?? ""}. Use os parâmetros recebidos e responda de forma objetiva e útil.`
          : "",
    })),
  });
}

// Loop do agente executor: 1ª rodada (sem observações) chama a 1ª tool; depois,
// com observações, encerra com resposta final. Mantém a demo navegável sem gateway.
function talvezAgenteExecutor(req: ChatRequest): string | null {
  if (!/ACIONANDO as tools|acao.*chamar/i.test(req.system)) return null;
  const ultima = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  if (/Observações até agora/i.test(ultima)) {
    return JSON.stringify({ acao: "final", resposta: "Pronto — acionei a tool do MCP e consolidei o resultado acima para o seu objetivo." });
  }
  const m = req.system.match(/Tools disponíveis:\s*(\[[\s\S]*\])\s*$/);
  let tools: any[] = [];
  try { tools = m ? JSON.parse(m[1]) : []; } catch { tools = []; }
  const t0 = tools[0];
  const args: Record<string, unknown> = {};
  for (const [k, v] of Object.entries((t0?.schema?.properties as any) ?? {})) {
    args[k] = /number/.test((v as any)?.type) ? 1 : "exemplo";
  }
  return JSON.stringify({ acao: t0 ? "chamar" : "final", tool: t0?.nome, args, resposta: t0 ? undefined : "Nenhuma tool disponível." });
}

// Mapa de capacidades: gera uma arquitetura de negócio plausível a partir dos
// nomes dos repositórios citados na instrução, para a demo rodar sem gateway.
function talvezCapacidades(req: ChatRequest): string | null {
  if (!/arquiteto de neg[oó]cios|fluxos de valor|ARQUITETURA DE NEG/i.test(req.system)) return null;
  const ultima = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const repos = [...new Set([...ultima.matchAll(/Reposit[oó]rio\s+(\S+)/g)].map((m) => m[1]))].slice(0, 8);
  const ehImpacto = /REAVALIA[ÇC]/i.test(ultima);
  const fluxo = "Aceitar e liquidar pagamentos";
  const caps: any[] = [
    { nome: "Gestão de Cobrança", nivel: 1, pai: null, fluxoValor: fluxo, descricao: "Emissão, agendamento e conciliação de cobranças.", repos: repos.slice(0, 2) },
    { nome: "Autorização de Recorrência", nivel: 2, pai: "Gestão de Cobrança", descricao: "Consentimento e mandato do pagador.", repos: repos.slice(0, 1) },
    { nome: "Liquidação e Split", nivel: 1, pai: null, fluxoValor: fluxo, descricao: "Divisão e liquidação de valores entre participantes.", repos: repos.slice(1, 3) },
    { nome: "Trilha de Auditoria", nivel: 2, pai: "Liquidação e Split", descricao: "Registro imutável de operações.", repos: repos.slice(2, 3) },
  ];
  return JSON.stringify({
    resumo: `Arquitetura de negócio inferida de ${repos.length} repositório(s): fluxo de valor "${fluxo}" sustentado por capacidades de cobrança, liquidação e auditoria.`,
    fluxosValor: [{ nome: fluxo, descricao: "Da autorização do pagador à liquidação e conciliação." }],
    capacidades: caps,
    ...(ehImpacto ? { impacto: { resumo: "O novo repositório reforça a capacidade de Liquidação e Split.", mudancas: ["Nova capacidade L2 candidata: Roteamento de Liquidação", "Cobertura de código aumentou em Liquidação e Split"] } } : {}),
  });
}

// SDD testável de uma história.
function talvezSdd(req: ChatRequest): string | null {
  if (!/Gere um SDD|Spec-Driven Development/i.test(req.system)) return null;
  const ultima = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const h = ultima.match(/Hist[óo]ria\s+(\S+):\s*(.+)/i);
  const cod = h?.[1] ?? "H01"; const tit = h?.[2]?.trim() ?? "história";
  const markdown =
    `# SDD — ${cod} ${tit}\n\n## Contexto\nHistória derivada da iniciativa.\n\n` +
    `## Escopo\n- Entra: o fluxo descrito na história\n- Não entra: itens de outras histórias\n\n` +
    `## Especificação técnica\n- Endpoint/serviço responsável pela ação\n- Validação de entradas\n- Persistência do resultado\n\n` +
    `## Plano de testes\n- Teste do caminho feliz (critério de aceite principal)\n- Teste de validação de entrada\n- Teste de erro/edge case\n\n` +
    `## Tarefas\n1. Implementar o handler\n2. Adicionar validação\n3. Escrever os testes\n\n## Definition of Done\n- Testes passando e critérios de aceite satisfeitos`;
  const promptPronto =
    `Você é um engenheiro. Implemente a história ${cod} — ${tit}.\n` +
    `Contexto: parte de uma iniciativa maior.\nTarefa: implementar o fluxo com validação e persistência.\n` +
    `Testes de aceite a satisfazer:\n- Caminho feliz funciona\n- Entradas inválidas são rejeitadas\nRestrições: siga os padrões do repositório.\nEntregue: código + testes.`;
  return JSON.stringify({ resumo: `SDD testável da história ${cod}.`, markdown, promptPronto });
}

// Épicos de uma iniciativa (etapa de Histórias).
function talvezEpicos(req: ChatRequest): string | null {
  if (!/identifique os [ÉE]PICOS/i.test(req.system)) return null;
  return JSON.stringify({
    epicos: [
      { nome: "Onboarding e perfil", descricao: "Cadastro, autenticação e características do usuário." },
      { nome: "Motor de sugestão", descricao: "Gerar a sugestão de treino a partir das características." },
      { nome: "Acompanhamento", descricao: "Registrar progresso e ajustar sugestões ao longo do tempo." },
    ],
  });
}

// Histórias INVEST de um épico.
function talvezHistorias(req: ChatRequest): string | null {
  if (!/Quebre o [ÉE]PICO em HIST[ÓO]RIAS/i.test(req.system)) return null;
  const ultima = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const ep = ultima.match(/[ÉE]pico:\s*(.+)/i)?.[1]?.trim() ?? "Épico";
  return JSON.stringify({
    historias: [
      { titulo: `Definir ${ep.toLowerCase()} — fluxo principal`, descricao: `Como usuário, quero concluir ${ep.toLowerCase()} para avançar no objetivo.`, criteriosAceite: ["Dado que informo os dados, quando confirmo, então o sistema registra e segue.", "Erros são exibidos de forma clara."], pontos: 3 },
      { titulo: `Validar entradas de ${ep.toLowerCase()}`, descricao: `Como usuário, quero validações para evitar erros em ${ep.toLowerCase()}.`, criteriosAceite: ["Campos obrigatórios são checados.", "Mensagens de erro são específicas."], pontos: 2 },
    ],
  });
}

// Planejamento de leitura de repositório: escolhe alguns arquivos da lista.
function talvezPlanoLeitura(req: ChatRequest): string | null {
  if (!/planeja a LEITURA de um reposit[oó]rio/i.test(req.system)) return null;
  const ultima = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const lista = ultima.split("Arquivos (escolha só destes caminhos):\n")[1]?.split("\n\nFormato")[0] ?? "";
  const paths = lista.split("\n").map((p) => p.trim()).filter(Boolean);
  const pref = /(schema|migration|model|entit|route|controller|service|index|app|main|api)/i;
  const escolhidos = [...paths.filter((p) => pref.test(p)), ...paths].filter((p, i, a) => a.indexOf(p) === i).slice(0, 10);
  return JSON.stringify({ passos: escolhidos.map((path) => ({ path, motivo: "arquivo informativo para a documentação" })) });
}

// KB a partir de repositório: gera documentação plausível e ESPECÍFICA por tipo
// (funcional, técnico, dados, api, operação) para a demo rodar sem gateway.
function talvezKbRepo(req: ChatRequest): string | null {
  if (!/BASE DE CONHECIMENTO|documenta um reposit[oó]rio/i.test(req.system)) return null;
  const ultima = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const repo = ultima.match(/reposit[oó]rio\s+(\S+)/i)?.[1] ?? "o repositório";
  const sys = req.system;
  let titulo = "Documentação";
  let resumo = `Documentação de contexto de ${repo}.`;
  let corpo = "";
  if (/FUNCIONAL/i.test(sys)) {
    titulo = "📗 Funcional"; resumo = `Visão funcional de ${repo}: propósito, atores, fluxos e regras de negócio.`;
    corpo =
      `## Propósito\nEntregar ao usuário a jornada de negócio suportada por ${repo}.\n\n` +
      `## Atores\n- Usuário final\n- Operador/back-office\n- Sistemas parceiros\n\n` +
      `## Principais fluxos\n1. Entrada e validação do pedido\n2. Processamento conforme regras de negócio\n3. Confirmação e notificação\n\n` +
      `## Regras de negócio\n- Elegibilidade e limites\n- Idempotência das operações\n- Trilha de auditoria obrigatória`;
  } else if (/DADOS/i.test(sys)) {
    titulo = "🗄️ Dados"; resumo = `Modelo de dados de ${repo}: entidades, esquema e relacionamentos.`;
    corpo =
      `## Entidades principais\n\n| Entidade | Descrição | Campos-chave |\n|---|---|---|\n` +
      `| Pedido | Solicitação do usuário | id, status, valor |\n| Movimento | Lançamento financeiro | id, pedido_id, tipo |\n| Conciliação | Fechamento diário | id, data, total |\n\n` +
      `## Relacionamentos\n- Pedido 1—N Movimento\n- Movimento N—1 Conciliação\n\n` +
      `## Persistência\nBanco relacional com migrações versionadas; eventos publicados a cada mudança de estado.`;
  } else if (/API|INTEGRA/i.test(sys)) {
    titulo = "🔌 API & Integrações"; resumo = `Contratos e integrações de ${repo}.`;
    corpo =
      `## Endpoints\n- \`POST /pedidos\` — cria um pedido\n- \`GET /pedidos/{id}\` — consulta\n- \`POST /pedidos/{id}/confirmar\` — confirma\n\n` +
      `## Eventos\n- \`pedido.criado\`\n- \`pedido.confirmado\`\n\n` +
      `## Integrações externas\n- Serviço de liquidação\n- Provedor antifraude`;
  } else if (/OPERA/i.test(sys)) {
    titulo = "⚙️ Operação & Deploy"; resumo = `Como configurar, rodar e operar ${repo}.`;
    corpo =
      `## Pré-requisitos\nNode 20+, banco relacional, credenciais dos serviços.\n\n` +
      `## Variáveis de ambiente\n- \`DATABASE_URL\`\n- \`QUEUE_URL\`\n- \`API_KEY\`\n\n` +
      `## Deploy\n\`\`\`bash\nnpm ci && npm run build && npm run deploy\n\`\`\`\n\n` +
      `## Runbook\n- Falha de liquidação: reprocessar fila e verificar idempotência\n- Latência alta: checar pool de conexões`;
  } else {
    titulo = "📘 Técnico"; resumo = `Visão técnica de ${repo}: arquitetura, módulos e stack.`;
    corpo =
      `## Arquitetura\nServiço em camadas (API → domínio → infraestrutura), orientado a eventos.\n\n` +
      `## Stack\nTypeScript, framework HTTP, ORM e fila de mensagens.\n\n` +
      `## Módulos\n- \`src/api\` — controladores e rotas\n- \`src/domain\` — regras de negócio\n- \`src/infra\` — persistência e integrações\n\n` +
      `## Build e testes\n\`\`\`bash\nnpm install && npm test && npm run build\n\`\`\``;
  }
  return JSON.stringify({ resumo, markdown: `# ${titulo} — ${repo}\n\n${corpo}` });
}

// Agente Master (crítico): aprova com nota alta na demo.
function talvezMaster(req: ChatRequest): string | null {
  if (!/AGENTE MASTER/i.test(req.system)) return null;
  return JSON.stringify({ aprovado: true, nota: 8, problemas: [] });
}

// Produção de documento formal (etapa, modo crítico): devolve um doc estruturado.
function talvezDocFormal(req: ChatRequest): string | null {
  if (!/DOCUMENTO FORMAL em Markdown/i.test(req.system)) return null;
  const nome = req.system.match(/Você é ([^.]+)\./)?.[1]?.trim() ?? "Agente";
  return (
    `## Visão geral\nDocumento produzido por ${nome}, considerando os documentos das etapas anteriores.\n\n` +
    `## Decisões e conteúdo\n- Ponto 1 derivado do que foi definido antes\n- Ponto 2 específico desta etapa\n- Ponto 3 acionável\n\n` +
    `## Detalhamento\nDescrição concreta e verificável do que deve ser feito, consistente com o funcional e o técnico já definidos.\n\n` +
    `## Próximos passos\n- Item acionável 1\n- Item acionável 2`
  );
}

// Sugestão de capacidade ao final da iniciativa.
function talvezSugCapacidade(req: ChatRequest): string | null {
  if (!/sugira UMA capacidade de neg[oó]cio/i.test(req.system)) return null;
  const ultima = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const tit = ultima.match(/—\s*(.+)/)?.[1]?.split("\n")[0]?.trim() ?? "a iniciativa";
  return JSON.stringify({
    nome: `Gestão de ${tit}`.slice(0, 60),
    descricao: `Capacidade que passou a existir com a entrega de "${tit}": operar e evoluir a funcionalidade de ponta a ponta.`,
    nivel: 1, pai: null, fluxoValor: "Aceitar e liquidar pagamentos", repos: [],
    justificativa: "A iniciativa consolidou um conjunto coeso de regras e fluxos que caracterizam uma capacidade de negócio própria.",
  });
}

// Mesa-redonda (party): fala curta no papel do agente.
function talvezParty(req: ChatRequest): string | null {
  if (!/MESA-REDONDA/i.test(req.system)) return null;
  const nome = req.system.match(/Você é ([^(]+)\(/)?.[1]?.trim() ?? "Agente";
  const papel = req.system.match(/\(([^)]+)\)/)?.[1] ?? "";
  return `Do meu ponto de vista como ${papel || nome}, o ponto central é equilibrar valor e risco. Concordo com o que foi levantado, mas sugiro priorizar o menor incremento que já entrega resultado e medir antes de expandir.`;
}

function responder(req: ChatRequest): string {
  const master = talvezMaster(req);
  if (master) return master;
  const docF = talvezDocFormal(req);
  if (docF) return docF;
  const sugCap = talvezSugCapacidade(req);
  if (sugCap) return sugCap;
  const party = talvezParty(req);
  if (party) return party;
  const sdd = talvezSdd(req);
  if (sdd) return sdd;
  const epicos = talvezEpicos(req);
  if (epicos) return epicos;
  const hist = talvezHistorias(req);
  if (hist) return hist;
  const plano = talvezPlanoLeitura(req);
  if (plano) return plano;
  const kb = talvezKbRepo(req);
  if (kb) return kb;
  const cap = talvezCapacidades(req);
  if (cap) return cap;
  const exec = talvezAgenteExecutor(req);
  if (exec) return exec;
  const mcp = talvezMcpJson(req);
  if (mcp) return mcp;
  const ultima = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const contexto = `${req.system}\n${ultima}`;
  for (const [re, resp] of RESPOSTAS) if (re.test(contexto)) return resp;
  return FALLBACK;
}

const usage = (texto: string) => ({
  promptTokens: 350 + Math.floor(texto.length / 8),
  completionTokens: Math.ceil(texto.length / 4),
});

export class MockProvider implements LLMProvider {
  async chat(req: ChatRequest): Promise<ChatResponse> {
    const content = responder(req);
    return { content, usage: usage(content) };
  }

  async *stream(req: ChatRequest): AsyncIterable<ChatChunk> {
    const content = responder(req);
    const palavras = content.split(/(?<=\s)/);
    for (const p of palavras) {
      await new Promise((r) => setTimeout(r, 18));
      yield { delta: p };
    }
    yield { delta: "", usage: usage(content) };
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => Array.from({ length: 8 }, (_, i) => Math.sin(i)));
  }
}
