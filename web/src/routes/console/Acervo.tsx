import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, del, post } from "../../lib/api";
import { Button, Chip, Fld, Modal, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

interface Item { id: string; nome: string; emoji: string | null; descricao?: string | null; origem: string }
interface AgenteItem extends Item { papel: string }
interface Template extends Item { tipo: string; conteudo: string }
interface Checklist extends Item { categoria: string; itens: string[] }
interface Acervo {
  jaTemBmad: boolean;
  contagem: { agentes: number; skills: number; templates: number; checklists: number };
  agentes: AgenteItem[]; skills: Item[]; templates: Template[]; checklists: Checklist[];
}

const OrigemChip = ({ o }: { o: string }) =>
  o === "bmad" ? <Chip tone="blue">BMAD</Chip> : o === "ia" ? <Chip tone="blue">🤖 IA</Chip> : <Chip tone="neutral">manual</Chip>;

export default function Acervo() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery<Acervo>({ queryKey: ["acervo"], queryFn: () => api("/console/acervo") });
  const inval = () => qc.invalidateQueries({ queryKey: ["acervo"] });

  const instalar = useMutation({
    mutationFn: () => post<{ agentes: number; skills: number; templates: number; checklists: number }>("/console/acervo/instalar-bmad"),
    onSuccess: (r) => { inval(); qc.invalidateQueries({ queryKey: ["agentes"] }); toast(`📦 Acervo BMAD instalado (+${r.agentes} agentes, +${r.skills} skills, +${r.templates} templates, +${r.checklists} checklists)`); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  const [gerar, setGerar] = useState(false);
  const [tipo, setTipo] = useState("agente");
  const [descricao, setDescricao] = useState("");
  const gerarItem = useMutation({
    mutationFn: () => post("/console/acervo/gerar", { tipo, descricao }),
    onSuccess: () => { inval(); qc.invalidateQueries({ queryKey: ["agentes"] }); setGerar(false); setDescricao(""); toast("✨ Item gerado e adicionado ao acervo"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });
  const delTemplate = useMutation({ mutationFn: (id: string) => del(`/console/acervo/templates/${id}`), onSuccess: () => { inval(); toast("🗑️ Template removido"); } });
  const delChecklist = useMutation({ mutationFn: (id: string) => del(`/console/acervo/checklists/${id}`), onSuccess: () => { inval(); toast("🗑️ Checklist removido"); } });

  const [verTpl, setVerTpl] = useState<Template | null>(null);

  return (
    <>
      <PageHead
        title="Acervo"
        description="Inteligência pronta do time (estilo BMAD): agentes, skills, templates e checklists. Instale o acervo, gere novos itens por IA — as squads consomem."
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={() => setGerar(true)}>✨ Gerar item</Button>
            {!data?.jaTemBmad && <Button variant="primary" onClick={() => instalar.mutate()}>{instalar.isPending ? "Instalando…" : "📦 Instalar acervo BMAD"}</Button>}
          </div>
        }
      />
      {data?.jaTemBmad && (
        <div className="card" style={{ marginBottom: 12, display: "flex", gap: 10, alignItems: "center" }}>
          ✅ <span className="sub">Acervo BMAD instalado. Você pode reinstalar (idempotente) para trazer itens novos, ou gerar itens sob demanda.</span>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={() => instalar.mutate()}>Reinstalar</button>
        </div>
      )}

      <Secao titulo={`Agentes (${data?.agentes.length ?? 0})`} extra={<Link to="/console/agentes" className="btn">Gerenciar agentes</Link>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 10 }}>
          {data?.agentes.map((a) => (
            <Link key={a.id} to={`/console/agentes/${a.id}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <strong>{a.emoji ?? "🤖"} {a.nome}</strong><OrigemChip o={a.origem} />
              </div>
              <p className="sub" style={{ margin: "4px 0 0", fontSize: 12.5 }}>{a.papel}</p>
            </Link>
          ))}
        </div>
      </Secao>

      <Secao titulo={`Skills (${data?.skills.length ?? 0})`} extra={<Link to="/console/skills" className="btn">Gerenciar skills</Link>}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {data?.skills.map((sk) => (
            <span key={sk.id} className="card" style={{ padding: "8px 12px", display: "inline-flex", gap: 8, alignItems: "center" }}>
              {sk.emoji ?? "🧩"} {sk.nome} <OrigemChip o={sk.origem} />
            </span>
          ))}
        </div>
      </Secao>

      <Secao titulo={`Templates (${data?.templates.length ?? 0})`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
          {data?.templates.map((t) => (
            <div key={t.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 6 }}>
                <strong>{t.emoji ?? "📄"} {t.nome}</strong><OrigemChip o={t.origem} />
              </div>
              <p className="sub" style={{ margin: "4px 0 8px", fontSize: 12.5 }}>{t.descricao}</p>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn" style={{ fontSize: 12 }} onClick={() => setVerTpl(t)}>Ver</button>
                <button className="btn" style={{ fontSize: 12 }} onClick={() => confirm("Remover template?") && delTemplate.mutate(t.id)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo={`Checklists (${data?.checklists.length ?? 0})`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
          {data?.checklists.map((ck) => (
            <div key={ck.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 6 }}>
                <strong>{ck.emoji ?? "✅"} {ck.nome}</strong><OrigemChip o={ck.origem} />
              </div>
              <ul style={{ margin: "6px 0 8px", paddingLeft: 18, fontSize: 12.5 }}>
                {ck.itens.slice(0, 6).map((it, i) => <li key={i} className="sub">{it}</li>)}
              </ul>
              <button className="btn" style={{ fontSize: 12 }} onClick={() => confirm("Remover checklist?") && delChecklist.mutate(ck.id)}>🗑️</button>
            </div>
          ))}
        </div>
      </Secao>

      {gerar && (
        <Modal title="Gerar item por IA" subtitle="Descreva o que precisa; a IA cria o item e adiciona ao acervo." onClose={() => setGerar(false)}
          foot={<><Button onClick={() => setGerar(false)}>Cancelar</Button><Button variant="primary" onClick={() => descricao.length >= 4 && gerarItem.mutate()}>{gerarItem.isPending ? "Gerando…" : "✨ Gerar"}</Button></>}>
          <Fld label="Tipo">
            <select className="in" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="agente">Agente (persona)</option>
              <option value="skill">Skill</option>
              <option value="template">Template de documento</option>
              <option value="checklist">Checklist</option>
            </select>
          </Fld>
          <Fld label="Descrição"><textarea className="in" rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: um agente de segurança que revisa ameaças; ou um checklist de prontidão para GMUD" /></Fld>
        </Modal>
      )}

      {verTpl && (
        <Modal title={`${verTpl.emoji ?? "📄"} ${verTpl.nome}`} subtitle={verTpl.descricao ?? undefined} onClose={() => setVerTpl(null)}
          foot={<Button onClick={() => setVerTpl(null)}>Fechar</Button>}>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12.5, background: "var(--card-2, rgba(127,127,127,.1))", padding: 12, borderRadius: 8 }}>{verTpl.conteudo}</pre>
        </Modal>
      )}
    </>
  );
}

function Secao({ titulo, extra, children }: { titulo: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{titulo}</h3><div style={{ flex: 1 }} />{extra}
      </div>
      {children}
    </div>
  );
}
