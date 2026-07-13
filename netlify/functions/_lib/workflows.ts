// Motor de execução dos fluxos de trabalho da squad. Uma run avança passo a
// passo: passos de agente rodam a IA (com o contexto acumulado), passos de MCP
// acionam as tools de um MCP (loop ReAct) e passos de validação PAUSAM a run
// até um humano decidir. Ver _routes/workflows.ts.

import { asc, eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { getProvider } from "../../../ai/provider";
import { resolveModel } from "../../../ai/router";

// Monta o contexto acumulado (entrada + saídas dos passos já concluídos).
function contextoDaRun(run: any, passos: any[]): string {
  const partes: string[] = [];
  if (run.entrada) partes.push(`Entrada do fluxo:\n${run.entrada}`);
  for (const p of passos) {
    if (p.status === "concluido" || p.status === "aprovado") {
      const saida = p.saida?.resumo ?? p.saida?.detalhe ?? "";
      if (saida) partes.push(`Resultado de "${p.nome}":\n${saida}`);
      if (p.tipo === "validacao" && p.comentario) partes.push(`Observação humana em "${p.nome}": ${p.comentario}`);
    }
  }
  return partes.join("\n\n");
}

// Passo de agente: a IA cumpre a instrução do passo com o contexto acumulado.
async function rodarAgente(db: any, agenteId: string | null, instrucao: string, contexto: string): Promise<{ resumo: string }> {
  let identidade = "Você é um agente de uma squad executando um passo de um fluxo de trabalho.";
  if (agenteId) {
    const [ag] = await db.select().from(s.agente).where(eq(s.agente.id, agenteId));
    if (ag) identidade = `Você é ${ag.nome} (${ag.papel}). ${ag.personalidade}`;
  }
  const system =
    `${identidade}\n\nCumpra a tarefa deste passo de forma objetiva e acionável, ` +
    "usando o contexto do fluxo. Entregue um resultado direto (sem preâmbulos), " +
    "em português, pronto para o próximo passo consumir.";
  const provider = await getProvider();
  const model = await resolveModel("historias");
  const res = await provider.chat({
    model,
    system,
    messages: [{ role: "user", content: `Tarefa deste passo:\n${instrucao || "(sem instrução específica)"}\n\n${contexto || "(sem contexto anterior)"}` }],
    maxTokens: 900,
    temperature: 0.3,
  });
  return { resumo: (res.content ?? "").trim() || "(sem saída)" };
}

// Passo de MCP: aciona as tools de um MCP acessível (loop ReAct) para cumprir a
// instrução como objetivo. Reaproveita o cliente MCP / executor de tools.
async function rodarMcp(db: any, me: any, mcpId: string, objetivo: string, contexto: string): Promise<{ resumo: string; passos: unknown[] }> {
  const [m] = await db.select().from(s.conexaoMcp).where(eq(s.conexaoMcp.id, mcpId));
  const ok = m && (m.criadoPor === me.id || (m.aprovacao === "aprovado" && (m.escopo === "global" || m.squadId === me.squadId)));
  if (!ok) return { resumo: "MCP não acessível para esta squad.", passos: [] };

  const { chamarToolRemoto, listarToolsRemoto } = await import("./mcpclient");
  const { executarTool, gerarJson } = await import("./aigen");

  let toolSpecs: { nome: string; descricao: string; schema: any }[] = [];
  let exec: (nome: string, args: any) => Promise<{ ok: boolean; resultado?: unknown; erro?: string }>;
  if (m.url) {
    const r = await listarToolsRemoto(m.url, m.token ?? undefined);
    if (!r.ok) return { resumo: `Falha ao listar tools do MCP: ${r.erro}`, passos: [] };
    toolSpecs = (r.tools ?? []).map((t: any) => ({ nome: t.name, descricao: t.description ?? "", schema: t.inputSchema ?? {} }));
    exec = (nome, args) => chamarToolRemoto(m.url as string, nome, args ?? {}, m.token ?? undefined);
  } else {
    const tools = (await db.select().from(s.tool)).filter((t: any) => t.conexaoMcpId === mcpId);
    toolSpecs = tools.map((t: any) => ({ nome: t.nome, descricao: t.descricao ?? "", schema: t.inputSchema ?? {} }));
    const byName = new Map(tools.map((t: any) => [t.nome, t]));
    exec = async (nome, args) => { const t = byName.get(nome); return t ? executarTool(t as any, args ?? {}) : { ok: false, erro: "tool inexistente" }; };
  }
  if (!toolSpecs.length) return { resumo: "Este MCP não expõe tools.", passos: [] };

  const passos: any[] = [];
  const observacoes: string[] = [];
  let resposta = "";
  const system =
    "Você é um agente que cumpre um objetivo ACIONANDO as tools de um MCP. Responda SOMENTE JSON. " +
    'Para chamar uma tool: {"acao":"chamar","tool":"<nome>","args":{...}}. ' +
    'Quando já tiver a resposta final: {"acao":"final","resposta":"<texto>"}. ' +
    "Tools disponíveis: " + JSON.stringify(toolSpecs);
  for (let i = 0; i < 4; i++) {
    let plano: any;
    try {
      plano = await gerarJson({
        tarefa: "historias",
        system,
        instrucao: `Objetivo: ${objetivo}\nContexto:\n${contexto || "(sem contexto)"}\n` + (observacoes.length ? `Observações:\n${observacoes.join("\n")}` : "Ainda sem observações."),
        maxTokens: 700,
      });
    } catch (e) { resposta = `Falha do agente: ${e instanceof Error ? e.message : e}`; break; }
    if (plano?.acao === "chamar" && plano.tool) {
      const r = await exec(plano.tool, plano.args ?? {});
      const txt = typeof r.resultado === "string" ? r.resultado : JSON.stringify(r.resultado);
      passos.push({ tool: plano.tool, args: plano.args ?? {}, ok: r.ok, resultado: r.ok ? (txt ?? "").slice(0, 1200) : undefined, erro: r.erro });
      observacoes.push(`Tool ${plano.tool}(${JSON.stringify(plano.args ?? {})}) -> ${r.ok ? (txt ?? "").slice(0, 700) : "ERRO: " + r.erro}`);
    } else { resposta = plano?.resposta ?? "sem resposta"; break; }
  }
  if (!resposta) resposta = "Limite de passos atingido.";
  return { resumo: resposta, passos };
}

// Avança a run: executa passos pendentes em ordem até encontrar uma validação
// (pausa em "aguardando") ou concluir todos. Passos de validação humana param a
// run; a decisão humana é registrada em _routes/workflows.ts e chama de novo.
export async function avancarRun(me: any, runId: string): Promise<void> {
  const db = await getDb();
  const [run] = await db.select().from(s.workflowRun).where(eq(s.workflowRun.id, runId));
  if (!run || (run.status !== "em_andamento" && run.status !== "aguardando")) return;

  for (let guarda = 0; guarda < 50; guarda++) {
    const passos = (await db.select().from(s.workflowRunPasso).where(eq(s.workflowRunPasso.runId, runId)))
      .sort((a: any, b: any) => a.ordem - b.ordem);
    const prox = passos.find((p: any) => p.status === "pendente");
    if (!prox) {
      await db.update(s.workflowRun).set({ status: "concluido", atualizadoEm: new Date() }).where(eq(s.workflowRun.id, runId));
      return;
    }
    if (prox.tipo === "validacao") {
      await db.update(s.workflowRunPasso).set({ status: "aguardando" }).where(eq(s.workflowRunPasso.id, prox.id));
      await db.update(s.workflowRun).set({ status: "aguardando", passoAtual: prox.ordem, atualizadoEm: new Date() }).where(eq(s.workflowRun.id, runId));
      return;
    }

    await db.update(s.workflowRunPasso).set({ status: "em_execucao" }).where(eq(s.workflowRunPasso.id, prox.id));
    await db.update(s.workflowRun).set({ status: "em_andamento", passoAtual: prox.ordem }).where(eq(s.workflowRun.id, runId));
    const contexto = contextoDaRun(run, passos);
    try {
      let saida: any;
      if (prox.tipo === "mcp") {
        const mcpId = (prox.config as any)?.mcpId as string | undefined;
        saida = mcpId ? await rodarMcp(db, me, mcpId, prox.instrucao ?? "", contexto)
                      : { resumo: "Passo de MCP sem MCP configurado." };
      } else {
        saida = await rodarAgente(db, prox.agenteId ?? null, prox.instrucao ?? "", contexto);
      }
      await db.update(s.workflowRunPasso).set({ status: "concluido", saida }).where(eq(s.workflowRunPasso.id, prox.id));
    } catch (e) {
      await db.update(s.workflowRunPasso).set({ status: "concluido", saida: { resumo: `Erro: ${e instanceof Error ? e.message : String(e)}` } }).where(eq(s.workflowRunPasso.id, prox.id));
    }
  }
}
