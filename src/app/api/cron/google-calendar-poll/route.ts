import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { syncGoogleCalendarComClientes } from "@/lib/google-calendar-clientes-sync";

/**
 * GET /api/cron/google-calendar-poll
 *
 * Polling do Google Calendar a cada 15min (configurado em railway.toml).
 * Mesma lógica do endpoint manual `/api/backoffice/google-calendar-sync`,
 * mas usa o cron-guard pra autenticar.
 *
 * Lookahead/lookback fixos pelo cron — querystrings ignoradas.
 *
 * Pré-requisitos:
 * - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 *   configurados via /integracoes (OAuth flow já existente)
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const guardErr = guardCron(req);
  if (guardErr) return guardErr;

  const log = await prisma.btgSyncLog.create({
    data: { tipo: "google-calendar-poll", trigger: "cron" },
  });

  try {
    const result = await syncGoogleCalendarComClientes({
      lookaheadDias: 60,
      lookbackDias: 7, // janela curta no cron — backfill maior só no sync manual
    });

    await prisma.btgSyncLog.update({
      where: { id: log.id },
      data: {
        finalizado: new Date(),
        sucesso: result.erros.length === 0,
        contasProcessadas:
          result.reunioesUpsert +
          result.reunioesRemovidas +
          result.contatosAtualizados,
        contasComErro: result.erros.length,
        resumo: `${result.reunioesUpsert} upsert · ${result.reunioesRemovidas} removidas · ${result.agregadosRecomputados} recomputados · ${result.contatosAtualizados} contatos · match: ${result.matchEmail}e/${result.matchNomeUnico}u/${result.matchNomeSubstring}s`,
        erros: result.erros.length > 0 ? result.erros : undefined,
      },
    });

    return NextResponse.json({
      ok: result.erros.length === 0,
      ...result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "?";
    await prisma.btgSyncLog.update({
      where: { id: log.id },
      data: { finalizado: new Date(), sucesso: false, resumo: `Erro: ${msg}` },
    });
    // 200 pra cron não retry storm
    return NextResponse.json({ ok: false, message: msg }, { status: 200 });
  }
}
