export const dynamic = "force-dynamic";

import { hubEcossistemaHabilitado } from "@/lib/hub-ecossistema/flag";
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
  if (await hubEcossistemaHabilitado()) {
    return <HubEcossistema nos={await resolverNosDoHub()} />;
  }

  return <PainelDeComando />;
}
