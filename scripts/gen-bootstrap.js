// Concatena db/migrations/*.sql em db/bootstrap-ddl.ts (string DDL embutida,
// usada para provisionar o Neon na primeira conexão). Rode após alterar o schema:
//   node scripts/gen-bootstrap.js
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.cwd(), "db/migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const ddl = files.map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n--> statement-breakpoint\n");
const out =
  "// GERADO de db/migrations/*.sql — DDL idempotente para provisionar o Neon\n" +
  "// na primeira conexão. Regenerar: node scripts/gen-bootstrap.js\n" +
  "export const DDL = " + JSON.stringify(ddl) + ";\n";
fs.writeFileSync(path.resolve(process.cwd(), "db/bootstrap-ddl.ts"), out);
console.log(`bootstrap-ddl.ts: ${files.length} arquivos, ${ddl.split("--> statement-breakpoint").length} statements`);
