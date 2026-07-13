import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, del, post, put } from "../../lib/api";
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

  // Editor de template (criar/editar)
  const [editTpl, setEditTpl] = useState<Template | "novo" | null>(null);
  const [tNome, setTNome] = useState(""); const [tTipo, setTTipo] = useState("generico"); const [tEmoji, setTEmoji] = useState("📄"); const [tDesc, setTDesc] = useState(""); const [tConteudo, setTConteudo] = useState("");
  const abrirTpl = (t: Template | "novo") => {
    setEditTpl(t);
    if (t === "novo") { setTNome(""); setTTipo("generico"); setTEmoji("📄"); setTDesc(""); setTConteudo("# {{titulo}}\n\n"); }
    else { setTNome(t.nome); setTTipo(t.tipo); setTEmoji(t.emoji ?? "📄"); setTDesc(t.descricao ?? ""); setTConteudo(t.conteudo); }
  };
  const salvarTpl = useMutation({
    mutationFn: () => { const body = { nome: tNome, tipo: tTipo, emoji: tEmoji, descricao: tDesc, conteudo: tConteudo }; return editTpl === "novo" ? post("/console/acervo/templates", body) : put(`/console/acervo/templates/${(editTpl as Template).id}`, body); },
    onSuccess: () => { inval(); setEditTpl(null); toast("💾 Template salvo"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  // Editor de checklist (criar/editar)
  const [editCk, setEditCk] = useState<Checklist | "novo" | null>(null);
  const [cNome, setCNome] = useState(""); const [cCat, setCCat] = useState("generico"); const [cEmoji, setCEmoji] = useState("✅"); const [cDesc, setCDesc] = useState(""); const [cItens, setCItens] = useState("");
  const abrirCk = (ck: Checklist | "novo") => {
    setEditCk(ck);
    if (ck === "novo") { setCNome(""); setCCat("generico"); setCEmoji("✅"); setCDesc(""); setCItens(""); }
    else { setCNome(ck.nome); setCCat(ck.categoria); setCEmoji(ck.emoji ?? "✅"); setCDesc(ck.descricao ?? ""); setCItens(ck.itens.join("\n")); }
  };
  const salvarCk = useMutation({
    mutationFn: () => { const body = { nome: cNome, categoria: cCat, emoji: cEmoji, descricao: cDesc, itens: cItens.split("\n").map((x) => x.trim()).filter(Boolean) }; return editCk === "novo" ? post("/console/acervo/checklists", body) : put(`/console/acervo/checklists/${(editCk as Checklist).id}`, body); },
    onSuccess: () => { inval(); setEditCk(null); toast("💾 Checklist salvo"); },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

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

      <Secao titulo={`Templates (${data?.templates.length ?? 0})`} extra={<Button onClick={() => abrirTpl("novo")}>+ Novo template</Button>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
          {data?.templates.map((t) => (
            <div key={t.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 6 }}>
                <strong>{t.emoji ?? "📄"} {t.nome}</strong><OrigemChip o={t.origem} />
              </div>
              <p className="sub" style={{ margin: "4px 0 8px", fontSize: 12.5 }}>{t.descricao}</p>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn" style={{ fontSize: 12 }} onClick={() => abrirTpl(t)}>Editar</button>
                <button className="btn" style={{ fontSize: 12 }} onClick={() => confirm("Remover template?") && delTemplate.mutate(t.id)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo={`Checklists (${data?.checklists.length ?? 0})`} extra={<Button onClick={() => abrirCk("novo")}>+ Novo checklist</Button>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
          {data?.checklists.map((ck) => (
            <div key={ck.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 6 }}>
                <strong>{ck.emoji ?? "✅"} {ck.nome}</strong><OrigemChip o={ck.origem} />
              </div>
              <ul style={{ margin: "6px 0 8px", paddingLeft: 18, fontSize: 12.5 }}>
                {ck.itens.slice(0, 6).map((it, i) => <li key={i} className="sub">{it}</li>)}
              </ul>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn" style={{ fontSize: 12 }} onClick={() => abrirCk(ck)}>Editar</button>
                <button className="btn" style={{ fontSize: 12 }} onClick={() => confirm("Remover checklist?") && delChecklist.mutate(ck.id)}>🗑️</button>
              </div>
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

      {editTpl && (
        <Modal title={editTpl === "novo" ? "Novo template" : "Editar template"} onClose={() => setEditTpl(null)}
          foot={<><Button onClick={() => setEditTpl(null)}>Cancelar</Button><Button variant="primary" onClick={() => tNome.length >= 2 && tConteudo.length >= 1 && salvarTpl.mutate()}>{salvarTpl.isPending ? "Salvando…" : "Salvar"}</Button></>}>
          <div className="fld-row">
            <Fld label="Nome"><input className="in" value={tNome} onChange={(e) => setTNome(e.target.value)} /></Fld>
            <Fld label="Emoji"><input className="in" value={tEmoji} onChange={(e) => setTEmoji(e.target.value)} maxLength={2} /></Fld>
          </div>
          <div className="fld-row">
            <Fld label="Tipo">
              <select className="in" value={tTipo} onChange={(e) => setTTipo(e.target.value)}>
                {["prd", "arquitetura", "story", "sdd", "generico"].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Fld>
            <Fld label="Descrição"><input className="in" value={tDesc} onChange={(e) => setTDesc(e.target.value)} /></Fld>
          </div>
          <Fld label="Conteúdo (markdown, placeholders {{...}})">
            <textarea className="in" rows={12} value={tConteudo} onChange={(e) => setTConteudo(e.target.value)} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }} />
          </Fld>
        </Modal>
      )}

      {editCk && (
        <Modal title={editCk === "novo" ? "Novo checklist" : "Editar checklist"} onClose={() => setEditCk(null)}
          foot={<><Button onClick={() => setEditCk(null)}>Cancelar</Button><Button variant="primary" onClick={() => cNome.length >= 2 && salvarCk.mutate()}>{salvarCk.isPending ? "Salvando…" : "Salvar"}</Button></>}>
          <div className="fld-row">
            <Fld label="Nome"><input className="in" value={cNome} onChange={(e) => setCNome(e.target.value)} /></Fld>
            <Fld label="Emoji"><input className="in" value={cEmoji} onChange={(e) => setCEmoji(e.target.value)} maxLength={2} /></Fld>
          </div>
          <div className="fld-row">
            <Fld label="Categoria">
              <select className="in" value={cCat} onChange={(e) => setCCat(e.target.value)}>
                {["dor", "dod", "revisao", "seguranca", "generico"].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Fld>
            <Fld label="Descrição"><input className="in" value={cDesc} onChange={(e) => setCDesc(e.target.value)} /></Fld>
          </div>
          <Fld label="Itens (um por linha)">
            <textarea className="in" rows={8} value={cItens} onChange={(e) => setCItens(e.target.value)} placeholder="Critério verificável 1&#10;Critério verificável 2" />
          </Fld>
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
