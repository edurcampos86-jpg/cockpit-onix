import { NextRequest, NextResponse } from "next/server";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { runDatacrazyPollLogged } from "@/lib/integrations/datacrazy-poll-runner";

/**
 * GET /api/cron/datacrazy-poll
 *
 * Polling defensivo — roda a cada 5 minutos via railway.toml.
 * Serve como FALLBACK do webhook DataCrazy: se o webhook falhar
 * (DataCrazy down, blip de rede, nosso servidor reiniciando), o
 * cron eventualmente puxa o que escapou.
 *
 * Por ser idempotente (upsert por externalId), nunca duplica.
 *
 * Estatística esperada em produção:
 *   - Webhook entrega ~99,5% das mensagens em <2s
 *   - Polling cobre os ~0,5% restantes em até 5min
 *
 * A lógica vive em src/lib/datacrazy-poll-runner.ts e é compartilhada
 * com /api/backoffice/datacrazy-poll-now (workaround manual).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const guardErr = guardCron(req);
  if (guardErr) return guardErr;

  // Toda a lógica (token + cutoff via Config DB + wrap BtgSyncLog) vive em
  // runDatacrazyPollLogged, compartilhada com o scheduler in-process.
  const { result, skipped } = await runDatacrazyPollLogged("cron");

  if (skipped || !result) {
    return NextResponse.json(
      { ok: false, message: skipped ?? "sem resultado" },
      { status: 200 },
    );
  }

  return NextResponse.json({
    ok: result.erros.length === 0,
    ...result,
    erros: result.erros.slice(0, 20),
  });
}
