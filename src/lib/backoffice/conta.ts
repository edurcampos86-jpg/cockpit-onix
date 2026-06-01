/**
 * Normalização ÚNICA de numeroConta — fonte da verdade pra casar contas BTG
 * entre import de arquivo e sync da API, evitando duplicação.
 *
 * Histórico do bug: o import de arquivo persistia 9 dígitos com zeros à
 * esquerda ("002149028"); o sync da API (via upsertPorPolitica) e o btg-import
 * normalizavam tirando os zeros ("2149028") e faziam findFirst EXATO — que não
 * achava a linha "002149028" e CRIAVA um gêmeo. Resultado: 2603 duplicatas.
 *
 * Convenção canônica = 9 dígitos zero-padded (formato que o BTG exporta e que
 * as linhas com histórico já usam). `variacoesConta` cobre as formas legadas
 * pra o lookup achar a linha existente em QUALQUER formato.
 */

/** Forma canônica pra PERSISTIR: 9 dígitos zero-padded (se for só dígitos). */
export function contaCanonica(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  return /^\d+$/.test(t) ? t.padStart(9, "0") : t;
}

/**
 * Todas as formas em que a mesma conta pode ter sido persistida, pra usar em
 * `where: { numeroConta: { in: variacoesConta(x) } }`. Cobre: como veio, sem
 * zeros à esquerda, e zero-padded a 9.
 */
export function variacoesConta(s: string | null | undefined): string[] {
  const t = (s ?? "").trim();
  if (!t) return [];
  const set = new Set<string>();
  set.add(t);
  set.add(t.replace(/^0+/, "") || "0");
  if (/^\d+$/.test(t)) set.add(t.padStart(9, "0"));
  return Array.from(set);
}
