import { NextRequest, NextResponse } from "next/server";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { syncBtgMovements } from "@/lib/integrations/btg-sync";

/**
 * GET /api/cron/btg-movements-poll
 *
 * Trigger semanal do sync de movimentações BTG (scope=weekly). Disparado
 * pelo workflow .github/workflows/cron.yml (terça 04:00 UTC). Mesmo
 * conteúdo do POST /api/backoffice/btg-movements-sync mas autenticado via
 * Bearer CRON_SECRET ao invés de sessão de usuário.
 *
 * Resposta sempre 200 (mesmo em falha) — o workflow lê o body e decide
 * se notifica Slack como sucesso ou erro. Status != 200 só pra falha de
 * auth (forbidden via guardCron).
 *
 * Shape da resposta (usada pelo workflow pra montar mensagem Slack):
 *   { ok, pending, recordsCreated, recordsSkipped, recordsOrphaned,
 *     contasComMovimentos, durationMs, errorMessage?, errors[] }
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300; // sync semanal é leve (1 chamada agregada),
// mas full pode levar minutos por causa do rate limit

export async function GET(req: NextRequest) {
  const guardErr = guardCron(req);
  if (guardErr) return guardErr;

  try {
    const result = await syncBtgMovements({
      scope: "weekly",
      trigger: "cron",
    });
    return NextResponse.json({
      ok: result.ok,
      pending: result.pending,
      scope: result.scope,
      recordsCreated: result.movimentosNovos,
      recordsSkipped: result.movimentosDuplicados,
      recordsOrphaned: result.movimentosOrfaos,
      contasComMovimentos: result.contasComMovimentos,
      durationMs: result.durationMs,
      logId: result.logId,
      message: result.message,
      errors: result.erros.slice(0, 20),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "?";
    return NextResponse.json(
      {
        ok: false,
        errorMessage: msg,
        message: `Falha no cron BTG: ${msg}`,
      },
      { status: 200 },
    );
  }
}
