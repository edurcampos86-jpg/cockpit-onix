import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config-db";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import {
  runDatacrazyPoll,
  DEFAULT_POLL_CUTOFF_MINUTES,
} from "@/lib/integrations/datacrazy-poll-runner";

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

  const token = await getConfig("DATACRAZY_TOKEN");
  if (!token) {
    return NextResponse.json(
      { ok: false, message: "DATACRAZY_TOKEN não configurado" },
      { status: 200 },
    );
  }

  // Janela de captura: cobre o intervalo entre rodadas pra não deixar ponto-cego
  // (o GHA não honra o */5 — roda ~a cada 1-2h). Override via Config DB; default
  // dimensionado pelo maior gap real medido. Ver DEFAULT_POLL_CUTOFF_MINUTES.
  const cutoffRaw = await getConfig("DATACRAZY_POLL_CUTOFF_MINUTES");
  const cutoffParsed = cutoffRaw ? Number(cutoffRaw) : NaN;
  const cutoffMinutes =
    Number.isFinite(cutoffParsed) && cutoffParsed > 0
      ? cutoffParsed
      : DEFAULT_POLL_CUTOFF_MINUTES;

  const log = await prisma.btgSyncLog.create({
    data: { tipo: "datacrazy-poll", trigger: "cron" },
  });

  const result = await runDatacrazyPoll({ token, cutoffMinutes });

  await prisma.btgSyncLog.update({
    where: { id: log.id },
    data: {
      finalizado: new Date(),
      sucesso: result.erros.length === 0,
      contasProcessadas: result.conversasComMudanca,
      contasComErro: result.erros.length,
      resumo: `${result.conversasVistas} conversas vistas · ${result.conversasComMudanca} c/ delta · ${result.mensagensNovas} msgs novas`,
      erros: result.erros.length > 0 ? result.erros : undefined,
    },
  });

  return NextResponse.json({
    ok: result.erros.length === 0,
    ...result,
    erros: result.erros.slice(0, 20),
  });
}
