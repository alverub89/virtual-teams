import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, del, post, put } from "../../lib/api";
import { Button, Card, Chip, Fld, Modal, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

interface Repo { id: string; nome: string; linguagem: string | null; url: string | null }
interface Capacidade { nome: string; nivel: number; pai: string | null; fluxoValor?: string; descricao?: string; repos?: string[] }
interface BaseCap { id: string; nome: string; descricao: string | null; nivel: number; pai: string | null; fluxoValor: string | null; repos: string[]; origem: string }
interface Conteudo { resumo?: string; fluxosValor?: { nome: string; descricao?: string }[]; capacidades?: Capacidade[] }
interface Mapa { id: string; versao: number; motivo: string | null; conteudo: Conteudo | null; impacto: { resumo?: string; mudancas?: string[] } | null; criadoEm: string; reposAnalisados: string[]; diagnostico?: string | null }
interface Dados {
  semSquad?: boolean;
  podeEditar: boolean;
  temToken: boolean;
  tokenViaEnv?: boolean;
  repos: Repo[];
  base: BaseCap[];
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
  const [teste, setTeste] = useState<{ temToken: boolean; tokenOk: boolean; login: string | null; repos: { nome: string; ok: boolean; status: number; privado: boolean | null }[] } | null>(null);
  const testar = useMutation({
    mutationFn: () => post<any>("/capacidades-mapa/testar-token"),
    onSuccess: (r) => setTeste(r),
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

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

  // Cadastro manual de capacidades na base
  const [capModal, setCapModal] = useState<null | BaseCap | "novo">(null);
  const [cNome, setCNome] = useState(""); const [cDesc, setCDesc] = useState(""); const [cNivel, setCNivel] = useState(1); const [cPai, setCPai] = useState(""); const [cFluxo, setCFluxo] = useState("");
  const abrirCap = (cp: BaseCap | "novo") => {
    setCapModal(cp);
    setCNome(cp === "novo" ? "" : cp.nome); setCDesc(cp === "novo" ? "" : cp.descricao ?? "");
    setCNivel(cp === "novo" ? 1 : cp.nivel); setCPai(cp === "novo" ? "" : cp.pai ?? ""); setCFluxo(cp === "novo" ? "" : cp.fluxoValor ?? "");
  };
  const salvarCap = useMutation({
    mutationFn: () => {
      const body = { nome: cNome, descricao: cDesc, nivel: cNivel, pai: cNivel === 2 ? cPai || null : null, fluxoValor: cFluxo || null };
      return capModal === "novo" ? post("/capacidades-mapa/capacidade", body) : put(`/capacidades-mapa/capacidade/${(capModal as BaseCap).id}`, body);
    },
    onSuccess: () => { invalidar(); setCapModal(null); toast("🧩 Capacidade salva na base"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });
  const removerCap = useMutation({ mutationFn: (id: string) => del(`/capacidades-mapa/capacidade/${id}`), onSuccess: () => { invalidar(); toast("🗑️ Removida"); } });
  const avaliar = useMutation({ mutationFn: () => post("/capacidades-mapa/avaliar-impacto"), onSuccess: () => { invalidar(); toast("🧠 Reavaliando com o novo repo"); }, onError: (e) => toast(`⚠️ ${(e as Error).message}`) });

  if (!data) return <p className="muted">Carregando…</p>;
  if (data.semSquad) return <p className="empty-note">Você ainda não está em uma squad.</p>;

  const vendoSnapshot = !!verId && verId !== data.mapaAtual?.id;
  const mapa = versao ?? data.mapaAtual;
  const caps = mapa?.conteudo?.capacidades ?? [];
  const fluxos = mapa?.conteudo?.fluxosValor ?? [];
  const semFluxo = [...new Set(caps.filter((c) => c.nivel === 1 && !fluxos.some((f) => f.nome === c.fluxoValor)).map((c) => c.nome))];

  // Base de capacidades (registro vivo, usado em outros lugares)
  const base = data.base ?? [];
  const fluxosBase = [...new Set(base.filter((c) => c.nivel === 1 && c.fluxoValor).map((c) => c.fluxoValor as string))];
  const semFluxoBase = base.filter((c) => c.nivel === 1 && !c.fluxoValor);
  const renderBaseL1 = (l1: BaseCap) => (
    <Card key={l1.id} pad style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <b>{l1.nome}</b><Repos pill={l1.repos} />
        <Chip tone={l1.origem === "ia" ? "blue" : "neutral"}>{l1.origem === "ia" ? "IA" : "manual"}</Chip>
        {data.podeEditar && <><span style={{ flex: 1 }} /><button className="modal-x" title="Editar" onClick={() => abrirCap(l1)}>✎</button><button className="modal-x" title="Remover" onClick={() => confirm(`Remover ${l1.nome}?`) && removerCap.mutate(l1.id)}>✕</button></>}
      </div>
      {l1.descricao && <p className="sub" style={{ marginTop: 2 }}>{l1.descricao}</p>}
      {base.filter((c) => c.nivel === 2 && c.pai === l1.nome).map((l2) => (
        <div key={l2.id} className="tool-pick" style={{ cursor: "default" }}>
          <div style={{ flex: 1 }}><div className="tp-name">↳ {l2.nome} <Repos pill={l2.repos} /></div><div className="tp-src">{l2.descricao}</div></div>
          <Chip tone={l2.origem === "ia" ? "blue" : "neutral"}>{l2.origem === "ia" ? "IA" : "manual"}</Chip>
          {data.podeEditar && <><button className="modal-x" title="Editar" onClick={() => abrirCap(l2)}>✎</button><button className="modal-x" title="Remover" onClick={() => confirm(`Remover ${l2.nome}?`) && removerCap.mutate(l2.id)}>✕</button></>}
        </div>
      ))}
    </Card>
  );

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
            <Button onClick={() => setTokenModal(true)}>🔑 Token GitHub</Button>
            <Button onClick={() => { setTeste(null); testar.mutate(); }}>{testar.isPending ? "Testando…" : "🧪 Testar token"}</Button>
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
        <span style={{ flex: 1 }} />
        <Chip tone={data.temToken ? "good" : "warn"}>{data.temToken ? (data.tokenViaEnv ? "🔑 token via env" : "🔑 token conectado") : "🔑 sem token"}</Chip>
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

      {/* Base de capacidades (registro vivo) + snapshots */}
      <div className="sec-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span>Base de capacidades{vendoSnapshot ? ` · snapshot v${mapa?.versao}` : ""}</span>
        {data.podeEditar && !vendoSnapshot && <button className="btn" style={{ padding: "2px 10px" }} onClick={() => abrirCap("novo")}>+ Capacidade</button>}
        <span style={{ flex: 1 }} />
        {data.versoes.some((v) => v.status === "pronto") && (
          <select className="in" style={{ maxWidth: 300 }} value={verId ?? "atual"} onChange={(e) => setVerId(e.target.value === "atual" ? null : e.target.value)}>
            <option value="atual">Atual (base editável)</option>
            {data.versoes.filter((v) => v.status === "pronto").map((v) => <option key={v.id} value={v.id}>📸 v{v.versao} · {v.motivo} · {new Date(v.criadoEm).toLocaleDateString("pt-BR")}</option>)}
          </select>
        )}
      </div>

      {data.mapaAtual?.diagnostico && /Falhas:/.test(data.mapaAtual.diagnostico) && !vendoSnapshot && (
        <div className="banner" style={{ marginBottom: 10 }}>⚠️ <span><b>Leitura dos repos:</b> {data.mapaAtual.diagnostico}. Verifique o token e o acesso ao repositório.</span></div>
      )}
      {!vendoSnapshot && data.mapaAtual?.impacto?.resumo && (
        <div className="banner" style={{ marginBottom: 10 }}>🔎 <span><b>Impacto (v{data.mapaAtual.versao}):</b> {data.mapaAtual.impacto.resumo}{data.mapaAtual.impacto.mudancas?.length ? ` — ${data.mapaAtual.impacto.mudancas.join("; ")}` : ""}</span></div>
      )}

      {vendoSnapshot ? (
        <>
          {mapa?.conteudo?.resumo && <Card pad style={{ marginBottom: 10 }}><p className="sub">{mapa.conteudo.resumo}</p></Card>}
          {fluxos.map((fv) => (
            <div key={fv.nome} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>🎯 {fv.nome}</div>
              {fv.descricao && <p className="sub" style={{ margin: "2px 0 8px" }}>{fv.descricao}</p>}
              {caps.filter((c) => c.nivel === 1 && c.fluxoValor === fv.nome).map(renderL1)}
            </div>
          ))}
          {semFluxo.length > 0 && <div style={{ marginBottom: 14 }}><div style={{ fontWeight: 700, fontSize: 15 }}>📦 Outras capacidades</div>{caps.filter((c) => c.nivel === 1 && semFluxo.includes(c.nome)).map(renderL1)}</div>}
        </>
      ) : (
        <>
          {base.length === 0 && !data.analisando && <Card pad><p className="empty-note">Base vazia. Gere o mapa pela IA (<b>🧠 Gerar mapa</b>) — as capacidades são registradas aqui — ou cadastre uma manualmente em <b>+ Capacidade</b>.</p></Card>}
          {fluxosBase.map((fv) => (
            <div key={fv} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>🎯 {fv}</div>
              {data.mapaAtual?.conteudo?.fluxosValor?.find((f) => f.nome === fv)?.descricao && <p className="sub" style={{ margin: "2px 0 8px" }}>{data.mapaAtual!.conteudo!.fluxosValor!.find((f) => f.nome === fv)!.descricao}</p>}
              {base.filter((c) => c.nivel === 1 && c.fluxoValor === fv).map(renderBaseL1)}
            </div>
          ))}
          {semFluxoBase.length > 0 && <div style={{ marginBottom: 14 }}><div style={{ fontWeight: 700, fontSize: 15 }}>📦 Outras capacidades</div>{semFluxoBase.map(renderBaseL1)}</div>}
        </>
      )}

      {capModal && (
        <Modal title={capModal === "novo" ? "Nova capacidade" : "Editar capacidade"} subtitle="Fica registrada na base de capacidades — usada nas iniciativas e no mapa." onClose={() => setCapModal(null)}
          foot={<><Button onClick={() => setCapModal(null)}>Cancelar</Button><Button variant="primary" onClick={() => cNome.length >= 2 && salvarCap.mutate()}>{salvarCap.isPending ? "…" : "Salvar"}</Button></>}>
          <Fld label="Nome"><input className="in" value={cNome} onChange={(e) => setCNome(e.target.value)} placeholder="Ex.: Gestão de Cobrança" /></Fld>
          <Fld label="Descrição"><textarea className="in" rows={2} value={cDesc} onChange={(e) => setCDesc(e.target.value)} /></Fld>
          <div className="fld-row">
            <Fld label="Nível">
              <select className="in" value={cNivel} onChange={(e) => setCNivel(Number(e.target.value))}>
                <option value={1}>1 — macro</option>
                <option value={2}>2 — sub-capacidade</option>
              </select>
            </Fld>
            {cNivel === 2 ? (
              <Fld label="Capacidade pai (L1)">
                <select className="in" value={cPai} onChange={(e) => setCPai(e.target.value)}>
                  <option value="">— selecionar —</option>
                  {base.filter((c) => c.nivel === 1).map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                </select>
              </Fld>
            ) : (
              <Fld label="Fluxo de valor">
                <input className="in" list="fluxos-list" value={cFluxo} onChange={(e) => setCFluxo(e.target.value)} placeholder="Ex.: Aceitar e liquidar pagamentos" />
                <datalist id="fluxos-list">{fluxosBase.map((f) => <option key={f} value={f} />)}</datalist>
              </Fld>
            )}
          </div>
        </Modal>
      )}

      {repoModal && (
        <Modal title="Conectar repositórios" subtitle="org/repo por linha. Reflete na sua squad (Comunidade & Pessoas)." onClose={() => setRepoModal(false)}
          foot={<><Button onClick={() => setRepoModal(false)}>Cancelar</Button><Button variant="primary" onClick={() => addRepos.mutate()}>{addRepos.isPending ? "…" : "Conectar"}</Button></>}>
          <Fld label="Repositórios"><textarea className="in" rows={5} value={reposText} onChange={(e) => setReposText(e.target.value)} placeholder={"acme/pix-cobranca\nacme/pix-core"} /></Fld>
        </Modal>
      )}
      {teste && (
        <Modal title="🧪 Teste do token do GitHub" onClose={() => setTeste(null)} foot={<Button variant="primary" onClick={() => setTeste(null)}>Fechar</Button>}>
          {!teste.temToken && <p className="empty-note">Nenhum token configurado. Use <b>🔑 Token GitHub</b> ou a env var <code>GITHUB_TOKEN</code>.</p>}
          {teste.temToken && (
            <>
              <p className="sub" style={{ marginBottom: 8 }}>
                {teste.tokenOk ? <>✅ Token válido — conta <b>{teste.login}</b></> : <>❌ Token <b>não reconhecido</b> pelo GitHub (inválido/expirado/incompleto)</>}
              </p>
              <div className="sec-title">Acesso aos repositórios</div>
              {teste.repos.map((r) => (
                <div key={r.nome} className="tool-pick" style={{ cursor: "default" }}>
                  <div style={{ flex: 1 }}>
                    <div className="tp-name">{r.ok ? "✅" : "❌"} {r.nome}</div>
                    <div className="tp-src">{r.ok ? `ok${r.privado ? " · privado" : r.privado === false ? " · público" : ""}` : `HTTP ${r.status}${r.status === 404 ? " — sem acesso a este repo (scope/inclusão do repo)" : ""}`}</div>
                  </div>
                </div>
              ))}
              {teste.repos.some((r) => !r.ok) && <div className="banner" style={{ marginTop: 8 }}>💡 <span>Repo privado precisa de token <b>classic com scope <code>repo</code></b> ou <b>fine-grained incluindo o repo</b> (Contents: Read).</span></div>}
            </>
          )}
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
