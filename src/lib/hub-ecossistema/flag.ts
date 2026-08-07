import { getConfig } from "@/lib/config-db";

/**
 * Gate (Config DB) do hub "Ecossistema Onix" na rota raiz `/`. Flag PRÓPRIA,
 * default OFF — mesmo padrão de `cockpitReuniaoHabilitado` /
 * `painelAtencaoBackendHabilitado`.
 *
 * OFF → `/` renderiza o Painel de Comando de sempre, byte-idêntico ao de hoje.
 *       O hub não é montado e as queries dele nem existem (não há query nova).
 * ON  → `/` renderiza o hub e o Painel de Comando NÃO é consultado (early
 *       return antes do Promise.all do dashboard — zero custo de query).
 *
 * Ligar/desligar é por linha na tabela Config, SEM rebuild e SEM redeploy:
 *   INSERT INTO "Config" (key, value) VALUES ('HUB_ECOSSISTEMA', '1')
 *     ON CONFLICT (key) DO UPDATE SET value = '1';
 *   -- desligar: UPDATE "Config" SET value = '0' WHERE key = 'HUB_ECOSSISTEMA';
 *
 * Local, dá pra usar o fallback de env do getConfig: `HUB_ECOSSISTEMA=1` no
 * `.env.local`.
 */
export const HUB_ECOSSISTEMA_FLAG = "HUB_ECOSSISTEMA";

function parseBoolFlag(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "on", "yes", "sim"].includes(v.trim().toLowerCase());
}

/** Hub "Ecossistema Onix" habilitado? Lê a flag do Config DB a cada chamada. Default OFF. */
export async function hubEcossistemaHabilitado(): Promise<boolean> {
  return parseBoolFlag(await getConfig(HUB_ECOSSISTEMA_FLAG));
}
