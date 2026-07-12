import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post, useMe } from "../../lib/api";
import { Button, Chip, Fld, Modal, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

interface Iniciativa {
  id: string;
  codigo: string;
  titulo: string;
  descricao: string | null;
  status: string;
  etapaAtual: number;
  capacidadeNome: string | null;
}

const ETAPAS = ["Brief", "PRD", "Arquitetura", "Histórias", "Desenvolvimento", "Esteira & GMUD"];

export default function Iniciativas() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const [novaAberta, setNovaAberta] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [capacidadeId, setCapacidadeId] = useState("");

  const { data: inis, isLoading } = useQuery<Iniciativa[]>({
    queryKey: ["iniciativas"],
    queryFn: () => api("/iniciativas"),
  });
  const { data: caps } = useQuery<{ capacidades: { id: string; nome: string }[] }>({
    queryKey: ["capacidades"],
    queryFn: () => api("/capacidades"),
  });

  const criar = useMutation({
    mutationFn: () =>
      post<Iniciativa>("/iniciativas", {
        titulo,
        descricao: descricao || undefined,
        capacidadeId: capacidadeId || undefined,
      }),
    onSuccess: (ini) => {
      qc.invalidateQueries({ queryKey: ["iniciativas"] });
      setNovaAberta(false);
      toast(`✨ ${ini.codigo} criada — o Agente Analista te espera no Brief`);
      navigate(`/squad/iniciativas/${ini.codigo}`);
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  return (
    <>
      <PageHead
        title="Iniciativas da squad"
        description="Features em andamento e sua jornada — do brief à GMUD, com um agente em cada etapa."
        actions={
          (me?.papel === "pm" || me?.papel === "tech_lead") && (
            <Button variant="primary" onClick={() => setNovaAberta(true)}>
              + Nova iniciativa
            </Button>
          )
        }
      />
      {isLoading && <p className="muted">Carregando…</p>}
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {inis?.map((ini) => (
          <div
            key={ini.id}
            className="card card-pad"
            style={{ cursor: "pointer" }}
            onClick={() => navigate(`/squad/iniciativas/${ini.codigo}`)}
          >
            <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
              <span className="mono muted">{ini.codigo}</span>
              {ini.status === "concluida" ? (
                <Chip tone="good">Concluída</Chip>
              ) : (
                <Chip tone="blue">{`Etapa ${ini.etapaAtual} · ${ETAPAS[ini.etapaAtual - 1]}`}</Chip>
              )}
              {ini.capacidadeNome && <Chip>{ini.capacidadeNome}</Chip>}
            </div>
            <h3 style={{ marginTop: 8 }}>{ini.titulo}</h3>
            <p className="sub">{ini.descricao}</p>
          </div>
        ))}
      </div>
      {inis?.length === 0 && <p className="empty-note">Nenhuma iniciativa ainda — crie a primeira.</p>}

      {novaAberta && (
        <Modal
          title="Nova iniciativa"
          subtitle="Nasce de uma capacidade da squad e entra na jornada do método ativo."
          onClose={() => setNovaAberta(false)}
          foot={
            <>
              <Button onClick={() => setNovaAberta(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => titulo.length >= 4 && criar.mutate()}>
                {criar.isPending ? "Criando…" : "Criar e iniciar jornada"}
              </Button>
            </>
          }
        >
          <Fld label="Título">
            <input className="in" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Configuração de regras de split por parceiro" />
          </Fld>
          <Fld label="Capacidade">
            <select className="in" value={capacidadeId} onChange={(e) => setCapacidadeId(e.target.value)}>
              <option value="">— selecionar —</option>
              {caps?.capacidades.map((cp) => (
                <option key={cp.id} value={cp.id}>{cp.nome}</option>
              ))}
            </select>
          </Fld>
          <Fld label="Descrição">
            <textarea className="in" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Problema, público e resultado esperado" />
          </Fld>
        </Modal>
      )}
    </>
  );
}
