import { getConfig } from "@/lib/config-db";
import { flagLigada } from "@/lib/flags/registro";

/**
 * Gate (Config DB) da tela de abertura da Onix Capital. Default OFF.
 *
 * OFF → `/empresas/investimentos/abertura` responde `notFound()`: nenhuma
 *       superfície nova no ar, nenhuma consulta a mais rodando.
 * ON  → a tela agrega o que já existe (atenção, agenda, números, saúde dos
 *       dados), sempre dentro do escopo RBAC de quem abriu.
 *
 * Ativar: linha na tabela `Config`
 * `INSERT INTO "Config" (key,value) VALUES ('PAINEL_ABERTURA_CAPITAL','1');`
 * ou `PAINEL_ABERTURA_CAPITAL=1` no `.env.local`.
 */
export const PAINEL_ABERTURA_CAPITAL_FLAG = "PAINEL_ABERTURA_CAPITAL";

/** Tela de abertura habilitada? Lê a flag do Config DB. Default OFF. */
export async function painelAberturaCapitalHabilitado(): Promise<boolean> {
  return flagLigada(await getConfig(PAINEL_ABERTURA_CAPITAL_FLAG));
}
