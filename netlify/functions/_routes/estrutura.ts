import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";

const app = new Hono();

/* Estrutura da comunidade do usuário: RTs e squads (consulta). */
app.get("/", async (c) => {
  const me = c.get("me");
  const db = await getDb();
  if (!me.squadId) return c.json({ comunidade: null, releaseTrains: [] });

  // Resolve a comunidade a partir da squad do usuário.
  const [minhaSquad] = await db.select().from(s.squad).where(eq(s.squad.id, me.squadId));
  if (!minhaSquad) return c.json({ comunidade: null, releaseTrains: [] });
  const [meuRt] = await db.select().from(s.releaseTrain).where(eq(s.releaseTrain.id, minhaSquad.releaseTrainId));
  const [com] = await db.select().from(s.comunidade).where(eq(s.comunidade.id, meuRt.comunidadeId));

  const rts = (await db.select().from(s.releaseTrain)).filter((rt: any) => rt.comunidadeId === com.id);
  const rtIds = new Set(rts.map((rt: any) => rt.id));
  const squads = (await db.select().from(s.squad)).filter((sq: any) => rtIds.has(sq.releaseTrainId));
  const pessoas = await db.select().from(s.pessoa);
  const inis = await db.select().from(s.iniciativa);
  const caps = await db.select().from(s.capacidade);

  return c.json({
    comunidade: com,
    releaseTrains: rts.map((rt: any) => ({
      ...rt,
      squads: squads
        .filter((sq: any) => sq.releaseTrainId === rt.id)
        .map((sq: any) => ({
          ...sq,
          minha: sq.id === me.squadId,
          pessoas: pessoas.filter((p: any) => p.squadId === sq.id).length,
          iniciativas: inis.filter((i: any) => i.squadId === sq.id && i.status === "em_andamento").length,
          capacidades: caps.filter((cp: any) => cp.squadId === sq.id).length,
        })),
    })),
  });
});

export default app;
