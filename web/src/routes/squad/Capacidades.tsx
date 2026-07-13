import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, del, post, put } from "../../lib/api";
import { Button, Card, Chip, Fld, Modal, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

interface Repo { id: string; nome: string; linguagem: string | null; url: string | null }
interface Capacidade { nome: string; nivel: number; pai: string | null; fluxoValor?: string; descricao?: string; repos?: string[] }
interface Conteudo { resumo?: string; fluxosValor?: { nome: string; descricao?: string }[]; capacidades?: Capacidade[] }
interface Mapa { id: string; versao: number; motivo: string | null; conteudo: Conteudo | null; impacto: { resumo?: string; mudancas?: string[] } | null; criadoEm: string; reposAnalisados: string[] }
interface Dados {
  semSquad?: boolean;
  podeEditar: boolean;
  temToken: boolean;
  repos: Repo[];
  analisando: { versao: number; progresso: string | null; motivo: string | null } | null;
  mapaAtual: Mapa | null;
  reposNovos: string[];
  versoes: { id: string; versao: number; status: string; motivo: string | null; criadoEm: string }[];
}

function Repos({ pill }: { pill: string[] | undefined }) {
  if (!pill?.length) return null;
  return <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, marginLeft: 6 }}>{pill.map((r) => <span key={r} className="pill" style={{ fontSize: 10.5 }}>📦 {r}</span>)}</span>;
}

export default function Capacidades() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery<Dados>({
    queryKey: ["capacidades-mapa"],
    queryFn: () => api("/capacidades-mapa"),
    refetchInterval: (q) => ((q.state.data as Dados | undefined)?.analisando ? 2500 : false),
  });
  const [verId, setVerId] = useState<string | null>(null);
  const { data: versao } = useQuery<Mapa>({ queryKey: ["capacidade-versao", verId], queryFn: () => api(`/capacidades-mapa/versoes/${verId}`), enabled: !!verId });

  const [repoModal, setRepoModal] = useState(false);
  const [reposText, setReposText] = useState("");
  const [tokenModal, setTokenModal] = useState(false);
  const [token, setToken] = useState("");

  const invalidar = () => qc.invalidateQueries({ queryKey: ["capacidades-mapa"] });

  const addRepos = useMutation({
    mutationFn: () => {
      const repos = reposText.split("\n").map((l) => l.trim()).filter((l) => l.includes("/")).map((nome) => ({ nome }));
      if (!repos.length) throw new Error("informe ao menos um repo (org/repo)");
      return post<{ criados: number }>("/time/repos", { repos });
    },
    onSuccess: (r) => { invalidar(); setRepoModal(false); setReposText(""); toast(`🔗 ${r.criados} repo(s) — refletido na squad`); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });
  const removerRepo = useMutation({ mutationFn: (id: string) => del(`/time/repos/${id}`), onSuccess: () => { invalidar(); toast("🗑️ Removido"); } });
  const salvarToken = useMutation({
    mutationFn: () => put("/capacidades-mapa/token", { token }),
    onSuccess: () => { invalidar(); setTokenModal(false); setToken(""); toast("🔑 Token do GitHub salvo"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });
  const gerar = useMutation({ mutationFn: () => post("/capacidades-mapa/gerar"), onSuccess: () => { invalidar(); toast("🧠 Análise iniciada em background"); }, onError: (e) => toast(`⚠️ ${(e as Error).message}`) });
  const avaliar = useMutation({ mutationFn: () => post("/capacidades-mapa/avaliar-impacto"), onSuccess: () => { invalidar(); toast("🧠 Reavaliando com o novo repo"); }, onError: (e) => toast(`⚠️ ${(e as Error).message}`) });

  if (!data) return <p className="muted">Carregando…</p>;
  if (data.semSquad) return <p className="empty-note">Você ainda não está em uma squad.</p>;

  const mapa = versao ?? data.mapaAtual;
  const caps = mapa?.conteudo?.capacidades ?? [];
  const fluxos = mapa?.conteudo?.fluxosValor ?? [];
  const semFluxo = [...new Set(caps.filter((c) => c.nivel === 1 && !fluxos.some((f) => f.nome === c.fluxoValor)).map((c) => c.nome))];

  const renderL1 = (l1: Capacidade) => (
    <Card key={l1.nome} pad style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <b>{l1.nome}</b><Repos pill={l1.repos} />
      </div>
      {l1.descricao && <p className="sub" style={{ marginTop: 2 }}>{l1.descricao}</p>}
      {caps.filter((c) => c.nivel === 2 && c.pai === l1.nome).map((l2) => (
        <div key={l2.nome} className="tool-pick" style={{ cursor: "default" }}>
          <div style={{ flex: 1 }}><div className="tp-name">↳ {l2.nome} <Repos pill={l2.repos} /></div><div className="tp-src">{l2.descricao}</div></div>
        </div>
      ))}
    </Card>
  );

  return (
    <>
      <PageHead
        title="Mapa de capacidades"
        description="A arquitetura de negócio da squad — fluxos de valor e capacidades — construída pela IA sobre os seus repositórios."
        actions={data.podeEditar && (
          <>
            {data.reposNovos.length > 0 && data.mapaAtual && !data.analisando && <Button onClick={() => avaliar.mutate()}>⚠️ Avaliar impacto ({data.reposNovos.length})</Button>}
            {!data.analisando && <Button variant="primary" onClick={() => gerar.mutate()}>{data.mapaAtual ? "Regerar" : "🧠 Gerar mapa"}</Button>}
          </>
        )}
      />

      {!data.temToken && (
        <div className="banner" style={{ marginBottom: 10 }}>
          🔑 <span>Sem token do GitHub, a IA lê só os nomes dos repos. Para ler pastas e arquivos, {data.podeEditar ? <a onClick={() => setTokenModal(true)} style={{ cursor: "pointer", textDecoration: "underline" }}>conecte um token</a> : "peça a um líder para conectar um token"}.</span>
        </div>
      )}

      {data.analisando && (
        <div className="banner" style={{ marginBottom: 10 }}>
          ⏳ <span><b>Analisando capacidades…</b> {data.analisando.progresso ?? "iniciando"} (v{data.analisando.versao})</span>
        </div>
      )}

      {/* Repositórios */}
      <div className="sec-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span>Repositórios da squad ({data.repos.length})</span>
        {data.podeEditar && <button className="btn" style={{ padding: "2px 10px" }} onClick={() => setRepoModal(true)}>+ Conectar</button>}
      </div>
      <Card pad style={{ marginBottom: 12 }}>
        {data.repos.length === 0 && <p className="empty-note">Conecte ao menos um repositório para gerar o mapa.</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {data.repos.map((r) => (
            <span key={r.id} className="pill" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              📦 {r.nome}
              {data.reposNovos.includes(r.nome) && <Chip tone="warn">novo</Chip>}
              {data.podeEditar && <button className="modal-x" title="Remover" onClick={() => confirm(`Remover ${r.nome}?`) && removerRepo.mutate(r.id)}>✕</button>}
            </span>
          ))}
        </div>
      </Card>

      {/* Mapa */}
      {!mapa && !data.analisando && <Card pad><p className="empty-note">Nenhum mapa ainda. Conecte os repositórios e clique em <b>🧠 Gerar mapa</b> — a IA planeja e lê os arquivos principais em background.</p></Card>}

      {mapa && (
        <>
          <div className="sec-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>Arquitetura de negócio · v{mapa.versao}</span>
            {data.versoes.length > 1 && (
              <select className="in" style={{ maxWidth: 260 }} value={verId ?? data.mapaAtual?.id ?? ""} onChange={(e) => setVerId(e.target.value === data.mapaAtual?.id ? null : e.target.value)}>
                {data.versoes.filter((v) => v.status === "pronto").map((v) => <option key={v.id} value={v.id}>v{v.versao} · {v.motivo} · {new Date(v.criadoEm).toLocaleDateString("pt-BR")}</option>)}
              </select>
            )}
          </div>
          {mapa.conteudo?.resumo && <Card pad style={{ marginBottom: 10 }}><p className="sub">{mapa.conteudo.resumo}</p></Card>}
          {mapa.impacto?.resumo && (
            <div className="banner" style={{ marginBottom: 10 }}>🔎 <span><b>Impacto:</b> {mapa.impacto.resumo}{mapa.impacto.mudancas?.length ? ` — ${mapa.impacto.mudancas.join("; ")}` : ""}</span></div>
          )}
          {fluxos.map((fv) => (
            <div key={fv.nome} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>🎯 {fv.nome}</div>
              {fv.descricao && <p className="sub" style={{ margin: "2px 0 8px" }}>{fv.descricao}</p>}
              {caps.filter((c) => c.nivel === 1 && c.fluxoValor === fv.nome).map(renderL1)}
            </div>
          ))}
          {semFluxo.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>📦 Outras capacidades</div>
              {caps.filter((c) => c.nivel === 1 && semFluxo.includes(c.nome)).map(renderL1)}
            </div>
          )}
        </>
      )}

      {repoModal && (
        <Modal title="Conectar repositórios" subtitle="org/repo por linha. Reflete na sua squad (Comunidade & Pessoas)." onClose={() => setRepoModal(false)}
          foot={<><Button onClick={() => setRepoModal(false)}>Cancelar</Button><Button variant="primary" onClick={() => addRepos.mutate()}>{addRepos.isPending ? "…" : "Conectar"}</Button></>}>
          <Fld label="Repositórios"><textarea className="in" rows={5} value={reposText} onChange={(e) => setReposText(e.target.value)} placeholder={"itau/pix-cobranca\nitau/pix-core"} /></Fld>
        </Modal>
      )}
      {tokenModal && (
        <Modal title="Conectar token do GitHub" subtitle="PAT com scope repo — usado para ler pastas e arquivos dos repos." onClose={() => setTokenModal(false)}
          foot={<><Button onClick={() => setTokenModal(false)}>Cancelar</Button><Button variant="primary" onClick={() => token.length >= 4 && salvarToken.mutate()}>{salvarToken.isPending ? "…" : "Salvar"}</Button></>}>
          <Fld label="Personal Access Token"><input className="in" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_…" /></Fld>
        </Modal>
      )}
    </>
  );
}
