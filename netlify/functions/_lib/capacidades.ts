import { eq } from "drizzle-orm";
import { schema as s } from "../../../db/client";

// Token do GitHub: prioriza o salvo na comunidade (via UI); senão, cai para a
// env var (GITHUB_TOKEN / GITHUB_PAT / GH_TOKEN) configurada na Netlify.
export function resolveGithubToken(com: any): string | undefined {
  return com?.githubToken || process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || process.env.GH_TOKEN || undefined;
}

// Análise de capacidades: planeja e lê os repositórios da squad (profundidade
// média: estrutura + README + manifest + arquivos-âncora), depois sintetiza com
// IA a arquitetura de negócio (fluxo de valor → capacidades L1/L2 → repos).
// Tolerante a falhas: sem token/GitHub, usa o nome do repo e segue.

const GH = "https://api.github.com";

async function ghGet(url: string, token?: string, raw = false): Promise<{ ok: boolean; status: number; text: string }> {
  const headers: Record<string, string> = { "user-agent": "AI-Workspace" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (raw) headers.accept = "application/vnd.github.raw+json";
  try {
    const res = await fetch(url, { headers });
    return { ok: res.ok, status: res.status, text: await res.text() };
  } catch (e) {
    return { ok: false, status: 0, text: e instanceof Error ? e.message : String(e) };
  }
}

const MANIFESTS = ["package.json", "pom.xml", "build.gradle", "go.mod", "requirements.txt", "Cargo.toml", "composer.json", "pyproject.toml"];
const ANCHOR = /(^|\/)(main|index|app|application|server|api)\.(ts|js|py|go|java|kt|rb)$|controller|service|domain|handler|usecase|route/i;

function dicaErro(status: number): string {
  if (status === 401) return "token inválido/expirado";
  if (status === 403) return "sem permissão, rate limit ou SSO não autorizado";
  if (status === 404) return "repo não encontrado ou sem acesso (token/escopo/SSO)";
  if (status === 0) return "falha de rede";
  return `HTTP ${status}`;
}

async function lerRepo(nome: string, token?: string): Promise<{ nome: string; ok: boolean; erro?: string; contexto: string }> {
  // 1) metadados do repo (valida acesso e descobre o branch padrão)
  const meta = await ghGet(`${GH}/repos/${nome}`, token);
  if (!meta.ok) {
    let erro = dicaErro(meta.status);
    // Refina o 404: o token é válido? de quem? — para dizer se falta acesso ou o token está ruim.
    if (meta.status === 404) {
      if (!token) {
        erro = "repo não encontrado ou privado (nenhum token configurado — defina GITHUB_TOKEN)";
      } else {
        const who = await ghGet(`${GH}/user`, token);
        if (!who.ok) {
          erro = `token não reconhecido pelo GitHub (${who.status}) — verifique se copiou inteiro/não expirou`;
        } else {
          let login = "?"; try { login = JSON.parse(who.text).login; } catch { /* */ }
          erro = `token de "${login}" é válido, mas SEM acesso a ${nome} — se o repo é privado, use um classic com scope 'repo' OU inclua este repo num token fine-grained`;
        }
      }
    }
    return { nome, ok: false, erro, contexto: `Repositório ${nome}: NÃO foi possível ler (${erro}).` };
  }
  let repo: any = {};
  try { repo = JSON.parse(meta.text); } catch { /* */ }
  const branch = repo.default_branch || "main";
  const descricao = repo.description || "";
  const lingua = repo.language || "";

  // 2) árvore de arquivos pelo branch padrão (a API de trees não aceita "HEAD")
  const tree = await ghGet(`${GH}/repos/${nome}/git/trees/${branch}?recursive=1`, token);
  let paths: string[] = [];
  try { paths = (JSON.parse(tree.text).tree ?? []).map((t: any) => t.path).filter(Boolean); } catch { /* */ }
  const dirsTopo = [...new Set(paths.filter((p) => p.includes("/")).map((p) => p.split("/")[0]))].slice(0, 30);

  const rm = await ghGet(`${GH}/repos/${nome}/readme`, token, true);
  const readme = rm.ok ? rm.text.slice(0, 4000) : "";
  const manifestPath = paths.find((p) => MANIFESTS.includes(p));
  let manifest = "";
  if (manifestPath) { const mr = await ghGet(`${GH}/repos/${nome}/contents/${manifestPath}`, token, true); if (mr.ok) manifest = mr.text.slice(0, 1500); }
  const anchors = paths.filter((p) => ANCHOR.test(p)).slice(0, 5);
  let anchorTxt = "";
  for (const a of anchors) { const ar = await ghGet(`${GH}/repos/${nome}/contents/${a}`, token, true); if (ar.ok) anchorTxt += `\n--- ${a} ---\n${ar.text.slice(0, 1200)}`; }

  const contexto =
    `Repositório ${nome}\nDescrição: ${descricao || "-"}\nLinguagem: ${lingua || "-"}\n` +
    `Pastas de topo: ${dirsTopo.join(", ") || "-"}\nArquivos: ${paths.length}\n` +
    `README:\n${readme || "(sem README)"}\nManifest (${manifestPath ?? "-"}):\n${manifest || "-"}\n` +
    `Arquivos-âncora:${anchorTxt || " (nenhum)"}`;
  return { nome, ok: true, contexto };
}

// Testa o token: quem é (login), se é válido, e o acesso a cada repo da squad.
export async function testarToken(token: string | undefined, repos: string[]) {
  if (!token) return { temToken: false, tokenOk: false, login: null, repos: repos.map((nome) => ({ nome, ok: false, status: 0, privado: null })) };
  const who = await ghGet(`${GH}/user`, token);
  let login: string | null = null;
  if (who.ok) { try { login = JSON.parse(who.text).login; } catch { /* */ } }
  const rr: { nome: string; ok: boolean; status: number; privado: boolean | null }[] = [];
  for (const nome of repos) {
    const r = await ghGet(`${GH}/repos/${nome}`, token);
    let privado: boolean | null = null;
    try { privado = JSON.parse(r.text).private ?? null; } catch { /* */ }
    rr.push({ nome, ok: r.ok, status: r.status, privado });
  }
  return { temToken: true, tokenOk: who.ok, login, repos: rr };
}

async function setProgresso(db: any, mapaId: string, txt: string) {
  await db.update(s.mapaCapacidade).set({ progresso: txt }).where(eq(s.mapaCapacidade.id, mapaId));
}

export async function analisarCapacidades(db: any, mapaId: string): Promise<void> {
  const [mapa] = await db.select().from(s.mapaCapacidade).where(eq(s.mapaCapacidade.id, mapaId));
  if (!mapa) return;
  try {
    const repos = (await db.select().from(s.repositorio)).filter((r: any) => r.squadId === mapa.squadId);
    const [sq] = await db.select().from(s.squad).where(eq(s.squad.id, mapa.squadId));
    const [rt] = sq ? await db.select().from(s.releaseTrain).where(eq(s.releaseTrain.id, sq.releaseTrainId)) : [];
    const [com] = rt ? await db.select().from(s.comunidade).where(eq(s.comunidade.id, rt.comunidadeId)) : [];
    const token = resolveGithubToken(com);

    if (!repos.length) throw new Error("a squad não tem repositórios conectados");

    await setProgresso(db, mapaId, `Planejando a leitura de ${repos.length} repositório(s)…`);
    const contextos: { nome: string; ok: boolean; erro?: string; contexto: string }[] = [];
    for (let i = 0; i < repos.length; i++) {
      await setProgresso(db, mapaId, `Lendo ${repos[i].nome} (${i + 1}/${repos.length})…`);
      contextos.push(await lerRepo(repos[i].nome, token));
    }
    await setProgresso(db, mapaId, "Sintetizando o mapa de capacidades…");

    const anteriores = (await db.select().from(s.mapaCapacidade))
      .filter((m: any) => m.squadId === mapa.squadId && m.status === "pronto" && m.versao < mapa.versao)
      .sort((a: any, b: any) => b.versao - a.versao);
    const anterior = anteriores[0];
    const ehImpacto = String(mapa.motivo ?? "").startsWith("impacto");

    const { gerarJson } = await import("./aigen");
    const plano = await gerarJson({
      tarefa: "arquitetura",
      system:
        "Você é um arquiteto de negócios (estilo TOGAF). A partir do conteúdo dos repositórios, monte a ARQUITETURA DE NEGÓCIO da squad: " +
        "fluxos de valor no topo, capacidades de negócio hierárquicas (nível 1 e 2), e cada capacidade vinculada aos repositórios que a realizam. Responda SOMENTE JSON.",
      instrucao:
        `Repositórios e conteúdo lido:\n${contextos.map((c) => c.contexto).join("\n\n")}\n\n` +
        (anterior ? `Mapa anterior (v${anterior.versao}) para evoluir/comparar:\n${JSON.stringify(anterior.conteudo).slice(0, 3000)}\n\n` : "") +
        (ehImpacto ? `Esta é uma REAVALIAÇÃO (${mapa.motivo}). Avalie o impacto do(s) repositório(s) novo(s) nas capacidades existentes e atualize o mapa.\n\n` : "") +
        'Formato JSON: { "resumo": "texto curto", "fluxosValor": [{"nome":"...","descricao":"..."}], ' +
        '"capacidades": [{"nome":"...","nivel":1,"pai":null,"fluxoValor":"<nome do fluxo>","descricao":"...","repos":["owner/repo"]}, {"nome":"...","nivel":2,"pai":"<capacidade L1>","descricao":"...","repos":[...]}]' +
        (ehImpacto ? ', "impacto": {"resumo":"...","mudancas":["..."]}' : "") + " }",
      maxTokens: 2500,
    });

    const falhas = contextos.filter((c) => !c.ok);
    const diagnostico = falhas.length
      ? `${contextos.length - falhas.length}/${contextos.length} repos lidos. Falhas: ${falhas.map((f) => `${f.nome} (${f.erro})`).join("; ")}`
      : `${contextos.length} repo(s) lido(s) com sucesso.`;
    await db.update(s.mapaCapacidade).set({
      status: "pronto",
      conteudo: plano,
      reposAnalisados: repos.map((r: any) => r.nome),
      impacto: plano?.impacto ?? null,
      progresso: diagnostico,
      concluidoEm: new Date(),
    }).where(eq(s.mapaCapacidade.id, mapaId));

    // Registra a análise na BASE de capacidades (reutilizável em outros lugares).
    // Upsert por nome; não apaga as manuais nem as de IA fora deste mapa.
    const capsPlano: any[] = Array.isArray(plano?.capacidades) ? plano.capacidades : [];
    const existentes = (await db.select().from(s.capacidade)).filter((cp: any) => cp.squadId === mapa.squadId);
    for (const cp of capsPlano) {
      if (!cp?.nome) continue;
      const ex = existentes.find((e: any) => String(e.nome).toLowerCase() === String(cp.nome).toLowerCase());
      const vals = {
        descricao: cp.descricao ?? null,
        nivel: Number(cp.nivel) === 2 ? 2 : 1,
        pai: cp.pai ?? null,
        fluxoValor: cp.fluxoValor ?? null,
        repos: Array.isArray(cp.repos) ? cp.repos : [],
        origem: "ia",
      };
      if (ex) await db.update(s.capacidade).set(vals).where(eq(s.capacidade.id, ex.id));
      else await db.insert(s.capacidade).values({ squadId: mapa.squadId, nome: cp.nome, ...vals });
    }
  } catch (e) {
    await db.update(s.mapaCapacidade).set({ status: "erro", progresso: `erro: ${e instanceof Error ? e.message : e}` }).where(eq(s.mapaCapacidade.id, mapaId));
  }
}

// Background Function em produção (até 15 min); inline no dev/demo.
export async function enqueueAnalise(mapaId: string): Promise<void> {
  const base = process.env.URL;
  if (base && process.env.DATABASE_URL) {
    await fetch(`${base}/.netlify/functions/capability-analyze-background`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mapaId }),
    }).catch((err) => console.error("[capacidades] enqueue", err));
  } else {
    const { getDb } = await import("../../../db/client");
    void getDb().then((db) => analisarCapacidades(db, mapaId)).catch((err) => console.error("[capacidades]", err));
  }
}
