import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post } from "../../lib/api";
import { Button, Card, Chip, Fld, Modal, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

interface Squad { id: string; nome: string; pessoas: number }
interface RT { id: string; nome: string; squads: Squad[] }
interface Com { id: string; nome: string; releaseTrains: RT[] }

type Alvo = { tipo: "comunidade" } | { tipo: "rt"; comunidadeId: string } | { tipo: "squad"; releaseTrainId: string };

export default function Estrutura() {
  const toast = useToast();
  const qc = useQueryClient();
  const [modal, setModal] = useState<Alvo | null>(null);
  const [nome, setNome] = useState("");

  const { data: coms } = useQuery<Com[]>({ queryKey: ["estrutura"], queryFn: () => api("/console/estrutura") });

  const criar = useMutation({
    mutationFn: () => {
      if (!modal) throw new Error();
      if (modal.tipo === "comunidade") return post("/console/comunidades", { nome });
      if (modal.tipo === "rt") return post("/console/release-trains", { comunidadeId: modal.comunidadeId, nome });
      return post("/console/squads", { releaseTrainId: modal.releaseTrainId, nome });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estrutura"] });
      qc.invalidateQueries({ queryKey: ["console-setup"] });
      setModal(null);
      setNome("");
      toast("✅ Criado");
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const abrir = (a: Alvo) => { setNome(""); setModal(a); };
  const titulo = modal?.tipo === "comunidade" ? "Nova comunidade" : modal?.tipo === "rt" ? "Novo release train" : "Nova squad";

  return (
    <>
      <PageHead
        title="Estrutura"
        description="Cadastre e organize comunidades, release trains e squads. O CTO pode criar qualquer estrutura da diretoria, não só a sua."
        actions={<Button variant="primary" onClick={() => abrir({ tipo: "comunidade" })}>+ Nova comunidade</Button>}
      />

      {coms?.length === 0 && <p className="empty-note">Nenhuma comunidade ainda — crie a primeira.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {coms?.map((com) => (
          <Card key={com.id} pad>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="icon-sq">🏢</span>
              <h3 style={{ flex: 1 }}>{com.nome}</h3>
              <Button onClick={() => abrir({ tipo: "rt", comunidadeId: com.id })}>+ Release train</Button>
            </div>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {com.releaseTrains.map((rt) => (
                <div key={rt.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span>🚆</span>
                    <b style={{ flex: 1 }}>{rt.nome}</b>
                    <Button onClick={() => abrir({ tipo: "squad", releaseTrainId: rt.id })}>+ Squad</Button>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {rt.squads.map((sq) => (
                      <Chip key={sq.id}>{sq.nome} · {sq.pessoas}👤</Chip>
                    ))}
                    {rt.squads.length === 0 && <span className="empty-note">sem squads</span>}
                  </div>
                </div>
              ))}
              {com.releaseTrains.length === 0 && <span className="empty-note">sem release trains</span>}
            </div>
          </Card>
        ))}
      </div>

      {modal && (
        <Modal
          title={titulo}
          onClose={() => setModal(null)}
          foot={
            <>
              <Button onClick={() => setModal(null)}>Cancelar</Button>
              <Button variant="primary" onClick={() => nome.length >= 2 && criar.mutate()}>
                {criar.isPending ? "Criando…" : "Criar"}
              </Button>
            </>
          }
        >
          <Fld label="Nome">
            <input className="in" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && nome.length >= 2 && criar.mutate()} />
          </Fld>
        </Modal>
      )}
    </>
  );
}
