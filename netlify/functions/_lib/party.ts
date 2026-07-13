// Party mode — mesa-redonda orquestrada: os agentes escolhidos debatem um
// tópico em turnos (vendo o que os colegas disseram) e o Orquestrador fecha com
// uma síntese. Roda em Background Function (vários turnos = várias chamadas).

import { eq } from "drizzle-orm";
import { schema as s } from "../../../db/client";
import { getProvider } from "../../../ai/provider";
import { resolveModel } from "../../../ai/router";

async function fala(ag: any, topico: string, transcript: string): Promise<string> {
  const provider = await getProvider();
  const model = await resolveModel("resumo");
  const system =
    `Você é ${ag.nome} (${ag.papel}). ${ag.personalidade}\n` +
    (Array.isArray(ag.guardRails) && ag.guardRails.length ? `Regras: ${ag.guardRails.join(" ")}\n` : "") +
    "Você está numa MESA-REDONDA com outros agentes. Fale a SUA contribuição em 2 a 4 frases, no seu papel, " +
    "em português. Pode concordar ou discordar dos colegas com argumento. Não repita o que já foi dito.";
  const user = `Tópico: ${topico}\n\n${transcript ? `Até agora na mesa:\n${transcript}\n\n` : ""}Sua vez, ${ag.nome}:`;
  const res = await provider.chat({ model, system, messages: [{ role: "user", content: user }], maxTokens: 320, temperature: 0.6 });
  return (res.content ?? "").trim();
}

export async function rodarParty(db: any, sessaoId: string, agenteIds: string[], rounds = 2): Promise<void> {
  const [sess] = await db.select().from(s.partySessao).where(eq(s.partySessao.id, sessaoId));
  if (!sess) return;
  try {
    const todos = await db.select().from(s.agente);
    const agentes = agenteIds.map((id) => todos.find((a: any) => a.id === id)).filter(Boolean).slice(0, 5);
    if (agentes.length < 2) throw new Error("selecione ao menos 2 agentes");

    let ordem = 0;
    const linhas: string[] = [];
    for (let r = 0; r < rounds; r++) {
      for (const ag of agentes) {
        await db.update(s.partySessao).set({ progresso: `Rodada ${r + 1}/${rounds} — ${ag.nome} está falando…` }).where(eq(s.partySessao.id, sessaoId));
        const txt = await fala(ag, sess.topico, linhas.join("\n"));
        ordem += 1;
        linhas.push(`${ag.nome}: ${txt}`);
        await db.insert(s.partyTurno).values({ sessaoId, ordem, agenteId: ag.id, agenteNome: ag.nome, emoji: ag.emoji ?? "🤖", conteudo: txt });
      }
    }

    // Síntese pelo Orquestrador (ou um sintetizador neutro).
    await db.update(s.partySessao).set({ progresso: "Sintetizando a mesa…" }).where(eq(s.partySessao.id, sessaoId));
    const orq = todos.find((a: any) => a.papel?.toLowerCase().includes("coorden") || a.nome?.toLowerCase().includes("orquestr")) ?? agentes[0];
    const provider = await getProvider();
    const model = await resolveModel("resumo");
    const res = await provider.chat({
      model,
      system: `Você é ${orq.nome}, o facilitador da mesa. Sintetize o debate em Markdown com: **Acordos**, **Divergências** e **Decisão / Próximos passos**. Seja objetivo.`,
      messages: [{ role: "user", content: `Tópico: ${sess.topico}\n\nDebate:\n${linhas.join("\n")}` }],
      maxTokens: 700, temperature: 0.3,
    });
    await db.update(s.partySessao).set({ status: "concluido", sintese: (res.content ?? "").trim(), progresso: null }).where(eq(s.partySessao.id, sessaoId));
  } catch (e) {
    await db.update(s.partySessao).set({ status: "erro", progresso: `erro: ${e instanceof Error ? e.message : String(e)}` }).where(eq(s.partySessao.id, sessaoId));
  }
}

export async function enqueueParty(sessaoId: string, agenteIds: string[], rounds: number): Promise<void> {
  const base = process.env.URL;
  if (base && process.env.DATABASE_URL) {
    await fetch(`${base}/.netlify/functions/party-run-background`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessaoId, agenteIds, rounds }),
    }).catch((err) => console.error("[party] enqueue", err));
  } else {
    const { getDb } = await import("../../../db/client");
    void getDb().then((db) => rodarParty(db, sessaoId, agenteIds, rounds)).catch((err) => console.error("[party]", err));
  }
}
