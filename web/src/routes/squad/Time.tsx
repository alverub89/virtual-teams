import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, del, post, put } from "../../lib/api";
import { Button, Card, Chip, Fld, Modal, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

interface Membro { id: string; nome: string; email: string; papel: string; papelLabel: string; ehVoce: boolean }
interface Repo { id: string; nome: string; linguagem: string | null; url: string | null }
interface Convite { id: string; email: string; papel: string; emailEnviado: boolean }
interface Dados { squad: { id: string; nome: string } | null; podeEditar: boolean; membros: Membro[]; repos: Repo[]; convites: Convite[] }

export default function Time() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery<Dados>({ queryKey: ["time"], queryFn: () => api("/time") });

  const [nome, setNome] = useState("");
  useEffect(() => { if (data?.squad) setNome(data.squad.nome); }, [data?.squad?.id]);

  const [convite, setConvite] = useState(false);
  const [email, setEmail] = useState("");

  const [repoModal, setRepoModal] = useState(false);
  const [reposText, setReposText] = useState("");

  const invalidar = () => qc.invalidateQueries({ queryKey: ["time"] });

  const salvarNome = useMutation({
    mutationFn: () => put("/time/nome", { nome }),
    onSuccess: () => { invalidar(); qc.invalidateQueries({ queryKey: ["me"] }); toast("✏️ Squad renomeada"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const convidar = useMutation({
    mutationFn: () => post("/convites", { email, papel: "dev", squadId: data?.squad?.id }),
    onSuccess: () => { invalidar(); setConvite(false); setEmail(""); toast("✉️ Convite enviado (dev)"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const addRepos = useMutation({
    mutationFn: () => {
      const repos = reposText.split("\n").map((l) => l.trim()).filter((l) => l.includes("/")).map((nome) => ({ nome }));
      if (!repos.length) throw new Error("informe ao menos um repo no formato org/repo");
      return post<{ criados: number }>("/time/repos", { repos });
    },
    onSuccess: (r) => { invalidar(); setRepoModal(false); setReposText(""); toast(`🔗 ${r.criados} repositório(s) conectado(s)`); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const removerRepo = useMutation({
    mutationFn: (id: string) => del(`/time/repos/${id}`),
    onSuccess: () => { invalidar(); toast("🗑️ Repositório removido"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  if (!data) return <p className="muted">Carregando…</p>;
  if (!data.squad) return <p className="empty-note">Você ainda não está em uma squad.</p>;
  const ed = data.podeEditar;

  return (
    <>
      <PageHead
        title={`Time & Squad — ${data.squad.nome}`}
        description="Gerencie o time da sua squad, convide desenvolvedores e conecte os repositórios em que vocês trabalham."
        actions={ed && <><Button onClick={() => setRepoModal(true)}>+ Repositórios</Button><Button variant="primary" onClick={() => setConvite(true)}>+ Convidar dev</Button></>}
      />

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card pad>
            <h3>Identidade da squad</h3>
            <p className="sub" style={{ marginBottom: 8 }}>nome exibido em toda a plataforma</p>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="in" value={nome} disabled={!ed} onChange={(e) => setNome(e.target.value)} />
              {ed && <Button variant="primary" onClick={() => nome.length >= 2 && salvarNome.mutate()}>{salvarNome.isPending ? "…" : "Salvar"}</Button>}
            </div>
          </Card>

          <Card pad>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ flex: 1 }}>Time</h3>
              <Chip>{data.membros.length} pessoa(s)</Chip>
            </div>
            {data.membros.map((m) => (
              <div key={m.id} className="tool-pick" style={{ cursor: "default" }}>
                <div>
                  <div className="tp-name">{m.nome} {m.ehVoce && <span className="muted">(você)</span>}</div>
                  <div className="tp-src">{m.email}</div>
                </div>
                <span className="pill">{m.papelLabel}</span>
              </div>
            ))}
            {data.convites.length > 0 && (
              <>
                <div className="sec-title" style={{ marginTop: 12 }}>Convites pendentes</div>
                {data.convites.map((v) => (
                  <div key={v.id} className="tool-pick" style={{ cursor: "default" }}>
                    <div><div className="tp-name">{v.email}</div><div className="tp-src">aguardando aceite {v.emailEnviado ? "· email enviado" : "· link manual"}</div></div>
                    <span className="pill">{v.papel}</span>
                  </div>
                ))}
              </>
            )}
          </Card>
        </div>

        <Card pad>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ flex: 1 }}>Repositórios</h3>
            <Chip>{data.repos.length}</Chip>
          </div>
          <p className="sub" style={{ marginBottom: 8 }}>os repositórios GitHub em que a squad trabalha</p>
          {data.repos.length === 0 && <p className="empty-note">Nenhum repositório conectado. Use <b>+ Repositórios</b>.</p>}
          {data.repos.map((r) => (
            <div key={r.id} className="tool-pick" style={{ cursor: "default" }}>
              <div style={{ flex: 1 }}>
                <div className="tp-name">{r.nome}</div>
                {r.url && <a className="tp-src" href={r.url} target="_blank" rel="noreferrer">{r.url}</a>}
              </div>
              {r.linguagem && <span className="pill">{r.linguagem}</span>}
              {ed && <button className="modal-x" title="Remover" onClick={() => confirm(`Remover ${r.nome}?`) && removerRepo.mutate(r.id)}>✕</button>}
            </div>
          ))}
          <div className="banner" style={{ marginTop: 10 }}>
            🔗 <span>Em breve: conectar o GitHub por login (OAuth) para escolher os repositórios da lista e criar repos novos. Hoje você associa por nome <code>org/repo</code>.</span>
          </div>
        </Card>
      </div>

      {convite && (
        <Modal title="Convidar desenvolvedor" subtitle="O convite entra para a sua squad com o papel dev." onClose={() => setConvite(false)}
          foot={<><Button onClick={() => setConvite(false)}>Cancelar</Button><Button variant="primary" onClick={() => /\S+@\S+\.\S+/.test(email) && convidar.mutate()}>{convidar.isPending ? "Enviando…" : "Enviar convite"}</Button></>}>
          <Fld label="Email do dev"><input className="in" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" /></Fld>
        </Modal>
      )}

      {repoModal && (
        <Modal title="Conectar repositórios" subtitle="Um por linha, no formato org/repo. Pode colar vários." onClose={() => setRepoModal(false)}
          foot={<><Button onClick={() => setRepoModal(false)}>Cancelar</Button><Button variant="primary" onClick={() => addRepos.mutate()}>{addRepos.isPending ? "Conectando…" : "Conectar"}</Button></>}>
          <Fld label="Repositórios (org/repo por linha)">
            <textarea className="in" rows={5} value={reposText} onChange={(e) => setReposText(e.target.value)} placeholder={"itau/pix-cobranca\nitau/pix-core\nitau/consent-service"} />
          </Fld>
        </Modal>
      )}
    </>
  );
}
