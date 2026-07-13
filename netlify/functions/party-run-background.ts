// Party mode — Background Function (até 15 min): conduz a mesa-redonda e a
// síntese. Lógica em _lib/party (compartilhada com o dev local).
import { rodarParty } from "./_lib/party";
import { getDb } from "../../db/client";

export default async (req: Request) => {
  const { sessaoId, agenteIds, rounds } = (await req.json().catch(() => ({}))) as { sessaoId?: string; agenteIds?: string[]; rounds?: number };
  if (!sessaoId || !agenteIds?.length) return new Response("dados obrigatórios", { status: 400 });
  const db = await getDb();
  await rodarParty(db, sessaoId, agenteIds, rounds ?? 2);
  return new Response(null, { status: 202 });
};

export const config = { name: "party-run-background" };
