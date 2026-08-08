import { getConfig } from "@/lib/config-db";
import { flagLigada } from "@/lib/flags/registro";

/**
 * Gate (Config DB) da aba "Perfil" (leitura read-only dos `ClienteFato` na ficha
 * do cliente). Flag PRÓPRIA, default OFF — espelha `cockpitReuniaoHabilitado`.
 *
 * OFF → a aba não aparece; a ficha fica byte-idêntica à de hoje.
 * ON  → aba "Perfil" exibe os fatos versionados agrupados por categoria.
 *
 * Computada no SERVER (page.tsx) e passada como prop pro client `ClienteDetalhe`,
 * porque flag do Config DB é async e o componente é 'use client'.
 *
 * Ativar: `PERFIL_FATO_LEITURA=1` no `.env.local` (fallback de env do getConfig),
 * ou linha na tabela Config: INSERT INTO "Config" (key,value) VALUES ('PERFIL_FATO_LEITURA','1').
 */
export const PERFIL_FATO_LEITURA_FLAG = "PERFIL_FATO_LEITURA";

/** Aba "Perfil" (leitura de fatos) habilitada? Lê a flag do Config DB. Default OFF. */
export async function perfilFatoLeituraHabilitado(): Promise<boolean> {
  return flagLigada(await getConfig(PERFIL_FATO_LEITURA_FLAG));
}
