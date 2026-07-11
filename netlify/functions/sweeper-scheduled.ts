// Sweeper agendado (docs/spec, seções 2 e 8.2): reenfileira runs
// `em_andamento` sem progresso recente, roda sincronizações periódicas
// (IU Click, GitHub, catálogo) e consolida consumo_tokens.

export default async () => {
  // TODO(Fase 4):
  // - SELECT runs em_andamento com atualizado_em antigo → POST para
  //   /.netlify/functions/run-advance-background (idempotente).
  // - Consolidar custos por squad/mês e alertar em 80% do budget.
  return new Response("ok");
};

export const config = { schedule: "*/2 * * * *" };
