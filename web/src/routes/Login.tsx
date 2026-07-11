import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, post } from "../lib/api";
import { homeDoPapel, type Me, type Papel } from "../../../shared/types";

interface AuthConfig {
  demo: boolean;
  githubClientId: string | null;
  personas: { id: string; nome: string; papel: string; squadNome: string | null }[];
}

const PAPEL_LABEL: Record<string, string> = {
  pm: "Product Manager",
  dev: "Desenvolvedor(a)",
  arquiteto: "Arquitetura de Plataforma",
  diretor: "Diretor de Tecnologia",
  gerente: "Gerência",
  coordenador: "Coordenação",
};

const iniciais = (nome: string) =>
  nome.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export default function Login() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [entrando, setEntrando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<AuthConfig>("/auth/config").then(setConfig).catch(() => setErro("API indisponível"));
  }, []);

  // Callback OAuth: GitHub redireciona de volta com ?code=
  useEffect(() => {
    const code = new URLSearchParams(location.search).get("code");
    if (!code) return;
    setEntrando("github");
    post<{ me: Me }>("/auth/github/callback", { code })
      .then(({ me }) => {
        qc.setQueryData(["me"], me);
        navigate(homeDoPapel(me.papel), { replace: true });
      })
      .catch((e) => {
        setErro(String(e.message));
        setEntrando(null);
      });
  }, []);

  const entrarDemo = async (pessoaId: string) => {
    setEntrando(pessoaId);
    try {
      const { me } = await post<{ me: Me }>("/auth/demo", { pessoaId });
      qc.setQueryData(["me"], me);
      navigate(homeDoPapel(me.papel as Papel), { replace: true });
    } catch (e) {
      setErro(String((e as Error).message));
      setEntrando(null);
    }
  };

  const entrarGithub = () => {
    if (!config?.githubClientId) return;
    const params = new URLSearchParams({
      client_id: config.githubClientId,
      scope: "read:user read:org",
      redirect_uri: `${location.origin}/login`,
    });
    location.href = `https://github.com/login/oauth/authorize?${params}`;
  };

  return (
    <div className="screen-login">
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">AI</div>
          <h1>AI Workspace</h1>
          <p className="l-sub">A plataforma AI-First da diretoria. Entre com sua conta corporativa.</p>

          {config?.githubClientId && (
            <button className="btn-gh" onClick={entrarGithub}>
              Entrar com GitHub
            </button>
          )}

          {config?.demo && (
            <>
              <div className="login-div">modo demonstração · entre como</div>
              {config.personas.map((p) => (
                <button
                  key={p.id}
                  className="btn-sso"
                  disabled={entrando !== null}
                  onClick={() => entrarDemo(p.id)}
                  style={{ justifyContent: "flex-start", gap: 11 }}
                >
                  <span className="avatar" style={{ background: "#b85700" }}>
                    {iniciais(p.nome)}
                  </span>
                  <span style={{ textAlign: "left" }}>
                    {entrando === p.id ? "Entrando…" : p.nome}
                    <small style={{ display: "block", fontWeight: 400, color: "var(--ink-3)" }}>
                      {PAPEL_LABEL[p.papel] ?? p.papel}
                      {p.squadNome ? ` · ${p.squadNome}` : ""}
                    </small>
                  </span>
                </button>
              ))}
            </>
          )}

          {erro && <p className="login-note" style={{ color: "var(--crit)" }}>{erro}</p>}
          {!config && !erro && <p className="login-note">Carregando…</p>}
          <p className="login-note">
            Sem OAuth configurado, o AI Workspace roda em <b>modo demonstração</b> com banco
            embarcado e dados ilustrativos — nenhuma integração externa é chamada.
          </p>
        </div>
      </div>
      <div className="login-foot">AI Workspace · ambiente interno</div>
    </div>
  );
}
