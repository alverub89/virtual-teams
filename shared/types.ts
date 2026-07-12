import { z } from "zod";

// Papéis da POC:
// - cto: monta a plataforma (estrutura, método, docs base, agentes, convites)
// - pm / tech_lead / dev: membros de squad (entram por convite)
// - gestao: gerencia a área e vê indicadores/produtividade
export const Papel = z.enum(["cto", "pm", "tech_lead", "dev", "gestao"]);
export type Papel = z.infer<typeof Papel>;

export const PAPEL_LABEL: Record<Papel, string> = {
  cto: "CTO · Plataforma",
  pm: "Product Manager",
  tech_lead: "Tech Lead",
  dev: "Desenvolvedor(a)",
  gestao: "Gestão",
};

// Papéis que o CTO pode convidar diretamente.
export const PAPEIS_CONVIDAVEIS: Papel[] = ["pm", "tech_lead", "gestao"];

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
  comunidadeId: z.string().nullable(),
  onboardingConcluido: z.boolean(),
  escopos: z.array(Escopo),
});
export type Me = z.infer<typeof Me>;

// Destino inicial por papel.
export function homeDoPapel(papel: Papel): string {
  if (papel === "cto") return "/console";
  if (papel === "gestao") return "/gestao";
  return "/squad/iniciativas";
}
