// Integrações reais de esteira/GMUD. As credenciais vêm SEMPRE do ambiente,
// nunca do banco. Sem credenciais, cada disparo devolve `pendente: true` com
// uma mensagem clara — a plataforma segue funcionando em modo demonstração.

export interface StatusIntegracoes {
  github: { conectado: boolean; motivo: string };
  serviceNow: { conectado: boolean; motivo: string };
}

export function statusIntegracoes(): StatusIntegracoes {
  const gh = !!process.env.GITHUB_TOKEN;
  const snUrl = process.env.SERVICENOW_INSTANCE;
  const snUser = process.env.SERVICENOW_USER;
  const snPass = process.env.SERVICENOW_PASSWORD;
  const snOk = !!(snUrl && snUser && snPass);
  return {
    github: {
      conectado: gh,
      motivo: gh ? "GITHUB_TOKEN configurado" : "defina GITHUB_TOKEN (PAT ou token da GitHub App) no ambiente",
    },
    serviceNow: {
      conectado: snOk,
      motivo: snOk
        ? `instância ${snUrl}`
        : "defina SERVICENOW_INSTANCE, SERVICENOW_USER e SERVICENOW_PASSWORD no ambiente",
    },
  };
}

export interface ResultadoDisparo {
  ok: boolean;
  pendente?: boolean;
  mensagem: string;
  ref?: string;
}

// Dispara um workflow do GitHub Actions (workflow_dispatch). Real quando há
// GITHUB_TOKEN; caso contrário, retorna pendente (sem simular sucesso).
export async function dispararWorkflow(
  org: string,
  repo: string,
  workflow: string,
  ref = "main"
): Promise<ResultadoDisparo> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { ok: false, pendente: true, mensagem: "GitHub não conectado — configure GITHUB_TOKEN para disparar a esteira de verdade." };
  }
  if (!org || !repo || !workflow) {
    return { ok: false, mensagem: "Defina organização, repositório e workflow no Console (Esteiras & GMUD)." };
  }
  const url = `https://api.github.com/repos/${org}/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
      },
      body: JSON.stringify({ ref }),
    });
    // 204 = aceito; GitHub não devolve corpo no sucesso.
    if (res.status === 204) return { ok: true, mensagem: `Workflow ${workflow} disparado em ${org}/${repo} (${ref}).`, ref };
    const corpo = await res.text().catch(() => "");
    return { ok: false, mensagem: `GitHub respondeu ${res.status}: ${corpo.slice(0, 200) || res.statusText}` };
  } catch (e) {
    return { ok: false, mensagem: `Falha ao chamar o GitHub: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export interface ResultadoGmud {
  ok: boolean;
  pendente?: boolean;
  numero?: string;
  mensagem: string;
}

// Abre uma GMUD (change_request) no ServiceNow. Real quando há credenciais;
// caso contrário retorna pendente para o chamador registrar uma GMUD local.
export async function abrirGmudServiceNow(titulo: string, descricao: string, risco = "baixo"): Promise<ResultadoGmud> {
  const instance = process.env.SERVICENOW_INSTANCE;
  const user = process.env.SERVICENOW_USER;
  const pass = process.env.SERVICENOW_PASSWORD;
  if (!instance || !user || !pass) {
    return { ok: false, pendente: true, mensagem: "ServiceNow não conectado — configure SERVICENOW_INSTANCE/USER/PASSWORD para abrir GMUD real." };
  }
  const url = `https://${instance}.service-now.com/api/now/table/change_request`;
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ short_description: titulo, description: descricao, risk: risco, type: "normal" }),
    });
    if (res.ok) {
      const j = (await res.json().catch(() => ({}))) as { result?: { number?: string } };
      return { ok: true, numero: j.result?.number, mensagem: `GMUD ${j.result?.number ?? ""} aberta no ServiceNow.` };
    }
    const corpo = await res.text().catch(() => "");
    return { ok: false, mensagem: `ServiceNow respondeu ${res.status}: ${corpo.slice(0, 200) || res.statusText}` };
  } catch (e) {
    return { ok: false, mensagem: `Falha ao chamar o ServiceNow: ${e instanceof Error ? e.message : String(e)}` };
  }
}
