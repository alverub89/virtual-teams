import { Navigate, Outlet } from "react-router-dom";
import { useMe } from "../lib/api";
import { homeDoPapel } from "../../../shared/types";

// Guarda de ÁREA por papel: impede que um papel entre por URL numa área que
// não é dele (ex.: tech_lead em /console → 403). Redireciona para a home do
// papel em vez de deixar a tela quebrar. O CTO pode entrar na área da squad
// para auditar.
export default function AreaGuard({ area }: { area: "console" | "squad" | "gestao" }) {
  const { data: me } = useMe();
  if (!me) return null;
  const pode =
    area === "console" ? me.papel === "cto"
    : area === "gestao" ? me.papel === "gestao" || me.papel === "cto"
    : ["pm", "tech_lead", "dev", "cto"].includes(me.papel);
  if (!pode) return <Navigate to={homeDoPapel(me.papel)} replace />;
  return <Outlet />;
}
