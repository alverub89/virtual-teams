// Análise de capacidades — Background Function (até 15 min): planeja e lê os
// repositórios e sintetiza o mapa. Resposta 202 imediata; a lógica vive em
// _lib/capacidades (compartilhada com o dev local).
import { analisarCapacidades } from "./_lib/capacidades";
import { getDb } from "../../db/client";

export default async (req: Request) => {
  const { mapaId } = (await req.json().catch(() => ({}))) as { mapaId?: string };
  if (!mapaId) return new Response("mapaId obrigatório", { status: 400 });
  const db = await getDb();
  await analisarCapacidades(db, mapaId);
  return new Response(null, { status: 202 });
};

export const config = { name: "capability-analyze-background" };
