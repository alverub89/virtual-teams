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
  etapaNome: string | null;
  etapasTotal: number;
  capacidadeNome: string | null;
}
interface Metodo { id: string; nome: string; descricao: string | null; escopo: string; etapas: { nome: string; agenteNome: string | null; tipo: string }[] }

export default function Iniciativas() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const [novaAberta, setNovaAberta] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [capacidadeId, setCapacidadeId] = useState("");
  const [modelo, setModelo] = useState("ativo"); // "ativo" | "livre" | <metodoId>

  const { data: inis, isLoading } = useQuery<Iniciativa[]>({
    queryKey: ["iniciativas"],
    queryFn: () => api("/iniciativas"),
  });
  const { data: caps } = useQuery<{ capacidades: { id: string; nome: string }[] }>({
    queryKey: ["capacidades"],
    queryFn: () => api("/capacidades"),
  });
  const { data: metodos } = useQuery<Metodo[]>({ queryKey: ["iniciativa-metodos"], queryFn: () => api("/iniciativas/metodos") });
  const metodoSel = metodos?.find((m) => m.id === modelo);

  const criar = useMutation({
    mutationFn: () =>
      post<Iniciativa>("/iniciativas", {
        titulo,
        descricao: descricao || undefined,
        capacidadeId: capacidadeId || undefined,
        livre: modelo === "livre" ? true : undefined,
        metodoId: modelo !== "livre" && modelo !== "ativo" ? modelo : undefined,
      }),
    onSuccess: (ini) => {
      qc.invalidateQueries({ queryKey: ["iniciativas"] });
      setNovaAberta(false);
      toast(`✨ ${ini.codigo} criada — ${modelo === "livre" ? "a Analista te espera na Descoberta" : "o agente da primeira etapa te espera"}`);
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
                <Chip tone="blue">{`Etapa ${ini.etapaAtual}${ini.etapasTotal ? `/${ini.etapasTotal}` : ""} · ${ini.etapaNome ?? ""}`}</Chip>
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
          subtitle="Escolha o modelo de trabalho — um método com etapas, ou um modelo livre que começa com a Analista."
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
          <Fld label="Modelo de trabalho">
            <select className="in" value={modelo} onChange={(e) => setModelo(e.target.value)}>
              <option value="ativo">Método padrão (ativo)</option>
              {metodos?.map((m) => (
                <option key={m.id} value={m.id}>{m.nome} · {m.etapas.length} etapa(s){m.escopo === "comunidade" ? " · comunidade" : ""}</option>
              ))}
              <option value="livre">✨ Modelo livre — começa com a Analista</option>
            </select>
          </Fld>
          {modelo === "livre" ? (
            <p className="sub" style={{ marginTop: -4, marginBottom: 10, fontSize: 12.5 }}>Abre uma única etapa de Descoberta com o Agente Analista; você conduz livremente e conclui quando quiser.</p>
          ) : metodoSel ? (
            <p className="sub" style={{ marginTop: -4, marginBottom: 10, fontSize: 12.5 }}>Etapas: {metodoSel.etapas.map((e) => e.nome).join(" → ")}</p>
          ) : null}
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
