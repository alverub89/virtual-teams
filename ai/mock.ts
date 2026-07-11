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

function responder(req: ChatRequest): string {
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
