import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, put, useMe } from "../../lib/api";
import { Button, Chip, PageHead } from "../../components/ui";
import { useToast } from "../../lib/toast";

interface AgenteResumo {
  id: string;
  nome: string;
  papel: string;
  emoji: string | null;
  personalidade: string;
  nivelModelo: string;
  ativo: boolean;
  skills: { id: string; nome: string; emoji: string | null }[];
  tools: { id: string; nome: string; permissao: string }[];
}

export default function Agentes() {
  const navigate = useNavigate();
  const { data: agentes } = useQuery<AgenteResumo[]>({
    queryKey: ["agentes"],
    queryFn: () => api("/console/agentes"),
  });

  return (
    <>
      <PageHead
        title="Agentes, Skills & Tools"
        description="O catálogo de agentes da plataforma: personalidade, skills que sabem executar e tools que podem usar — com permissão explícita."
      />
      <div className="grid g3">
        {agentes?.map((a) => (
          <div key={a.id} className="agent-card" onClick={() => navigate(`/console/agentes/${a.id}`)}>
            <div className="ac-top">
              <span className="ac-av">{a.emoji ?? "🤖"}</span>
              <div>
                <h3>{a.nome}</h3>
                <div className="ac-role">{a.papel} · modelo {a.nivelModelo}</div>
              </div>
            </div>
            <p className="ac-pers">“{a.personalidade.slice(0, 110)}…”</p>
            <div className="ac-foot">
              {a.skills.map((sk) => (
                <span key={sk.id} className="pill">{sk.emoji ?? "✨"} {sk.nome}</span>
              ))}
              {a.tools.map((t) => (
                <span key={t.id} className={`perm ${t.permissao}`}>{t.nome}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

interface AgenteDetalhe {
  id: string;
  nome: string;
  papel: string;
  emoji: string | null;
  personalidade: string;
  nivelModelo: string;
  maxTokens: number;
  ativo: boolean;
  skillIds: string[];
  toolIds: string[];
  catalogoSkills: { id: string; nome: string; emoji: string | null; descricao: string | null }[];
  catalogoTools: { id: string; nome: string; descricao: string | null; permissao: string; mcp: string }[];
  promptGerado: string;
}

export function AgenteEdit() {
  const { id } = useParams();
  const { data: me } = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: agente } = useQuery<AgenteDetalhe>({
    queryKey: ["agente", id],
    queryFn: () => api(`/console/agentes/${id}`),
  });

  const [personalidade, setPersonalidade] = useState("");
  const [nivelModelo, setNivelModelo] = useState("intermediario");
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [toolIds, setToolIds] = useState<string[]>([]);

  useEffect(() => {
    if (!agente) return;
    setPersonalidade(agente.personalidade);
    setNivelModelo(agente.nivelModelo);
    setSkillIds(agente.skillIds);
    setToolIds(agente.toolIds);
  }, [agente?.id]);

  const salvar = useMutation({
    mutationFn: () => put(`/console/agentes/${id}`, { personalidade, nivelModelo, skillIds, toolIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agente", id] });
      qc.invalidateQueries({ queryKey: ["agentes"] });
      toast("🤖 Agente atualizado — vale para todas as squads");
    },
    onError: (e) => toast(`⚠️ ${(e as Error).message}`),
  });

  if (!agente) return <p className="muted">Carregando…</p>;
  const editavel = me?.papel === "arquiteto";
  const toggle = (arr: string[], setArr: (v: string[]) => void, val: string) =>
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);

  return (
    <>
      <PageHead
        crumbs={<><Link to="/console/agentes">Agentes & Skills</Link> › {agente.nome}</>}
        title={`${agente.emoji ?? "🤖"} ${agente.nome}`}
        description={agente.papel}
        actions={
          editavel && (
            <Button variant="primary" onClick={() => salvar.mutate()}>
              {salvar.isPending ? "Salvando…" : "Salvar alterações"}
            </Button>
          )
        }
      />
      <div className="grid g2" style={{ alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card card-pad">
            <h3>Identidade</h3>
            <p className="sub" style={{ marginBottom: 8 }}>personalidade que abre o prompt de sistema</p>
            <textarea className="in" rows={4} value={personalidade} disabled={!editavel} onChange={(e) => setPersonalidade(e.target.value)} />
            <div className="fld-row" style={{ marginTop: 10 }}>
              <div className="fld">
                <label>Nível de modelo</label>
                <select className="in" value={nivelModelo} disabled={!editavel} onChange={(e) => setNivelModelo(e.target.value)}>
                  <option value="avancado">avançado</option>
                  <option value="intermediario">intermediário</option>
                  <option value="leve">leve</option>
                </select>
              </div>
              <div className="fld">
                <label>Teto de tokens</label>
                <input className="in" disabled value={agente.maxTokens} />
              </div>
            </div>
          </div>
          <div className="card card-pad">
            <h3>Skills</h3>
            <p className="sub" style={{ marginBottom: 8 }}>o que este agente sabe executar</p>
            {agente.catalogoSkills.map((sk) => (
              <label key={sk.id} className="tool-pick" style={{ cursor: editavel ? "pointer" : "default" }}>
                <input type="checkbox" checked={skillIds.includes(sk.id)} disabled={!editavel} onChange={() => toggle(skillIds, setSkillIds, sk.id)} />
                <div>
                  <div className="tp-name">{sk.emoji ?? "✨"} {sk.nome}</div>
                  <div className="tp-src">{sk.descricao}</div>
                </div>
              </label>
            ))}
          </div>
          <div className="card card-pad">
            <h3>Tools</h3>
            <p className="sub" style={{ marginBottom: 8 }}>ações críticas exigem checkpoint humano — sempre</p>
            {agente.catalogoTools.map((t) => (
              <label key={t.id} className="tool-pick" style={{ cursor: editavel ? "pointer" : "default" }}>
                <input type="checkbox" checked={toolIds.includes(t.id)} disabled={!editavel} onChange={() => toggle(toolIds, setToolIds, t.id)} />
                <div>
                  <div className="tp-name">{t.nome}</div>
                  <div className="tp-src">via {t.mcp} · {t.descricao}</div>
                </div>
                <span className={`perm ${t.permissao}`}>{t.permissao}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="card card-pad" style={{ position: "sticky", top: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ flex: 1 }}>Prompt de sistema (gerado)</h3>
            <Chip>identidade + skills + tools + guard-rails</Chip>
          </div>
          <p className="sub" style={{ marginBottom: 10 }}>composição automática — é exatamente o que o modelo recebe</p>
          <div className="prompt-box">{agente.promptGerado}</div>
        </div>
      </div>
    </>
  );
}
