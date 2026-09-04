import { getConfig } from "@/lib/config-db";
import { flagLigada } from "@/lib/flags/registro";

/**
 * Gate da Mesa de Conciliação Plaud.
 *
 * OFF mantém `/reunioes` e `/integracoes` byte-idênticos ao fluxo legado.
 * ON libera somente a leitura da nova mesa; confirmação, distribuição e
 * observabilidade durável continuam fora desta fase.
 */
export const PLAUD_CONCILIACAO_UI_FLAG = "PLAUD_CONCILIACAO_UI";

export async function plaudConciliacaoUiHabilitada(): Promise<boolean> {
  return flagLigada(await getConfig(PLAUD_CONCILIACAO_UI_FLAG));
}
