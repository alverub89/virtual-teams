export default function Login() {
  const login = () => {
    const clientId = import.meta.env.VITE_GITHUB_OAUTH_CLIENT_ID as string | undefined;
    if (!clientId) {
      alert("OAuth GitHub ainda não configurado (VITE_GITHUB_OAUTH_CLIENT_ID).");
      return;
    }
    const params = new URLSearchParams({
      client_id: clientId,
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
          <p className="l-sub">Plataforma AI-First de Produto · Meios de Pagamento</p>
          <button className="btn-gh" onClick={login}>
            Entrar com GitHub
          </button>
          <div className="login-div">ou</div>
          <button className="btn-sso" onClick={() => alert("SSO corporativo: em breve.")}>
            SSO corporativo (Azure AD)
          </button>
          <p className="login-note">
            Acesso restrito à organização <b>itau-meios-pagamento</b>. Seu papel e squad
            são resolvidos automaticamente após o login.
          </p>
        </div>
      </div>
      <div className="login-foot">AI Workspace · ambiente interno</div>
    </div>
  );
}
