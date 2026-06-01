/**
 * Cadência Supernova ABC — régua de contato, PURA (sem prisma, sem server-only).
 *
 * Vive separada de cadencia.ts pra poder ser importada tanto no client
 * (termômetro de presença na tabela de clientes) quanto no server (cron de
 * alertas, backfill). cadencia.ts re-exporta estas constantes — fonte ÚNICA.
 *
 * 12-4-2 = toques/ano por classe:
 *   A = 12 toques/ano → ~mensal     → 30 dias entre contatos
 *   B = 4 toques/ano  → ~trimestral → 90 dias
 *   C = 2 toques/ano  → ~semestral  → 180 dias
 */
export const DIAS_POR_CLASSE: Record<string, number> = {
  A: 30,
  B: 90,
  C: 180,
};

export const DIAS_CLASSE_PADRAO = 180; // fallback p/ classificação desconhecida

export function diasCadencia(classificacao: string | null | undefined): number {
  return DIAS_POR_CLASSE[(classificacao || "").toUpperCase()] ?? DIAS_CLASSE_PADRAO;
}

const MS_DIA = 24 * 60 * 60 * 1000;

export type StatusTermometro = "sem-historico" | "verde" | "amarelo" | "vermelho";

export interface TermometroPresenca {
  status: StatusTermometro;
  dias: number | null; // dias desde último contato (null = nunca contatado)
  cadencia: number; // dias da régua da classe
  pct: number | null; // dias/cadencia (null = sem histórico)
}

/**
 * Termômetro de presença: dias desde `ultimoContatoAt` vs a cadência da classe.
 *
 *   verde    → < 80% do intervalo (em dia)
 *   amarelo  → 80%–100% (chegando no limite)
 *   vermelho → > 100% (estourou a cadência)
 *   sem-historico → nunca contatado (estado neutro/cinza, NÃO vermelho)
 *
 * A classe A é a mais exigente (30 dias), então estoura mais rápido.
 */
export function statusTermometro(
  classificacao: string | null | undefined,
  ultimoContatoAt: Date | string | null | undefined,
  now: number = Date.now(),
): TermometroPresenca {
  const cadencia = diasCadencia(classificacao);
  if (!ultimoContatoAt) {
    return { status: "sem-historico", dias: null, cadencia, pct: null };
  }
  const dias = Math.floor((now - new Date(ultimoContatoAt).getTime()) / MS_DIA);
  const pct = dias / cadencia;
  let status: StatusTermometro;
  if (pct > 1) status = "vermelho";
  else if (pct >= 0.8) status = "amarelo";
  else status = "verde";
  return { status, dias, cadencia, pct };
}
