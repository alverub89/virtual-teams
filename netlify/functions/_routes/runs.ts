import { Hono } from "hono";
import { z } from "zod";
import { rbac } from "../_mw/rbac";
import { DecisaoCheckpoint } from "../../../shared/types";

// Execução autônoma (docs/spec, seção 8) — máquina de estados persistida
// no Neon (execucao_autonoma / execucao_passo / execucao_checkpoint),
// avançada pela Background Function run-advance-background.
const app = new Hono();

const CriarRun = z.object({
  squadId: z.string().uuid(),
  okrAlvoId: z.string().uuid().optional(),
  krAlvoId: z.string().uuid().optional(),
});

app.post("/", rbac("iniciar_run"), async (c) => {
  const body = CriarRun.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  // TODO(Fase 4): inserir execucao_autonoma + passos do método e enfileirar
  // run-advance-background via fetch interno (resposta 202).
  return c.json({ error: "não implementado (Fase 4)" }, 501);
});

app.get("/:id", async (c) => {
  // TODO(Fase 4): carregar run + passos + checkpoints.
  return c.json({ error: "não implementado (Fase 4)" }, 501);
});

app.post("/:id/checkpoints/:cid", rbac("decidir_checkpoint"), async (c) => {
  const decisao = DecisaoCheckpoint.safeParse((await c.req.json())?.decisao);
  if (!decisao.success) return c.json({ error: "decisão inválida" }, 400);
  // TODO(Fase 4): gravar decisão + aprovador + decidido_em; se aprovado,
  // reenfileirar run-advance-background.
  return c.json({ error: "não implementado (Fase 4)" }, 501);
});

export default app;
