import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { post, useMe } from "../lib/api";
import type { Me } from "../../../shared/types";

// Wizard pós-cadastro: o usuário nomeia sua área e sua squad. Os agentes já
// vêm prontos (catálogo da plataforma) — depois é criar objetivos e iniciativas.
export default function Onboarding() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [passo, setPasso] = useState(1);
  const [comunidade, setComunidade] = useState("");
  const [squad, setSquad] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const concluir = async () => {
    setErro(null);
    setCarregando(true);
    try {
      const { me: novo } = await post<{ me: Me }>("/onboarding", {
        comunidadeNome: comunidade,
        squadNome: squad,
      });
      qc.setQueryData(["me"], novo);
      navigate("/squad/okrs", { replace: true });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="screen-entry">
      <div className="entry-inner" style={{ maxWidth: 560 }}>
        <div className="entry-logo">AI</div>
        <h1>Vamos montar seu workspace</h1>
        <p className="tag">
          Olá, <b>{me?.nome}</b> — em 2 passos você começa a pôr os agentes para trabalhar.
        </p>

        <div className="onb-card">
          {passo === 1 && (
            <>
              <span className="onb-step">Passo 1 de 2</span>
              <h3>Qual é a sua área?</h3>
              <p className="onb-help">O guarda-chuva onde vivem seus times. Ex.: “Meios de Pagamento”, “Growth”, “Plataforma”.</p>
              <input
                className="in"
                value={comunidade}
                onChange={(e) => setComunidade(e.target.value)}
                placeholder="Nome da sua área"
                onKeyDown={(e) => e.key === "Enter" && comunidade.length >= 2 && setPasso(2)}
                autoFocus
              />
              <button className="btn primary onb-btn" disabled={comunidade.length < 2} onClick={() => setPasso(2)}>
                Continuar
              </button>
            </>
          )}

          {passo === 2 && (
            <>
              <span className="onb-step">Passo 2 de 2</span>
              <h3>Como se chama sua squad?</h3>
              <p className="onb-help">O time onde você vai criar objetivos e iniciativas. Você entra como PM.</p>
              <input
                className="in"
                value={squad}
                onChange={(e) => setSquad(e.target.value)}
                placeholder="Nome da squad"
                onKeyDown={(e) => e.key === "Enter" && squad.length >= 2 && concluir()}
                autoFocus
              />
              {erro && <p className="login-note" style={{ color: "var(--crit)" }}>{erro}</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button className="btn" style={{ justifyContent: "center", padding: "11px 18px" }} onClick={() => setPasso(1)}>
                  Voltar
                </button>
                <button className="btn primary" style={{ flex: 1, justifyContent: "center", padding: "11px" }} disabled={squad.length < 2 || carregando} onClick={concluir}>
                  {carregando ? "Criando…" : "Criar meu workspace"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
