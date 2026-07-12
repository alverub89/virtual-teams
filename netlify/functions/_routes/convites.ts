import { Hono } from "hono";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb, schema as s } from "../../../db/client";
import { audit } from "../_lib/audit";
import { appBaseUrl, sendInviteEmail } from "../_lib/email";
import { PAPEL_LABEL, type Papel } from "../../../shared/types";

// Convites (setup do CTO). CTO convida pm/tech_lead/gestao; pm/tech_lead
// convidam dev na própria squad.
const app = new Hono();

const NovoConvite = z.object({
  email: z.string().email(),
  papel: z.enum(["pm", "tech_lead", "dev", "gestao"]),
  squadId: z.string().uuid().optional(),
});

function podeConvidar(papelRequisitante: Papel, papelAlvo: string): boolean {
  if (papelRequisitante === "cto") return true;
  if ((papelRequisitante === "pm" || papelRequisitante === "tech_lead") && papelAlvo === "dev") return true;
  return false;
}

app.post("/", async (c) => {
  const me = c.get("me");
  const body = NovoConvite.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos", detalhe: body.error.flatten() }, 400);
  const { email, papel, squadId } = body.data;
  if (!podeConvidar(me.papel, papel)) return c.json({ error: `seu papel não pode convidar ${papel}` }, 403);
  if (papel !== "gestao" && !squadId) return c.json({ error: "squad obrigatória para este papel" }, 400);
  if (!me.comunidadeId) return c.json({ error: "conclua o setup da área antes de convidar" }, 400);

  const db = await getDb();
  const token = randomBytes(24).toString("hex");
  const [conv] = await db
    .insert(s.convite)
    .values({
      comunidadeId: me.comunidadeId,
      squadId: squadId ?? null,
      email: email.toLowerCase(),
      papel,
      token,
      convidadoPor: me.id,
      convidadoNome: me.nome,
    })
    .returning();

  const [com] = await db.select().from(s.comunidade).where(eq(s.comunidade.id, me.comunidadeId));
  const squad = squadId ? (await db.select().from(s.squad).where(eq(s.squad.id, squadId)))[0] : null;
  const link = `${appBaseUrl()}/convite/${token}`;
  const enviado = await sendInviteEmail({
    para: email,
    convidadoPor: me.nome,
    comunidade: com?.nome ?? "sua área",
    squad: squad?.nome ?? null,
    papelLabel: PAPEL_LABEL[papel as Papel],
    link,
  });
  if (enviado) await db.update(s.convite).set({ emailEnviado: true }).where(eq(s.convite.id, conv.id));

  await audit(me, "convidar", `convite:${email}`, { papel, squad: squad?.nome });
  return c.json({ convite: { ...conv, emailEnviado: enviado }, link, emailEnviado: enviado }, 201);
});

app.get("/", async (c) => {
  const me = c.get("me");
  if (!me.comunidadeId) return c.json([]);
  const db = await getDb();
  const convites = (await db.select().from(s.convite).orderBy(desc(s.convite.criadoEm))).filter(
    (v: any) => v.comunidadeId === me.comunidadeId
  );
  const squads = await db.select().from(s.squad);
  return c.json(
    convites.map((v: any) => ({
      ...v,
      squadNome: squads.find((sq: any) => sq.id === v.squadId)?.nome ?? null,
      link: `${appBaseUrl()}/convite/${v.token}`,
    }))
  );
});

app.post("/:id/cancelar", async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const [conv] = await db.select().from(s.convite).where(eq(s.convite.id, c.req.param("id")));
  if (!conv || conv.comunidadeId !== me.comunidadeId) return c.json({ error: "convite não encontrado" }, 404);
  await db.update(s.convite).set({ status: "cancelado" }).where(eq(s.convite.id, conv.id));
  return c.json({ ok: true });
});

export default app;
