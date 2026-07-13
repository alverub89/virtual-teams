import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, del, post } from "../../lib/api";
import { Button, Card, Chip, Fld, Modal, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

interface Tool { id: string; nome: string; descricao: string | null; permissao: string; execucao: string; aprovacao: string; motivoRejeicao: string | null }
interface Mcp { id: string; nome: string; sistema: string; descricao: string | null; url: string | null; aprovacao: string; motivoRejeicao: string | null; endpoint: string | null }
interface Dados { podeCriar: boolean; tools: Tool[]; mcps: Mcp[] }

const STATUS: Record<string, { label: string; tone: "neutral" | "warn" | "good" | "crit" }> = {
  rascunho: { label: "Rascunho", tone: "neutral" },
  pendente: { label: "Aguardando CTO", tone: "warn" },
  aprovado: { label: "Aprovado", tone: "good" },
  rejeitado: { label: "Rejeitado", tone: "crit" },
};

export default function Lab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery<Dados>({ queryKey: ["lab"], queryFn: () => api("/lab") });
  const invalidar = () => qc.invalidateQueries({ queryKey: ["lab"] });

  const [novaTool, setNovaTool] = useState(false);
  const [tNome, setTNome] = useState(""); const [tDesc, setTDesc] = useState(""); const [tPerm, setTPerm] = useState("leitura");
  const [tExec, setTExec] = useState("ia"); const [tParam, setTParam] = useState("");
  const [tUrl, setTUrl] = useState(""); const [tMetodo, setTMetodo] = useState("GET");

  const [novoMcp, setNovoMcp] = useState(false);
  const [mNome, setMNome] = useState(""); const [mSis, setMSis] = useState(""); const [mDesc, setMDesc] = useState(""); const [mUrl, setMUrl] = useState(""); const [mEscopo, setMEscopo] = useState("squad");

  const criarTool = useMutation({
    mutationFn: () => post("/lab/tools", {
      nome: tNome, descricao: tDesc, permissao: tPerm, execucao: tExec, parametros: tParam,
      handlerConfig: tExec === "http" ? { metodo: tMetodo, url: tUrl, headers: {} } : undefined,
    }),
    onSuccess: () => { invalidar(); setNovaTool(false); setTNome(""); setTDesc(""); setTParam(""); setTUrl(""); toast("🔧 Tool criada (rascunho)"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });
  const criarMcp = useMutation({
    mutationFn: () => post("/lab/mcps", { nome: mNome, sistema: mSis, descricao: mDesc, url: mUrl || undefined, escopo: mEscopo }),
    onSuccess: () => { invalidar(); setNovoMcp(false); setMNome(""); setMSis(""); setMDesc(""); setMUrl(""); toast("🔌 MCP criado (rascunho)"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });
  const publicarTool = useMutation({ mutationFn: (id: string) => post(`/lab/tools/${id}/publicar`), onSuccess: () => { invalidar(); toast("📤 Enviado para aprovação do CTO"); }, onError: (e) => toast(`⚠️ ${(e as Error).message}`) });
  const publicarMcp = useMutation({ mutationFn: (id: string) => post(`/lab/mcps/${id}/publicar`), onSuccess: () => { invalidar(); toast("📤 Enviado para aprovação do CTO"); }, onError: (e) => toast(`⚠️ ${(e as Error).message}`) });
  const delTool = useMutation({ mutationFn: (id: string) => del(`/lab/tools/${id}`), onSuccess: () => { invalidar(); toast("🗑️ Removido"); } });
  const delMcp = useMutation({ mutationFn: (id: string) => del(`/lab/mcps/${id}`), onSuccess: () => { invalidar(); toast("🗑️ Removido"); } });

  if (!data) return <p className="muted">Carregando…</p>;

  const statusChip = (ap: string) => <Chip tone={STATUS[ap]?.tone ?? "neutral"}>{STATUS[ap]?.label ?? ap}</Chip>;

  return (
    <>
      <PageHead
        title="Tools & MCPs da squad"
        description="Crie tools e MCPs para a sua squad, teste, e publique — publicar envia para a aprovação do CTO. Aprovado, fica ativo."
        actions={data.podeCriar && <><Button onClick={() => setNovoMcp(true)}>+ MCP</Button><Button variant="primary" onClick={() => setNovaTool(true)}>+ Tool</Button></>}
      />
      {!data.podeCriar && <div className="banner" style={{ marginBottom: 10 }}>ℹ️ <span>Só PM e Tech Lead da squad podem criar e publicar. Você vê o que a squad já tem.</span></div>}

      <div className="sec-title">Tools</div>
      {data.tools.length === 0 && <p className="empty-note">Nenhuma tool ainda.</p>}
      <div className="grid g2">
        {data.tools.map((t) => (
          <Card key={t.id} pad>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ flex: 1 }}>{t.nome}</h3>
              <Chip tone={t.execucao === "http" ? "blue" : "neutral"}>{t.execucao === "http" ? "HTTP" : "IA"}</Chip>
              {statusChip(t.aprovacao)}
            </div>
            <p className="sub">{t.descricao}</p>
            {t.aprovacao === "rejeitado" && t.motivoRejeicao && <div className="prompt-box" style={{ marginTop: 6 }}>Motivo: {t.motivoRejeicao}</div>}
            {data.podeCriar && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {(t.aprovacao === "rascunho" || t.aprovacao === "rejeitado") && <Button variant="primary" onClick={() => publicarTool.mutate(t.id)}>Publicar</Button>}
                {t.aprovacao !== "aprovado" && <Button onClick={() => confirm(`Remover ${t.nome}?`) && delTool.mutate(t.id)}>Remover</Button>}
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="sec-title" style={{ marginTop: 16 }}>MCPs</div>
      {data.mcps.length === 0 && <p className="empty-note">Nenhum MCP ainda. Você pode registrar um MCP remoto (ex.: da Netlify) e publicar para aprovação.</p>}
      <div className="grid g2">
        {data.mcps.map((m) => (
          <Card key={m.id} pad>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ flex: 1 }}>{m.nome}</h3>
              {statusChip(m.aprovacao)}
            </div>
            <p className="sub">{m.descricao || m.sistema}</p>
            {m.url && <div className="prompt-box" style={{ marginTop: 6, fontSize: 11 }}>{m.url}</div>}
            {m.aprovacao === "rejeitado" && m.motivoRejeicao && <div className="prompt-box" style={{ marginTop: 6 }}>Motivo: {m.motivoRejeicao}</div>}
            {data.podeCriar && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {(m.aprovacao === "rascunho" || m.aprovacao === "rejeitado") && <Button variant="primary" onClick={() => publicarMcp.mutate(m.id)}>Publicar</Button>}
                {m.aprovacao !== "aprovado" && <Button onClick={() => confirm(`Remover ${m.nome}?`) && delMcp.mutate(m.id)}>Remover</Button>}
              </div>
            )}
          </Card>
        ))}
      </div>

      {novaTool && (
        <Modal title="Nova tool" subtitle="Fica como rascunho; publique para enviar ao CTO." onClose={() => setNovaTool(false)}
          foot={<><Button onClick={() => setNovaTool(false)}>Cancelar</Button><Button variant="primary" onClick={() => tNome.length >= 2 && criarTool.mutate()}>{criarTool.isPending ? "…" : "Criar"}</Button></>}>
          <div className="fld-row">
            <Fld label="Nome"><input className="in" value={tNome} onChange={(e) => setTNome(e.target.value.replace(/\s+/g, "_"))} placeholder="ex.: consultar_saldo" /></Fld>
            <Fld label="Permissão"><select className="in" value={tPerm} onChange={(e) => setTPerm(e.target.value)}><option value="leitura">leitura</option><option value="escrita">escrita</option><option value="critica">crítica</option></select></Fld>
          </div>
          <Fld label="O que faz"><input className="in" value={tDesc} onChange={(e) => setTDesc(e.target.value)} /></Fld>
          <Fld label="Parâmetros (linguagem natural)"><textarea className="in" rows={2} value={tParam} onChange={(e) => setTParam(e.target.value)} placeholder="conta (obrigatório), incluir_bloqueado (opcional)" /></Fld>
          <Fld label="Execução"><select className="in" value={tExec} onChange={(e) => setTExec(e.target.value)}><option value="ia">IA</option><option value="http">HTTP</option></select></Fld>
          {tExec === "http" && (
            <div className="fld-row">
              <Fld label="Método"><select className="in" value={tMetodo} onChange={(e) => setTMetodo(e.target.value)}>{["GET", "POST", "PUT", "PATCH", "DELETE"].map((x) => <option key={x}>{x}</option>)}</select></Fld>
              <Fld label="URL ({{param}})"><input className="in" value={tUrl} onChange={(e) => setTUrl(e.target.value)} placeholder="https://api.interna/saldo/{{conta}}" /></Fld>
            </div>
          )}
        </Modal>
      )}

      {novoMcp && (
        <Modal title="Novo MCP" subtitle="Registre um MCP (inclusive remoto). Fica como rascunho até publicar." onClose={() => setNovoMcp(false)}
          foot={<><Button onClick={() => setNovoMcp(false)}>Cancelar</Button><Button variant="primary" onClick={() => mNome.length >= 2 && mSis.length >= 2 && criarMcp.mutate()}>{criarMcp.isPending ? "…" : "Criar"}</Button></>}>
          <div className="fld-row">
            <Fld label="Nome"><input className="in" value={mNome} onChange={(e) => setMNome(e.target.value)} placeholder="Netlify" /></Fld>
            <Fld label="Sistema"><input className="in" value={mSis} onChange={(e) => setMSis(e.target.value)} placeholder="netlify" /></Fld>
          </div>
          <Fld label="Descrição"><input className="in" value={mDesc} onChange={(e) => setMDesc(e.target.value)} /></Fld>
          <Fld label="URL do servidor MCP (opcional, remoto)"><input className="in" value={mUrl} onChange={(e) => setMUrl(e.target.value)} placeholder="https://mcp.exemplo.com/mcp" /></Fld>
          <Fld label="Abrangência sugerida"><select className="in" value={mEscopo} onChange={(e) => setMEscopo(e.target.value)}><option value="squad">Só a minha squad</option><option value="comunidade">Toda a comunidade (CTO decide)</option></select></Fld>
        </Modal>
      )}
    </>
  );
}
