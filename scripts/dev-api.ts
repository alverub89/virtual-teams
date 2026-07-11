import { serve } from "@hono/node-server";

// Servidor local da API — mesmo app Hono das Netlify Functions, servido em
// :8888 para o proxy do Vite. Em produção quem serve é a Netlify.
process.env.AIW_DEV ??= "1";

const { app } = await import("../netlify/functions/api");

serve({ fetch: app.fetch, port: 8888 }, (info) => {
  console.log(`[api] http://localhost:${info.port}/api/health (modo ${process.env.DATABASE_URL ? "Neon" : "demo/PGlite"})`);
});
