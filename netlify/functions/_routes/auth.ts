import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { signSession, sessionCookieName } from "../_mw/auth";
import type { Me } from "../../../shared/types";

// Login via GitHub OAuth (docs/spec, seção 6.1):
// SPA → GitHub authorize → callback aqui → troca code por token →
// upsert em pessoa → cria sessão (cookie httpOnly + refresh no Neon).
const app = new Hono();

app.post("/github/callback", async (c) => {
  const { code } = await c.req.json<{ code?: string }>();
  if (!code) return c.json({ error: "code ausente" }, 400);

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return c.json({ error: "OAuth GitHub não configurado" }, 501);
  }

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

  // TODO(Fase 0): upsert em ai_workspace.pessoa por e-mail/login e carregar
  // papel + squad reais; refresh opaco persistido em ai_workspace.sessao.
  const me: Me = {
    id: ghUser.login,
    nome: ghUser.name ?? ghUser.login,
    email: ghUser.email ?? `${ghUser.login}@users.noreply.github.com`,
    papel: "pm",
    squadId: null,
    escopos: ["squad"],
  };

  setCookie(c, sessionCookieName, await signSession(me), {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 15,
  });
  return c.json({ me });
});

app.post("/logout", (c) => {
  deleteCookie(c, sessionCookieName, { path: "/" });
  return c.json({ ok: true });
});

export default app;
