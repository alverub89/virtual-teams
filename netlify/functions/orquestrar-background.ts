// Orquestrador de iniciativa — Background Function (até 15 min): conduz o fluxo
// inteiro até concluir. Lógica em _lib/orquestrador (compartilhada com o dev).
import { orquestrarIniciativa } from "./_lib/orquestrador";
import { getDb } from "../../db/client";

export default async (req: Request) => {
  const { execId } = (await req.json().catch(() => ({}))) as { execId?: string };
  if (!execId) return new Response("execId obrigatório", { status: 400 });
  const db = await getDb();
  await orquestrarIniciativa(db, execId);
  return new Response(null, { status: 202 });
};

export const config = { name: "orquestrar-background" };
