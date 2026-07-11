// Composição do prompt de sistema do agente (docs/spec, seção 7.3):
// agente (personalidade) + agente_skill (instruções) + agente_tool (tools)
// + guard-rails herdados da plataforma.

export interface AgenteDef {
  nome: string;
  personalidade: string;
  skills: { nome: string; instrucoes: string }[];
  tools: { nome: string; descricao: string; permissao: string }[];
  guardRails: string[];
}

export function composeSystemPrompt(a: AgenteDef): string {
  const skills = a.skills
    .map((s) => `### ${s.nome}\n${s.instrucoes}`)
    .join("\n\n");
  const tools = a.tools
    .map((t) => `- ${t.nome} (${t.permissao}): ${t.descricao}`)
    .join("\n");
  const rails = a.guardRails.map((g) => `- ${g}`).join("\n");

  return [
    `Você é ${a.nome}.`,
    a.personalidade,
    skills && `## Skills\n${skills}`,
    tools && `## Tools disponíveis\n${tools}`,
    `## Guard-rails (obrigatórios)\n${rails}\n- Nunca faça merge de pull request.\n- Nunca abra GMUD sem checkpoint humano aprovado.\n- Respeite o teto de tokens da execução.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
