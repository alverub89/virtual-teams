import { z } from "zod";

// Papéis e escopos — regra central: cria/edita só na própria squad; consulta o resto.
export const Papel = z.enum([
  "dev",
  "pm",
  "arquiteto",
  "coordenador",
  "gerente",
  "diretor",
]);
export type Papel = z.infer<typeof Papel>;

export const Escopo = z.enum(["squad", "release_train", "comunidade"]);
export type Escopo = z.infer<typeof Escopo>;

export const PermissaoTool = z.enum(["leitura", "escrita", "critica"]);
export type PermissaoTool = z.infer<typeof PermissaoTool>;

export const StatusRun = z.enum([
  "em_andamento",
  "aguardando_aprovacao",
  "pausada",
  "rejeitada",
  "concluida",
]);
export type StatusRun = z.infer<typeof StatusRun>;

export const DecisaoCheckpoint = z.enum(["aprovado", "ajustar", "rejeitado"]);
export type DecisaoCheckpoint = z.infer<typeof DecisaoCheckpoint>;

export const Me = z.object({
  id: z.string(),
  nome: z.string(),
  email: z.string().email(),
  papel: Papel,
  squadId: z.string().nullable(),
  squadNome: z.string().nullable(),
  escopos: z.array(Escopo),
});
export type Me = z.infer<typeof Me>;

// Destino inicial por papel (docs/spec §4.1).
export function homeDoPapel(papel: Papel): string {
  if (papel === "arquiteto") return "/console";
  if (papel === "diretor" || papel === "gerente" || papel === "coordenador") return "/gestao";
  return "/squad/iniciativas";
}
