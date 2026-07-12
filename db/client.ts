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

// Provisiona o schema no Neon (idempotente) — as functions da Netlify alcançam
// o Neon mesmo quando o banco é externo (Neon próprio, não o Netlify DB).
async function ensureSchema(db: any) {
  const { sql } = await import("drizzle-orm");
  const { DDL } = await import("./bootstrap-ddl");
  const stmts = DDL.split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of stmts) {
    try {
      await db.execute(sql.raw(stmt));
    } catch (err: any) {
      // Ignora "já existe" (schema/tabela/coluna/constraint) — torna idempotente.
      const code = err?.code ?? err?.cause?.code;
      const msg = String(err?.message ?? "");
      if (["42P06", "42P07", "42701", "42710", "42P16"].includes(code) || /already exists|duplicate/i.test(msg))
        continue;
      throw err;
    }
  }
}

async function initNeon(url: string) {
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  const db = drizzle(neon(url), { schema });
  await ensureSchema(db);
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
