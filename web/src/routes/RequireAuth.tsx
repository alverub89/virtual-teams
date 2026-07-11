import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useMe } from "../lib/api";

// Guarda de rotas: sem sessão → /login (o RBAC real é do servidor).
export default function RequireAuth() {
  const { data, isLoading, error } = useMe();
  const location = useLocation();
  if (isLoading)
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh", color: "var(--ink-3)" }}>
        Carregando…
      </div>
    );
  if (error || !data) return <Navigate to="/login" replace state={{ de: location.pathname }} />;
  return <Outlet />;
}
