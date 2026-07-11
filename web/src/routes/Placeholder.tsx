import { Card, Chip, PageHead } from "../components/ui";
import type { NavItem } from "./nav";

// Tela em construção: mantém título/descrição reais do protótipo e indica
// em que fase do roadmap (docs/spec, seção 15) ela ganha dados do Neon.
export default function Placeholder({ item }: { item: NavItem }) {
  return (
    <>
      <PageHead title={item.title} description={item.description} />
      <Card>
        <h3>
          Em construção <Chip tone="blue">{item.fase}</Chip>
        </h3>
        <p className="sub">
          Esta tela será portada do protótipo (docs/prototipo) com dados reais da API.
          Referência visual: <span className="mono">ai-workspace-prototipo.html</span>.
        </p>
      </Card>
    </>
  );
}
