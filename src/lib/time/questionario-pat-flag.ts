import "server-only";

import { getConfig } from "@/lib/config-db";
import { flagLigada } from "@/lib/flags/registro";

export const QUESTIONARIO_PAT_TIME_FLAG = "QUESTIONARIO_PAT_TIME";

/** Feature inteira (leitura e escrita) nasce desligada. */
export async function questionarioPatTimeHabilitado(): Promise<boolean> {
  return flagLigada(await getConfig(QUESTIONARIO_PAT_TIME_FLAG));
}

