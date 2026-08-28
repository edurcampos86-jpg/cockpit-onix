import { Cormorant_Garamond } from "next/font/google";
import { OrganogramaCliente } from "./organograma-cliente";
import type { NoOrganograma } from "@/lib/organograma/arvore";

/* A serifada da identidade nova, self-hosted por `next/font` — nada de CDN.
 * Só dois pesos: 400 para a marca da holding, 600 para o nome das empresas. É
 * o que a tela usa; pedir a família inteira seria peso baixado para nada.
 *
 * Fica NESTE arquivo, e não no `layout.tsx`, de propósito: no layout a fonte
 * entraria no preload de toda página do Cockpit — inclusive com a flag
 * desligada, quando esta tela nem é montada. Aqui ela acompanha quem a usa.
 *
 * `--font-serif` não existia; `font-serif` do Tailwind cai na pilha padrão até
 * esta variável estar no escopo, então nenhuma outra tela muda. */
const serifada = Cormorant_Garamond({
  weight: ["400", "600"],
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Casca de servidor do organograma: declara a fonte e entrega a árvore.
 *
 * A interação (recolher card, abrir transversais, trocar tema) mora no
 * componente cliente. Esta separação é o que mantém `next/font` fora do
 * bundle do cliente — a fonte é resolvida em build, e o que atravessa a
 * fronteira é só o nome da classe.
 */
export function Organograma({ raizes }: { raizes: NoOrganograma[] }) {
  return <OrganogramaCliente raizes={raizes} classeSerif={serifada.variable} />;
}
