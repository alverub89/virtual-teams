import type { MiddlewareHandler } from "hono";
import type { Papel } from "../../../shared/types";

// RBAC + escopo (docs/spec, seção 6.2). Regra central: cria/edita só na
// própria squad; consulta o resto. O guard-rail é sempre o servidor.

type Acao =
  | "criar_iniciativa"
  | "imputar_kr"
  | "decidir_checkpoint"
  | "iniciar_run"
  | "endossar_kb"
  | "configurar_plataforma"
  | "ver_gestao";

const PAPEIS_POR_ACAO: Record<Acao, Papel[]> = {
  criar_iniciativa: ["pm", "tech_lead"],
  imputar_kr: ["pm", "tech_lead"],
  decidir_checkpoint: ["pm", "tech_lead"],
  iniciar_run: ["pm", "tech_lead"],
  endossar_kb: ["cto"],
  configurar_plataforma: ["cto"],
  ver_gestao: ["gestao", "cto"],
};

export const rbac =
  (acao: Acao): MiddlewareHandler =>
  async (c, next) => {
    const me = c.get("me");
    if (!PAPEIS_POR_ACAO[acao].includes(me.papel)) {
      return c.json({ error: `papel "${me.papel}" não pode "${acao}"` }, 403);
    }
    await next();
  };

// Escopo de escrita: só a própria squad.
export const mesmaSquad =
  (squadIdParam = "squadId"): MiddlewareHandler =>
  async (c, next) => {
    const me = c.get("me");
    const alvo = c.req.param(squadIdParam) ?? c.req.query(squadIdParam);
    if (alvo && me.squadId !== alvo) {
      return c.json({ error: "escrita permitida apenas na própria squad" }, 403);
    }
    await next();
  };
