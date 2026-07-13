import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { getProvider } from "../../../ai/provider";
import { resolveModel } from "../../../ai/router";
import { composeSystemPrompt } from "../../../ai/prompts";

// Assistente livre da squad — bate-papo com um agente para tirar dúvidas ou
// explorar ideias, sem estar preso a uma iniciativa. Conversa efêmera (o
// histórico vem do cliente); registra apenas o consumo de tokens da squad.
const app = new Hono();

app.get("/agentes", async (c) => {
  const db = await getDb();
  const agentes = (await db.select().from(s.agente)).filter((a: any) => a.ativo);
  return c.json(agentes.map((a: any) => ({ id: a.id, nome: a.nome, papel: a.papel, emoji: a.emoji, personalidade: a.personalidade })));
});

const ChatIn = z.object({
  agenteId: z.string().uuid().optional(),
  mensagem: z.string().min(1).max(4000),
  historico: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(40).optional(),
});

app.post("/chat", async (c) => {
  const me = c.get("me");
  const body = ChatIn.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const db = await getDb();

  const agentes = await db.select().from(s.agente);
  const ag = (body.data.agenteId ? agentes.find((a: any) => a.id === body.data.agenteId) : agentes[0]) ?? agentes[0];
  if (!ag) return c.json({ error: "nenhum agente disponível" }, 400);

  // Compõe o prompt de sistema com identidade + skills do agente.
  const agSkills = await db.select().from(s.agenteSkill).where(eq(s.agenteSkill.agenteId, ag.id));
  const skills = (await db.select().from(s.skill)).filter((sk: any) => agSkills.some((l: any) => l.skillId === sk.id));
  const system = composeSystemPrompt({
    nome: ag.nome,
    personalidade: ag.personalidade,
    skills: skills.map((sk: any) => ({ nome: sk.nome, instrucoes: sk.instrucoes })),
    tools: [],
    guardRails: [
      "Este é um espaço de exploração e dúvidas — nenhuma ação é executada aqui.",
      "Seja direto e útil; quando não souber, diga.",
    ],
  });

  const provider = await getProvider();
  const req = {
    model: await resolveModel("resumo"),
    system,
    maxTokens: ag.maxTokens,
    messages: [
      ...(body.data.historico ?? []).map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: body.data.mensagem },
    ],
  };

  const mesAtual = new Date().toISOString().slice(0, 7);
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let tokens = 0;
      try {
        for await (const chunk of provider.stream(req)) {
          if (chunk.usage) tokens = chunk.usage.promptTokens + chunk.usage.completionTokens;
          if (chunk.delta) controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`));
        }
        if (me.squadId && tokens) {
          const [cons] = await db.select().from(s.consumoTokens).where(and(eq(s.consumoTokens.squadId, me.squadId), eq(s.consumoTokens.mes, mesAtual)));
          if (cons) await db.update(s.consumoTokens).set({ completionTokens: cons.completionTokens + tokens }).where(eq(s.consumoTokens.id, cons.id));
          else await db.insert(s.consumoTokens).values({ squadId: me.squadId, mes: mesAtual, completionTokens: tokens });
        }
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch (err) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
});

export default app;
