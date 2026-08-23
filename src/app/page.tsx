export const dynamic = "force-dynamic";

import { hubEcossistemaHabilitado } from "@/lib/hub-ecossistema/flag";
import { organogramaHomeHabilitado } from "@/lib/organograma/flag";
import { resolverOrganograma } from "@/lib/organograma/resolver";
import { Organograma } from "@/components/organograma/organograma";
import { resolverNosDoHub } from "@/lib/hub-ecossistema/acesso";
import { HubEcossistema } from "@/components/hub/hub-ecossistema";
import { PainelDeComando } from "@/app/painel/painel-de-comando";

export default async function RaizPage() {
  /* Hub "Ecossistema Onix" atrás da flag Config DB `HUB_ECOSSISTEMA`
   * (default OFF, ligável sem rebuild — ver `lib/hub-ecossistema/flag.ts`).
   *
   * Com a flag OFF a raiz continua sendo o Painel de Comando, idêntico ao que
   * sempre foi — só passa a vir do componente compartilhado com `/painel`.
   * Com a flag ON o painel nem é montado: nenhuma das queries dele roda. */
  /* ORDEM DELIBERADA: organograma → hub → Painel de Comando.
   *
   * São dois desenhos para a mesma rota, cada um na sua flag. Ligar as duas
   * não é erro a punir: é alguém comparando, e a resposta certa é mostrar o
   * mais novo. Cada `if` é um early return — o desenho perdedor não é montado
   * e nenhuma query dele roda. */
  if (await organogramaHomeHabilitado()) {
    return <Organograma raizes={await resolverOrganograma()} />;
  }

  if (await hubEcossistemaHabilitado()) {
    return <HubEcossistema nos={await resolverNosDoHub()} />;
  }

  return <PainelDeComando />;
}
