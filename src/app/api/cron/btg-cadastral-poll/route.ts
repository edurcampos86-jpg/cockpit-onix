import { NextRequest, NextResponse } from "next/server";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { syncBtgCadastral } from "@/lib/integrations/btg-api-sync";

/**
 * GET /api/cron/btg-cadastral-poll
 *
 * Sync SEMANAL incremental de dados cadastrais + suitability via Partner API
 * (getAccountInformation + getSuitabilityInfo, por conta, rate-limited 55/min).
 * Só processa clientes "novos ou sem info" (sem nomeCompleto/cpfCnpj/
 * perfilInvestidor). Mapeia nomeCompleto, cpfCnpj, email, telefone,
 * perfilInvestidor, suitabilityValidoAte via upsertPorPolitica (fonte "api").
 *
 * Disparado por cron.yml domingo 07:00 UTC (04:00 Bahia, off-peak). Roda em
 * janelas (limit por execução) — contas restantes entram na semana seguinte.
 *
 * Resposta sempre 200 (mesmo em falha parcial); status != 200 só pra auth.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 800; // 55/min: ~600 contas ≈ 11min de rate limit

export async function GET(req: NextRequest) {
  const guardErr = guardCron(req);
  if (guardErr) return guardErr;

  try {
    const r = await syncBtgCadastral({ trigger: "cron" });
    return NextResponse.json({
      ok: r.ok,
      candidatos: r.candidatos,
      processados: r.processados,
      atualizados: r.atualizados,
      nomeCompletoNovos: r.nomeCompletoNovos,
      durationMs: r.durationMs,
      logId: r.logId,
      message: r.message,
      errors: r.erros.slice(0, 20),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "?";
    return NextResponse.json({ ok: false, errorMessage: msg, message: `Falha no cron btg-cadastral: ${msg}` }, { status: 200 });
  }
}
