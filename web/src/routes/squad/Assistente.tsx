import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, streamAssistente } from "../../lib/api";
import { Button, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

interface Agente { id: string; nome: string; papel: string; emoji: string | null; personalidade: string }
interface Msg { role: "user" | "assistant"; content: string }

const SUGESTOES = [
  "Como eu quebro esta feature em histórias INVEST?",
  "Quais riscos de arquitetura devo considerar para PIX Automático?",
  "Me ajude a escrever um brief de descoberta.",
  "O que revisar antes de abrir uma GMUD?",
];

export default function Assistente() {
  const toast = useToast();
  const { data: agentes } = useQuery<Agente[]>({ queryKey: ["assistente-agentes"], queryFn: () => api("/assistente/agentes") });
  const [agenteId, setAgenteId] = useState<string>("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  const agente = agentes?.find((a) => a.id === agenteId) ?? agentes?.[0];

  const enviar = async (texto: string) => {
    const msg = texto.trim();
    if (!msg || streaming) return;
    const historico = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: msg }, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    try {
      await streamAssistente(agente?.id, msg, historico, (delta) => {
        setMsgs((m) => {
          const copia = [...m];
          copia[copia.length - 1] = { role: "assistant", content: copia[copia.length - 1].content + delta };
          return copia;
        });
        fimRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    } catch (e) {
      toast(`⚠️ ${(e as Error).message}`);
      setMsgs((m) => m.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  };

  return (
    <>
      <PageHead
        title="Assistente"
        description="Converse com um agente para tirar uma dúvida ou explorar uma ideia. É um espaço livre — nada é executado aqui."
        actions={
          <select className="in" style={{ maxWidth: 240 }} value={agente?.id ?? ""} onChange={(e) => { setAgenteId(e.target.value); setMsgs([]); }}>
            {agentes?.map((a) => <option key={a.id} value={a.id}>{a.emoji ?? "🤖"} {a.nome}</option>)}
          </select>
        }
      />

      <div className="card" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 220px)", minHeight: 420 }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {msgs.length === 0 && (
            <div style={{ maxWidth: 620, margin: "24px auto", textAlign: "center" }}>
              <div style={{ fontSize: 40 }}>{agente?.emoji ?? "🤖"}</div>
              <h3 style={{ marginTop: 8 }}>{agente?.nome ?? "Assistente"}</h3>
              <p className="sub" style={{ marginBottom: 16 }}>{agente?.personalidade?.slice(0, 160)}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {SUGESTOES.map((s) => (
                  <button key={s} className="btn" onClick={() => enviar(s)} style={{ fontSize: 12.5 }}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 12 }}>
              <div className={m.role === "user" ? "msg-user" : "msg-agente"} style={{
                maxWidth: "76%", padding: "10px 14px", borderRadius: 12, whiteSpace: "pre-wrap", lineHeight: 1.55,
                background: m.role === "user" ? "var(--accent, #2563eb)" : "var(--card-2, rgba(127,127,127,.12))",
                color: m.role === "user" ? "#fff" : "inherit",
              }}>
                {m.content || (streaming && i === msgs.length - 1 ? "…" : "")}
              </div>
            </div>
          ))}
          <div ref={fimRef} />
        </div>
        <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid rgba(127,127,127,.18)" }}>
          <textarea
            className="in" rows={1} value={input} placeholder="Escreva sua mensagem…" style={{ flex: 1, resize: "none" }}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(input); } }}
          />
          <Button variant="primary" onClick={() => enviar(input)}>{streaming ? "…" : "Enviar"}</Button>
        </div>
      </div>
    </>
  );
}
