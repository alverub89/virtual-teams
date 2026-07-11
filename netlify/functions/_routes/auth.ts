import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { signSession, sessionCookieName, cookieOpts } from "../_mw/auth";
import { getDb, schema } from "../../../db/client";
import type { Me, Papel, Escopo } from "../../../shared/types";

// Login (docs/spec §6.1): GitHub OAuth quando configurado; modo demo
// (personas do seed) quando não há OAuth — é como o produto roda localmente.
const app = new Hono();

const demoDisponivel = () =>
  process.env.DEMO_MODE === "1" || !process.env.GITHUB_OAUTH_CLIENT_ID;

function escoposDoPapel(papel: Papel): Escopo[] {
  if (papel === "arquiteto") return ["squad", "release_train", "comunidade"];
  if (papel === "diretor" || papel === "gerente" || papel === "coordenador")
    return ["comunidade", "release_train", "squad"];
  return ["squad"];
}

async function meDaPessoa(p: typeof schema.pessoa.$inferSelect): Promise<Me> {
  let squadNome: string | null = null;
  if (p.squadId) {
    const db = await getDb();
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

async function criarSessao(c: any, me: Me) {
  const db = await getDb();
  await db.insert(schema.sessao).values({
    pessoaId: me.id,
    refreshToken: randomUUID(),
    expiraEm: new Date(Date.now() + 1000 * 60 * 60 * 8),
  });
  setCookie(c, sessionCookieName, await signSession(me), cookieOpts());
}

// Configuração pública da tela de login.
app.get("/config", async (c) => {
  const demo = demoDisponivel();
  let personas: { id: string; nome: string; papel: string; squadNome: string | null }[] = [];
  if (demo) {
    const db = await getDb();
    const pessoas = await db.select().from(schema.pessoa);
    const squads = await db.select().from(schema.squad);
    const nomeSquad = (id: string | null) => squads.find((s: any) => s.id === id)?.nome ?? null;
    personas = pessoas.map((p: any) => ({
      id: p.id,
      nome: p.nome,
      papel: p.papel,
      squadNome: nomeSquad(p.squadId),
    }));
  }
  return c.json({
    demo,
    githubClientId: process.env.GITHUB_OAUTH_CLIENT_ID ?? null,
    personas,
  });
});

// Modo demo: entra como uma persona do seed.
app.post("/demo", async (c) => {
  if (!demoDisponivel()) return c.json({ error: "modo demo desativado" }, 403);
  const { pessoaId } = await c.req.json<{ pessoaId?: string }>();
  if (!pessoaId) return c.json({ error: "pessoaId obrigatório" }, 400);
  const db = await getDb();
  const [p] = await db.select().from(schema.pessoa).where(eq(schema.pessoa.id, pessoaId));
  if (!p) return c.json({ error: "persona não encontrada" }, 404);
  const me = await meDaPessoa(p);
  await criarSessao(c, me);
  return c.json({ me });
});

app.post("/github/callback", async (c) => {
  const { code } = await c.req.json<{ code?: string }>();
  if (!code) return c.json({ error: "code ausente" }, 400);

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return c.json({ error: "OAuth GitHub não configurado" }, 501);

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) return c.json({ error: "code inválido" }, 401);

  const ghUser = (await (
    await fetch("https://api.github.com/user", {
      headers: { authorization: `Bearer ${access_token}`, "user-agent": "ai-workspace" },
    })
  ).json()) as { login: string; name?: string; email?: string };

  const email = ghUser.email ?? `${ghUser.login}@users.noreply.github.com`;
  const db = await getDb();
  let [p] = await db.select().from(schema.pessoa).where(eq(schema.pessoa.email, email));
  if (!p) {
    // Pessoa nova entra como dev sem squad; papel/squad são geridos na plataforma.
    [p] = await db
      .insert(schema.pessoa)
      .values({ nome: ghUser.name ?? ghUser.login, email, githubLogin: ghUser.login, papel: "dev" })
      .returning();
  } else if (!p.githubLogin) {
    await db
      .update(schema.pessoa)
      .set({ githubLogin: ghUser.login })
      .where(eq(schema.pessoa.id, p.id));
  }

  const me = await meDaPessoa(p);
  await criarSessao(c, me);
  return c.json({ me });
});

app.post("/logout", (c) => {
  deleteCookie(c, sessionCookieName, { path: "/" });
  return c.json({ ok: true });
});

export default app;
