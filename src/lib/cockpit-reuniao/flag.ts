import { getConfig } from "@/lib/config-db";

/**
 * Gate (Config DB) da nova tela "Cockpit de Reunião" — aba read-only que roda em
 * PARALELO à aba "RCA / Reuniões" atual. Flag PRÓPRIA, default OFF — espelha o
 * padrão de `saldoParadoDiasHabilitado` / `implementacoesInlineHabilitado`.
 *
 * OFF → a aba não aparece e a tela do cliente fica byte-idêntica à de hoje
 *       (a aba RCA/Reuniões segue 100% intacta).
 * ON  → uma nova aba "Cockpit de Reunião" é exibida ao lado da RCA.
 *
 * Computada no SERVER (page.tsx) e passada como prop pro componente client
 * `ClienteDetalhe`, porque flag do Config DB é async e o componente é 'use client'.
 *
 * Ativar local: `COCKPIT_REUNIAO=1` no `.env.local` (fallback de env do getConfig),
 * ou linha na tabela Config: INSERT INTO "Config" (key,value) VALUES ('COCKPIT_REUNIAO','1').
 */
export const COCKPIT_REUNIAO_FLAG = "COCKPIT_REUNIAO";

function parseBoolFlag(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "on", "yes", "sim"].includes(v.trim().toLowerCase());
}

/** Tela "Cockpit de Reunião" habilitada? Lê a flag do Config DB a cada chamada. Default OFF. */
export async function cockpitReuniaoHabilitado(): Promise<boolean> {
  return parseBoolFlag(await getConfig(COCKPIT_REUNIAO_FLAG));
}
