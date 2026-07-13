import { Hono } from "hono";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { rbac } from "../_mw/rbac";
import { getProvider } from "../../../ai/provider";
import { resolveModel, type TipoTarefa } from "../../../ai/router";
import { composeSystemPrompt } from "../../../ai/prompts";
import { gerarJson } from "../_lib/aigen";
import { audit } from "../_lib/audit";

const app = new Hono();

/* Lista iniciativas da squad do usuário. */
app.get("/", async (c) => {
  const me = c.get("me");
  const squadId = c.req.query("squadId") ?? me.squadId;
  if (!squadId) return c.json([]);
  const db = await getDb();
  const inis = await db
    .select()
    .from(s.iniciativa)
    .where(eq(s.iniciativa.squadId, squadId))
    .orderBy(desc(s.iniciativa.criadoEm));
  const caps = await db.select().from(s.capacidade).where(eq(s.capacidade.squadId, squadId));
  const todasEtapas = await db.select().from(s.iniciativaEtapa);
  return c.json(
    inis.map((i: any) => {
      const ets = todasEtapas.filter((e: any) => e.iniciativaId === i.id);
      const atual = ets.find((e: any) => e.ordem === i.etapaAtual);
      return {
        ...i,
        capacidadeNome: caps.find((cp: any) => cp.id === i.capacidadeId)?.nome ?? null,
        etapaNome: atual?.nome ?? null,
        etapasTotal: ets.length,
      };
    })
  );
});

/* Métodos disponíveis para a squad escolher (públicos + da comunidade). */
app.get("/metodos", async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const metodos = (await db.select().from(s.metodo)).filter(
    (m: any) => m.ativo && (m.escopo === "publico" || m.comunidadeId === me.comunidadeId)
  );
  const etapas = await db.select().from(s.metodoEtapa);
  const agentes = await db.select().from(s.agente);
  return c.json(
    metodos.map((m: any) => ({
      id: m.id, nome: m.nome, descricao: m.descricao, escopo: m.escopo,
      etapas: etapas.filter((e: any) => e.metodoId === m.id).sort((a: any, b: any) => a.ordem - b.ordem)
        .map((e: any) => ({ nome: e.nome, agenteNome: agentes.find((a: any) => a.id === e.agenteId)?.nome ?? null, tipo: e.tipo })),
    }))
  );
});

const CriarIniciativa = z.object({
  titulo: z.string().min(4),
  descricao: z.string().optional(),
  capacidadeId: z.string().uuid().optional(),
  metodoId: z.string().uuid().optional(),
  livre: z.boolean().optional(),
});

// Acha o agente Analista (para o modelo livre "que naturalmente chama a analista").
function acharAnalista(agentes: any[]): any {
  return agentes.find((a: any) => /analista|analyst/i.test(a.nome) || /analista|descoberta|brief/i.test(a.papel ?? "")) ?? agentes[0] ?? null;
}

/* Cria iniciativa: método escolhido, método ativo (padrão) ou modelo livre. */
app.post("/", rbac("criar_iniciativa"), async (c) => {
  const me = c.get("me");
  if (!me.squadId) return c.json({ error: "usuário sem squad" }, 400);
  const body = CriarIniciativa.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const d = body.data;

  const db = await getDb();
  const agentes = await db.select().from(s.agente);

  // Monta as etapas: modelo livre (1 etapa com a Analista) | método escolhido | método ativo.
  let etapas: { ordem: number; nome: string; agenteId: string | null }[];
  if (d.livre) {
    const analista = acharAnalista(agentes);
    etapas = [{ ordem: 1, nome: "Descoberta", agenteId: analista?.id ?? null }];
  } else {
    let metodo: any = null;
    if (d.metodoId) [metodo] = await db.select().from(s.metodo).where(eq(s.metodo.id, d.metodoId));
    if (!metodo) [metodo] = await db.select().from(s.metodo).where(eq(s.metodo.ativo, true));
    if (!metodo) return c.json({ error: "nenhum método disponível" }, 400);
    const raw = await db.select().from(s.metodoEtapa).where(eq(s.metodoEtapa.metodoId, metodo.id)).orderBy(asc(s.metodoEtapa.ordem));
    etapas = raw.map((e: any) => ({ ordem: e.ordem, nome: e.nome, agenteId: e.agenteId }));
  }
  if (!etapas.length) return c.json({ error: "método sem etapas" }, 400);

  const num = 100 + Math.floor(Math.random() * 899);
  const [ini] = await db
    .insert(s.iniciativa)
    .values({
      codigo: `INI-${num}`,
      squadId: me.squadId,
      capacidadeId: d.capacidadeId ?? null,
      titulo: d.titulo,
      descricao: d.descricao,
      criadoPor: me.id,
    })
    .returning();

  await db.insert(s.iniciativaEtapa).values(
    etapas.map((e) => ({
      iniciativaId: ini.id,
      ordem: e.ordem,
      nome: e.nome,
      agenteId: e.agenteId,
      status: e.ordem === 1 ? "em_andamento" : "pendente",
    }))
  );
  await audit(me, "criar_iniciativa", `iniciativa:${ini.codigo}`, { titulo: ini.titulo, livre: !!d.livre, metodoId: d.metodoId ?? null });
  return c.json(ini, 201);
});

/* Jornada completa de uma iniciativa. */
app.get("/:codigo", async (c) => {
  const db = await getDb();
  const [ini] = await db
    .select()
    .from(s.iniciativa)
    .where(eq(s.iniciativa.codigo, c.req.param("codigo")));
  if (!ini) return c.json({ error: "iniciativa não encontrada" }, 404);

  const etapas = await db
    .select()
    .from(s.iniciativaEtapa)
    .where(eq(s.iniciativaEtapa.iniciativaId, ini.id))
    .orderBy(asc(s.iniciativaEtapa.ordem));
  const agentes = await db.select().from(s.agente);
  const historias = (await db
    .select()
    .from(s.historia)
    .where(eq(s.historia.iniciativaId, ini.id)))
    .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const sdds = (await db.select().from(s.documento)).filter((d: any) => d.iniciativaId === ini.id && d.tipo === "sdd");
  const docs = await db
    .select({ id: s.documento.id, titulo: s.documento.titulo, tipo: s.documento.tipo, emoji: s.documento.emoji })
    .from(s.documento)
    .where(eq(s.documento.iniciativaId, ini.id));
  const capacidade = ini.capacidadeId
    ? (await db.select().from(s.capacidade).where(eq(s.capacidade.id, ini.capacidadeId)))[0]
    : null;

  return c.json({
    ...ini,
    capacidade,
    historias: historias.map((h: any) => {
      const sdd = sdds.find((d: any) => d.historiaId === h.id);
      return { ...h, sdd: sdd ? { docId: sdd.id, promptPronto: sdd.extra?.promptPronto ?? "" } : null };
    }),
    docs,
    etapas: etapas.map((e: any) => ({
      ...e,
      agente: agentes.find((a: any) => a.id === e.agenteId) ?? null,
    })),
  });
});

/* Mensagens do chat de uma etapa. */
app.get("/:codigo/mensagens", async (c) => {
  const etapa = Number(c.req.query("etapa") ?? "1");
  const db = await getDb();
  const [ini] = await db
    .select()
    .from(s.iniciativa)
    .where(eq(s.iniciativa.codigo, c.req.param("codigo")));
  if (!ini) return c.json({ error: "iniciativa não encontrada" }, 404);
  const msgs = await db
    .select()
    .from(s.mensagemChat)
    .where(and(eq(s.mensagemChat.iniciativaId, ini.id), eq(s.mensagemChat.etapaOrdem, etapa)))
    .orderBy(asc(s.mensagemChat.criadoEm));
  return c.json(msgs);
});

const TAREFA_POR_ETAPA: Record<number, TipoTarefa> = {
  1: "resumo",
  2: "prd",
  3: "arquitetura",
  4: "historias",
  5: "arquitetura",
  6: "classificacao",
};

// Cada etapa da jornada ENTREGA um documento formal (armazenado em `documento`,
// visível em Documentação). Metadados do documento por etapa.
const DOC_ETAPA: Record<number, { tipo: string; emoji: string; titulo: (t: string) => string; foco: string }> = {
  1: { tipo: "doc", emoji: "📋", titulo: (t) => `Brief — ${t}`, foco: "um brief de descoberta (problema, objetivo, público, escopo, hipóteses, métricas de sucesso e riscos)" },
  2: { tipo: "prd", emoji: "📄", titulo: (t) => `PRD — ${t}`, foco: "um PRD (contexto, requisitos funcionais e não-funcionais, fluxos de usuário, critérios de aceite e o que está fora de escopo)" },
  3: { tipo: "adr", emoji: "🏛️", titulo: (t) => `Arquitetura — ${t}`, foco: "um documento de arquitetura/ADR (decisões, componentes, integrações, dados, trade-offs e guard rails)" },
  4: { tipo: "doc", emoji: "📝", titulo: (t) => `Histórias — ${t}`, foco: "um backlog de histórias no formato INVEST, cada uma com critérios de aceite e estimativa" },
  5: { tipo: "guia", emoji: "🛠️", titulo: (t) => `Notas de desenvolvimento — ${t}`, foco: "notas de desenvolvimento (abordagem técnica, decomposição em tarefas, pontos de atenção e estratégia de testes)" },
  6: { tipo: "doc", emoji: "🚀", titulo: (t) => `Plano de release e GMUD — ${t}`, foco: "um plano de release e GMUD (janela, nível de risco, plano de rollback, checklist de deploy e evidências)" },
};

// Config do documento pelo NOME da etapa (para funcionar com qualquer método),
// com fallback para a posição e, por fim, um genérico.
function cfgDaEtapa(ordem: number, nome: string) {
  const n = (nome ?? "").toLowerCase();
  const kind = /brief|descoberta/.test(n) ? 1
    : /prd|requisit|produto/.test(n) ? 2
    : /arquitet|adr|t[eé]cnic/.test(n) ? 3
    : /hist[óo]ria|backlog|stor/.test(n) ? 4
    : /desenvolv|implement|c[óo]digo/.test(n) ? 5
    : /esteira|gmud|release|deploy|entrega/.test(n) ? 6
    : null;
  const key = kind ?? (DOC_ETAPA[ordem] ? ordem : null);
  return key ? DOC_ETAPA[key] : { tipo: "doc", emoji: "📄", titulo: (t: string) => `${nome} — ${t}`, foco: `o artefato da etapa "${nome}"` };
}

// Contexto que "transborda" entre etapas: os documentos já gerados nas etapas
// anteriores da iniciativa. Cada etapa constrói sobre a anterior (o PRD parte
// do Brief, a Arquitetura parte do PRD, etc.) em vez de recomeçar do zero.
// Contexto do PRODUTO EXISTENTE da squad: repositórios conectados, capacidades
// já mapeadas e a documentação do código (KB gerada dos repos). Serve para os
// agentes NÃO recriarem o que já existe (ex.: login que o repo já tem).
async function contextoProduto(db: any, squadId: string | null | undefined): Promise<string> {
  if (!squadId) return "";
  const repos = (await db.select().from(s.repositorio)).filter((r: any) => r.squadId === squadId);
  const caps = (await db.select().from(s.capacidade)).filter((c: any) => c.squadId === squadId);
  const kb = (await db.select().from(s.kbArtigo)).filter((a: any) => a.squadId === squadId && a.origem === "ia" && (a.status ?? "pronto") === "pronto").slice(0, 4);
  if (!repos.length && !caps.length && !kb.length) return "";
  const linhas: string[] = ["PRODUTO EXISTENTE — o que JÁ existe no código/negócio. NÃO recrie o que já existe: reutilize, construa sobre isto ou integre."];
  if (repos.length) linhas.push(`Repositórios conectados: ${repos.map((r: any) => r.nome + (r.linguagem ? ` (${r.linguagem})` : "")).join(", ")}`);
  if (caps.length) linhas.push(`Capacidades já mapeadas: ${caps.map((c: any) => c.nome).join(", ")}`);
  for (const a of kb) linhas.push(`Documentação do código — ${a.titulo}:\n${String(a.conteudo ?? a.resumo ?? "").slice(0, 1200)}`);
  return linhas.join("\n\n");
}

async function contextoEtapasAnteriores(db: any, ini: any, maxCharsPorDoc = 2800): Promise<string> {
  const produto = await contextoProduto(db, ini.squadId);
  // Docs da jornada (brief, PRD, arquitetura, histórias…). Exclui os SDDs — são
  // derivados por história e inflariam/diluiriam o contexto das etapas.
  const docs = (await db
    .select()
    .from(s.documento)
    .where(eq(s.documento.iniciativaId, ini.id))
    .orderBy(asc(s.documento.criadoEm)))
    .filter((d: any) => d.tipo !== "sdd");
  const TOTAL = 16000; // orçamento total para não estourar o prompt
  let usado = produto.length;
  const partes: string[] = [];
  for (const d of docs) {
    const corpo = (d.conteudo ?? "").slice(0, maxCharsPorDoc);
    if (usado + corpo.length > TOTAL) {
      // Estourou o orçamento: inclui só título + resumo dos docs restantes.
      partes.push(`### ${d.emoji ?? "📄"} ${d.titulo}\n${d.resumo ?? "(documento completo em Documentação)"}`);
      continue;
    }
    usado += corpo.length;
    partes.push(`### ${d.emoji ?? "📄"} ${d.titulo}\n${corpo}`);
  }
  return [produto, ...partes].filter(Boolean).join("\n\n");
}

// GERAÇÃO ITERATIVA DE HISTÓRIAS (etapa 4): a IA primeiro identifica os ÉPICOS
// da iniciativa (a partir do Brief/PRD/Arquitetura já gerados) e depois, para
// cada épico, quebra em várias HISTÓRIAS INVEST testáveis (com critérios de
// aceite e estimativa). Salva como registros reais no backlog. Retorna as
// histórias criadas para montar o documento da etapa.
const normTitulo = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

async function gerarHistoriasIterativo(db: any, ini: any, etapa?: any): Promise<any[]> {
  const contexto = await contextoEtapasAnteriores(db, ini);
  const base = `Iniciativa ${ini.codigo} — ${ini.titulo}\n${ini.descricao ?? ""}\n\n${contexto || "(sem documentos anteriores)"}`;
  const extra = etapa?.instrucao ? `\n\nOrientação da squad para esta etapa: ${etapa.instrucao}` : "";
  const minH = etapa?.config?.minSaidas ?? 2;
  const maxH = etapa?.config?.maxSaidas ?? 4;
  const LIMITE = 16; // teto de histórias para não inflar o backlog

  // 1) Épicos — DISTINTOS e não sobrepostos.
  let epicos: { nome: string; descricao?: string }[] = [];
  try {
    const plano = await gerarJson({
      tarefa: "historias",
      system: "Você é um Product Owner. Identifique os ÉPICOS (fatias de valor) da iniciativa. Os épicos devem ser DISTINTOS e NÃO se sobrepor — cada um cobre um tema diferente; não crie dois épicos sobre a mesma coisa. Responda SOMENTE JSON.",
      instrucao: `${base}\n\nFormato JSON: { "epicos": [{ "nome": "...", "descricao": "..." }] } (3 a 5 épicos, sem sobreposição, do mais essencial ao complementar).`,
      maxTokens: 900,
    });
    if (Array.isArray(plano?.epicos)) epicos = plano.epicos.filter((e: any) => e?.nome).slice(0, 5);
  } catch { /* segue com fallback */ }
  if (!epicos.length) epicos = [{ nome: ini.titulo, descricao: ini.descricao ?? "" }];

  // 2) Histórias por épico — passando as já criadas para NÃO repetir + dedup.
  const criadas: any[] = [];
  const vistos = new Set<string>();
  let seq = (await db.select().from(s.historia)).filter((h: any) => h.iniciativaId === ini.id).length;
  let ordem = seq;
  for (const ep of epicos) {
    if (criadas.length >= LIMITE) break;
    const jaTem = criadas.length
      ? `\n\nHistórias JÁ criadas em outros épicos (NÃO repita nenhuma destas; gere apenas o que é NOVO e específico DESTE épico):\n${criadas.map((h) => `- ${h.titulo}`).join("\n")}`
      : "";
    let hs: any[] = [];
    try {
      const r = await gerarJson({
        tarefa: "historias",
        system:
          "Você é um Product Owner/Scrum Master. Quebre o ÉPICO em HISTÓRIAS de usuário INVEST, cada uma TESTÁVEL, específicas e SEM repetir histórias de outros épicos. Responda SOMENTE JSON." + extra,
        instrucao:
          `${base}\n\nÉpico: ${ep.nome}\n${ep.descricao ?? ""}${jaTem}\n\n` +
          'Formato JSON: { "historias": [{ "titulo": "curto e único", "descricao": "Como <persona>, quero <ação> para <valor>", ' +
          `"criteriosAceite": ["Dado/Quando/Então…", "…"], "pontos": 1|2|3|5|8 }] } (${minH} a ${maxH} histórias, independentes, pequenas e distintas).`,
        maxTokens: 1400,
      });
      if (Array.isArray(r?.historias)) hs = r.historias.filter((h: any) => h?.titulo);
    } catch { /* pula o épico */ }
    for (const h of hs) {
      if (criadas.length >= LIMITE) break;
      const key = normTitulo(String(h.titulo));
      if (!key || vistos.has(key)) continue; // dedup por título normalizado
      vistos.add(key);
      seq += 1; ordem += 1;
      const [row] = await db.insert(s.historia).values({
        iniciativaId: ini.id,
        codigo: `${ini.codigo}-H${String(seq).padStart(2, "0")}`,
        titulo: String(h.titulo).slice(0, 200),
        descricao: h.descricao ?? null,
        pontos: [1, 2, 3, 5, 8].includes(Number(h.pontos)) ? Number(h.pontos) : null,
        status: "backlog",
        epico: ep.nome,
        criteriosAceite: Array.isArray(h.criteriosAceite) ? h.criteriosAceite.map((x: any) => String(x)).slice(0, 12) : [],
        ordem,
        origem: "ia",
      }).returning();
      criadas.push(row);
    }
  }
  return criadas;
}

// Monta o documento (backlog) da etapa de Histórias a partir das histórias reais.
function docDeHistorias(ini: any, historias: any[]): string {
  const porEpico = new Map<string, any[]>();
  for (const h of historias) { const k = h.epico ?? "Geral"; if (!porEpico.has(k)) porEpico.set(k, []); porEpico.get(k)!.push(h); }
  let md = `## Backlog — ${ini.titulo}\n\n${historias.length} história(s) em ${porEpico.size} épico(s).\n`;
  for (const [ep, hs] of porEpico) {
    md += `\n### Épico: ${ep}\n`;
    for (const h of hs) {
      md += `\n**${h.codigo} — ${h.titulo}**${h.pontos ? ` _(${h.pontos} pts)_` : ""}\n\n${h.descricao ?? ""}\n`;
      if (h.criteriosAceite?.length) { md += `\nCritérios de aceite:\n`; for (const c of h.criteriosAceite) md += `- ${c}\n`; }
    }
  }
  return md;
}

// Gera (via IA) o documento formal da etapa a partir do contexto + conversa e
// o persiste em `documento`. Retorna o registro criado. Tolerante a falha da
// IA: cai para um documento montado a partir da própria conversa.
async function gerarDocumentoDaEtapa(db: any, ini: any, ordem: number, etapaNome: string, ag: any): Promise<any> {
  const cfg = cfgDaEtapa(ordem, etapaNome);
  const titulo = cfg.titulo(ini.titulo);
  const historico = await db
    .select()
    .from(s.mensagemChat)
    .where(and(eq(s.mensagemChat.iniciativaId, ini.id), eq(s.mensagemChat.etapaOrdem, ordem)))
    .orderBy(asc(s.mensagemChat.criadoEm));
  const transcript = historico.map((m: any) => `${m.autorNome}: ${m.conteudo}`).join("\n");

  const anteriores = await contextoEtapasAnteriores(db, ini);
  const provider = await getProvider();
  const model = await resolveModel(TAREFA_POR_ETAPA[ordem] ?? "resumo");
  const system =
    `Você é ${ag?.nome ?? "o agente da etapa"}. Produza um DOCUMENTO FORMAL em Markdown: ${cfg.foco}. ` +
    "CONSIDERE os documentos das etapas anteriores e o produto existente. Use títulos (##), listas e tabelas quando ajudar. " +
    "Seja específico, completo e acionável — NADA de stub ou frase única. Entregue SOMENTE o documento final, em português, sem saudações nem meta-comentários.";
  const user =
    `Iniciativa ${ini.codigo} — ${ini.titulo}\n${ini.descricao ?? ""}\n\n` +
    (anteriores ? `Documentos das etapas anteriores (construa SOBRE eles, mantendo consistência):\n${anteriores}\n\n` : "") +
    `Conversa da etapa (fonte, se houver):\n${transcript || "(sem conversa; gere o documento completo a partir do contexto acima)"}`;
  // Retry: uma resposta muito curta (stub) é descartada e tentada de novo.
  let markdown = "";
  for (let i = 0; i < 2; i++) {
    try {
      const res = await provider.chat({ model, system, messages: [{ role: "user", content: user }], maxTokens: 1800, temperature: 0.3 });
      const txt = (res.content ?? "").trim();
      if (txt.length > 120) { markdown = txt; break; }
      markdown = markdown || txt;
    } catch { /* tenta de novo */ }
  }
  if (!markdown || markdown.length <= 120) {
    // Fallback ESTRUTURADO (nunca um stub de uma linha).
    markdown =
      `# ${titulo}\n\n> ⚠️ Documento preliminar — a síntese completa por IA não pôde ser concluída agora. Revise e complete.\n\n` +
      `## Contexto\n${ini.descricao ?? "—"}\n\n## Pontos a detalhar\n${cfg.foco}\n\n` +
      (transcript ? `## Notas da conversa\n${transcript}\n` : "");
  }
  const resumo = markdown.replace(/[#*`>_-]/g, "").split("\n").map((l: string) => l.trim()).filter(Boolean)[0]?.slice(0, 180) ?? titulo;

  const [doc] = await db.insert(s.documento).values({
    squadId: ini.squadId,
    iniciativaId: ini.id,
    titulo,
    tipo: cfg.tipo,
    emoji: cfg.emoji,
    resumo,
    conteudo: markdown,
    autorNome: ag?.nome ?? "Agente da etapa",
    escopo: "squad",
  }).returning();
  return doc;
}

type RodadaFase = "produzir" | "criticar" | "revisar" | "final";
type OnRodada = (rodada: number, fase: RodadaFase, parecer?: { nota: number; problemas: string[] }) => Promise<void> | void;

// Geração de documento COM AGENTE MASTER (crítico): o agente da etapa PRODUZ o
// documento considerando os documentos anteriores (funcionais/técnicos); o
// Master avalia criticamente; se reprovar, o agente REVISA — até N rodadas.
// Entrega um documento muito mais forte do que a primeira resposta.
async function gerarDocumentoCritico(db: any, ini: any, ordem: number, etapaNome: string, ag: any, onRodada?: OnRodada): Promise<{ doc: any; rodadas: number; nota: number; problemas: string[] }> {
  const cfg = cfgDaEtapa(ordem, etapaNome);
  const titulo = cfg.titulo(ini.titulo);
  const anteriores = await contextoEtapasAnteriores(db, ini);
  const provider = await getProvider();
  const model = await resolveModel(TAREFA_POR_ETAPA[ordem] ?? "resumo");
  const guardRails = ((ag?.guardRails ?? []) as string[]).join(" ");
  const persona = (ag?.promptSistema && String(ag.promptSistema).trim()) || ag?.personalidade || "um especialista da etapa";

  const maxRodadas = 3;
  let markdown = "";
  let parecer = { aprovado: false, nota: 0, problemas: [] as string[] };
  let rodada = 0;
  for (rodada = 1; rodada <= maxRodadas; rodada++) {
    await onRodada?.(rodada, "produzir");
    const sys =
      `Você é ${ag?.nome ?? "o agente"}. ${persona}\n\n` +
      `Escreva ${cfg.foco} como um DOCUMENTO FORMAL em Markdown, específico e acionável. ` +
      `CONSIDERE OBRIGATORIAMENTE os documentos das etapas anteriores (funcionais e técnicos) — não os ignore nem contradiga. ` +
      `Não escreva saudações, nem faça perguntas: entregue o documento pronto. ${guardRails}`;
    const user = rodada === 1
      ? `Iniciativa ${ini.codigo} — ${ini.titulo}\n${ini.descricao ?? ""}\n\nDocumentos anteriores (base obrigatória):\n${anteriores || "(nenhum)"}\n\nProduza o documento completo.`
      : `Revise e MELHORE o documento abaixo corrigindo os problemas apontados pelo Master. Mantenha o que está bom e aprofunde onde falta.\n\nProblemas a corrigir:\n${parecer.problemas.map((p) => `- ${p}`).join("\n")}\n\nDocumentos anteriores (base obrigatória):\n${anteriores || "(nenhum)"}\n\nDocumento atual:\n${markdown}`;
    try {
      const res = await provider.chat({ model, system: sys, messages: [{ role: "user", content: user }], maxTokens: 2000, temperature: 0.3 });
      const novo = (res.content ?? "").trim();
      if (novo) markdown = novo;
    } catch { /* mantém a versão anterior */ }

    await onRodada?.(rodada, "criticar");
    try {
      const p = await gerarJson({
        tarefa: "arquitetura",
        system:
          "Você é o AGENTE MASTER, guardião da qualidade do produto. Avalie CRITICAMENTE o documento da etapa: completude, especificidade, " +
          "consistência com os documentos ANTERIORES (não pode ignorar/contradizer o que já foi definido), e se está acionável/testável. Seja exigente. Responda SOMENTE JSON.",
        instrucao:
          `Etapa: ${etapaNome}\nIniciativa: ${ini.titulo}\n\nDocumentos anteriores:\n${anteriores || "(nenhum)"}\n\n` +
          `Documento a avaliar:\n${markdown}\n\n` +
          'JSON: { "aprovado": true|false, "nota": 0-10, "problemas": ["o que falta / está fraco / ignora doc anterior", "…"] }',
        maxTokens: 600,
      });
      parecer = { aprovado: !!p.aprovado, nota: Number(p.nota) || 0, problemas: Array.isArray(p.problemas) ? p.problemas.map(String) : [] };
    } catch {
      parecer = { aprovado: true, nota: 7, problemas: [] }; // se o Master falhar, aceita o que há
    }
    if (parecer.aprovado || rodada === maxRodadas) { await onRodada?.(rodada, "final", parecer); break; }
    await onRodada?.(rodada, "revisar", parecer);
  }

  if (!markdown) markdown = `# ${titulo}\n\n(documento não pôde ser gerado)`;
  const resumo = markdown.replace(/[#*`>_-]/g, "").split("\n").map((l: string) => l.trim()).filter(Boolean)[0]?.slice(0, 200) ?? titulo;
  const [doc] = await db.insert(s.documento).values({
    squadId: ini.squadId, iniciativaId: ini.id, titulo, tipo: cfg.tipo, emoji: cfg.emoji, resumo,
    conteudo: markdown, autorNome: ag?.nome ?? "Agente da etapa", escopo: "squad",
  }).returning();
  return { doc, rodadas: rodada, nota: parecer.nota, problemas: parecer.problemas };
}

// Abre a próxima etapa: o agente dela publica a PRIMEIRA mensagem já partindo
// dos documentos gerados nas etapas anteriores — a etapa começa "em andamento"
// e com contexto, sem o usuário precisar puxar do zero.
async function abrirProximaEtapa(db: any, ini: any, proximaOrdem: number): Promise<void> {
  const [etapaRow] = await db
    .select()
    .from(s.iniciativaEtapa)
    .where(and(eq(s.iniciativaEtapa.iniciativaId, ini.id), eq(s.iniciativaEtapa.ordem, proximaOrdem)));
  if (!etapaRow?.agenteId) return;
  const [ag] = await db.select().from(s.agente).where(eq(s.agente.id, etapaRow.agenteId));
  if (!ag) return;
  // não duplica se a etapa já tiver conversa
  const jaTem = await db
    .select()
    .from(s.mensagemChat)
    .where(and(eq(s.mensagemChat.iniciativaId, ini.id), eq(s.mensagemChat.etapaOrdem, proximaOrdem)));
  if (jaTem.length) return;

  const anteriores = await contextoEtapasAnteriores(db, ini);
  if (!anteriores) return; // sem documentos anteriores, não há o que "transbordar"
  const foco = DOC_ETAPA[proximaOrdem]?.foco ?? etapaRow.nome;
  try {
    const provider = await getProvider();
    const model = await resolveModel(TAREFA_POR_ETAPA[proximaOrdem] ?? "resumo");
    const system =
      `Você é ${ag.nome} (${ag.papel}). ${ag.personalidade}\n\n` +
      `Você está ABRINDO a etapa "${etapaRow.nome}" da iniciativa ${ini.codigo} — ${ini.titulo}. ` +
      `Você JÁ TEM os documentos das etapas anteriores abaixo; use-os como base, sem recomeçar do zero.\n\n${anteriores}`;
    const user =
      `Escreva a PRIMEIRA mensagem desta etapa: cumprimente em uma linha, mostre em 2 a 4 bullets o que você já extraiu ` +
      `dos documentos anteriores que é relevante para produzir ${foco}, e proponha o próximo passo (ou pergunte apenas as ` +
      `lacunas que faltam). Seja objetivo, em português, e não repita o documento inteiro.`;
    const res = await provider.chat({ model, system, messages: [{ role: "user", content: user }], maxTokens: 700, temperature: 0.35 });
    const txt = (res.content ?? "").trim();
    if (txt) {
      await db.insert(s.mensagemChat).values({
        iniciativaId: ini.id, etapaOrdem: proximaOrdem, autor: "agente", autorNome: ag.nome, conteudo: txt,
      });
    }
  } catch {
    /* silencioso: a etapa abre normalmente, apenas sem a mensagem inicial */
  }
}

/* Chat com o agente da etapa — streaming SSE (docs/spec §8.5). */
app.post("/:codigo/chat", async (c) => {
  const me = c.get("me");
  const { mensagem, etapa } = await c.req.json<{ mensagem: string; etapa: number }>();
  if (!mensagem?.trim()) return c.json({ error: "mensagem vazia" }, 400);

  const db = await getDb();
  const [ini] = await db
    .select()
    .from(s.iniciativa)
    .where(eq(s.iniciativa.codigo, c.req.param("codigo")));
  if (!ini) return c.json({ error: "iniciativa não encontrada" }, 404);
  if (ini.squadId !== me.squadId && me.papel !== "cto")
    return c.json({ error: "chat permitido apenas na própria squad" }, 403);

  const [etapaRow] = await db
    .select()
    .from(s.iniciativaEtapa)
    .where(and(eq(s.iniciativaEtapa.iniciativaId, ini.id), eq(s.iniciativaEtapa.ordem, etapa)));
  const [ag] = etapaRow?.agenteId
    ? await db.select().from(s.agente).where(eq(s.agente.id, etapaRow.agenteId))
    : [null];
  if (!ag) return c.json({ error: "etapa sem agente" }, 400);

  const agSkills = await db
    .select({ nome: s.skill.nome, instrucoes: s.skill.instrucoes })
    .from(s.agenteSkill)
    .innerJoin(s.skill, eq(s.agenteSkill.skillId, s.skill.id))
    .where(eq(s.agenteSkill.agenteId, ag.id));
  const agTools = await db
    .select({ nome: s.tool.nome, descricao: s.tool.descricao, permissao: s.tool.permissao })
    .from(s.agenteTool)
    .innerJoin(s.tool, eq(s.agenteTool.toolId, s.tool.id))
    .where(eq(s.agenteTool.agenteId, ag.id));

  const agTpls = await db.select().from(s.agenteTemplate).where(eq(s.agenteTemplate.agenteId, ag.id));
  const tplsAg = (await db.select().from(s.template)).filter((t: any) => agTpls.some((l: any) => l.templateId === t.id));
  const agCks = await db.select().from(s.agenteChecklist).where(eq(s.agenteChecklist.agenteId, ag.id));
  const cksAg = (await db.select().from(s.checklist)).filter((ck: any) => agCks.some((l: any) => l.checklistId === ck.id));
  const contextoAnterior = await contextoEtapasAnteriores(db, ini);
  const instrucaoEtapa = etapaRow.instrucao ? `\n\nInstrução desta etapa (definida no método): ${etapaRow.instrucao}` : "";
  const personaBase = (ag.promptSistema && ag.promptSistema.trim()) || ag.personalidade;
  const system = composeSystemPrompt({
    nome: ag.nome,
    personalidade:
      `${personaBase}\n\nContexto: etapa "${etapaRow.nome}" da iniciativa ${ini.codigo} — ${ini.titulo}. ${ini.descricao ?? ""}` +
      instrucaoEtapa +
      (contextoAnterior
        ? `\n\nVocê JÁ TEM ACESSO aos documentos das etapas anteriores desta iniciativa (abaixo). Use-os como base e NÃO recomece do zero nem peça informação que já está aqui — apenas confirme lacunas pontuais.\n\n${contextoAnterior}`
        : ""),
    skills: agSkills,
    tools: agTools.map((t: any) => ({ ...t, descricao: t.descricao ?? "" })),
    guardRails: [
      "Responda em português, direto ao ponto, no contexto da etapa.",
      "Ao concluir esta etapa, um DOCUMENTO FORMAL é gerado e salvo em Documentação a partir desta conversa — nunca diga que você não cria documentos. Ajude a construir o conteúdo desse documento; se pedirem para vê-lo, oriente a concluir a etapa para gerá-lo (ou apresente uma prévia do documento).",
      "Você recebe os documentos das etapas anteriores no contexto; se perguntarem se tem acesso ao brief/PRD/etc., a resposta é SIM — referencie o conteúdo, não diga que não tem acesso.",
      ...((ag.guardRails ?? []) as string[]),
    ],
    templates: tplsAg.map((t: any) => ({ nome: t.nome, conteudo: t.conteudo })),
    checklists: cksAg.map((ck: any) => ({ nome: ck.nome, itens: ck.itens ?? [] })),
  });

  const historico = await db
    .select()
    .from(s.mensagemChat)
    .where(and(eq(s.mensagemChat.iniciativaId, ini.id), eq(s.mensagemChat.etapaOrdem, etapa)))
    .orderBy(asc(s.mensagemChat.criadoEm));

  await db.insert(s.mensagemChat).values({
    iniciativaId: ini.id,
    etapaOrdem: etapa,
    autor: "user",
    autorNome: me.nome,
    conteudo: mensagem,
  });

  const provider = await getProvider();
  const req = {
    model: await resolveModel(TAREFA_POR_ETAPA[etapa] ?? "resumo"),
    system,
    maxTokens: ag.maxTokens,
    messages: [
      ...historico.map((m: any) => ({
        role: m.autor === "user" ? ("user" as const) : ("assistant" as const),
        content: m.conteudo,
      })),
      { role: "user" as const, content: mensagem },
    ],
  };

  const mesAtual = new Date().toISOString().slice(0, 7);
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let completo = "";
      let tokens = 0;
      try {
        for await (const chunk of provider.stream(req)) {
          completo += chunk.delta;
          if (chunk.usage) tokens = chunk.usage.promptTokens + chunk.usage.completionTokens;
          if (chunk.delta)
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`));
        }
        // Persiste a resposta e o consumo ao encerrar (docs/spec §5.2).
        await db.insert(s.mensagemChat).values({
          iniciativaId: ini.id,
          etapaOrdem: etapa,
          autor: "agente",
          autorNome: ag.nome,
          conteudo: completo,
          tokens,
        });
        const [cons] = await db
          .select()
          .from(s.consumoTokens)
          .where(and(eq(s.consumoTokens.squadId, ini.squadId), eq(s.consumoTokens.mes, mesAtual)));
        if (cons) {
          await db
            .update(s.consumoTokens)
            .set({ completionTokens: cons.completionTokens + tokens })
            .where(eq(s.consumoTokens.id, cons.id));
        } else {
          await db.insert(s.consumoTokens).values({
            squadId: ini.squadId,
            mes: mesAtual,
            completionTokens: tokens,
          });
        }
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true, tokens })}\n\n`));
      } catch (err) {
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
});

/* Concluir a etapa atual (gera artefato e avança). */
// Conclui a etapa ATUAL da iniciativa: gera o documento (ou as histórias na
// etapa de Histórias), marca como concluída, avança e abre a próxima. Retorna
// o documento, a próxima etapa e se a iniciativa terminou. Reutilizado pelo
// endpoint manual e pelo orquestrador da execução autônoma.
export async function concluirEtapaAtual(db: any, ini: any, autorNome = "Orquestrador", opts?: { critico?: boolean; onRodada?: OnRodada; onProgresso?: (txt: string) => Promise<void> | void }): Promise<{ ok: boolean; erro?: string; doc?: any; etapaNome?: string; proxima: number | null; terminou: boolean; revisao?: { rodadas: number; nota: number; problemas: string[] }; sddCount?: number }> {
  const ordem = ini.etapaAtual;
  const [etapaRow] = await db.select().from(s.iniciativaEtapa).where(and(eq(s.iniciativaEtapa.iniciativaId, ini.id), eq(s.iniciativaEtapa.ordem, ordem)));
  if (!etapaRow) return { ok: false, erro: "etapa atual não encontrada", proxima: null, terminou: true };
  const [ag] = etapaRow.agenteId ? await db.select().from(s.agente).where(eq(s.agente.id, etapaRow.agenteId)) : [null];
  const totalEtapas = (await db.select().from(s.iniciativaEtapa)).filter((e: any) => e.iniciativaId === ini.id).length;

  const ehHistorias = /hist[óo]ria/i.test(etapaRow.nome);
  let doc: any;
  let revisao: { rodadas: number; nota: number; problemas: string[] } | undefined;
  if (ehHistorias) {
    const historias = await gerarHistoriasIterativo(db, ini, etapaRow);
    const nEpicos = new Set(historias.map((h) => h.epico)).size;
    const markdown = historias.length ? docDeHistorias(ini, historias) : "_Nenhuma história pôde ser gerada._";
    [doc] = await db.insert(s.documento).values({
      squadId: ini.squadId, iniciativaId: ini.id, titulo: `Histórias — ${ini.titulo}`, tipo: "doc", emoji: "📝",
      resumo: `${historias.length} história(s) em ${nEpicos} épico(s).`, conteudo: markdown,
      autorNome: ag?.nome ?? autorNome, escopo: "squad",
    }).returning();
  } else if (opts?.critico) {
    const r = await gerarDocumentoCritico(db, ini, ordem, etapaRow.nome, ag, opts.onRodada);
    doc = r.doc; revisao = { rodadas: r.rodadas, nota: r.nota, problemas: r.problemas };
  } else {
    doc = await gerarDocumentoDaEtapa(db, ini, ordem, etapaRow.nome, ag);
  }

  // Etapa de Desenvolvimento: gera os SDDs (spec por história) na sequência, no
  // modo autônomo (fica em Documentação, um doc por história).
  let sddCount = 0;
  if (opts?.critico && /desenvolv|implement|c[óo]digo/i.test(etapaRow.nome)) {
    sddCount = await gerarSddsPendentes(db, ini, ag?.nome ?? autorNome, 12, async (i, total, hcod) => {
      await opts.onProgresso?.(`Desenvolvimento: gerando SDD ${i}/${total} (${hcod})…`);
    });
  }

  await db.update(s.iniciativaEtapa).set({
    status: "concluida", concluidaEm: new Date(),
    artefato: {
      titulo: doc.titulo,
      secoes: [
        { h: "Documento gerado", itens: [`${doc.emoji ?? "📄"} ${doc.titulo} — por ${doc.autorNome}. Disponível em Documentação.`] },
        ...(doc.resumo ? [{ h: "Resumo", itens: [doc.resumo] }] : []),
      ],
    },
  }).where(eq(s.iniciativaEtapa.id, etapaRow.id));

  if (sddCount && revisao) (revisao as any).sddCount = sddCount;
  const proxima = ordem + 1;
  if (proxima > totalEtapas) {
    await db.update(s.iniciativa).set({ status: "concluida" }).where(eq(s.iniciativa.id, ini.id));
    return { ok: true, doc, etapaNome: etapaRow.nome, proxima: null, terminou: true, revisao, sddCount };
  }
  await db.update(s.iniciativa).set({ etapaAtual: proxima }).where(eq(s.iniciativa.id, ini.id));
  await db.update(s.iniciativaEtapa).set({ status: "em_andamento" }).where(and(eq(s.iniciativaEtapa.iniciativaId, ini.id), eq(s.iniciativaEtapa.ordem, proxima)));
  await abrirProximaEtapa(db, ini, proxima);
  return { ok: true, doc, etapaNome: etapaRow.nome, proxima, terminou: false, revisao, sddCount };
}

app.post("/:codigo/etapas/:ordem/concluir", rbac("criar_iniciativa"), async (c) => {
  const me = c.get("me");
  const ordem = Number(c.req.param("ordem"));
  const db = await getDb();
  const [ini] = await db.select().from(s.iniciativa).where(eq(s.iniciativa.codigo, c.req.param("codigo")));
  if (!ini) return c.json({ error: "iniciativa não encontrada" }, 404);
  if (ini.squadId !== me.squadId) return c.json({ error: "apenas a própria squad" }, 403);
  if (ordem !== ini.etapaAtual) return c.json({ error: "só a etapa atual pode ser concluída" }, 400);

  const r = await concluirEtapaAtual(db, ini, me.nome);
  if (!r.ok) return c.json({ error: r.erro }, 400);
  await audit(me, "concluir_etapa", `iniciativa:${ini.codigo}`, { etapa: r.etapaNome, docId: r.doc.id });
  return c.json({ ok: true, proximaEtapa: r.proxima, docId: r.doc.id });
});

/* Gera o SDD (spec testável) de UMA história — para desenvolver em outro agente. */
// Gera o SDD (spec testável) de UMA história e o persiste como documento 'sdd'.
// Substitui o SDD anterior da história (regenerar). Reutilizado pelo endpoint
// manual e pela etapa de Desenvolvimento (SDDs gerados na sequência).
async function gerarSddDaHistoria(db: any, ini: any, h: any, autorNome: string): Promise<any> {
  const contexto = await contextoEtapasAnteriores(db, ini);
  const criterios = (h.criteriosAceite ?? []).map((x: string) => `- ${x}`).join("\n") || "- (sem critérios registrados)";
  const provider = await getProvider();
  const model = await resolveModel("arquitetura");
  const baseUser =
    `Iniciativa ${ini.codigo} — ${ini.titulo}\n${ini.descricao ?? ""}\n\n` +
    `Documentos anteriores da iniciativa (funcionais e técnicos — considere-os):\n${contexto || "(nenhum)"}\n\n` +
    `História ${h.codigo}: ${h.titulo}\n${h.descricao ?? ""}\nCritérios de aceite:\n${criterios}`;

  // 1) SDD em Markdown DIRETO (mais robusto que JSON com markdown embutido), com retry.
  let markdown = "";
  const sysDoc =
    "Você é um engenheiro de software. Escreva um SDD (Spec-Driven Development) TESTÁVEL para UMA história, " +
    "para ser EXECUTADO por um agente de código externo (Cursor, Claude Code). CONSIDERE OBRIGATORIAMENTE os documentos anteriores " +
    "da iniciativa (funcionais e técnicos). Entregue SOMENTE o documento em Markdown, específico e concreto (não repita apenas a descrição da história), " +
    "com as seções: ## Contexto, ## Escopo (o que entra e o que não entra), ## Especificação técnica (componentes, arquivos/áreas a mexer, contratos/APIs, modelo de dados), " +
    "## Plano de testes (casos verificáveis derivados dos critérios de aceite), ## Tarefas (passo a passo), ## Definition of Done.";
  for (let i = 0; i < 2 && !markdown; i++) {
    try {
      const r = await provider.chat({ model, system: sysDoc, messages: [{ role: "user", content: `${baseUser}\n\nProduza o SDD completo.` }], maxTokens: 2200, temperature: 0.3 });
      markdown = (r.content ?? "").trim();
    } catch { /* tenta de novo */ }
  }

  // 2) Prompt pronto para colar no agente de código.
  let promptPronto = "";
  try {
    const rp = await provider.chat({
      model,
      system: "Você gera um PROMPT autocontido, em 1ª pessoa, para um agente de código implementar a história: papel, resumo do contexto, tarefa objetiva, testes de aceite a satisfazer, restrições (padrões do repositório) e o que entregar (arquivos + testes). Responda SOMENTE o prompt.",
      messages: [{ role: "user", content: `${baseUser}\n\nSDD:\n${markdown || "(use os critérios acima)"}` }],
      maxTokens: 600, temperature: 0.3,
    });
    promptPronto = (rp.content ?? "").trim();
  } catch { /* usa fallback */ }
  if (!promptPronto) {
    promptPronto = `Implemente a história ${h.codigo} — ${h.titulo}, no contexto da iniciativa "${ini.titulo}".\n\n${h.descricao ?? ""}\n\nCritérios de aceite a satisfazer:\n${criterios}\n\nSiga os padrões do repositório. Entregue o código e os testes automatizados que cobrem os critérios acima.`;
  }
  if (!markdown) {
    const testes = (h.criteriosAceite ?? []).map((c: string) => `- Teste: ${c}`).join("\n") || "- Teste do caminho feliz";
    markdown =
      `# SDD — ${h.codigo} ${h.titulo}\n\n## Contexto\n${h.descricao ?? ""}\n\n## Escopo\n- Entra: o comportamento descrito na história\n- Não entra: itens de outras histórias\n\n` +
      `## Especificação técnica\n- Componentes e arquivos afetados a definir na implementação\n- Contratos/APIs e dados conforme os critérios\n\n` +
      `## Plano de testes\n${testes}\n\n## Tarefas\n1. Implementar o comportamento\n2. Cobrir com testes\n\n## Definition of Done\n- Critérios de aceite atendidos e testes passando`;
  }
  markdown += `\n\n## 🤖 Prompt para o agente de código\n\n\`\`\`\n${promptPronto}\n\`\`\`\n`;
  const resumo = `SDD testável de ${h.codigo}: ${h.titulo}`;

  const antigos = (await db.select().from(s.documento)).filter((d: any) => d.tipo === "sdd" && d.historiaId === h.id);
  for (const d of antigos) await db.delete(s.documento).where(eq(s.documento.id, d.id));
  const [docSdd] = await db.insert(s.documento).values({
    squadId: ini.squadId, iniciativaId: ini.id, historiaId: h.id,
    titulo: `SDD — ${h.codigo} ${h.titulo}`, tipo: "sdd", emoji: "🧩", resumo,
    conteudo: markdown, extra: { promptPronto, arquivo: `${h.codigo}.spec.md` },
    autorNome, escopo: "squad",
  }).returning();
  return { doc: docSdd, promptPronto };
}

// Gera SDDs (na sequência) para as histórias que ainda não têm — usado na etapa
// de Desenvolvimento. Bounded para caber no tempo. Retorna quantos gerou.
async function gerarSddsPendentes(db: any, ini: any, autorNome: string, cap = 12, onCada?: (i: number, total: number, hCodigo: string) => Promise<void> | void): Promise<number> {
  const hs = (await db.select().from(s.historia)).filter((x: any) => x.iniciativaId === ini.id).sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const comSdd = new Set((await db.select().from(s.documento)).filter((d: any) => d.tipo === "sdd" && d.iniciativaId === ini.id).map((d: any) => d.historiaId));
  const pendentes = hs.filter((h: any) => !comSdd.has(h.id)).slice(0, cap);
  let n = 0;
  for (const h of pendentes) {
    n++;
    await onCada?.(n, pendentes.length, h.codigo);
    await gerarSddDaHistoria(db, ini, h, autorNome);
  }
  return n;
}

app.post("/:codigo/historias/:id/sdd", rbac("criar_iniciativa"), async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const [ini] = await db.select().from(s.iniciativa).where(eq(s.iniciativa.codigo, c.req.param("codigo")));
  if (!ini) return c.json({ error: "iniciativa não encontrada" }, 404);
  if (ini.squadId !== me.squadId) return c.json({ error: "apenas a própria squad" }, 403);
  const [h] = await db.select().from(s.historia).where(eq(s.historia.id, c.req.param("id")));
  if (!h || h.iniciativaId !== ini.id) return c.json({ error: "história não encontrada" }, 404);
  const r = await gerarSddDaHistoria(db, ini, h, me.nome);
  await audit(me, "gerar_sdd", `historia:${h.codigo}`, { docId: r.doc.id });
  return c.json({ ok: true, docId: r.doc.id, promptPronto: r.promptPronto });
});

/* Ao final do desenvolvimento: a IA SUGERE uma capacidade para registrar na base. */
app.post("/:codigo/sugerir-capacidade", rbac("criar_iniciativa"), async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const [ini] = await db.select().from(s.iniciativa).where(eq(s.iniciativa.codigo, c.req.param("codigo")));
  if (!ini) return c.json({ error: "iniciativa não encontrada" }, 404);
  if (ini.squadId !== me.squadId) return c.json({ error: "apenas a própria squad" }, 403);

  const contexto = await contextoEtapasAnteriores(db, ini);
  const base = (await db.select().from(s.capacidade)).filter((cp: any) => cp.squadId === ini.squadId);
  const baseTxt = base.map((cp: any) => `- ${cp.nome} (L${cp.nivel ?? 1}${cp.fluxoValor ? `, fluxo: ${cp.fluxoValor}` : ""})`).join("\n") || "(base vazia)";

  let sug: any = null;
  try {
    sug = await gerarJson({
      tarefa: "arquitetura",
      system:
        "Você é um arquiteto de negócios (estilo TOGAF). Concluído o desenvolvimento de uma iniciativa, sugira UMA capacidade de negócio " +
        "(nova, ou evolução de uma existente) que passou a existir/ser reforçada — para registrar na base de capacidades. Responda SOMENTE JSON.",
      instrucao:
        `Iniciativa ${ini.codigo} — ${ini.titulo}\n${ini.descricao ?? ""}\n\nO que foi produzido:\n${contexto || "(sem documentos)"}\n\n` +
        `Base de capacidades atual (não duplique; complemente):\n${baseTxt}\n\n` +
        'Formato JSON: { "nome": "curto", "descricao": "o que a capacidade entrega", "nivel": 1|2, "pai": "<nome da capacidade L1 pai ou null>", "fluxoValor": "<fluxo de valor>", "repos": ["owner/repo"], "justificativa": "por que surge desta iniciativa" }',
      maxTokens: 700,
    });
  } catch { return c.json({ error: "a IA não conseguiu sugerir agora — tente novamente" }, 502); }
  if (!sug?.nome) return c.json({ error: "sugestão inválida" }, 502);
  return c.json({
    sugestao: {
      nome: String(sug.nome), descricao: sug.descricao ? String(sug.descricao) : "",
      nivel: Number(sug.nivel) === 2 ? 2 : 1, pai: sug.pai ? String(sug.pai) : null,
      fluxoValor: sug.fluxoValor ? String(sug.fluxoValor) : null,
      repos: Array.isArray(sug.repos) ? sug.repos.map(String) : [],
      justificativa: sug.justificativa ? String(sug.justificativa) : "",
    },
    base: base.filter((cp: any) => (cp.nivel ?? 1) === 1).map((cp: any) => cp.nome),
  });
});

/* Registra na base a capacidade (aprovada) e vincula a iniciativa a ela. */
app.post("/:codigo/capacidade", rbac("criar_iniciativa"), async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const [ini] = await db.select().from(s.iniciativa).where(eq(s.iniciativa.codigo, c.req.param("codigo")));
  if (!ini) return c.json({ error: "iniciativa não encontrada" }, 404);
  if (ini.squadId !== me.squadId) return c.json({ error: "apenas a própria squad" }, 403);
  const body = z.object({
    nome: z.string().min(2).max(120),
    descricao: z.string().max(500).optional().nullable(),
    nivel: z.union([z.literal(1), z.literal(2)]).default(1),
    pai: z.string().optional().nullable(),
    fluxoValor: z.string().optional().nullable(),
    repos: z.array(z.string()).optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const d = body.data;
  const [cap] = await db.insert(s.capacidade).values({
    squadId: ini.squadId, nome: d.nome, descricao: d.descricao ?? null, nivel: d.nivel,
    pai: d.pai ?? null, fluxoValor: d.fluxoValor ?? null, repos: d.repos ?? [], origem: "ia",
  }).returning();
  if (!ini.capacidadeId) await db.update(s.iniciativa).set({ capacidadeId: cap.id }).where(eq(s.iniciativa.id, ini.id));
  await audit(me, "registrar_capacidade_iniciativa", `iniciativa:${ini.codigo}`, { capacidade: d.nome });
  return c.json(cap, 201);
});

export default app;
