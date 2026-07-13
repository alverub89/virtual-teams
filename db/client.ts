import * as schema from "./schema";

// Cliente dual (docs/spec §3.3 + modo demo):
// - Produção Netlify: Netlify DB (Neon). A connection string vem de
//   getConnectionString() do @netlify/database (accessor oficial em runtime)
//   ou das envs NETLIFY_DATABASE_URL / DATABASE_URL. Driver serverless HTTP.
//   Schema aplicado pela migration do Netlify DB no deploy; seed idempotente
//   na primeira conexão.
// - Local sem banco: PGlite (Postgres embarcado em WASM) com migrations +
//   seed. Modo demo turnkey.

export type Db = ReturnType<typeof import("drizzle-orm/neon-http").drizzle<typeof schema>>;

let clientPromise: Promise<any> | null = null;

// Resolve a connection string do Postgres gerenciado (Neon/Netlify DB).
export async function resolveNeonUrl(): Promise<{ url?: string; source: string }> {
  if (process.env.NETLIFY_DATABASE_URL) return { url: process.env.NETLIFY_DATABASE_URL, source: "env:NETLIFY_DATABASE_URL" };
  if (process.env.DATABASE_URL) return { url: process.env.DATABASE_URL, source: "env:DATABASE_URL" };
  try {
    const mod: any = await import("@netlify/database");
    const cs = typeof mod.getConnectionString === "function" ? mod.getConnectionString() : undefined;
    if (cs) return { url: cs, source: "getConnectionString" };
  } catch {
    /* pacote indisponível fora da Netlify — segue para PGlite */
  }
  return { source: "none" };
}

// Aplica as migrations pendentes no Neon de forma incremental e idempotente,
// com uma tabela de tracking (_migrations). Nunca apaga dados — statements que
// já existem (tabela/coluna/constraint) são ignorados. Serve tanto para banco
// novo quanto para evoluir um já provisionado.
async function ensureSchema(url: string) {
  const { MIGRATIONS } = await import("./bootstrap-ddl");
  const ignoravel = (e: any) => {
    const code = e?.code ?? e?.cause?.code;
    const msg = String(e?.message ?? "");
    return ["42P06", "42P07", "42701", "42710", "42P16", "42P16"].includes(code) || /already exists|duplicate/i.test(msg);
  };

  const aplicar = async (run: (s: string) => Promise<unknown>, query: (s: string) => Promise<any[]>) => {
    await run('CREATE SCHEMA IF NOT EXISTS "ai_workspace"');
    await run('CREATE TABLE IF NOT EXISTS "ai_workspace"."_migrations" (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
    const rows = await query('SELECT name FROM "ai_workspace"."_migrations"').catch(() => []);
    const aplicadas = new Set((rows ?? []).map((r: any) => r.name));
    for (const mig of MIGRATIONS) {
      if (aplicadas.has(mig.name)) continue;
      const stmts = mig.sql.split("--> statement-breakpoint").map((x) => x.trim()).filter(Boolean);
      for (const stmt of stmts) {
        try {
          await run(stmt);
        } catch (err: any) {
          if (!ignoravel(err)) console.error("[migrations]", mig.name, String(err?.message ?? err).slice(0, 120));
        }
      }
      await run(`INSERT INTO "ai_workspace"."_migrations"(name) VALUES ('${mig.name}') ON CONFLICT (name) DO NOTHING`);
    }
  };

  // Preferência: Pool (WebSocket, 1 conexão). Fallback: HTTP (drizzle).
  try {
    const { Pool } = await import("@neondatabase/serverless");
    const pool = new Pool({ connectionString: url });
    try {
      await aplicar((s) => pool.query(s), async (s) => (await pool.query(s)).rows);
    } finally {
      await pool.end();
    }
  } catch (err: any) {
    console.error("[migrations] Pool indisponível, fallback HTTP:", String(err?.message ?? err).slice(0, 100));
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const { sql } = await import("drizzle-orm");
    const dbHttp = drizzle(neon(url));
    await aplicar(
      (s) => dbHttp.execute(sql.raw(s)),
      async (s) => {
        const r: any = await dbHttp.execute(sql.raw(s));
        return r?.rows ?? r ?? [];
      }
    );
  }
}

async function initNeon(url: string) {
  await ensureSchema(url);
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  const db = drizzle(neon(url), { schema });
  const { seedIfEmpty } = await import("./seed");
  await seedIfEmpty(db as any); // idempotente: só popula catálogo se vazio
  return db;
}

async function initPglite() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const path = await import("node:path");

  const dataDir = process.env.PGLITE_DATA_DIR ?? path.resolve(process.cwd(), ".data/pglite");
  const fs = await import("node:fs");
  fs.mkdirSync(dataDir, { recursive: true });
  const pg = new PGlite(dataDir);
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "db/migrations") });

  const { seedIfEmpty } = await import("./seed");
  await seedIfEmpty(db as any);
  return db;
}

async function init() {
  const { url } = await resolveNeonUrl();
  return url ? initNeon(url) : initPglite();
}

export async function getDb(): Promise<any> {
  // Falha de init não fica cacheada — a próxima chamada tenta de novo.
  clientPromise ??= init().catch((err) => {
    clientPromise = null;
    throw err;
  });
  return clientPromise;
}

// Diagnóstico seguro (sem vazar a connection string) para depurar conexão.
export async function dbDiagnostics(): Promise<Record<string, unknown>> {
  const { url, source } = await resolveNeonUrl();
  const out: Record<string, unknown> = {
    hasNetlifyUrl: !!process.env.NETLIFY_DATABASE_URL,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    source,
    driver: url ? "neon-http" : "pglite",
  };
  try {
    const db = await getDb();
    const rows = await db.select().from(schema.comunidade).limit(1);
    out.dbOk = true;
    out.seeded = rows.length > 0;
  } catch (err) {
    out.dbOk = false;
    out.error = err instanceof Error ? err.message : String(err);
  }
  return out;
}

export { schema };
