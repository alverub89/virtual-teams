import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, del, post, put } from "../../lib/api";
import { Button, Card, Chip, Fld, Modal, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

interface Skill { id: string; nome: string; emoji: string | null; descricao: string | null; instrucoes: string; agentes: number }

export default function Skills() {
  const toast = useToast();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Skill | "novo" | null>(null);
  const [nome, setNome] = useState("");
  const [emoji, setEmoji] = useState("✨");
  const [descricao, setDescricao] = useState("");
  const [instrucoes, setInstrucoes] = useState("");

  const { data: skills } = useQuery<Skill[]>({ queryKey: ["skills"], queryFn: () => api("/console/skills") });

  const abrir = (sk: Skill | "novo") => {
    setEdit(sk);
    setNome(sk === "novo" ? "" : sk.nome);
    setEmoji(sk === "novo" ? "✨" : sk.emoji ?? "✨");
    setDescricao(sk === "novo" ? "" : sk.descricao ?? "");
    setInstrucoes(sk === "novo" ? "" : sk.instrucoes);
  };

  const salvar = useMutation({
    mutationFn: () => {
      const body = { nome, emoji, descricao, instrucoes };
      return edit === "novo" ? post("/console/skills", body) : put(`/console/skills/${(edit as Skill).id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["agentes"] });
      setEdit(null);
      toast("✨ Skill salva");
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const remover = useMutation({
    mutationFn: (id: string) => del(`/console/skills/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["skills"] }); toast("🗑️ Skill removida"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  return (
    <>
      <PageHead
        title="Skills"
        description="As habilidades que os agentes usam. Edite as instruções, crie novas ou remova — vale para todo o catálogo."
        actions={<Button variant="primary" onClick={() => abrir("novo")}>+ Nova skill</Button>}
      />
      <div className="grid g2">
        {skills?.map((sk) => (
          <Card key={sk.id} pad>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="ac-av">{sk.emoji ?? "✨"}</span>
              <div style={{ flex: 1 }}>
                <h3>{sk.nome}</h3>
                <div className="ac-role">{sk.descricao}</div>
              </div>
              <Chip>{sk.agentes} agente(s)</Chip>
            </div>
            <div className="prompt-box" style={{ marginTop: 10, maxHeight: 96, overflow: "hidden" }}>{sk.instrucoes}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Button onClick={() => abrir(sk)}>Editar</Button>
              <Button onClick={() => confirm(`Remover a skill "${sk.nome}"?`) && remover.mutate(sk.id)}>Remover</Button>
            </div>
          </Card>
        ))}
      </div>

      {edit && (
        <Modal
          title={edit === "novo" ? "Nova skill" : "Editar skill"}
          onClose={() => setEdit(null)}
          foot={
            <>
              <Button onClick={() => setEdit(null)}>Cancelar</Button>
              <Button variant="primary" onClick={() => nome.length >= 2 && instrucoes.length >= 5 && salvar.mutate()}>
                {salvar.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </>
          }
        >
          <div className="fld-row">
            <Fld label="Nome"><input className="in" value={nome} onChange={(e) => setNome(e.target.value)} /></Fld>
            <Fld label="Emoji"><input className="in" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} /></Fld>
          </div>
          <Fld label="Descrição curta"><input className="in" value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Fld>
          <Fld label="Instruções (o que o agente faz com esta skill)">
            <textarea className="in" rows={6} value={instrucoes} onChange={(e) => setInstrucoes(e.target.value)} />
          </Fld>
        </Modal>
      )}
    </>
  );
}
