import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "../../../db/client";

// Endpoint MCP vivo — servidor Model Context Protocol hospedado pela plataforma.
// Público por slug: /api/mcp/:slug (JSON-RPC 2.0). Cada MCP registrado no console
// que foi "gerado com IA" ganha um slug e passa a responder aqui, expondo suas
// tools (tools/list) e executando-as de verdade (tools/call — HTTP real ou IA).
const app = new Hono();

const PROTOCOL = "2024-11-05";

const rpcOk = (id: any, result: any) => ({ jsonrpc: "2.0", id, result });
const rpcErr = (id: any, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function carregar(slug: string) {
  const db = await getDb();
  const [m] = await db.select().from(s.conexaoMcp).where(eq(s.conexaoMcp.slug, slug));
  if (!m) return null;
  const tools = (await db.select().from(s.tool)).filter((t: any) => t.conexaoMcpId === m.id);
  return { mcp: m, tools };
}

// Descoberta simples (GET) — útil para checar se o endpoint está no ar.
app.get("/:slug", async (c) => {
  const found = await carregar(c.req.param("slug"));
  if (!found) return c.json({ error: "MCP não encontrado" }, 404);
  return c.json({
    name: found.mcp.nome,
    protocol: PROTOCOL,
    proposito: found.mcp.proposito,
    tools: found.tools.map((t: any) => t.nome),
    transport: "json-rpc over HTTP POST",
  });
});

app.post("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const found = await carregar(slug);
  let msg: any;
  try {
    msg = await c.req.json();
  } catch {
    return c.json(rpcErr(null, -32700, "parse error"), 200);
  }
  const { id = null, method, params } = msg ?? {};
  if (!found) return c.json(rpcErr(id, -32601, `MCP "${slug}" não encontrado`), 200);
  const { mcp, tools } = found;

  if (method === "initialize") {
    return c.json(
      rpcOk(id, {
        protocolVersion: PROTOCOL,
        serverInfo: { name: mcp.nome, version: "1.0.0" },
        capabilities: { tools: {} },
        instructions: mcp.proposito ?? mcp.descricao ?? undefined,
      })
    );
  }

  if (method === "notifications/initialized" || method === "ping") {
    return c.json(rpcOk(id, {}));
  }

  if (method === "tools/list") {
    return c.json(
      rpcOk(id, {
        tools: tools.map((t: any) => ({
          name: t.nome,
          description: t.descricao ?? "",
          inputSchema: t.inputSchema ?? { type: "object", properties: {} },
        })),
      })
    );
  }

  if (method === "tools/call") {
    const nome = params?.name;
    const args = (params?.arguments ?? {}) as Record<string, unknown>;
    const tool = tools.find((t: any) => t.nome === nome);
    if (!tool) return c.json(rpcErr(id, -32602, `tool "${nome}" não existe neste MCP`), 200);
    const { executarTool } = await import("../_lib/aigen");
    const r = await executarTool(tool, args);
    return c.json(
      rpcOk(id, {
        isError: !r.ok,
        content: [
          {
            type: "text",
            text: r.ok ? (typeof r.resultado === "string" ? r.resultado : JSON.stringify(r.resultado, null, 2)) : `Erro: ${r.erro}`,
          },
        ],
      })
    );
  }

  return c.json(rpcErr(id, -32601, `método "${method}" não suportado`), 200);
});

export default app;
