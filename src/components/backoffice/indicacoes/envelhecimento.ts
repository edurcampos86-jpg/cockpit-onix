/* ──────────────────────────────────────────────────────────────
 * Envelhecimento do pipeline — Círculo de Introduções (V2).
 *
 * Dado disponível: só `criadoEm` (não há timestamp por mudança de status —
 * nada de fingir "parada NESTE status há N dias"). Definição honesta:
 * N = dias corridos desde `criadoEm` (floor de (agora − criadoEm) / 86400s).
 *
 * Thresholds por status (John Bowen — timing pós-momento de valor: introdução
 * esfria em dias); colunas terminais não envelhecem.
 * ────────────────────────────────────────────────────────────── */

/** Dias; `null` = terminal, não envelhece. */
export const LIMIARES: Record<string, { atencao: number; critico: number } | null> = {
  recebida: { atencao: 3, critico: 8 },
  contatada: { atencao: 8, critico: 15 },
  reuniao: { atencao: 15, critico: 31 },
  convertida: null,
  perdida: null,
};

export type TierEnvelhecimento = "fresco" | "atencao" | "critico";

export function diasNoFunil(criadoEm: string, agora: Date = new Date()): number {
  const dias = Math.floor((agora.getTime() - new Date(criadoEm).getTime()) / 86_400_000);
  return Math.max(0, dias);
}

/** `null` para status terminais (mostram só a data absoluta). */
export function tierEnvelhecimento(status: string, dias: number): TierEnvelhecimento | null {
  const limiar = LIMIARES[status];
  if (!limiar) return null;
  if (dias >= limiar.critico) return "critico";
  if (dias >= limiar.atencao) return "atencao";
  return "fresco";
}

/**
 * Rótulo é o mesmo em todos os níveis — a COR comunica a severidade
 * (decisão da copy: "Nova hoje" / "Parada há 1 dia" / "Parada há {n} dias").
 */
export function rotuloEnvelhecimento(dias: number): string {
  if (dias === 0) return "Nova hoje";
  if (dias === 1) return "Parada há 1 dia";
  return `Parada há ${dias} dias`;
}

export function dataAbsoluta(criadoEm: string): string {
  return new Date(criadoEm).toLocaleDateString("pt-BR");
}
