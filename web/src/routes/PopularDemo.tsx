import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { post } from "../lib/api";
import { Button, Card } from "../components/ui";

interface SeedResp { ok: boolean; counts: Record<string, number> }

// Página utilitária de demonstração: popula a squad e entra como tech lead.
// Reachable em /popular-demo (funciona para qualquer papel logado).
export default function PopularDemo() {
  const [msg, setMsg] = useState<string>("");

  const popular = useMutation({
    mutationFn: () => post<SeedResp>("/console/seed-demo"),
    onSuccess: (r) => {
      setMsg(`Pronto! ${r.counts.membros} membros · ${r.counts.iniciativas} iniciativas · ${r.counts.okrs} OKRs · ${r.counts.runs} run · ${r.counts.docs} docs. Redirecionando…`);
      setTimeout(() => { window.location.href = "/squad/iniciativas"; }, 1200);
    },
    onError: (e) => setMsg(`Erro: ${(e as Error).message}`),
  });

  const voltar = useMutation({
    mutationFn: () => post("/console/voltar-cto"),
    onSuccess: () => { window.location.href = "/console"; },
    onError: (e) => setMsg(`Erro: ${(e as Error).message}`),
  });

  return (
    <div style={{ maxWidth: 640, margin: "60px auto", padding: 20 }}>
      <Card pad>
        <h2>Popular squad de demonstração</h2>
        <p className="sub" style={{ marginTop: 8, lineHeight: 1.7 }}>
          Cria o time (PM, tech lead, 3 devs, gestor), popula a <b>Squad Pix Cobrança</b> inteira
          (iniciativas, histórias, OKRs, esteira, GMUD, execução autônoma, docs e KB) e já te coloca
          como <b>tech lead</b> — sem precisar deslogar. Roda no banco que o app usa.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <Button variant="primary" onClick={() => popular.mutate()}>
            {popular.isPending ? "Populando…" : "🚀 Popular e entrar como Tech Lead"}
          </Button>
          <Button onClick={() => voltar.mutate()}>Voltar a ser CTO</Button>
        </div>
        {msg && <div className="prompt-box" style={{ marginTop: 14 }}>{msg}</div>}
        <p className="sub" style={{ marginTop: 16, fontSize: 12 }}>
          Login dos demais papéis para demonstrar cada visão — senha <code>Demo@2026</code>:<br />
          ana.souza · bruno.lima · carla.nunes · diego.alves · eduardo.ramos <b>@itau-demo.com</b>
        </p>
      </Card>
    </div>
  );
}
