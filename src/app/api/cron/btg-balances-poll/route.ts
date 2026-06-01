import { NextRequest, NextResponse } from "next/server";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { syncBtgBalances } from "@/lib/integrations/btg-api-sync";

/**
 * GET /api/cron/btg-balances-poll
 *
 * Sync DIÁRIO de saldos via Partner API (listAllBalances, bulk — 1 chamada
 * pra todas as contas). Atualiza saldoConta dos clientes existentes via
 * upsertPorPolitica (fonte "api"). Disparado por cron.yml às 09:00 UTC
 * (06:00 Bahia). saldoConta é o campo crítico diário — alimenta o alerta de
 * "saldo parado" (Entrega C).
 *
 * Resposta sempre 200 (mesmo em falha parcial); status != 200 só pra auth.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const guardErr = guardCron(req);
  if (guardErr) return guardErr;

  try {
    const r = await syncBtgBalances({ trigger: "cron" });
    return NextResponse.json({
      ok: r.ok,
      contasBtg: r.contasBtg,
      contasAtualizadas: r.contasAtualizadas,
      semClienteLocal: r.semClienteLocal,
      durationMs: r.durationMs,
      logId: r.logId,
      message: r.message,
      errors: r.erros.slice(0, 20),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "?";
    return NextResponse.json({ ok: false, errorMessage: msg, message: `Falha no cron btg-balances: ${msg}` }, { status: 200 });
  }
}
