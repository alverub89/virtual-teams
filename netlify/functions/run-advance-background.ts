// Motor de avanço da execução autônoma (docs/spec, seção 8.2).
// Background Function: até 15 min, resposta 202 imediata, retry automático —
// por isso cada passo precisa ser idempotente (UNIQUE (execucao_id, ordem)
// + chave de idempotência para efeitos externos).

const TIME_BUDGET_MS = 13 * 60 * 1000; // margem sob o teto de 15 min

export default async (req: Request) => {
  const { runId } = (await req.json().catch(() => ({}))) as { runId?: string };
  if (!runId) return new Response("runId obrigatório", { status: 400 });

  const deadline = Date.now() + TIME_BUDGET_MS;

  // TODO(Fase 4):
  // 1. Carregar o run e o próximo passo `pendente` no Neon.
  // 2. Passo automático → executar (agente/tool), gravar saída, seguir
  //    enquanto Date.now() < deadline.
  // 3. Passo checkpoint humano → criar execucao_checkpoint, run em
  //    `aguardando_aprovacao`, encerrar (a espera não custa computação).
  // 4. Estourou o tempo → retornar; o sweeper reenfileira.
  void deadline;

  return new Response(null, { status: 202 });
};

export const config = { name: "run-advance-background" };
