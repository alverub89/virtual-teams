// Backfill único: atribui comunidade aos agentes CUSTOM legados (origem ia|manual
// com comunidade_id nulo), inferindo pela trilha de auditoria (quem criou/gerou
// o agente → a comunidade dessa pessoa). Agentes BMAD/seed permanecem globais.
//
// Uso (produção): DATABASE_URL=<neon> npx tsx scripts/backfill-agente-comunidade.ts
// Uso (local/PGlite): AIW_DEV=1 npx tsx scripts/backfill-agente-comunidade.ts

import { eq } from "drizzle-orm";
import { getDb, schema as s } from "../db/client";

async function main() {
  const db = await getDb();
  const agentes = await db.select().from(s.agente);
  const pessoas = await db.select().from(s.pessoa);
  const auditoria = await db.select().from(s.auditLog);

  const comDaPessoa = (id: string | null) => pessoas.find((p: any) => p.id === id)?.comunidadeId ?? null;
  const legados = agentes.filter((a: any) => (a.origem === "ia" || a.origem === "manual") && a.comunidadeId == null);

  let atribuidos = 0;
  const semDono: string[] = [];
  for (const ag of legados) {
    // Evento de criação/geração cujo alvo é "agente:<nome>".
    const ev = auditoria
      .filter((e: any) => ["criar_agente", "gerar_item_acervo"].includes(e.acao) && e.alvo === `agente:${ag.nome}`)
      .sort((a: any, b: any) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())[0];
    const com = ev ? comDaPessoa(ev.pessoaId) : null;
    if (com) {
      await db.update(s.agente).set({ comunidadeId: com }).where(eq(s.agente.id, ag.id));
      atribuidos++;
    } else {
      semDono.push(ag.nome);
    }
  }

  console.log(`Agentes legados custom: ${legados.length}`);
  console.log(`Atribuídos a uma comunidade: ${atribuidos}`);
  if (semDono.length) {
    console.log(`Sem dono identificável (seguem globais — revise manualmente): ${semDono.length}`);
    console.log("  " + semDono.join(", "));
  }
  console.log("Concluído.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
