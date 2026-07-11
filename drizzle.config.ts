import { defineConfig } from "drizzle-kit";

// Migrations usam a conexão direta (sem pooler) — ver docs/spec, seção 14.
export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
