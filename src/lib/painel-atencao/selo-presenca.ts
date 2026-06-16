/**
 * Fusão (PURA) do termômetro de RECÊNCIA (`statusTermometro`, sobre
 * `ultimoContatoAt`) com o sinal DIRECIONAL de atenção (`EstadoAtencao`,
 * derivado ao vivo das mensagens). Regra de ouro: **ESCALAR, nunca rebaixar**.
 *
 * Sem prisma e sem `server-only` (só imports de tipo): importável tanto no
 * client (célula da coluna Presença em `clientes-table`) quanto no server.
 * NÃO reescreve `statusTermometro`, a cadência ABC nem o estado — apenas decide
 * QUAL selo a célula renderiza, combinando dois sinais já calculados.
 */
import type { StatusTermometro } from "../cadencia-core";
import type { EstadoAtencao } from "./core";

/** Selo renderizado pela célula Presença: os 4 do termômetro + o direcional. */
export type SeloPresenca = StatusTermometro | "no-vacuo";

/**
 * Decide o selo da coluna Presença a partir do status de recência e do estado
 * direcional OPCIONAL. Precedência (nesta ordem EXATA):
 *
 *   1. estado === "no-vacuo" && status !== "verde"        → "no-vacuo"
 *   2. status ∈ {verde, amarelo, vermelho}                → status (inalterado)
 *   3. status === "sem-historico" && estado === "em-dia"     → "verde"
 *      status === "sem-historico" && estado === "esquecido"  → "amarelo"
 *   4. caso contrário                                     → "sem-historico"
 *
 * INVARIANTE (garante OFF byte-idêntico): selarPresenca(s, undefined) === s para
 * TODOS os 4 status — estado ausente NUNCA muda o selo:
 *
 *   ┌───────────────┬──────────┬───────────────────────────────┬───────────────┐
 *   │ status (s)    │ estado   │ regra aplicada                │ resultado     │
 *   ├───────────────┼──────────┼───────────────────────────────┼───────────────┤
 *   │ verde         │ undefined│ r1✗ · r2✓                     │ verde         │
 *   │ amarelo       │ undefined│ r1✗ · r2✓                     │ amarelo       │
 *   │ vermelho      │ undefined│ r1✗ · r2✓                     │ vermelho      │
 *   │ sem-historico │ undefined│ r1✗ · r2✗ · r3✗ · r4          │ sem-historico │
 *   └───────────────┴──────────┴───────────────────────────────┴───────────────┘
 *
 * NUNCA REBAIXA: para status colorido (verde/amarelo/vermelho) a regra 2 vence
 * antes de qualquer leitura de `estado` — a única exceção é a regra 1, que troca
 * cor-por-cor DENTRO da família vermelha (amarelo/vermelho/sem-histórico aceso →
 * "no-vacuo"), uma escala direcional, nunca um apagamento. Por isso
 * `estado === "sem-contato"` jamais apaga um termômetro aceso: cai sempre na
 * regra 2 (status colorido preservado) ou na regra 4 (sem-historico → sem-historico).
 */
export function selarPresenca(
  statusRecencia: StatusTermometro,
  estado?: EstadoAtencao,
): SeloPresenca {
  // 1. Vácuo direcional ESCALA — mas só quando a recência não está verde (um
  //    toque recente nosso já conta como "em dia"; não vira no-vácuo).
  if (estado === "no-vacuo" && statusRecencia !== "verde") {
    return "no-vacuo";
  }
  // 2. Termômetro aceso manda: cor de recência preservada (nunca rebaixa).
  if (
    statusRecencia === "verde" ||
    statusRecencia === "amarelo" ||
    statusRecencia === "vermelho"
  ) {
    return statusRecencia;
  }
  // 3. Sem histórico de contato, mas há sinal por mensagens: acende via estado.
  if (statusRecencia === "sem-historico") {
    if (estado === "em-dia") return "verde";
    if (estado === "esquecido") return "amarelo";
  }
  // 4. Sem nenhum sinal utilizável → neutro.
  return "sem-historico";
}
