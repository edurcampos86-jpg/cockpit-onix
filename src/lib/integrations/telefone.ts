/**
 * Normalização de telefone para envio via Z-API — PURA (sem server-only, sem
 * prisma), para ser testável e reusável fora do bundler.
 *
 * Existe porque as duas pontas divergiam em silêncio: o formulário de /time
 * (pessoa-form.tsx) tem placeholder "(71) 99999-9999" e guarda o que for
 * digitado, enquanto o envio mandava esse valor CRU no corpo da requisição,
 * e a Z-API espera só dígitos com DDI. Número cadastrado exatamente como a UI
 * sugere não chegava — e o `false` devolvido por erro de rede é
 * indistinguível do de número inválido, então a falha aparecia como "o alerta
 * não funciona", sem pista de onde.
 */

/**
 * "(71) 99735-9025" → "5571997359025".
 *
 * Regras conservadoras de propósito:
 *  - remove tudo que não é dígito;
 *  - 10 ou 11 dígitos (DDD + número, fixo ou celular) → prefixa "55";
 *  - qualquer outro tamanho → devolve os dígitos como estão, sem inventar DDI.
 *
 * A última regra é o que protege número internacional legítimo (que já vem com
 * o próprio DDI) e evita transformar entrada malformada num número plausível
 * porém errado — melhor falhar explícito do que mandar para o telefone de
 * outra pessoa.
 */
export function normalizarTelefoneZapi(
  valor: string | null | undefined,
): string {
  const d = (valor ?? "").replace(/\D+/g, "");
  if (!d) return "";
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}
