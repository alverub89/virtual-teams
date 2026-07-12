import { Hono } from "hono";
import { auth } from "./_mw/auth";
import authRoutes from "./_routes/auth";
import onboarding from "./_routes/onboarding";
import convites from "./_routes/convites";
import iniciativas from "./_routes/iniciativas";
import okrs from "./_routes/okrs";
import capacidades from "./_routes/capacidades";
import docs from "./_routes/docs";
import kb from "./_routes/kb";
import esteira from "./_routes/esteira";
import estrutura from "./_routes/estrutura";
import runs from "./_routes/runs";
import consoleRoutes from "./_routes/console";
import gestao from "./_routes/gestao";

// API do AI Workspace — Hono catch-all em /api/* (docs/spec §5).
const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ ok: true, service: "ai-workspace" }));
app.get("/health/db", async (c) => {
  const { dbDiagnostics } = await import("../../db/client");
  return c.json(await dbDiagnostics());
});
app.route("/auth", authRoutes); // públicas (config, demo, callback OAuth, logout)

app.use("*", auth); // tudo abaixo exige sessão

app.get("/me", (c) => c.json(c.get("me")));
app.route("/onboarding", onboarding);
app.route("/convites", convites);
app.route("/iniciativas", iniciativas);
app.route("/okrs", okrs);
app.route("/capacidades", capacidades);
app.route("/docs", docs);
app.route("/kb", kb);
app.route("/esteira", esteira);
app.route("/estrutura", estrutura);
app.route("/runs", runs);
app.route("/console", consoleRoutes);
app.route("/gestao", gestao);

export { app };
export default app.fetch;
export const config = { path: "/api/*" };
