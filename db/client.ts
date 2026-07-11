import * as schema from "./schema";

// Cliente dual (docs/spec §3.3 + modo demo):
// - Com DATABASE_URL → Neon (driver serverless HTTP; Pool para transações).
// - Sem DATABASE_URL → PGlite (Postgres embarcado em WASM) com migrations e
//   seed de demonstração aplicados na primeira conexão. É o modo em que o
//   produto roda localmente sem provisionar nada.

export type Db = ReturnType<typeof import("drizzle-orm/neon-http").drizzle<typeof schema>>;

let pglitePromise: Promise<any> | null = null;

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

export async function getDb(): Promise<any> {
  if (process.env.DATABASE_URL) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle(neon(process.env.DATABASE_URL), { schema });
  }
  // Falha de init não fica cacheada — a próxima chamada tenta de novo.
  pglitePromise ??= initPglite().catch((err) => {
    pglitePromise = null;
    throw err;
  });
  return pglitePromise;
}

export { schema };
