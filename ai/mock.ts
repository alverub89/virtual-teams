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

function responder(req: ChatRequest): string {
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
