// Composição do prompt de sistema do agente (docs/spec, seção 7.3):
// agente (personalidade) + agente_skill (instruções) + agente_tool (tools)
// + guard-rails herdados da plataforma.

export interface AgenteDef {
  nome: string;
  personalidade: string;
  skills: { nome: string; instrucoes: string }[];
  tools: { nome: string; descricao: string; permissao: string }[];
  guardRails: string[];
  templates?: { nome: string; conteudo: string }[];
  checklists?: { nome: string; itens: string[] }[];
}

export function composeSystemPrompt(a: AgenteDef): string {
  const skills = a.skills
    .map((s) => `### ${s.nome}\n${s.instrucoes}`)
    .join("\n\n");
  const tools = a.tools
    .map((t) => `- ${t.nome} (${t.permissao}): ${t.descricao}`)
    .join("\n");
  const rails = a.guardRails.map((g) => `- ${g}`).join("\n");
  const templates = (a.templates ?? [])
    .map((t) => `### ${t.nome}\n${t.conteudo}`)
    .join("\n\n");
  const checklists = (a.checklists ?? [])
    .map((c) => `### ${c.nome}\n${c.itens.map((i) => `- ${i}`).join("\n")}`)
    .join("\n\n");

  return [
    `Você é ${a.nome}.`,
    a.personalidade,
    skills && `## Skills\n${skills}`,
    tools && `## Tools disponíveis\n${tools}`,
    templates && `## Templates (use estes modelos ao produzir documentos)\n${templates}`,
    checklists && `## Checklists (verifique estes itens)\n${checklists}`,
    `## Guard-rails (obrigatórios)\n${rails}\n- Nunca faça merge de pull request.\n- Nunca abra GMUD sem checkpoint humano aprovado.\n- Respeite o teto de tokens da execução.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// Prompt de sistema efetivo do agente: se houver override (promptSistema),
// usa-o como base; senão, compõe a partir das partes.
export function promptDoAgente(ag: { promptSistema?: string | null }, def: AgenteDef): string {
  const override = ag.promptSistema?.trim();
  if (!override) return composeSystemPrompt(def);
  // Override substitui a persona; skills/tools/checklists/guard-rails seguem anexados.
  return composeSystemPrompt({ ...def, personalidade: override });
}
