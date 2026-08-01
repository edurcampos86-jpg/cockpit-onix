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

// ============================================================================
// Régua de REUNIÃO — eixo INDEPENDENTE do contato acima.
// ============================================================================

/**
 * O termômetro acima mede CONTATO (mensagem, ligação, qualquer canal) olhando
 * para trás: `ultimoContatoAt`. Esta régua mede outra coisa — se existe
 * reunião AGENDADA dentro do teto da classe, olhando para a frente.
 *
 * São eixos distintos e ambos importam. Um cliente pode estar VERDE no
 * termômetro por ter trocado WhatsApp ontem e estar há oito meses sem reunião
 * marcada: contato em dia, relacionamento em risco. Antes desta régua, esse
 * caso era invisível na tabela.
 *
 * Tetos (máximo entre reuniões):
 *   A =  90 dias (3 meses)
 *   B = 120 dias (4 meses)
 *   C = 180 dias (6 meses)
 *
 * Os números NÃO seguem a proporção 1:3:6 do contato. Lá a razão vem de
 * toques/ano (12-4-2); aqui a régua é mais comprimida — 3× o teto de A daria
 * 270 dias, mais frouxo que o C, o que seria incoerente.
 *
 * Sobre o override: as réguas vêm de teoria, e cliente real tem exceção.
 * `overrideDias` permite fixar outro teto para um cliente específico sem
 * mexer na régua de ninguém. Valor <= 0 ou ausente cai no padrão da classe.
 */
export const DIAS_REUNIAO_POR_CLASSE: Record<string, number> = {
  A: 90,
  B: 120,
  C: 180,
};

export const DIAS_REUNIAO_PADRAO = 180; // fallback p/ classificação desconhecida

export function diasCadenciaReuniao(
  classificacao: string | null | undefined,
  overrideDias?: number | null,
): number {
  if (typeof overrideDias === "number" && Number.isFinite(overrideDias) && overrideDias > 0) {
    return Math.floor(overrideDias);
  }
  return (
    DIAS_REUNIAO_POR_CLASSE[(classificacao || "").toUpperCase()] ?? DIAS_REUNIAO_PADRAO
  );
}

export type StatusReuniao = "ok" | "atencao" | "risco";

export type MotivoReuniao =
  | "agendada-no-prazo" // há reunião marcada dentro do teto
  | "agendada-fora-do-teto" // há reunião marcada, mas tarde demais
  | "sem-agenda-no-prazo" // nada marcado, mas o teto ainda não venceu
  | "sem-agenda-vencida"; // nada marcado e o teto já venceu — o caso grave

export interface RiscoEvasao {
  status: StatusReuniao;
  motivo: MotivoReuniao;
  /** Teto em dias efetivamente aplicado (já com override, se houver). */
  cadencia: number;
  /** true quando o teto veio de override manual, não da régua da classe. */
  override: boolean;
  /** Até quando a próxima reunião deveria acontecer (ISO ms). */
  prazoLimite: number;
  /** Dias até o prazo. Negativo = já venceu. */
  diasAteLimite: number;
}

const LIMIAR_ATENCAO = 0.8; // mesmos 80% do termômetro de contato

/**
 * Risco de evasão por ausência de reunião agendada.
 *
 * O teto conta a partir da ÚLTIMA reunião — é o intervalo entre reuniões que
 * a régua limita. Cliente sem histórico nenhum tem o prazo contado de hoje, e
 * não é marcado como vencido de saída: sem reunião passada, não há intervalo
 * estourado, há um relacionamento que ainda não começou.
 *
 *   ok      → reunião marcada dentro do teto
 *   atencao → nada marcado e o prazo se aproxima (>=80%), ou marcada fora do
 *             teto (existe agenda, mas atrasa o ciclo)
 *   risco   → prazo vencido sem nada marcado — a falha grave
 */
export function riscoEvasaoReuniao(
  classificacao: string | null | undefined,
  ultimaReuniaoAt: Date | string | null | undefined,
  proximaReuniaoAt: Date | string | null | undefined,
  overrideDias?: number | null,
  now: number = Date.now(),
): RiscoEvasao {
  const cadencia = diasCadenciaReuniao(classificacao, overrideDias);
  const override = cadencia !== diasCadenciaReuniao(classificacao, null);

  const base = ultimaReuniaoAt ? new Date(ultimaReuniaoAt).getTime() : now;
  const prazoLimite = base + cadencia * MS_DIA;
  const diasAteLimite = Math.floor((prazoLimite - now) / MS_DIA);

  const proxima = proximaReuniaoAt ? new Date(proximaReuniaoAt).getTime() : null;

  if (proxima !== null) {
    const dentro = proxima <= prazoLimite;
    return {
      status: dentro ? "ok" : "atencao",
      motivo: dentro ? "agendada-no-prazo" : "agendada-fora-do-teto",
      cadencia,
      override,
      prazoLimite,
      diasAteLimite,
    };
  }

  // Nada agendado.
  const decorrido = 1 - diasAteLimite / cadencia;
  if (diasAteLimite < 0) {
    return {
      status: "risco",
      motivo: "sem-agenda-vencida",
      cadencia,
      override,
      prazoLimite,
      diasAteLimite,
    };
  }
  return {
    status: decorrido >= LIMIAR_ATENCAO ? "atencao" : "ok",
    motivo: "sem-agenda-no-prazo",
    cadencia,
    override,
    prazoLimite,
    diasAteLimite,
  };
}
