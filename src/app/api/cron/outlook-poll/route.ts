import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { syncOutlookIcsComClientes } from "@/lib/outlook-clientes-sync";

/**
 * GET /api/cron/outlook-poll
 *
 * Polling do calendário Outlook (ICS) a cada 30min.
 * Mesma lógica do endpoint manual /api/backoffice/outlook-sync mas
 * autenticado via cron-guard.
 *
 * Lookahead 60 dias / lookback 7 dias (janela curta no cron — backfill
 * maior só via sync manual).
 *
 * Idempotente — ReuniaoCliente tem unique(source, externalId).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const guardErr = guardCron(req);
  if (guardErr) return guardErr;

  const log = await prisma.btgSyncLog.create({
    data: { tipo: "outlook-poll", trigger: "cron" },
  });

  try {
    const result = await syncOutlookIcsComClientes({
      lookaheadDias: 60,
      lookbackDias: 7,
    });

    if (!result.icsUrlConfigurado) {
      await prisma.btgSyncLog.update({
        where: { id: log.id },
        data: {
          finalizado: new Date(),
          sucesso: false,
          resumo: "OUTLOOK_ICS_URL não configurada",
        },
      });
      return NextResponse.json(
        { ok: false, message: "OUTLOOK_ICS_URL não configurada" },
        { status: 200 },
      );
    }

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
        resumo: `${result.reunioesUpsert} upsert · ${result.reunioesRemovidas} removidas · ${result.agregadosRecomputados} recomputados · ${result.contatosAtualizados} contatos · match: ${result.matchEmail}e/${result.matchNomeUnico}u/${result.matchNomeSubstring}s · ${result.eventosNaJanela}/${result.eventosTotal} ev`,
        erros: result.erros.length > 0 ? result.erros.slice(0, 50) : undefined,
      },
    });

    return NextResponse.json({ ok: result.erros.length === 0, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "?";
    await prisma.btgSyncLog.update({
      where: { id: log.id },
      data: { finalizado: new Date(), sucesso: false, resumo: `Erro: ${msg}` },
    });
    return NextResponse.json({ ok: false, message: msg }, { status: 200 });
  }
}
