import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post } from "../../lib/api";
import { Button, Chip, Fld, Modal, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

interface Cap {
  id: string;
  nome: string;
  sigla: string | null;
  descricao: string | null;
  iniciativas: number;
  repositorios: { id: string; nome: string; linguagem: string | null }[];
}

export default function Capacidades() {
  const toast = useToast();
  const qc = useQueryClient();
  const [conectando, setConectando] = useState(false);
  const [nome, setNome] = useState("");
  const [linguagem, setLinguagem] = useState("");
  const [capacidadeId, setCapacidadeId] = useState("");

  const { data } = useQuery<{ capacidades: Cap[]; repositorios: unknown[] }>({
    queryKey: ["capacidades"],
    queryFn: () => api("/capacidades"),
  });

  const conectar = useMutation({
    mutationFn: () =>
      post("/capacidades/repos/conectar", {
        nome,
        linguagem: linguagem || undefined,
        capacidadeId: capacidadeId || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["capacidades"] });
      setConectando(false);
      setNome("");
      toast("🐙 Repositório conectado");
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  return (
    <>
      <PageHead
        title="Capacidades"
        description="O que a squad sabe fazer, com os repositórios GitHub que implementam cada capacidade — é o mapa que os agentes usam."
        actions={
          <Button variant="primary" onClick={() => setConectando(true)}>
            🐙 Conectar repositório
          </Button>
        }
      />
      <div className="grid g2">
        {data?.capacidades.map((cap) => (
          <div key={cap.id} className="card card-pad">
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <h3 style={{ flex: 1 }}>{cap.nome}</h3>
              {cap.sigla && <span className="sigla">{cap.sigla}</span>}
            </div>
            <p className="sub">{cap.descricao}</p>
            <div style={{ marginTop: 8 }}>
              {cap.repositorios.map((r) => (
                <span key={r.id} className="tag-repo" title={r.linguagem ?? ""}>
                  🐙 {r.nome.split("/")[1] ?? r.nome}
                </span>
              ))}
              {cap.repositorios.length === 0 && <span className="empty-note">sem repositório conectado</span>}
            </div>
            <div className="cap-stats">
              <span><b>{cap.repositorios.length}</b> repositório(s)</span>
              <span><b>{cap.iniciativas}</b> iniciativa(s)</span>
            </div>
          </div>
        ))}
      </div>

      {conectando && (
        <Modal
          title="Conectar repositório do GitHub"
          subtitle="Com a GitHub App instalada, o repositório fica disponível para os agentes (somente leitura por padrão)."
          onClose={() => setConectando(false)}
          foot={
            <>
              <Button onClick={() => setConectando(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => nome.length >= 3 && conectar.mutate()}>
                {conectar.isPending ? "Conectando…" : "Conectar"}
              </Button>
            </>
          }
        >
          <Fld label="Repositório (org/nome)">
            <input className="in" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="itau-mp/novo-servico" />
          </Fld>
          <div className="fld-row">
            <Fld label="Linguagem">
              <input className="in" value={linguagem} onChange={(e) => setLinguagem(e.target.value)} placeholder="Java" />
            </Fld>
            <Fld label="Capacidade">
              <select className="in" value={capacidadeId} onChange={(e) => setCapacidadeId(e.target.value)}>
                <option value="">— nenhuma —</option>
                {data?.capacidades.map((cp) => (
                  <option key={cp.id} value={cp.id}>{cp.nome}</option>
                ))}
              </select>
            </Fld>
          </div>
        </Modal>
      )}
    </>
  );
}
