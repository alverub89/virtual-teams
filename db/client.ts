import { neon, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzlePool } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

const url = () => {
  const u = process.env.DATABASE_URL;
  if (!u) throw new Error("DATABASE_URL não configurada");
  return u;
};

// HTTP: queries pontuais (a maioria das rotas de leitura) — menor latência em cold start.
export const db = () => drizzle(neon(url()), { schema });

// WebSocket Pool: transações multi-statement (ex.: criar iniciativa + etapas atomicamente).
// Sempre encerrar o pool ao fim da request (ctx.waitUntil / finally).
export const dbTx = () => {
  const pool = new Pool({ connectionString: url() });
  return { db: drizzlePool(pool, { schema }), close: () => pool.end() };
};
