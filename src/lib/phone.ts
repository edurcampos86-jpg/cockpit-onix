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

/**
 * Para números brasileiros, retorna ambas as variantes com e sem o "9"
 * inicial obrigatório em celulares pós-2014. Útil pra matching tolerante:
 * cadastros antigos (WhatsApp ID, BTG) ainda usam o formato sem o 9, e
 * cadastros novos usam com o 9. Sem isso, perdemos match silenciosamente.
 *
 *   "+5571999752022" (13 dígitos) → ["+5571999752022", "+557199752022"]
 *   "+557199752022"  (12 dígitos) → ["+557199752022", "+5571999752022"]
 *   "+551134567890"  (fixo 10d)    → ["+551134567890"]               (não aplica)
 *   números não-BR ou inválidos    → [entrada]                       (passthrough)
 */
export function brazilianPhoneVariants(e164: string | null | undefined): string[] {
  if (!e164) return [];
  if (!e164.startsWith("+55")) return [e164];

  const rest = e164.slice(3); // dígitos após "+55"
  // Celular com 9 inicial: +55 + DDD(2) + 9 + 8 dígitos = 13 chars
  if (rest.length === 11 && rest[2] === "9") {
    const ddd = rest.slice(0, 2);
    const semNove = rest.slice(3); // 8 dígitos
    return [e164, `+55${ddd}${semNove}`];
  }
  // Celular sem 9 inicial: +55 + DDD(2) + 8 dígitos = 12 chars
  // (cadastros antigos / WhatsApp ID)
  if (rest.length === 10) {
    const ddd = rest.slice(0, 2);
    const numero = rest.slice(2); // 8 dígitos
    const primeiroDigito = numero[0];
    // Heurística: só vale adicionar "9" se for celular (primeiro dígito >= 6)
    // Fixos no Brasil começam com 2-5; celulares com 6-9.
    if (["6", "7", "8", "9"].includes(primeiroDigito)) {
      return [e164, `+55${ddd}9${numero}`];
    }
  }
  return [e164];
}
