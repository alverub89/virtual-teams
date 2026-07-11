import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { post } from "../lib/api";
import type { Me } from "../../../shared/types";

type Modo = "entrar" | "criar";

export default function Login() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [modo, setModo] = useState<Modo>("criar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const enviar = async () => {
    setErro(null);
    setCarregando(true);
    try {
      const rota = modo === "criar" ? "/auth/register" : "/auth/login";
      const payload = modo === "criar" ? { nome, email, senha } : { email, senha };
      const { me } = await post<{ me: Me }>(rota, payload);
      qc.setQueryData(["me"], me);
      navigate(me.squadId ? "/squad/iniciativas" : "/onboarding", { replace: true });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  };

  const podeEnviar =
    email.includes("@") && senha.length >= (modo === "criar" ? 8 : 1) && (modo === "entrar" || nome.length >= 2);

  return (
    <div className="screen-login">
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">AI</div>
          <h1>AI Workspace</h1>
          <p className="l-sub">
            {modo === "criar"
              ? "Crie sua conta e monte seu workspace do zero."
              : "Bem-vindo de volta. Entre para continuar."}
          </p>

          <div className="auth-tabs">
            <button className={modo === "criar" ? "active" : ""} onClick={() => setModo("criar")}>
              Criar conta
            </button>
            <button className={modo === "entrar" ? "active" : ""} onClick={() => setModo("entrar")}>
              Entrar
            </button>
          </div>

          <div style={{ textAlign: "left", marginTop: 6 }}>
            {modo === "criar" && (
              <div className="fld">
                <label>Seu nome</label>
                <input className="in" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como devemos te chamar" />
              </div>
            )}
            <div className="fld">
              <label>Email</label>
              <input className="in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" autoCapitalize="none" />
            </div>
            <div className="fld">
              <label>Senha {modo === "criar" && <small>(mín. 8 caracteres)</small>}</label>
              <input
                className="in"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && podeEnviar && enviar()}
                placeholder="••••••••"
              />
            </div>
          </div>

          {erro && <p className="login-note" style={{ color: "var(--crit)" }}>{erro}</p>}

          <button
            className="btn primary"
            style={{ width: "100%", justifyContent: "center", marginTop: 8, padding: "11px" }}
            disabled={!podeEnviar || carregando}
            onClick={enviar}
          >
            {carregando ? "…" : modo === "criar" ? "Criar conta e começar" : "Entrar"}
          </button>

          <p className="login-note">
            {modo === "criar"
              ? "Ao criar a conta você define sua área e squad no próximo passo, com os agentes já prontos para trabalhar."
              : "Ainda não tem conta? Toque em “Criar conta”."}
          </p>
        </div>
      </div>
      <div className="login-foot">AI Workspace · plataforma AI-First de produto</div>
    </div>
  );
}
