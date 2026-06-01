import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { backfillProximoContato } from "@/lib/cadencia";

/**
 * GET /api/cron/cadencia-backfill
 *
 * Cron diário leve (FIX C): reaplica o seed de `proximoContatoAt` pros
 * clientes novos importados desde o último run. Idempotente — só preenche
 * quem está com o campo NULL, então o custo é ~zero quando não há novatos.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const guardErr = guardCron(req);
  if (guardErr) return guardErr;

  const log = await prisma.btgSyncLog.create({
    data: { tipo: "cadencia-backfill", trigger: "cron" },
  });

  try {
    const { atualizados } = await backfillProximoContato();
    await prisma.btgSyncLog.update({
      where: { id: log.id },
      data: {
        finalizado: new Date(),
        sucesso: true,
        contasProcessadas: atualizados,
        resumo: `${atualizados} cliente(s) novo(s) com proximoContatoAt semeado`,
      },
    });
    return NextResponse.json({ ok: true, atualizados });
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "?";
    await prisma.btgSyncLog.update({
      where: { id: log.id },
      data: {
        finalizado: new Date(),
        sucesso: false,
        contasComErro: 1,
        resumo: `falha: ${motivo}`,
      },
    });
    return NextResponse.json({ ok: false, erro: motivo }, { status: 500 });
  }
}
