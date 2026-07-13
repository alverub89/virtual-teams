import { Route, Routes } from "react-router-dom";
import AppShell from "./layout/AppShell";
import { ToastProvider } from "./lib/toast";
import { CONSOLE_NAV, GESTAO_NAV, SQUAD_NAV } from "./routes/nav";
import Entry from "./routes/Entry";
import Login from "./routes/Login";
import Convite from "./routes/Convite";
import Onboarding from "./routes/Onboarding";
import RequireAuth from "./routes/RequireAuth";
import Iniciativas from "./routes/squad/Iniciativas";
import Time from "./routes/squad/Time";
import Assistente from "./routes/squad/Assistente";
import Lab from "./routes/squad/Lab";
import Jornada from "./routes/squad/Jornada";
import Okrs from "./routes/squad/Okrs";
import Autonoma from "./routes/squad/Autonoma";
import Capacidades from "./routes/squad/Capacidades";
import EstacaoDev from "./routes/squad/EstacaoDev";
import Docs, { DocReader } from "./routes/squad/Docs";
import Kb, { KbArtigo } from "./routes/squad/Kb";
import Esteira from "./routes/squad/Esteira";
import Comunidade from "./routes/squad/Comunidade";
import CfgHome from "./routes/console/CfgHome";
import Convites from "./routes/console/Convites";
import Estrutura from "./routes/console/Estrutura";
import Skills from "./routes/console/Skills";
import Tools from "./routes/console/Tools";
import Agentes, { AgenteEdit } from "./routes/console/Agentes";
import { Blueprints, EsteiraConfig, Mcps, Metodos } from "./routes/console/Plataforma";
import McpDetalhe from "./routes/console/McpDetalhe";
import Playground from "./routes/console/Playground";
import Aprovacoes from "./routes/console/Aprovacoes";
import PopularDemo from "./routes/PopularDemo";
import Indicadores from "./routes/gestao/Indicadores";
import { DocsComunidade, DocsFeatures } from "./routes/gestao/DocsGestao";

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/convite/:token" element={<Convite />} />

        <Route element={<RequireAuth />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/popular-demo" element={<PopularDemo />} />
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
            <Route path="/comunidade" element={<Comunidade />} />
            <Route path="/squad/iniciativas" element={<Iniciativas />} />
            <Route path="/squad/iniciativas/:codigo" element={<Jornada />} />
            <Route path="/squad/time" element={<Time />} />
            <Route path="/squad/assistente" element={<Assistente />} />
            <Route path="/squad/lab" element={<Lab />} />
            <Route path="/squad/okrs" element={<Okrs />} />
            <Route path="/squad/autonoma" element={<Autonoma />} />
            <Route path="/squad/capacidades" element={<Capacidades />} />
            <Route path="/squad/dev" element={<EstacaoDev />} />
            <Route path="/squad/docs" element={<Docs />} />
            <Route path="/squad/docs/:id" element={<DocReader base="/squad/docs" />} />
            <Route path="/squad/kb" element={<Kb />} />
            <Route path="/squad/kb/:id" element={<KbArtigo />} />
            <Route path="/squad/esteira" element={<Esteira />} />
          </Route>

          <Route
            element={
              <AppShell
                sections={CONSOLE_NAV}
                foot={<>Alterações aqui valem para as squads da diretoria. Tudo é versionado e auditável.</>}
              />
            }
          >
            <Route path="/console" element={<CfgHome />} />
            <Route path="/console/estrutura" element={<Estrutura />} />
            <Route path="/console/convites" element={<Convites />} />
            <Route path="/console/skills" element={<Skills />} />
            <Route path="/console/tools" element={<Tools />} />
            <Route path="/console/arquitetura" element={<Blueprints />} />
            <Route path="/console/esteira" element={<EsteiraConfig />} />
            <Route path="/console/metodos" element={<Metodos />} />
            <Route path="/console/agentes" element={<Agentes />} />
            <Route path="/console/agentes/:id" element={<AgenteEdit />} />
            <Route path="/console/mcps" element={<Mcps />} />
            <Route path="/console/mcps/:id" element={<McpDetalhe />} />
            <Route path="/console/playground" element={<Playground />} />
            <Route path="/console/aprovacoes" element={<Aprovacoes />} />
          </Route>

          <Route
            element={
              <AppShell
                sections={GESTAO_NAV}
                foot={<>Visão de diretoria · <b>consulta</b>. As documentações são somente leitura aqui.</>}
              />
            }
          >
            <Route path="/gestao" element={<Indicadores />} />
            <Route path="/gestao/features" element={<DocsFeatures />} />
            <Route path="/gestao/features/:id" element={<DocReader base="/gestao/features" />} />
            <Route path="/gestao/comunidade" element={<DocsComunidade />} />
            <Route path="/gestao/comunidade/:id" element={<DocReader base="/gestao/comunidade" />} />
          </Route>
        </Route>
      </Routes>
    </ToastProvider>
  );
}
