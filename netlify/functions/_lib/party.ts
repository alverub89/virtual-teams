// Party mode — mesa-redonda de TRABALHO: os agentes debatem em turnos onde a
// fala de um entra como input do próximo, uma "proposta viva" vai ficando mais
// concreta a cada rodada, e a mesa só encerra quando converge (ou atinge o
// teto de rodadas). Fecha com um resultado claro e acionável.
// Roda em Background Function (vários turnos = várias chamadas de IA).

import { eq } from "drizzle-orm";
import { schema as s } from "../../../db/client";
import { getProvider } from "../../../ai/provider";
import { resolveModel } from "../../../ai/router";
import { gerarJson } from "./aigen";

// Um agente fala: reage ao ÚLTIMO colega e empurra a proposta viva adiante,
// sempre concreto e no seu papel — nada de conselho genérico.
async function fala(
  ag: any,
  topico: string,
  proposta: string,
  ultimoNome: string | null,
  ultimaFala: string | null,
  foco: string | null
): Promise<string> {
  const provider = await getProvider();
  const model = await resolveModel("resumo");
  const persona = (ag.promptSistema && ag.promptSistema.trim()) || ag.personalidade;
  const system =
    `Você é ${ag.nome} (${ag.papel}). ${persona}\n` +
    (Array.isArray(ag.guardRails) && ag.guardRails.length ? `Regras: ${ag.guardRails.join(" ")}\n` : "") +
    "Você está numa MESA-REDONDA de trabalho cujo objetivo é SAIR COM UMA PROPOSTA CONCRETA — não conselhos.\n" +
    "Como falar:\n" +
    "- Reaja DIRETO ao último colega: aceite e AVANCE, ou aponte um furo específico e proponha a correção.\n" +
    "- Traga algo NOVO e CONCRETO no seu papel: nomes, mecânica, números, decisões, exemplos.\n" +
    "- PROIBIDO frase genérica tipo 'é importante entender o público' ou 'devemos priorizar'. Decida coisas.\n" +
    "- No máximo 3 frases. Vá ao ponto.";
  const user =
    `Tópico: ${topico}\n\n` +
    `Proposta viva (o que já foi decidido):\n${proposta || "(ainda vazia — ajude a fixar o núcleo concreto)"}\n\n` +
    (ultimaFala ? `Último a falar — ${ultimoNome}: "${ultimaFala}"\n` : "Você abre a mesa.\n") +
    (foco ? `\nFoco desta rodada — resolva isto: ${foco}\n` : "") +
    `\nSua vez, ${ag.nome}. Reaja e empurre a proposta adiante, concreto:`;
  const res = await provider.chat({ model, system, messages: [{ role: "user", content: user }], maxTokens: 300, temperature: 0.7 });
  return (res.content ?? "").trim();
}

// Facilitador consolida a rodada numa proposta concreta atualizada e diz se já
// convergiu e o que ainda falta decidir.
async function consolidar(topico: string, proposta: string, linhasRodada: string[]): Promise<{ proposta: string; convergiu: boolean; pendencias: string[] }> {
  try {
    const j = await gerarJson({
      tarefa: "resumo",
      maxTokens: 800,
      system: "Você é o facilitador da mesa-redonda. Consolide o debate numa PROPOSTA CONCRETA e evolutiva. Sem enrolação, sem conselho genérico.",
      instrucao:
        `Tópico: ${topico}\n\n` +
        `Proposta anterior:\n${proposta || "(vazia)"}\n\n` +
        `Falas desta rodada:\n${linhasRodada.join("\n")}\n\n` +
        `Devolva SÓ JSON:\n` +
        `{\n` +
        `  "proposta": "proposta concreta ATUALIZADA incorporando as falas — Markdown curto com o que está DECIDIDO: nome, mecânica-núcleo, loop viral, stack/MVP. Substitui a anterior.",\n` +
        `  "convergiu": true|false,  // true só se há núcleo concreto e sem grandes lacunas\n` +
        `  "pendencias": ["pergunta aberta concreta a resolver na próxima rodada"]  // no máx 2\n` +
        `}`,
    });
    return {
      proposta: typeof j?.proposta === "string" && j.proposta.trim() ? j.proposta.trim() : proposta,
      convergiu: !!j?.convergiu,
      pendencias: Array.isArray(j?.pendencias) ? j.pendencias.map(String).slice(0, 2) : [],
    };
  } catch {
    // Fallback (ex.: provedor mock): mantém a proposta e não força convergência.
    return { proposta: proposta || linhasRodada.join("\n"), convergiu: false, pendencias: [] };
  }
}

export async function rodarParty(db: any, sessaoId: string, agenteIds: string[], maxRounds = 3): Promise<void> {
  const [sess] = await db.select().from(s.partySessao).where(eq(s.partySessao.id, sessaoId));
  if (!sess) return;
  try {
    const todos = await db.select().from(s.agente);
    const agentes = agenteIds.map((id) => todos.find((a: any) => a.id === id)).filter(Boolean).slice(0, 5);
    if (agentes.length < 2) throw new Error("selecione ao menos 2 agentes");
    const rounds = Math.max(2, Math.min(5, maxRounds));

    let ordem = 0;
    let proposta = "";
    let foco: string | null = null;
    let ultimoNome: string | null = null;
    let ultimaFala: string | null = null;
    const linhas: string[] = [];

    for (let r = 0; r < rounds; r++) {
      const linhasRodada: string[] = [];
      for (const ag of agentes) {
        await db.update(s.partySessao).set({ progresso: `Rodada ${r + 1}/${rounds} — ${ag.nome} está falando…` }).where(eq(s.partySessao.id, sessaoId));
        const txt = await fala(ag, sess.topico, proposta, ultimoNome, ultimaFala, foco);
        ordem += 1;
        linhas.push(`${ag.nome}: ${txt}`);
        linhasRodada.push(`${ag.nome}: ${txt}`);
        ultimoNome = ag.nome;
        ultimaFala = txt;
        await db.insert(s.partyTurno).values({ sessaoId, ordem, agenteId: ag.id, agenteNome: ag.nome, emoji: ag.emoji ?? "🤖", conteudo: txt });
      }

      // Consolida a rodada: proposta fica mais concreta e sabemos se convergiu.
      await db.update(s.partySessao).set({ progresso: `Consolidando a rodada ${r + 1}…` }).where(eq(s.partySessao.id, sessaoId));
      const cons = await consolidar(sess.topico, proposta, linhasRodada);
      proposta = cons.proposta;
      foco = cons.pendencias[0] ?? null;
      ordem += 1;
      const corpoCons = proposta + (cons.pendencias.length ? `\n\n**Ainda em aberto:** ${cons.pendencias.join(" · ")}` : "");
      await db.insert(s.partyTurno).values({ sessaoId, ordem, agenteId: null, agenteNome: `Consolidação — rodada ${r + 1}`, emoji: "🧩", conteudo: corpoCons });

      // Converge cedo se já há núcleo concreto (mínimo de 2 rodadas).
      if (cons.convergiu && r + 1 >= 2) break;
    }

    // Resultado final: claro e acionável, a partir da proposta consolidada.
    await db.update(s.partySessao).set({ progresso: "Fechando o resultado da mesa…" }).where(eq(s.partySessao.id, sessaoId));
    const orq = todos.find((a: any) => a.papel?.toLowerCase().includes("coorden") || a.nome?.toLowerCase().includes("orquestr")) ?? agentes[0];
    const provider = await getProvider();
    const model = await resolveModel("resumo");
    const res = await provider.chat({
      model,
      system: `Você é ${orq.nome}, facilitador da mesa. Entregue o RESULTADO final, claro e acionável — nada genérico.`,
      messages: [{
        role: "user",
        content:
          `Tópico: ${sess.topico}\n\n` +
          `Proposta final consolidada:\n${proposta}\n\n` +
          `Debate completo:\n${linhas.join("\n")}\n\n` +
          `Escreva em Markdown, direto:\n` +
          `## 🎯 Decisão\n(a proposta concreta final em 4–8 linhas: nome, mecânica-núcleo, loop viral, stack/MVP)\n` +
          `## ✅ Acordos\n(bullets)\n` +
          `## ⚖️ Divergências em aberto\n(bullets — ou "nenhuma relevante")\n` +
          `## ▶️ Próximos passos\n(3 itens acionáveis, com dono sugerido)`,
      }],
      maxTokens: 900, temperature: 0.35,
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
