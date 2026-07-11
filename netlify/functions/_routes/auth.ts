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
  if (papel === "arquiteto") return ["squad", "release_train", "comunidade"];
  if (papel === "diretor" || papel === "gerente" || papel === "coordenador")
    return ["comunidade", "release_train", "squad"];
  return ["squad"];
}

async function meDaPessoa(db: any, p: typeof schema.pessoa.$inferSelect): Promise<Me> {
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

  // O primeiro usuário do workspace nasce como PM (dono da própria squad
  // após o onboarding). Sem squad ainda → o front leva ao onboarding.
  const [p] = await db
    .insert(schema.pessoa)
    .values({ nome, email: email.toLowerCase(), senhaHash: hashPassword(senha), papel: "pm" })
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

app.post("/logout", (c) => {
  deleteCookie(c, sessionCookieName, { path: "/" });
  return c.json({ ok: true });
});

export default app;
