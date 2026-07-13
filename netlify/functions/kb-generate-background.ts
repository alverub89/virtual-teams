// Geração de KB a partir de repositório — Background Function (até 15 min): lê
// o repositório e sintetiza a documentação. Resposta 202 imediata; a lógica
// vive em _lib/kbgen (compartilhada com o dev local).
import { gerarKbDeRepoGrupo } from "./_lib/kbgen";
import { getDb } from "../../db/client";

export default async (req: Request) => {
  const { artigoIds } = (await req.json().catch(() => ({}))) as { artigoIds?: string[] };
  if (!artigoIds?.length) return new Response("artigoIds obrigatório", { status: 400 });
  const db = await getDb();
  await gerarKbDeRepoGrupo(db, artigoIds);
  return new Response(null, { status: 202 });
};

export const config = { name: "kb-generate-background" };
