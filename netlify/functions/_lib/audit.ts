import { getDb, schema } from "../../../db/client";
import type { Me } from "../../../shared/types";

// Auditoria de ações sensíveis (docs/spec §10).
export async function audit(
  me: Me,
  acao: string,
  alvo: string,
  detalhe?: Record<string, unknown>
) {
  const db = await getDb();
  await db.insert(schema.auditLog).values({
    pessoaId: me.id,
    pessoaNome: me.nome,
    acao,
    alvo,
    detalhe: detalhe ?? null,
  });
}
