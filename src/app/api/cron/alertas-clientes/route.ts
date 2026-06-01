import { NextRequest, NextResponse } from "next/server";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { avaliarAlertasClientes } from "@/lib/alertas-cliente";

/**
 * GET /api/cron/alertas-clientes
 *
 * Cron DIÁRIO de alertas proativos de relacionamento (Entrega C — Fase 3).
 * Avalia clientes A/B contra os gatilhos (saldo parado, RF vencendo, termômetro
 * vermelho) e dispara no Slack com dedupe por (gatilho, cliente), reenvio máx
 * 1x/semana. Disparado por cron.yml às 11:00 UTC (08:00 Bahia), depois do
 * btg-balances-poll (09:00 UTC) pra avaliar saldoConta fresco.
 *
 * Resposta sempre 200 (mesmo em falha parcial); status != 200 só pra auth.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const guardErr = guardCron(req);
  if (guardErr) return guardErr;

  try {
    const r = await avaliarAlertasClientes({ trigger: "cron" });
    return NextResponse.json({
      ok: r.ok,
      avaliados: r.avaliados,
      disparandoPorGatilho: r.disparandoPorGatilho,
      enviados: r.enviados,
      resolvidos: r.resolvidos,
      rfDormente: r.rfDormente,
      durationMs: r.durationMs,
      logId: r.logId,
      message: r.message,
      errors: r.erros.slice(0, 20),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "?";
    return NextResponse.json({ ok: false, errorMessage: msg, message: `Falha no cron alertas-clientes: ${msg}` }, { status: 200 });
  }
}
