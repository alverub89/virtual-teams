import { Hono } from "hono";
import { z } from "zod";
import { setCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { signSession, sessionCookieName, cookieOpts } from "../_mw/auth";
import { audit } from "../_lib/audit";
import type { Me } from "../../../shared/types";

// Onboarding: o usuário nomeia sua área (comunidade), um release train e a
// sua squad; vira PM dessa squad. A partir daí cria objetivos e iniciativas.
const app = new Hono();

const Onboarding = z.object({
  comunidadeNome: z.string().min(2).max(80),
  releaseTrainNome: z.string().min(2).max(80).optional(),
  squadNome: z.string().min(2).max(80),
});

app.post("/", async (c) => {
  const me = c.get("me");
  if (me.squadId) return c.json({ error: "onboarding já concluído" }, 409);
  const body = Onboarding.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos", detalhe: body.error.flatten() }, 400);

  const db = await getDb();
  const [com] = await db.insert(s.comunidade).values({ nome: body.data.comunidadeNome }).returning();
  const [rt] = await db
    .insert(s.releaseTrain)
    .values({ comunidadeId: com.id, nome: body.data.releaseTrainNome ?? `RT ${body.data.comunidadeNome}` })
    .returning();
  const [squad] = await db
    .insert(s.squad)
    .values({ releaseTrainId: rt.id, nome: body.data.squadNome, budgetTokensMes: 2_000_000 })
    .returning();
  await db.update(s.pessoa).set({ squadId: squad.id }).where(eq(s.pessoa.id, me.id));

  const meAtualizado: Me = { ...me, squadId: squad.id, squadNome: squad.nome };
  // Reemite a sessão para o JWT já refletir a squad.
  setCookie(c, sessionCookieName, await signSession(meAtualizado), cookieOpts());
  await audit(meAtualizado, "onboarding", `squad:${squad.nome}`, { comunidade: com.nome });
  return c.json({ me: meAtualizado }, 201);
});

export default app;
