import { eq } from "drizzle-orm";
import { schema as s } from "../../../db/client";

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

async function lerRepo(nome: string, token?: string): Promise<{ nome: string; ok: boolean; contexto: string }> {
  const tree = await ghGet(`${GH}/repos/${nome}/git/trees/HEAD?recursive=1`, token);
  if (!tree.ok) return { nome, ok: false, contexto: `Repositório ${nome}: não foi possível ler (HTTP ${tree.status}).` };
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
    `Repositório ${nome}\nPastas de topo: ${dirsTopo.join(", ") || "-"}\nArquivos: ${paths.length}\n` +
    `README:\n${readme || "(sem README)"}\nManifest (${manifestPath ?? "-"}):\n${manifest || "-"}\n` +
    `Arquivos-âncora:${anchorTxt || " (nenhum)"}`;
  return { nome, ok: true, contexto };
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
    const token = com?.githubToken ?? undefined;

    if (!repos.length) throw new Error("a squad não tem repositórios conectados");

    await setProgresso(db, mapaId, `Planejando a leitura de ${repos.length} repositório(s)…`);
    const contextos: { nome: string; ok: boolean; contexto: string }[] = [];
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

    await db.update(s.mapaCapacidade).set({
      status: "pronto",
      conteudo: plano,
      reposAnalisados: repos.map((r: any) => r.nome),
      impacto: plano?.impacto ?? null,
      progresso: "concluído",
      concluidoEm: new Date(),
    }).where(eq(s.mapaCapacidade.id, mapaId));
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
