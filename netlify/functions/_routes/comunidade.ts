import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";
import { PAPEL_LABEL, type Papel } from "../../../shared/types";

// Minha comunidade — visão da comunidade da pessoa: estrutura (RTs/squads),
// lideranças e membros, e convites pendentes. Resolve pela comunidade da pessoa
// (funciona para squad, gestão e CTO). O convite em si é feito por /convites.
const app = new Hono();

const papeisQuePodeConvidar = (papel: Papel): Papel[] => {
  if (papel === "cto") return ["pm", "tech_lead", "dev", "gestao"];
  if (papel === "pm" || papel === "tech_lead") return ["pm", "tech_lead", "dev"];
  return [];
};

app.get("/", async (c) => {
  const me = c.get("me");
  const db = await getDb();
  const comId = me.comunidadeId;
  if (!comId) return c.json({ comunidade: null, releaseTrains: [], lideranca: [], membros: [], squads: [], convites: [], podeConvidar: false, papeisConvidaveis: [] });

  const [com] = await db.select().from(s.comunidade).where(eq(s.comunidade.id, comId));
  const rts = (await db.select().from(s.releaseTrain)).filter((rt: any) => rt.comunidadeId === comId);
  const rtIds = new Set(rts.map((rt: any) => rt.id));
  const squads = (await db.select().from(s.squad)).filter((sq: any) => rtIds.has(sq.releaseTrainId));
  const squadById = new Map<string, any>(squads.map((sq: any) => [sq.id, sq]));
  const pessoas = (await db.select().from(s.pessoa)).filter((p: any) => p.comunidadeId === comId && p.ativo);
  const convites = (await db.select().from(s.convite)).filter((v: any) => v.comunidadeId === comId && v.status === "pendente");
  const repos = me.squadId ? (await db.select().from(s.repositorio)).filter((r: any) => r.squadId === me.squadId) : [];

  const pessoaDto = (p: any) => ({
    id: p.id, nome: p.nome, email: p.email, papel: p.papel,
    papelLabel: PAPEL_LABEL[p.papel as Papel] ?? p.papel,
    squadNome: p.squadId ? squadById.get(p.squadId)?.nome ?? null : null,
    ehVoce: p.id === me.id,
  });
  const papeisConvidaveis = papeisQuePodeConvidar(me.papel);

  const podeEditar = me.papel === "pm" || me.papel === "tech_lead" || me.papel === "cto";
  return c.json({
    comunidade: com ? { id: com.id, nome: com.nome } : null,
    podeConvidar: papeisConvidaveis.length > 0,
    papeisConvidaveis,
    minhaSquadNome: me.squadId ? squadById.get(me.squadId)?.nome ?? null : null,
    podeEditarRepos: podeEditar && !!me.squadId,
    repos: repos.map((r: any) => ({ id: r.id, nome: r.nome, linguagem: r.linguagem ?? null, url: r.url ?? null })),
    squads: squads.map((sq: any) => ({ id: sq.id, nome: sq.nome })),
    releaseTrains: rts.map((rt: any) => ({
      id: rt.id, nome: rt.nome,
      squads: squads.filter((sq: any) => sq.releaseTrainId === rt.id).map((sq: any) => ({
        id: sq.id, nome: sq.nome,
        pessoas: pessoas.filter((p: any) => p.squadId === sq.id).length,
        minha: sq.id === me.squadId,
      })),
    })),
    lideranca: pessoas.filter((p: any) => ["cto", "pm", "tech_lead", "gestao"].includes(p.papel)).map(pessoaDto),
    membros: pessoas.filter((p: any) => p.papel === "dev").map(pessoaDto),
    convites: convites.map((v: any) => ({ id: v.id, email: v.email, papel: v.papel, papelLabel: PAPEL_LABEL[v.papel as Papel] ?? v.papel, squadNome: v.squadId ? squadById.get(v.squadId)?.nome ?? null : null })),
  });
});

export default app;
