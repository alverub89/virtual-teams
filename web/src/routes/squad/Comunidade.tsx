import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, del, post } from "../../lib/api";
import { Button, Card, Chip, Fld, Modal, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";
import { PAPEL_LABEL, type Papel } from "../../../../shared/types";

interface Pessoa { id: string; nome: string; email: string; papel: string; papelLabel: string; squadNome: string | null; ehVoce: boolean }
interface Convite { id: string; email: string; papel: string; papelLabel: string; squadNome: string | null }
interface RT { id: string; nome: string; squads: { id: string; nome: string; pessoas: number; minha: boolean }[] }
interface Repo { id: string; nome: string; linguagem: string | null; url: string | null }
interface Dados {
  comunidade: { id: string; nome: string } | null;
  podeConvidar: boolean;
  papeisConvidaveis: Papel[];
  minhaSquadNome: string | null;
  podeEditarRepos: boolean;
  repos: Repo[];
  squads: { id: string; nome: string }[];
  releaseTrains: RT[];
  lideranca: Pessoa[];
  membros: Pessoa[];
  convites: Convite[];
}

export default function Comunidade() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery<Dados>({ queryKey: ["comunidade"], queryFn: () => api("/comunidade") });

  const [aberto, setAberto] = useState<null | "membro" | "lideranca">(null);
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("dev");
  const [squadId, setSquadId] = useState("");

  const [repoModal, setRepoModal] = useState(false);
  const [reposText, setReposText] = useState("");
  const addRepos = useMutation({
    mutationFn: () => {
      const repos = reposText.split("\n").map((l) => l.trim()).filter((l) => l.includes("/")).map((nome) => ({ nome }));
      if (!repos.length) throw new Error("informe ao menos um repo no formato org/repo");
      return post<{ criados: number }>("/time/repos", { repos });
    },
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["comunidade"] }); setRepoModal(false); setReposText(""); toast(`🔗 ${r.criados} repositório(s) conectado(s)`); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });
  const removerRepo = useMutation({
    mutationFn: (id: string) => del(`/time/repos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["comunidade"] }); toast("🗑️ Repositório removido"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const abrir = (tipo: "membro" | "lideranca") => {
    setAberto(tipo);
    setEmail(""); setSquadId(data?.squads[0]?.id ?? "");
    setPapel(tipo === "membro" ? "dev" : (data?.papeisConvidaveis.find((p) => p !== "dev") ?? "tech_lead"));
  };

  const convidar = useMutation({
    mutationFn: () => post("/convites", { email, papel, squadId: papel === "gestao" ? undefined : squadId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["comunidade"] }); setAberto(null); toast("✉️ Convite enviado"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  if (!data) return <p className="muted">Carregando…</p>;
  if (!data.comunidade) return <p className="empty-note">Você ainda não está em uma comunidade.</p>;

  const opcoesLideranca = data.papeisConvidaveis.filter((p) => p !== "dev");
  const linhaPessoa = (p: Pessoa) => (
    <div key={p.id} className="tool-pick" style={{ cursor: "default" }}>
      <div style={{ flex: 1 }}>
        <div className="tp-name">{p.nome} {p.ehVoce && <span className="muted">(você)</span>}</div>
        <div className="tp-src">{p.email}{p.squadNome ? ` · ${p.squadNome}` : ""}</div>
      </div>
      <span className="pill">{p.papelLabel}</span>
    </div>
  );

  return (
    <>
      <PageHead
        title={`Comunidade ${data.comunidade.nome}`}
        description="A sua comunidade: estrutura, lideranças e membros. Adicione pessoas e lideranças por aqui."
        actions={data.podeConvidar && (
          <>
            {opcoesLideranca.length > 0 && <Button onClick={() => abrir("lideranca")}>+ Liderança</Button>}
            <Button variant="primary" onClick={() => abrir("membro")}>+ Membro</Button>
          </>
        )}
      />

      <div className="sec-title">Estrutura</div>
      <div className="grid g3" style={{ alignItems: "start", marginBottom: 8 }}>
        {data.releaseTrains.map((rt) => (
          <Card key={rt.id} pad>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span>🚆</span><h3 style={{ flex: 1 }}>{rt.nome}</h3><Chip>{rt.squads.length} squads</Chip>
            </div>
            {rt.squads.map((sq) => (
              <div key={sq.id} className="tool-pick" style={{ cursor: "default" }}>
                <div style={{ flex: 1 }}><div className="tp-name">{sq.nome} {sq.minha && <span className="muted">· sua</span>}</div><div className="tp-src">{sq.pessoas} pessoa(s)</div></div>
                {sq.minha && <Chip tone="blue">sua squad</Chip>}
              </div>
            ))}
            {rt.squads.length === 0 && <p className="empty-note">Sem squads.</p>}
          </Card>
        ))}
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <Card pad>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><h3 style={{ flex: 1 }}>Lideranças</h3><Chip>{data.lideranca.length}</Chip></div>
          <p className="sub" style={{ marginBottom: 6 }}>CTO, PMs, tech leads e gestão</p>
          {data.lideranca.map(linhaPessoa)}
        </Card>
        <Card pad>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><h3 style={{ flex: 1 }}>Membros</h3><Chip>{data.membros.length}</Chip></div>
          <p className="sub" style={{ marginBottom: 6 }}>desenvolvedores das squads</p>
          {data.membros.length === 0 && <p className="empty-note">Nenhum membro ainda.</p>}
          {data.membros.map(linhaPessoa)}
        </Card>
      </div>

      {data.minhaSquadNome && (
        <>
          <div className="sec-title" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <span>Repositórios · {data.minhaSquadNome}</span>
            {data.podeEditarRepos && <button className="btn" style={{ padding: "2px 10px" }} onClick={() => setRepoModal(true)}>+ Conectar</button>}
          </div>
          <Card pad>
            {data.repos.length === 0 && <p className="empty-note">Nenhum repositório conectado à sua squad.</p>}
            {data.repos.map((r) => (
              <div key={r.id} className="tool-pick" style={{ cursor: "default" }}>
                <div style={{ flex: 1 }}><div className="tp-name">{r.nome}</div>{r.url && <a className="tp-src" href={r.url} target="_blank" rel="noreferrer">{r.url}</a>}</div>
                {r.linguagem && <span className="pill">{r.linguagem}</span>}
                {data.podeEditarRepos && <button className="modal-x" title="Remover" onClick={() => confirm(`Remover ${r.nome}?`) && removerRepo.mutate(r.id)}>✕</button>}
              </div>
            ))}
          </Card>
        </>
      )}

      {data.convites.length > 0 && (
        <>
          <div className="sec-title" style={{ marginTop: 14 }}>Convites pendentes</div>
          <Card pad>
            {data.convites.map((v) => (
              <div key={v.id} className="tool-pick" style={{ cursor: "default" }}>
                <div style={{ flex: 1 }}><div className="tp-name">{v.email}</div><div className="tp-src">{v.squadNome ?? "comunidade"} · aguardando aceite</div></div>
                <span className="pill">{v.papelLabel}</span>
              </div>
            ))}
          </Card>
        </>
      )}

      {aberto && (
        <Modal
          title={aberto === "lideranca" ? "Adicionar liderança" : "Adicionar membro"}
          subtitle={aberto === "lideranca" ? "PM ou Tech Lead de uma squad." : "Desenvolvedor(a) de uma squad."}
          onClose={() => setAberto(null)}
          foot={<><Button onClick={() => setAberto(null)}>Cancelar</Button><Button variant="primary" onClick={() => /\S+@\S+\.\S+/.test(email) && (papel === "gestao" || squadId) && convidar.mutate()}>{convidar.isPending ? "Enviando…" : "Enviar convite"}</Button></>}
        >
          <Fld label="Email"><input className="in" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" /></Fld>
          <div className="fld-row">
            <Fld label="Papel">
              <select className="in" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
                {(aberto === "lideranca" ? opcoesLideranca : (["dev"] as Papel[])).map((p) => <option key={p} value={p}>{PAPEL_LABEL[p]}</option>)}
              </select>
            </Fld>
            {papel !== "gestao" && (
              <Fld label="Squad">
                <select className="in" value={squadId} onChange={(e) => setSquadId(e.target.value)}>
                  <option value="">— selecionar —</option>
                  {data.squads.map((sq) => <option key={sq.id} value={sq.id}>{sq.nome}</option>)}
                </select>
              </Fld>
            )}
          </div>
        </Modal>
      )}

      {repoModal && (
        <Modal title="Conectar repositórios" subtitle="Um por linha, no formato org/repo. Pode colar vários." onClose={() => setRepoModal(false)}
          foot={<><Button onClick={() => setRepoModal(false)}>Cancelar</Button><Button variant="primary" onClick={() => addRepos.mutate()}>{addRepos.isPending ? "Conectando…" : "Conectar"}</Button></>}>
          <Fld label="Repositórios (org/repo por linha)">
            <textarea className="in" rows={5} value={reposText} onChange={(e) => setReposText(e.target.value)} placeholder={"acme/pix-cobranca\nacme/pix-core\nacme/consent-service"} />
          </Fld>
        </Modal>
      )}
    </>
  );
}
