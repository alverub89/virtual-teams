import type { PermissaoTool } from "../shared/types";

// Interface comum dos adapters de integração (docs/spec, seção 9).
// Enforcement: o executor só roda se a tool estiver liberada para o agente
// (agente_tool) e a permissão permitir; ações "critica" exigem checkpoint
// humano aberto e aprovado — validado no servidor, nunca no cliente.

export interface ExecCtx {
  runId?: string;
  passoOrdem?: number;
  agenteId: string;
  squadId: string;
  idempotencyKey?: string; // ex.: run:{id}:passo:{ordem}
}

export interface ToolResult {
  ok: boolean;
  output: unknown;
  error?: string;
}

export interface ToolExecutor {
  name: string;
  permission: PermissaoTool;
  execute(input: unknown, ctx: ExecCtx): Promise<ToolResult>;
}
