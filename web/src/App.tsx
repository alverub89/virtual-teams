import { Route, Routes } from "react-router-dom";
import AppShell from "./layout/AppShell";
import Entry from "./routes/Entry";
import Login from "./routes/Login";
import Placeholder from "./routes/Placeholder";
import { CONSOLE_NAV, GESTAO_NAV, SQUAD_NAV, type NavSection } from "./routes/nav";

const flat = (sections: NavSection[]) => sections.flatMap((s) => s.items);

function shellRoutes(sections: NavSection[]) {
  return flat(sections).map((item) => (
    <Route key={item.path} path={item.path} element={<Placeholder item={item} />} />
  ));
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Entry />} />

      <Route
        element={
          <AppShell
            sections={SQUAD_NAV}
            foot={
              <>
                Método da squad: <b>BMAD Method v6</b>
                <br />
                definido no Console da Plataforma
              </>
            }
          />
        }
      >
        {shellRoutes(SQUAD_NAV)}
      </Route>

      <Route
        element={
          <AppShell
            sections={CONSOLE_NAV}
            foot={
              <>
                Alterações aqui valem para as squads da diretoria. Tudo é versionado e
                auditável.
              </>
            }
          />
        }
      >
        {shellRoutes(CONSOLE_NAV)}
      </Route>

      <Route
        element={
          <AppShell
            sections={GESTAO_NAV}
            foot={
              <>
                Visão de diretoria · <b>consulta</b>. As documentações são somente
                leitura aqui.
              </>
            }
          />
        }
      >
        {shellRoutes(GESTAO_NAV)}
      </Route>
    </Routes>
  );
}
