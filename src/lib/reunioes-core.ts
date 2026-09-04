export type CandidatoAgregadoReuniao = {
  startAt: Date;
  source: string;
  matchedVia: string;
};

/**
 * Prioridade SOMENTE para empate exato de startAt no agregado.
 * Uma edição humana explícita deve vencer a cópia automática do mesmo evento;
 * entre fontes externas, preserva a precedência histórica do sistema.
 */
export const SOURCE_RANK: Readonly<Record<string, number>> = {
  manual: 6,
  "google-cal": 5,
  "outlook-ics": 4,
  "outlook-web": 3,
  "datacrazy-atividade": 2,
};

export function escolherCandidatoAgregado<T extends CandidatoAgregadoReuniao>(
  candidatos: readonly T[],
): T | null {
  if (candidatos.length === 0) return null;
  return [...candidatos].sort((a, b) => {
    const fonte = (SOURCE_RANK[b.source] ?? 0) - (SOURCE_RANK[a.source] ?? 0);
    if (fonte !== 0) return fonte;

    // Duas linhas da mesma fonte podem diferir na forma de associação. A
    // confirmação humana vence; o fallback lexical torna o resultado estável.
    const manual = Number(b.matchedVia === "manual") - Number(a.matchedVia === "manual");
    if (manual !== 0) return manual;
    const porFonte = a.source.localeCompare(b.source);
    if (porFonte !== 0) return porFonte;
    return a.matchedVia.localeCompare(b.matchedVia);
  })[0]!;
}

/**
 * O slot manual é override explícito da coluna, não apenas outro evento. Enquanto
 * existir e for temporalmente válido (checado pelo caller), vence a cronologia.
 */
export function escolherAgregadoComSlot<T extends CandidatoAgregadoReuniao>(
  slotManual: T | null,
  candidatoCronologico: T | null,
): T | null {
  return slotManual ?? candidatoCronologico;
}
