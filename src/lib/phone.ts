/**
 * Normaliza telefone para E.164 (+DDD + número, sem espaços/símbolos).
 *
 * Casos cobertos (formatos comuns do BTG / DataCrazy):
 *   "71 99999-9999"        → "+5571999999999"
 *   "(71) 99999-9999"      → "+5571999999999"
 *   "5571999999999"        → "+5571999999999"
 *   "55 71 99999 9999"     → "+5571999999999"
 *   "+55 71 99999-9999"    → "+5571999999999"
 *   "71999999999"          → "+5571999999999"   (default Brasil)
 *   "999999999"   (9 dig)  → null               (incompleto)
 *   "" / null / undefined  → null
 *
 * Não tenta validar se o número existe — só normaliza formato.
 * Para telefones de outros países (raro nessa base), assume que o
 * primeiro grupo de dígitos é o DDI e mantém como `+{dígitos}`.
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;

  // Brasil já com DDI (55) e 12+ dígitos (DDI + DDD + número):
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }

  // Brasil sem DDI: DDD + 8 ou 9 dígitos = 10 ou 11 dígitos:
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  // Outros países / formato desconhecido — best effort, mas se for
  // muito curto (< 10) retorna null pra evitar lixo no DB:
  if (digits.length < 10) return null;

  return `+${digits}`;
}

/**
 * Compara dois telefones (qualquer formato) — retorna true se forem
 * o mesmo número após normalização.
 */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = toE164(a);
  const nb = toE164(b);
  return !!na && !!nb && na === nb;
}

/**
 * Versão "lossy" pra matching contra strings que podem ter o número
 * embedado (ex: nome de arquivo, payload com formato exótico).
 * Retorna só os dígitos finais (até 13) — útil pra LIKE/contains.
 */
export function phoneDigits(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw).replace(/\D/g, "").slice(-13);
}
