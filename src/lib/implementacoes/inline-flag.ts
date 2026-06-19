import { getConfig } from "@/lib/config-db";

/**
 * Gate (Config DB) do FAB global "Sugerir implementação" + modal. Flag PRÓPRIA,
 * default OFF — espelha o padrão de `saldoParadoDiasHabilitado` /
 * `painelAtencaoBackendHabilitado`.
 *
 * OFF → o FAB NÃO renderiza (o endpoint /api/implementacoes/flag responde
 * { enabled: false } e o componente client retorna null). Ligável sem rebuild
 * pelo Config DB; deploy com a flag ausente não muda nada visível.
 */
export const IMPLEMENTACOES_INLINE_FLAG = "IMPLEMENTACOES_INLINE";

function parseBoolFlag(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "on", "yes", "sim"].includes(v.trim().toLowerCase());
}

/** FAB de sugestão habilitado? Lê a flag do Config DB a cada chamada. Default OFF. */
export async function implementacoesInlineHabilitado(): Promise<boolean> {
  return parseBoolFlag(await getConfig(IMPLEMENTACOES_INLINE_FLAG));
}
