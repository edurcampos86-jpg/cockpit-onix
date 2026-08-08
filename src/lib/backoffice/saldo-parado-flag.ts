import { getConfig } from "@/lib/config-db";
import { flagLigada } from "@/lib/flags/registro";

/**
 * Gate (Config DB) da UI "parado há X dias" na coluna Saldo Conta da página de
 * clientes. Flag PRÓPRIA, default OFF — espelha o padrão de
 * `atencaoInlineHabilitado` / `painelAtencaoBackendHabilitado`.
 *
 * OFF → a página NÃO exibe a 2ª linha "parado há Xd" nem expõe a ordenação por
 * tempo parado (coluna Saldo Conta byte-idêntica à de hoje). O campo
 * `saldoContaDesde` continua sendo propagado de graça (sem query extra); a flag
 * gateia só a EXIBIÇÃO/ordenação.
 */
export const CLIENTES_SALDO_PARADO_DIAS_FLAG = "CLIENTES_SALDO_PARADO_DIAS";

/** UI "parado há X dias" habilitada? Lê a flag do Config DB a cada chamada. Default OFF. */
export async function saldoParadoDiasHabilitado(): Promise<boolean> {
  return flagLigada(await getConfig(CLIENTES_SALDO_PARADO_DIAS_FLAG));
}
