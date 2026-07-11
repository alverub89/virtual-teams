import { Hono } from "hono";
import { auth } from "./_mw/auth";
import authRoutes from "./_routes/auth";
import runs from "./_routes/runs";

// API do AI Workspace — Hono catch-all em /api/* (docs/spec, seção 5).
const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ ok: true, service: "ai-workspace" }));
app.route("/auth", authRoutes); // públicas (callback OAuth, logout)

app.use("*", auth); // tudo abaixo exige sessão

app.get("/me", (c) => c.json(c.get("me")));
app.route("/runs", runs);
// Próximas fases: /iniciativas, /okrs, /docs, /kb, /repos, /console/agentes...

export default app.fetch;
export const config = { path: "/api/*" };
