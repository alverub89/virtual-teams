import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Card, Chip, EstadoErro, PageHead } from "../../components/ui";

interface Linha {
  id: string;
  pessoaNome: string | null;
  acao: string;
  alvo: string | null;
  familia: string;
  detalhe: Record<string, unknown> | null;
  criadoEm: string;
}
interface Trilha { total: number; linhas: Linha[] }

const TONE: Record<string, "good" | "blue" | "warn" | "crit" | "neutral"> = {
  método: "blue",
  "agente/config": "neutral",
  orquestração: "good",
  orçamento: "warn",
  decisões: "crit",
  outros: "neutral",
};

const quando = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export default function Auditoria() {
  const [q, setQ] = useState("");
  const [fam, setFam] = useState<string | null>(null);
  const { data, error, isLoading } = useQuery<Trilha>({
    queryKey: ["auditoria"],
    queryFn: () => api("/console/auditoria?limit=300"),
  });

  const familias = useMemo(() => {
    const m = new Map<string, number>();
    (data?.linhas ?? []).forEach((l) => m.set(l.familia, (m.get(l.familia) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const linhas = (data?.linhas ?? []).filter((l) => {
    if (fam && l.familia !== fam) return false;
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return [l.acao, l.alvo, l.pessoaNome].filter(Boolean).some((v) => (v as string).toLowerCase().includes(t));
  });

  if (error) return <><PageHead title="Trilha de auditoria" description="Quem fez o quê e quando." /><EstadoErro error={error} /></>;

  return (
    <>
      <PageHead
        title="Trilha de auditoria"
        description="Cada mudança na plataforma — método, agentes, orçamentos, orquestração e decisões — registrada com autor e horário. Versionamento do que muda e de quem aprovou."
      />

      <Card pad>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <input className="in" style={{ maxWidth: 260 }} placeholder="Buscar ação, alvo ou pessoa…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className={`chip-btn ${!fam ? "on" : ""}`} onClick={() => setFam(null)}>Tudo</button>
            {familias.map(([f, n]) => (
              <button key={f} className={`chip-btn ${fam === f ? "on" : ""}`} onClick={() => setFam(fam === f ? null : f)}>{f} ({n})</button>
            ))}
          </div>
          <div className="spacer" style={{ flex: 1 }} />
          {data && <span className="sub">{linhas.length} de {data.total} eventos</span>}
        </div>

        {isLoading && <p className="muted">Carregando…</p>}
        {data && data.total === 0 && <p className="empty-note">Ainda sem eventos registrados.</p>}

        <table className="tbl">
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td style={{ whiteSpace: "nowrap", color: "var(--ink-3)", fontSize: 12 }}>{quando(l.criadoEm)}</td>
                <td><Chip tone={TONE[l.familia] ?? "neutral"}>{l.familia}</Chip></td>
                <td className="mono" style={{ fontSize: 12 }}>{l.acao}</td>
                <td style={{ fontSize: 12.5 }}>{l.alvo ?? "—"}</td>
                <td style={{ fontSize: 12.5, fontWeight: 600 }}>{l.pessoaNome ?? "—"}</td>
                <td style={{ fontSize: 11.5, color: "var(--ink-3)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {l.detalhe ? JSON.stringify(l.detalhe) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
