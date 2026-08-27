import { getConfig } from "@/lib/config-db";
import { flagLigada } from "@/lib/flags/registro";

/**
 * Gate (Config DB) da sidebar filtrada por permissão. Default OFF.
 *
 * OFF → a sidebar renderiza como sempre renderizou, inclusive o gate de admin
 *       antigo (`ADMIN_ONLY_HREFS`, resolvido no cliente). Nada muda para
 *       ninguém.
 * ON  → a lista chega do SERVIDOR já filtrada; o gate antigo sai de cena.
 *
 * ── POR QUE ESTA FLAG PESA MAIS QUE AS OUTRAS DE UI ──────────────────────
 * Medido em 23/08/2026: das 22 pessoas ativas, 17 são `colaborador`. Ligar
 * isto tira de 77% do time, de uma vez, os itens de administração e os de
 * liderança. Não é irreversível — desligar devolve tudo —, mas é a mudança
 * visível mais ampla já feita no menu, e merece ser ligada com alguém olhando.
 *
 * Ligar/desligar é por linha na tabela Config, SEM rebuild e SEM redeploy:
 *   INSERT INTO "Config" (key, value) VALUES ('SIDEBAR_FILTRADA', '1')
 *     ON CONFLICT (key) DO UPDATE SET value = '1';
 *   -- desligar: UPDATE "Config" SET value = '0' WHERE key = 'SIDEBAR_FILTRADA';
 */
export const SIDEBAR_FILTRADA_FLAG = "SIDEBAR_FILTRADA";

/** Sidebar filtrada por permissão? Lê a flag do Config DB a cada chamada. Default OFF. */
export async function sidebarFiltradaHabilitada(): Promise<boolean> {
  return flagLigada(await getConfig(SIDEBAR_FILTRADA_FLAG));
}
