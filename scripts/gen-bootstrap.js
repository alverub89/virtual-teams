// Gera db/bootstrap-ddl.ts com as migrations separadas (para aplicar de forma
// incremental e idempotente no Neon em runtime). Rode após alterar o schema:
//   node scripts/gen-bootstrap.js
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.cwd(), "db/migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const migs = files.map((f) => ({ name: f.replace(/\.sql$/, ""), sql: fs.readFileSync(path.join(dir, f), "utf8") }));
const out =
  "// GERADO de db/migrations/*.sql — migrations aplicadas incrementalmente no\n" +
  "// Neon em runtime (idempotente, com tracking). Regenerar: node scripts/gen-bootstrap.js\n" +
  "export const MIGRATIONS: { name: string; sql: string }[] = " + JSON.stringify(migs) + ";\n";
fs.writeFileSync(path.resolve(process.cwd(), "db/bootstrap-ddl.ts"), out);
console.log(`bootstrap-ddl.ts: ${migs.length} migrations`);
