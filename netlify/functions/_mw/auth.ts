import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { jwtVerify, SignJWT } from "jose";
import type { Me } from "../../../shared/types";

const SESSION_COOKIE = "aiw_session";
const JWT_TTL = "15m";

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
  try {
    const { payload } = await jwtVerify(token, secret());
    c.set("me", payload.me as Me);
  } catch {
    return c.json({ error: "sessão inválida ou expirada" }, 401);
  }
  await next();
};
