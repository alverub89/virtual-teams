import type { ReactNode } from "react";

// Primitivos do design system, recortados do protótipo (docs/spec, seção 4.0).

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
}: {
  children: ReactNode;
  pad?: boolean;
  className?: string;
}) {
  return <div className={`card ${pad ? "card-pad" : ""} ${className}`}>{children}</div>;
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
