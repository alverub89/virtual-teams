import { type ReactNode, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post } from "../../lib/api";
import { Button, Card, Chip, EstadoErro, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

interface Tool { id: string; nome: string; descricao: string | null; permissao: string; execucao: string; squadNome: string | null; solicitante: string | null; submetidoEm: string | null; temSchema: boolean; agentesConsumidores: string[] }
interface Mcp { id: string; nome: string; sistema: string; descricao: string | null; url: string | null; squadNome: string | null; solicitante: string | null; submetidoEm: string | null }
interface Fila { tools: Tool[]; mcps: Mcp[] }

// Metadados de auditoria mostrados antes de aprovar (quem/quando/impacto).
function quando(iso: string | null): string {
  if (!iso) return "—";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const d = new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return dias <= 0 ? `hoje (${d})` : dias === 1 ? `ontem (${d})` : `há ${dias} dias (${d})`;
}
function AuditMeta({ solicitante, submetidoEm, extra }: { solicitante: string | null; submetidoEm: string | null; extra?: ReactNode }) {
  return (
    <div style={{ fontSize: 12, color: "var(--ink-3)", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", margin: "8px 0" }}>
      <div>👤 Solicitado por <b>{solicitante ?? "—"}</b> · 🕒 na fila {quando(submetidoEm)}</div>
      {extra}
    </div>
  );
}

export default function Aprovacoes() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data, error, isLoading } = useQuery<Fila>({ queryKey: ["aprovacoes"], queryFn: () => api("/console/aprovacoes") });
  const [escopo, setEscopo] = useState<Record<string, string>>({});

  const invalidar = () => { qc.invalidateQueries({ queryKey: ["aprovacoes"] }); qc.invalidateQueries({ queryKey: ["mcps"] }); qc.invalidateQueries({ queryKey: ["tools"] }); };

  const decidirTool = useMutation({
    mutationFn: (v: { id: string; decisao: string; motivo?: string }) => post(`/console/aprovacoes/tool/${v.id}`, { decisao: v.decisao, motivo: v.motivo }),
    onSuccess: () => { invalidar(); toast("✅ Decisão registrada"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });
  const decidirMcp = useMutation({
    mutationFn: (v: { id: string; decisao: string; motivo?: string; escopo?: string }) => post(`/console/aprovacoes/mcp/${v.id}`, { decisao: v.decisao, motivo: v.motivo, escopo: v.escopo }),
    onSuccess: () => { invalidar(); toast("✅ Decisão registrada"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const rejeitar = (fn: any, id: string, extra?: any) => {
    const motivo = prompt("Motivo da rejeição (a squad verá):") ?? "";
    if (motivo === null) return;
    fn.mutate({ id, decisao: "rejeitar", motivo, ...extra });
  };

  if (error) return <><PageHead title="Aprovações" description="Tools e MCPs publicados pelas squads, aguardando o CTO." /><EstadoErro error={error} /></>;
  if (isLoading || !data) return <p className="muted">Carregando…</p>;
  const vazio = data.tools.length === 0 && data.mcps.length === 0;

  return (
    <>
      <PageHead title="Aprovações" description="Tools e MCPs que as squads publicaram, aguardando sua decisão. Aprovar torna o item ativo; ao aprovar um MCP você define a abrangência." />
      {vazio && <Card pad><p className="empty-note">Nenhum item aguardando aprovação. 🎉</p></Card>}

      {data.tools.length > 0 && <div className="sec-title">Tools ({data.tools.length})</div>}
      <div className="grid g2">
        {data.tools.map((t) => (
          <Card key={t.id} pad>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ flex: 1 }}>{t.nome}</h3>
              <Chip tone={t.execucao === "http" ? "blue" : "neutral"}>{t.execucao === "http" ? "HTTP" : "IA"}</Chip>
              <span className={`perm ${t.permissao}`}>{t.permissao}</span>
            </div>
            <p className="sub">{t.descricao}</p>
            <p className="sub" style={{ marginTop: 4 }}>Squad: <b>{t.squadNome ?? "—"}</b></p>
            <AuditMeta
              solicitante={t.solicitante}
              submetidoEm={t.submetidoEm}
              extra={
                <div style={{ marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span>{t.temSchema ? "✅ schema definido" : "⚠️ sem schema validável"}</span>
                  <span>🔌 consumida por {t.agentesConsumidores.length === 0 ? "nenhum agente ainda" : t.agentesConsumidores.join(", ")}</span>
                </div>
              }
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Button variant="primary" onClick={() => decidirTool.mutate({ id: t.id, decisao: "aprovar" })}>Aprovar</Button>
              <Button onClick={() => rejeitar(decidirTool, t.id)}>Rejeitar</Button>
            </div>
          </Card>
        ))}
      </div>

      {data.mcps.length > 0 && <div className="sec-title" style={{ marginTop: 16 }}>MCPs ({data.mcps.length})</div>}
      <div className="grid g2">
        {data.mcps.map((m) => (
          <Card key={m.id} pad>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ flex: 1 }}>{m.nome}</h3>
              <Chip tone="neutral">{m.sistema}</Chip>
            </div>
            <p className="sub">{m.descricao}</p>
            {m.url && <div className="prompt-box" style={{ marginTop: 6, fontSize: 11 }}>{m.url}</div>}
            <p className="sub" style={{ marginTop: 4 }}>Squad: <b>{m.squadNome ?? "—"}</b></p>
            <AuditMeta solicitante={m.solicitante} submetidoEm={m.submetidoEm} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
              <select className="in" style={{ maxWidth: 180 }} value={escopo[m.id] ?? "squad"} onChange={(e) => setEscopo({ ...escopo, [m.id]: e.target.value })}>
                <option value="squad">Aprovar só p/ a squad</option>
                <option value="global">Aprovar p/ toda a comunidade</option>
              </select>
              <Button variant="primary" onClick={() => decidirMcp.mutate({ id: m.id, decisao: "aprovar", escopo: escopo[m.id] ?? "squad" })}>Aprovar</Button>
              <Button onClick={() => rejeitar(decidirMcp, m.id)}>Rejeitar</Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
