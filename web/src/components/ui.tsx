import type { CSSProperties, ReactNode } from "react";

// Primitivos do design system, recortados do protótipo (docs/spec, seção 4.0).

// Estado de erro de carregamento — mostra mensagem clara (permissão-aware) em
// vez de deixar a tela travada em "Carregando…".
export function EstadoErro({ error }: { error: unknown }) {
  const status = (error as { status?: number })?.status;
  const msg = (error as { message?: string })?.message ?? "Erro ao carregar";
  const semPermissao = status === 403;
  return (
    <div className="card" style={{ textAlign: "center", padding: 28, maxWidth: 560, margin: "12px auto" }}>
      <div style={{ fontSize: 30 }}>{semPermissao ? "🔒" : "⚠️"}</div>
      <h3 style={{ margin: "8px 0 4px" }}>{semPermissao ? "Sem permissão para esta área" : "Não foi possível carregar"}</h3>
      <p className="sub">{semPermissao ? "Seu papel atual não tem acesso a esta tela. Troque de perfil ou peça acesso ao CTO." : msg}</p>
    </div>
  );
}

export function Chip({
  tone = "neutral",
  children,
}: {
  tone?: "blue" | "good" | "warn" | "crit" | "neutral";
  children: ReactNode;
}) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

export function Card({
  children,
  pad = true,
  className = "",
  style,
}: {
  children: ReactNode;
  pad?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return <div className={`card ${pad ? "card-pad" : ""} ${className}`} style={style}>{children}</div>;
}

export function Button({
  variant,
  children,
  onClick,
  type = "button",
}: {
  variant?: "primary" | "ghost";
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button type={type} className={`btn ${variant ?? ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  foot,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

export function Fld({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fld">
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Kpi({
  label,
  value,
  suffix,
  delta,
  tone,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  delta?: string;
  tone?: "up" | "down" | "flat";
}) {
  return (
    <div className="card kpi">
      <div className="k-label">{label}</div>
      <div className="k-value">
        {value}
        {suffix && <small> {suffix}</small>}
      </div>
      {delta && <div className={`k-delta ${tone ?? "flat"}`}>{delta}</div>}
    </div>
  );
}

/* Barra horizontal de magnitude — matiz único, rótulo de valor sempre
   visível (exigência do validador de contraste). */
export function HBar({
  rows,
  format = (v) => String(v),
}: {
  rows: { label: string; value: number }[];
  format?: (v: number) => string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div>
      {rows.map((r) => (
        <div className="hbar-row" key={r.label}>
          <span className="lbl" title={r.label}>{r.label}</span>
          <div className="hbar-track">
            <div className="hbar" style={{ width: `${(r.value / max) * 100}%` }} title={`${r.label}: ${format(r.value)}`} />
          </div>
          <span className="val">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

const ESCOPO_LABEL: Record<string, string> = {
  squad: "Squad",
  release_train: "Release Train",
  comunidade: "Comunidade",
};
export function EscopoChip({ escopo }: { escopo: string }) {
  const cls = escopo === "comunidade" ? "scope-comm" : escopo === "release_train" ? "scope-rt" : "scope-sq";
  return <span className={`chip ${cls}`}>{ESCOPO_LABEL[escopo] ?? escopo}</span>;
}

export function PageHead({
  title,
  description,
  crumbs,
  actions,
}: {
  title: string;
  description?: string;
  crumbs?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <>
      {crumbs && <div className="crumbs">{crumbs}</div>}
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
    </>
  );
}
