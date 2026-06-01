/**
 * Núcleo PURO dos alertas proativos de relacionamento (sem prisma / server-only).
 *
 * Espelha a lógica de dedupe do Auditor de Integrações (audit-integracoes-core),
 * mas pra gatilhos por cliente: alerta na ENTRADA do gatilho, reenvia no máximo
 * 1x/semana enquanto seguir disparando, e "resolve" (reabre p/ futuros alertas)
 * quando o gatilho deixa de disparar. Unit-testável sem IO.
 */

export type Gatilho = "saldo_parado" | "rf_vencendo" | "termometro_vermelho";

export const GATILHOS: Gatilho[] = ["saldo_parado", "rf_vencendo", "termometro_vermelho"];

export const LABEL_GATILHO: Record<Gatilho, string> = {
  saldo_parado: "Saldo parado em conta",
  rf_vencendo: "Renda fixa vencendo",
  termometro_vermelho: "Cliente A vermelho no termômetro",
};

/** Reenvio no máximo 1x por semana enquanto o gatilho seguir disparando. */
export const REENVIO_MS = 7 * 24 * 60 * 60 * 1000;

export function chaveAlerta(gatilho: Gatilho, clienteId: string): string {
  return `${gatilho}:${clienteId}`;
}

export type EstadoAlerta = {
  ativo: boolean; // gatilho estava disparando no último check (alerta aberto)
  alertadoEm: Date | null; // último Slack enviado (null = nenhum alerta aberto)
  statusDesde: Date | null; // desde quando começou a disparar (p/ "há X dias")
};

export type AcaoAlerta = "novo" | "reenvio" | "resolvido" | "nada";

/**
 * Decide a ação dado o estado anterior e se o gatilho está disparando agora.
 *
 * - novo: começou a disparar e não havia alerta aberto → notifica
 * - reenvio: segue disparando e passou >=7d do último alerta → re-notifica
 * - resolvido: tinha alerta aberto e parou de disparar → fecha (sem Slack)
 * - nada: dedupe (já alertado há <7d) ou segue sem disparar
 */
export function decidirAlertaCliente(
  prev: EstadoAlerta,
  disparando: boolean,
  agora: Date,
): { acao: AcaoAlerta; estado: EstadoAlerta } {
  const ultimoAlerta = prev.alertadoEm;

  if (disparando) {
    const statusDesde = prev.ativo && prev.statusDesde ? prev.statusDesde : agora;
    if (ultimoAlerta == null) {
      return { acao: "novo", estado: { ativo: true, alertadoEm: agora, statusDesde } };
    }
    if (agora.getTime() - ultimoAlerta.getTime() >= REENVIO_MS) {
      return { acao: "reenvio", estado: { ativo: true, alertadoEm: agora, statusDesde } };
    }
    return { acao: "nada", estado: { ativo: true, alertadoEm: ultimoAlerta, statusDesde } };
  }

  // Não está disparando
  if (prev.ativo) {
    return { acao: "resolvido", estado: { ativo: false, alertadoEm: null, statusDesde: null } };
  }
  return { acao: "nada", estado: { ativo: false, alertadoEm: null, statusDesde: null } };
}
