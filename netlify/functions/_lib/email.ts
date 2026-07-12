// Envio de email via Resend. Sem RESEND_API_KEY, não envia (o convite ainda
// funciona pelo link mostrado na tela). Docs: https://resend.com/docs
const FROM = process.env.RESEND_FROM ?? "AI Workspace <onboarding@resend.dev>";

export function appBaseUrl(): string {
  return process.env.APP_URL ?? process.env.URL ?? "http://localhost:5173";
}

export async function sendInviteEmail(opts: {
  para: string;
  convidadoPor: string;
  comunidade: string;
  squad: string | null;
  papelLabel: string;
  link: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#0b0b0b">
      <div style="background:linear-gradient(135deg,#ff8a00,#c25a00);border-radius:12px;padding:22px;color:#fff;text-align:center">
        <div style="font-size:22px;font-weight:800">AI Workspace</div>
        <div style="opacity:.9;font-size:14px">Plataforma AI-First de Produto</div>
      </div>
      <div style="padding:22px 6px">
        <p><b>${opts.convidadoPor}</b> convidou você para o AI Workspace da <b>${opts.comunidade}</b>.</p>
        <p style="color:#52514e">Você entrará como <b>${opts.papelLabel}</b>${opts.squad ? ` na <b>${opts.squad}</b>` : ""}.</p>
        <p style="text-align:center;margin:26px 0">
          <a href="${opts.link}" style="background:#EC7000;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:9px;display:inline-block">Aceitar convite</a>
        </p>
        <p style="color:#898781;font-size:12px">Ou copie este link: ${opts.link}</p>
      </div>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: opts.para,
      subject: `Convite para o AI Workspace · ${opts.comunidade}`,
      html,
    }),
  });
  if (!res.ok) {
    console.error("[resend]", res.status, await res.text());
    return false;
  }
  return true;
}
