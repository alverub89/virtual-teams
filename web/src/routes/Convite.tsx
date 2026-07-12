import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, post } from "../lib/api";
import { homeDoPapel, PAPEL_LABEL, type Me, type Papel } from "../../../shared/types";

interface ConviteInfo {
  email: string;
  papel: Papel;
  status: string;
  comunidadeNome: string | null;
  squadNome: string | null;
  convidadoNome: string | null;
}

// Página pública: a pessoa convidada define nome + senha e entra na squad.
export default function Convite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [info, setInfo] = useState<ConviteInfo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    api<ConviteInfo>(`/auth/convite/${token}`)
      .then(setInfo)
      .catch((e) => setErro((e as Error).message));
  }, [token]);

  const aceitar = async () => {
    setErro(null);
    setCarregando(true);
    try {
      const { me } = await post<{ me: Me }>(`/auth/convite/${token}/aceitar`, { nome, senha });
      qc.setQueryData(["me"], me);
      navigate(homeDoPapel(me.papel), { replace: true });
    } catch (e) {
      setErro((e as Error).message);
      setCarregando(false);
    }
  };

  return (
    <div className="screen-login">
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">AI</div>
          {!info && !erro && <p className="l-sub">Carregando convite…</p>}
          {erro && !info && <p className="login-note" style={{ color: "var(--crit)" }}>{erro}</p>}

          {info && info.status !== "pendente" && (
            <>
              <h1>Convite indisponível</h1>
              <p className="l-sub">Este convite já foi utilizado ou cancelado. Peça um novo ao seu CTO.</p>
            </>
          )}

          {info && info.status === "pendente" && (
            <>
              <h1>Você foi convidado 🎉</h1>
              <p className="l-sub">
                {info.convidadoNome ? `${info.convidadoNome} ` : ""}convidou você para o AI Workspace da{" "}
                <b>{info.comunidadeNome}</b>. Você entra como <b>{PAPEL_LABEL[info.papel]}</b>
                {info.squadNome ? ` na ${info.squadNome}` : ""}.
              </p>
              <div style={{ textAlign: "left", marginTop: 8 }}>
                <div className="fld">
                  <label>Email</label>
                  <input className="in" value={info.email} disabled />
                </div>
                <div className="fld">
                  <label>Seu nome</label>
                  <input className="in" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como devemos te chamar" autoFocus />
                </div>
                <div className="fld">
                  <label>Crie uma senha <small>(mín. 8)</small></label>
                  <input className="in" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} onKeyDown={(e) => e.key === "Enter" && nome.length >= 2 && senha.length >= 8 && aceitar()} placeholder="••••••••" />
                </div>
              </div>
              {erro && <p className="login-note" style={{ color: "var(--crit)" }}>{erro}</p>}
              <button className="btn primary" style={{ width: "100%", justifyContent: "center", padding: 11, marginTop: 8 }} disabled={nome.length < 2 || senha.length < 8 || carregando} onClick={aceitar}>
                {carregando ? "Entrando…" : "Aceitar e entrar"}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="login-foot">AI Workspace</div>
    </div>
  );
}
