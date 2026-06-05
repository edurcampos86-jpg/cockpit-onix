/**
 * Score RICE = (reach × impact × confidence) / effort.
 * Calculado no app (não no banco). Retorna null se faltar campo ou effort <= 0.
 */
export function calcRiceScore(
  reach?: number | null,
  impact?: number | null,
  confidence?: number | null,
  effort?: number | null,
): number | null {
  if (
    reach == null ||
    impact == null ||
    confidence == null ||
    effort == null ||
    effort <= 0
  ) {
    return null;
  }
  const score = (reach * impact * confidence) / effort;
  // arredonda a 2 casas para evitar ruído de ponto flutuante
  return Math.round(score * 100) / 100;
}
