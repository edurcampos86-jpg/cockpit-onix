/* ──────────────────────────────────────────────────────────────
 * Decisão de retenção do `ConfigAudit` — módulo PURO.
 *
 * Separado de `retencao.ts` (que abre com `server-only` e usa prisma) pelo
 * mesmo motivo de `cadencia-core.ts` e `painel-atencao/core.ts`: `server-only`
 * explode no `tsx --test`, e sem essa separação a regra mais perigosa deste
 * subsistema — a que decide quanto histórico apagar — não teria teste.
 * ────────────────────────────────────────────────────────────── */

/** Chave no Config DB. Registrada em `flags/registro.ts` como flag de valor. */
export const CONFIG_AUDIT_RETENCAO_DIAS_KEY = "CONFIG_AUDIT_RETENCAO_DIAS";

/**
 * 730 dias (2 anos). Ver a justificativa completa no cabeçalho de
 * `retencao.ts`: número decidido nesta PR na falta de dono do assunto, não
 * herdado de política de compliance.
 */
export const RETENCAO_PADRAO_DIAS = 730;

/**
 * Piso: config abaixo disto é ignorada.
 *
 * Impede que um dedo trocado (`7` no lugar de `700`) transforme uma rotina
 * mensal e silenciosa numa destruição do rastro de auditoria. Aumentar o prazo
 * é livre pela Config; encurtar abaixo de um ano exige PR.
 */
export const RETENCAO_MINIMA_DIAS = 365;

export type DecisaoRetencao = {
  dias: number;
  /** O valor da Config foi recusado por ficar abaixo do piso? */
  pisoAplicado: boolean;
};

/**
 * Quantos dias de histórico guardar, a partir do valor cru da Config.
 *
 * Só devolve algo diferente do default quando o valor é um número finito, maior
 * que zero E maior ou igual ao piso. Qualquer outra coisa — ausente, vazio,
 * texto, zero, negativo, infinito — cai no default. Na dúvida, guarda MAIS
 * histórico, nunca menos: o erro de guardar demais custa bytes; o de guardar de
 * menos custa a resposta que a tabela existe para dar.
 */
export function decidirRetencaoDias(bruto: string | undefined | null): DecisaoRetencao {
  const texto = bruto?.trim();
  // `Number("")` é 0 e `Number(" ")` também — sem este curto-circuito, string
  // vazia viraria "0 dias" em vez de cair no default.
  if (!texto) return { dias: RETENCAO_PADRAO_DIAS, pisoAplicado: false };

  const n = Number(texto);
  if (!Number.isFinite(n) || n <= 0) return { dias: RETENCAO_PADRAO_DIAS, pisoAplicado: false };
  if (n < RETENCAO_MINIMA_DIAS) return { dias: RETENCAO_PADRAO_DIAS, pisoAplicado: true };

  return { dias: Math.trunc(n), pisoAplicado: false };
}
