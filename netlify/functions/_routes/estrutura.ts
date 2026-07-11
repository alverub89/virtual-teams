import { Hono } from "hono";
import { getDb, schema as s } from "../../../db/client";

const app = new Hono();

/* Estrutura organizacional: comunidade → release trains → squads (consulta). */
app.get("/", async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const [com] = await db.select().from(s.comunidade);
  const rts = await db.select().from(s.releaseTrain);
  const squads = await db.select().from(s.squad);
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
