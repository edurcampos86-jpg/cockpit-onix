export const dynamic = "force-dynamic";

import { PainelDeComando } from "@/app/painel/painel-de-comando";

/**
 * Endereço próprio do Painel de Comando.
 *
 * A raiz `/` também renderiza este painel enquanto a flag `HUB_ECOSSISTEMA`
 * estiver OFF — os dois caminhos chamam o MESMO componente, então não existe
 * versão que atrase em relação à outra. Quando a flag liga, `/` vira o hub e
 * este endereço passa a ser o único do painel.
 */
export default function PainelPage() {
  return <PainelDeComando />;
}
