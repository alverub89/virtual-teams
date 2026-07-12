import { Hono } from "hono";
import { z } from "zod";
import { setCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { signSession, sessionCookieName, cookieOpts } from "../_mw/auth";
import { getDb, schema } from "../../../db/client";
import { hashPassword, verifyPassword } from "../_lib/password";
import type { Me, Papel, Escopo } from "../../../shared/types";

// Autenticação real por email/senha (cadastro do próprio usuário).
const app = new Hono();

function escoposDoPapel(papel: Papel): Escopo[] {
  if (papel === "cto" || papel === "gestao") return ["comunidade", "release_train", "squad"];
  return ["squad"];
}

export async function meDaPessoa(db: any, p: typeof schema.pessoa.$inferSelect): Promise<Me> {
  let squadNome: string | null = null;
  if (p.squadId) {
    const [sq] = await db.select().from(schema.squad).where(eq(schema.squad.id, p.squadId));
    squadNome = sq?.nome ?? null;
  }
  return {
    id: p.id,
    nome: p.nome,
    email: p.email,
    papel: p.papel as Papel,
    squadId: p.squadId,
    squadNome,
    comunidadeId: p.comunidadeId,
    onboardingConcluido: p.onboardingConcluido,
    escopos: escoposDoPapel(p.papel as Papel),
  };
}

async function abrirSessao(c: any, db: any, me: Me) {
  await db.insert(schema.sessao).values({
    pessoaId: me.id,
    refreshToken: randomUUID(),
    expiraEm: new Date(Date.now() + 1000 * 60 * 60 * 8),
  });
  setCookie(c, sessionCookieName, await signSession(me), cookieOpts());
}

app.get("/config", (c) => c.json({ mode: "email", allowRegister: true }));

const Registro = z.object({
  nome: z.string().min(2).max(80),
  email: z.string().email(),
  senha: z.string().min(8).max(200),
});

app.post("/register", async (c) => {
  const body = Registro.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos", detalhe: body.error.flatten() }, 400);
  const { nome, email, senha } = body.data;
  const db = await getDb();

  const [existe] = await db
    .select()
    .from(schema.pessoa)
    .where(eq(schema.pessoa.email, email.toLowerCase()));
  if (existe) return c.json({ error: "já existe uma conta com esse email" }, 409);

  // Quem se cadastra é o CTO (dono da plataforma). Os demais entram por
  // convite. Sem onboarding concluído → o front leva ao setup guiado.
  const [p] = await db
    .insert(schema.pessoa)
    .values({ nome, email: email.toLowerCase(), senhaHash: hashPassword(senha), papel: "cto" })
    .returning();

  const me = await meDaPessoa(db, p);
  await abrirSessao(c, db, me);
  return c.json({ me }, 201);
});

const Login = z.object({ email: z.string().email(), senha: z.string().min(1) });

app.post("/login", async (c) => {
  const body = Login.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const db = await getDb();
  const [p] = await db
    .select()
    .from(schema.pessoa)
    .where(eq(schema.pessoa.email, body.data.email.toLowerCase()));
  if (!p || !p.senhaHash || !verifyPassword(body.data.senha, p.senhaHash))
    return c.json({ error: "email ou senha inválidos" }, 401);

  const me = await meDaPessoa(db, p);
  await abrirSessao(c, db, me);
  return c.json({ me });
});

// ---- Aceite de convite (público: o convidado ainda não tem conta) ----

app.get("/convite/:token", async (c) => {
  const db = await getDb();
  const [conv] = await db.select().from(schema.convite).where(eq(schema.convite.token, c.req.param("token")));
  if (!conv) return c.json({ error: "convite não encontrado" }, 404);
  const [com] = await db.select().from(schema.comunidade).where(eq(schema.comunidade.id, conv.comunidadeId));
  const squad = conv.squadId ? (await db.select().from(schema.squad).where(eq(schema.squad.id, conv.squadId)))[0] : null;
  return c.json({
    email: conv.email,
    papel: conv.papel,
    status: conv.status,
    comunidadeNome: com?.nome ?? null,
    squadNome: squad?.nome ?? null,
    convidadoNome: conv.convidadoNome,
  });
});

const AceitarConvite = z.object({ nome: z.string().min(2).max(80), senha: z.string().min(8).max(200) });

app.post("/convite/:token/aceitar", async (c) => {
  const body = AceitarConvite.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "dados inválidos" }, 400);
  const db = await getDb();
  const [conv] = await db.select().from(schema.convite).where(eq(schema.convite.token, c.req.param("token")));
  if (!conv) return c.json({ error: "convite não encontrado" }, 404);
  if (conv.status !== "pendente") return c.json({ error: "convite já utilizado ou cancelado" }, 409);

  const dados = {
    nome: body.data.nome,
    senhaHash: hashPassword(body.data.senha),
    papel: conv.papel,
    comunidadeId: conv.comunidadeId,
    squadId: conv.squadId,
    onboardingConcluido: true,
  };
  const [existe] = await db.select().from(schema.pessoa).where(eq(schema.pessoa.email, conv.email));
  let pessoa: typeof schema.pessoa.$inferSelect;
  if (existe) {
    [pessoa] = await db.update(schema.pessoa).set(dados).where(eq(schema.pessoa.id, existe.id)).returning();
  } else {
    [pessoa] = await db.insert(schema.pessoa).values({ email: conv.email, ...dados }).returning();
  }
  await db.update(schema.convite).set({ status: "aceito", aceitoEm: new Date() }).where(eq(schema.convite.id, conv.id));

  const me = await meDaPessoa(db, pessoa);
  await abrirSessao(c, db, me);
  return c.json({ me });
});

app.post("/logout", (c) => {
  deleteCookie(c, sessionCookieName, { path: "/" });
  return c.json({ ok: true });
});

export default app;
