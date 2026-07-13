import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { jwtVerify, SignJWT } from "jose";
import type { Me } from "../../../shared/types";

const SESSION_COOKIE = "aiw_session";
const JWT_TTL = "8h";

export const cookieOpts = () => ({
  httpOnly: true,
  secure: !process.env.AIW_DEV, // localhost sem TLS no dev
  sameSite: "Lax" as const,
  path: "/",
  maxAge: 60 * 60 * 8,
});

const secret = () => {
  const s = process.env.SESSION_JWT_SECRET;
  if (!s) throw new Error("SESSION_JWT_SECRET não configurada");
  return new TextEncoder().encode(s);
};

export async function signSession(me: Me): Promise<string> {
  return new SignJWT({ me })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_TTL)
    .sign(secret());
}

export const sessionCookieName = SESSION_COOKIE;

declare module "hono" {
  interface ContextVariableMap {
    me: Me;
  }
}

// Valida o cookie httpOnly de sessão em toda rota autenticada.
// TODO(Fase 0): refresh opaco no Neon (tabela sessao) quando o JWT expirar.
export const auth: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: "não autenticado" }, 401);
  let me: Me;
  try {
    const { payload } = await jwtVerify(token, secret());
    me = payload.me as Me;
  } catch {
    return c.json({ error: "sessão inválida ou expirada" }, 401);
  }

  // "Auditar como squad": só o CTO pode assumir a visão de uma squad, e
  // somente em leitura (GET). O header vem do front (modo auditoria).
  const auditarSquad = c.req.header("x-auditar-squad");
  if (auditarSquad && me.papel === "cto") {
    if (c.req.method !== "GET") {
      return c.json({ error: "modo auditoria: somente leitura — saia da auditoria para editar" }, 403);
    }
    me = { ...me, squadId: auditarSquad, auditando: true };
  }

  c.set("me", me);
  await next();
};
