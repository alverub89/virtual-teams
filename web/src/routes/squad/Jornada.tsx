import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post, streamChat, useMe } from "../../lib/api";
import { Button, Chip, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

interface Etapa {
  ordem: number;
  nome: string;
  status: string;
  artefato: { titulo: string; secoes: { h: string; itens: string[] }[] } | null;
  agente: { id: string; nome: string; emoji: string | null; papel: string } | null;
}
interface Jornada {
  id: string;
  codigo: string;
  titulo: string;
  descricao: string | null;
  status: string;
  etapaAtual: number;
  capacidade: { nome: string } | null;
  etapas: Etapa[];
  historias: { id: string; codigo: string; titulo: string; descricao: string | null; pontos: number | null; status: string; epico: string | null; criteriosAceite: string[]; origem?: string; sdd?: { docId: string; promptPronto: string } | null }[];
  docs: { id: string; titulo: string; emoji: string | null }[];
}
interface Msg {
  id?: string;
  autor: "user" | "agente";
  autorNome: string;
  conteudo: string;
}

export default function JornadaPage() {
  const { codigo } = useParams();
  const { data: me } = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const [sel, setSel] = useState<number | null>(null);

  const { data: ini } = useQuery<Jornada>({
    queryKey: ["iniciativa", codigo],
    queryFn: () => api(`/iniciativas/${codigo}`),
  });

  const etapaSel = sel ?? ini?.etapaAtual ?? 1;
  const etapa = ini?.etapas.find((e) => e.ordem === etapaSel);

  const concluir = useMutation({
    mutationFn: () => post<{ ok: boolean; docId?: string }>(`/iniciativas/${codigo}/etapas/${etapaSel}/concluir`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["iniciativa", codigo] });
      toast(`✅ Etapa ${etapa?.nome} concluída — 📄 documento gerado em Documentação`);
      setSel(null);
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const [gerandoSdd, setGerandoSdd] = useState<string | null>(null);
  const gerarSdd = useMutation({
    mutationFn: (hid: string) => post<{ docId: string }>(`/iniciativas/${codigo}/historias/${hid}/sdd`),
    onMutate: (hid) => setGerandoSdd(hid),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["iniciativa", codigo] }); toast("🧩 SDD gerado — pronto para desenvolver em outro agente"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
    onSettled: () => setGerandoSdd(null),
  });
  const copiarPrompt = async (txt: string) => { try { await navigator.clipboard.writeText(txt); toast("📋 Prompt copiado — cole no seu agente de código"); } catch { toast("⚠️ Não foi possível copiar"); } };

  if (!ini) return <p className="muted">Carregando jornada…</p>;

  return (
    <>
      <PageHead
        crumbs={
          <>
            <Link to="/squad/iniciativas">Iniciativas</Link> › {ini.codigo}
          </>
        }
        title={ini.titulo}
        description={ini.descricao ?? undefined}
        actions={
          <>
            {ini.capacidade && <Chip>{ini.capacidade.nome}</Chip>}
            {ini.status === "concluida" ? (
              <Chip tone="good">Concluída</Chip>
            ) : (
              <Chip tone="blue">Etapa {ini.etapaAtual} de 6</Chip>
            )}
          </>
        }
      />

      <div className="stepper">
        {ini.etapas.map((e) => (
          <button
            key={e.ordem}
            className={`step ${e.status === "concluida" ? "done" : ""} ${e.status === "em_andamento" ? "doing" : ""} ${e.ordem === etapaSel ? "sel" : ""}`}
            onClick={() => setSel(e.ordem)}
          >
            <span className="st-idx">{e.status === "concluida" ? "✓" : e.ordem}</span>
            <div className="st-label">{`${e.ordem} · ${e.nome}`}</div>
            <div className="st-meta">{e.agente ? `${e.agente.emoji ?? "🤖"} ${e.agente.nome}` : "—"}</div>
          </button>
        ))}
      </div>

      <div className="stage-wrap">
        <div className="stage-panel">
          {etapa?.artefato ? (
            <div className="artefact">
              <div className="a-head">
                📄 {etapa.artefato.titulo}
                <Chip tone="good">gerado na etapa</Chip>
              </div>
              <div className="a-body">
                {etapa.artefato.secoes.map((sec) => (
                  <div key={sec.h}>
                    <h4>{sec.h}</h4>
                    <ul>
                      {sec.itens.map((it) => (
                        <li key={it}>{it}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card card-pad">
              <h3>Etapa {etapa?.ordem} · {etapa?.nome}</h3>
              <p className="sub">
                {etapa?.status === "pendente"
                  ? "Etapa ainda não iniciada — conclua as anteriores."
                  : "Trabalhe com o agente no chat ao lado; o artefato da etapa aparece aqui."}
              </p>
            </div>
          )}

          {ini.historias.length > 0 && etapaSel >= 4 && (
            <>
              <div className="sec-title">Backlog · {ini.historias.length} histórias</div>
              {[...new Map(ini.historias.map((h) => [h.epico ?? "Geral", true])).keys()].map((epico) => (
                <div key={epico} style={{ marginBottom: 12 }}>
                  <div className="sub" style={{ fontSize: 12.5, fontWeight: 600, margin: "6px 0" }}>📦 {epico}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {ini.historias.filter((h) => (h.epico ?? "Geral") === epico).map((h) => (
                      <div className="card" key={h.id} style={{ padding: 12 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span className="s-id">{h.codigo}</span>
                          <strong style={{ flex: 1 }}>{h.titulo}</strong>
                          <Chip tone={h.status === "concluida" ? "good" : h.status === "em_dev" ? "blue" : "neutral"}>{h.status.replace("_", " ")}</Chip>
                          {h.pontos != null && <span className="pts">{h.pontos} pts</span>}
                        </div>
                        {h.descricao && <p className="sub" style={{ margin: "6px 0 0", fontSize: 12.5 }}>{h.descricao}</p>}
                        {h.criteriosAceite?.length > 0 && (
                          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12 }}>
                            {h.criteriosAceite.map((c, i) => <li key={i} className="sub">{c}</li>)}
                          </ul>
                        )}
                        {(me?.papel === "pm" || me?.papel === "tech_lead" || me?.papel === "dev") && (
                          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                            {h.sdd ? (
                              <>
                                <Link to={`/squad/docs/${h.sdd.docId}`} className="btn" style={{ fontSize: 12 }}>🧩 Ver SDD</Link>
                                <button className="btn" style={{ fontSize: 12 }} onClick={() => copiarPrompt(h.sdd!.promptPronto)}>📋 Copiar prompt</button>
                                <button className="btn" style={{ fontSize: 12 }} onClick={() => gerarSdd.mutate(h.id)} disabled={gerandoSdd === h.id}>{gerandoSdd === h.id ? "…" : "↻ Regerar"}</button>
                              </>
                            ) : (
                              <button className="btn primary" style={{ fontSize: 12 }} onClick={() => gerarSdd.mutate(h.id)} disabled={gerandoSdd === h.id}>{gerandoSdd === h.id ? "Gerando SDD…" : "🧩 Gerar SDD"}</button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

          {ini.docs.length > 0 && (
            <>
              <div className="sec-title">Documentos da iniciativa</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ini.docs.map((d) => (
                  <Link key={d.id} to={`/squad/docs/${d.id}`} className="pill" style={{ textDecoration: "none" }}>
                    {d.emoji ?? "📄"} {d.titulo}
                  </Link>
                ))}
              </div>
            </>
          )}

          {(me?.papel === "pm" || me?.papel === "tech_lead") && etapa?.status === "em_andamento" && (
            <div style={{ marginTop: 16 }}>
              <Button variant="primary" onClick={() => concluir.mutate()}>
                {concluir.isPending ? "Concluindo…" : `Concluir etapa ${etapa.ordem} e avançar`}
              </Button>
            </div>
          )}
        </div>

        <ChatEtapa codigo={ini.codigo} etapa={etapaSel} agente={etapa?.agente ?? null} bloqueado={etapa?.status === "pendente"} />
      </div>
    </>
  );
}

function ChatEtapa({
  codigo,
  etapa,
  agente,
  bloqueado,
}: {
  codigo: string;
  etapa: number;
  agente: { nome: string; emoji: string | null; papel: string } | null;
  bloqueado?: boolean;
}) {
  const { data: me } = useMe();
  const [texto, setTexto] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: msgs } = useQuery<Msg[]>({
    queryKey: ["chat", codigo, etapa],
    queryFn: () => api(`/iniciativas/${codigo}/mensagens?etapa=${etapa}`),
  });

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [msgs, streaming]);

  const enviar = async () => {
    const mensagem = texto.trim();
    if (!mensagem || streaming !== null) return;
    setTexto("");
    qc.setQueryData<Msg[]>(["chat", codigo, etapa], (old) => [
      ...(old ?? []),
      { autor: "user", autorNome: me?.nome ?? "Você", conteudo: mensagem },
    ]);
    setStreaming("");
    try {
      let acc = "";
      await streamChat(codigo, etapa, mensagem, (delta) => {
        acc += delta;
        setStreaming(acc);
      });
    } finally {
      setStreaming(null);
      qc.invalidateQueries({ queryKey: ["chat", codigo, etapa] });
    }
  };

  return (
    <div className="card chat">
      <div className="chat-head">
        <span className="avatar" style={{ background: "var(--accent)" }}>
          {agente?.emoji ?? "🤖"}
        </span>
        <div className="info">
          <b>{agente?.nome ?? "Agente da etapa"}</b>
          <span>{agente?.papel ?? ""}</span>
        </div>
        <Chip tone="good">online</Chip>
      </div>
      <div className="chat-body" ref={bodyRef}>
        {msgs?.map((m, i) => (
          <div key={m.id ?? i} className={`msg ${m.autor === "user" ? "user" : ""}`}>
            {m.autor !== "user" && (
              <span className="avatar" style={{ background: "var(--accent-deep)" }}>
                {agente?.emoji ?? "🤖"}
              </span>
            )}
            <div className="bubble">
              <b className="who">{m.autorNome}</b>
              {m.conteudo}
            </div>
          </div>
        ))}
        {streaming !== null && (
          <div className="msg">
            <span className="avatar" style={{ background: "var(--accent-deep)" }}>
              {agente?.emoji ?? "🤖"}
            </span>
            <div className="bubble">
              <b className="who">{agente?.nome}</b>
              {streaming || (
                <span className="typing">
                  <i /><i /><i />
                </span>
              )}
            </div>
          </div>
        )}
        {msgs?.length === 0 && streaming === null && (
          <p className="empty-note">
            {bloqueado ? "Etapa ainda não iniciada." : `Converse com o ${agente?.nome ?? "agente"} sobre esta etapa.`}
          </p>
        )}
      </div>
      <div className="chat-input">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          placeholder={bloqueado ? "Etapa não iniciada" : "Escreva para o agente…"}
          disabled={bloqueado || streaming !== null}
        />
        <button className="btn primary" onClick={enviar} disabled={bloqueado || streaming !== null}>
          ➤
        </button>
      </div>
    </div>
  );
}
