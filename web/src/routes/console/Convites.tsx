import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post } from "../../lib/api";
import { Button, Card, Chip, Fld, Modal, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

interface Convite {
  id: string;
  email: string;
  papel: string;
  status: string;
  squadNome: string | null;
  emailEnviado: boolean;
  link: string;
  criadoEm: string;
}
interface Setup { squads: { id: string; nome: string }[] }

const PAPEIS = [
  { v: "pm", l: "Product Manager" },
  { v: "tech_lead", l: "Tech Lead" },
  { v: "gestao", l: "Gestão" },
];
const PAPEL_L: Record<string, string> = { pm: "PM", tech_lead: "Tech Lead", gestao: "Gestão", dev: "Dev" };

export default function Convites() {
  const toast = useToast();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState("pm");
  const [squadId, setSquadId] = useState("");
  const [params, setParams] = useSearchParams();

  const { data: convites } = useQuery<Convite[]>({ queryKey: ["convites"], queryFn: () => api("/convites") });
  const { data: setup } = useQuery<Setup>({ queryKey: ["console-setup"], queryFn: () => api("/console/setup") });

  // Atalho vindo do card da squad (Console): abre já convidando para ela.
  useEffect(() => {
    const sq = params.get("squad");
    if (sq) {
      setSquadId(sq);
      setPapel("pm");
      setAberto(true);
      params.delete("squad");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const criar = useMutation({
    mutationFn: () =>
      post<{ link: string; emailEnviado: boolean }>("/convites", {
        email,
        papel,
        squadId: papel === "gestao" ? undefined : squadId || undefined,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["convites"] });
      qc.invalidateQueries({ queryKey: ["console-setup"] });
      setAberto(false);
      setEmail("");
      toast(r.emailEnviado ? "✉️ Convite enviado por email" : "🔗 Convite criado — copie o link para enviar");
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const copiar = (link: string) => {
    navigator.clipboard?.writeText(link);
    toast("🔗 Link copiado");
  };

  const podeCriar = email.includes("@") && (papel === "gestao" || squadId);

  return (
    <>
      <PageHead
        title="Convites"
        description="Convide pessoas para as squads (PM, Tech Lead) ou para a gestão. Elas recebem por email e entram já no lugar certo."
        actions={<Button variant="primary" onClick={() => setAberto(true)}>+ Novo convite</Button>}
      />

      {convites?.length === 0 && <p className="empty-note">Nenhum convite ainda — convide a primeira pessoa.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {convites?.map((v) => (
          <Card key={v.id} pad>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{v.email}</b>
                <div className="sub">{PAPEL_L[v.papel] ?? v.papel}{v.squadNome ? ` · ${v.squadNome}` : ""}</div>
              </div>
              <Chip tone={v.status === "aceito" ? "good" : v.status === "cancelado" ? "crit" : "warn"}>{v.status}</Chip>
              {v.status === "pendente" && (
                <>
                  <Chip tone={v.emailEnviado ? "good" : "neutral"}>{v.emailEnviado ? "email enviado" : "sem email"}</Chip>
                  <Button onClick={() => copiar(v.link)}>Copiar link</Button>
                </>
              )}
            </div>
            {v.status === "pendente" && !v.emailEnviado && (
              <div className="mono" data-invite-link style={{ marginTop: 8, fontSize: 11, color: "var(--ink-3)", wordBreak: "break-all" }}>
                {v.link}
              </div>
            )}
          </Card>
        ))}
      </div>

      {aberto && (
        <Modal
          title="Novo convite"
          subtitle="A pessoa recebe um email com o link para definir a senha e entrar."
          onClose={() => setAberto(false)}
          foot={
            <>
              <Button onClick={() => setAberto(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => podeCriar && criar.mutate()}>
                {criar.isPending ? "Enviando…" : "Enviar convite"}
              </Button>
            </>
          }
        >
          <Fld label="Email">
            <input className="in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" autoCapitalize="none" />
          </Fld>
          <div className="fld-row">
            <Fld label="Papel">
              <select className="in" value={papel} onChange={(e) => setPapel(e.target.value)}>
                {PAPEIS.map((p) => (
                  <option key={p.v} value={p.v}>{p.l}</option>
                ))}
              </select>
            </Fld>
            {papel !== "gestao" && (
              <Fld label="Squad">
                <select className="in" value={squadId} onChange={(e) => setSquadId(e.target.value)}>
                  <option value="">— selecionar —</option>
                  {setup?.squads.map((sq) => (
                    <option key={sq.id} value={sq.id}>{sq.nome}</option>
                  ))}
                </select>
              </Fld>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
