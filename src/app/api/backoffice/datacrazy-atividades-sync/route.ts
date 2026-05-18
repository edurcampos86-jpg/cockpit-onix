import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getConfig } from "@/lib/config-db";
import { syncDatacrazyAtividades } from "@/lib/datacrazy-atividades-sync";

/**
 * POST /api/backoffice/datacrazy-atividades-sync
 *
 * Versão manual do cron datacrazy-atividades-poll. Útil pra forçar sync
 * após criar reunião nova no Datacrazy sem esperar 30min.
 *
 * Query params:
 *   - lookaheadDias (default 60, max 365)
 *   - lookbackDias  (default 30, max 365)
 *   - attendantId   (default = Eduardo)
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, message: "Não autenticado" },
      { status: 401 },
    );
  }

  const token = await getConfig("DATACRAZY_TOKEN");
  if (!token) {
    return NextResponse.json(
      { success: false, message: "DATACRAZY_TOKEN não configurado" },
      { status: 400 },
    );
  }

  const lookaheadDias = Math.min(
    Number(req.nextUrl.searchParams.get("lookaheadDias") ?? 60),
    365,
  );
  const lookbackDias = Math.min(
    Number(req.nextUrl.searchParams.get("lookbackDias") ?? 30),
    365,
  );
  const attendantId =
    req.nextUrl.searchParams.get("attendantId") ?? undefined;

  const log = await prisma.btgSyncLog.create({
    data: {
      tipo: "datacrazy-atividades",
      trigger: "manual",
      userId: session.userId,
      resumo: `lookahead=${lookaheadDias}d lookback=${lookbackDias}d`,
    },
  });

  try {
    const result = await syncDatacrazyAtividades({
      token,
      attendantId,
      lookaheadDias,
      lookbackDias,
    });

    await prisma.btgSyncLog.update({
      where: { id: log.id },
      data: {
        finalizado: new Date(),
        sucesso: result.erros.length === 0,
        contasProcessadas: result.reunioesUpsert + result.reunioesRemovidas,
        contasComErro: result.unmatched,
        resumo: `${result.atividadesEncontradas} ativs · ${result.reunioesUpsert} upsert · ${result.reunioesRemovidas} removidas · ${result.agregadosRecomputados} recomputados · match: ${result.matchTelefone}t/${result.matchEmail}e · ${result.unmatched} sem match`,
        erros: result.erros.length > 0 ? result.erros.slice(0, 50) : undefined,
      },
    });

    return NextResponse.json({
      success: result.erros.length === 0,
      ...result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "?";
    await prisma.btgSyncLog.update({
      where: { id: log.id },
      data: { finalizado: new Date(), sucesso: false, resumo: `Erro: ${msg}` },
    });
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
