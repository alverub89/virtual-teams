// Motor de avanço da execução autônoma (docs/spec §8.2).
// Background Function: até 15 min, resposta 202 imediata, retry automático.
// A lógica idempotente vive em _lib/run-engine (compartilhada com o dev local).
import { advanceRun } from "./_lib/run-engine";

export default async (req: Request) => {
  const { runId } = (await req.json().catch(() => ({}))) as { runId?: string };
  if (!runId) return new Response("runId obrigatório", { status: 400 });
  await advanceRun(runId);
  return new Response(null, { status: 202 });
};

export const config = { name: "run-advance-background" };
