import * as schema from "./schema";

// Cliente dual (docs/spec §3.3 + modo demo):
// - Produção Netlify: NETLIFY_DATABASE_URL (Neon provisionado pela Netlify) ou
//   DATABASE_URL — driver serverless HTTP. O schema é aplicado pela migration
//   do Netlify DB no deploy; o seed roda na primeira conexão (idempotente).
// - Local sem banco: PGlite (Postgres embarcado em WASM) com migrations +
//   seed aplicados na primeira conexão. É o modo demo turnkey.

export type Db = ReturnType<typeof import("drizzle-orm/neon-http").drizzle<typeof schema>>;

const neonUrl = () => process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL;

let clientPromise: Promise<any> | null = null;

async function initNeon() {
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  const db = drizzle(neon(neonUrl()!), { schema });
  const { seedIfEmpty } = await import("./seed");
  await seedIfEmpty(db as any); // idempotente: só popula se o banco estiver vazio
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

export async function getDb(): Promise<any> {
  // Falha de init não fica cacheada — a próxima chamada tenta de novo.
  clientPromise ??= (neonUrl() ? initNeon() : initPglite()).catch((err) => {
    clientPromise = null;
    throw err;
  });
  return clientPromise;
}

export { schema };
