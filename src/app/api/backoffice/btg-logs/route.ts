import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * GET /api/backoffice/btg-logs?tipo=webhook&limit=50
 *
 * Lê os últimos BtgSyncLog. Útil pra inspecionar webhooks recebidos
 * (payloads vão pra .erros como { payload }) e debugar parsers.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Não autenticado" }, { status: 401 });
  }
  const tipo = req.nextUrl.searchParams.get("tipo") || undefined;
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "50", 10), 200);

  const logs = await prisma.btgSyncLog.findMany({
    where: tipo ? { tipo } : undefined,
    orderBy: { iniciado: "desc" },
    take: limit,
  });

  return NextResponse.json({
    total: logs.length,
    logs: logs.map((l) => ({
      id: l.id,
      tipo: l.tipo,
      iniciado: l.iniciado,
      finalizado: l.finalizado,
      sucesso: l.sucesso,
      contasProcessadas: l.contasProcessadas,
      contasComErro: l.contasComErro,
      resumo: l.resumo,
      trigger: l.trigger,
      userId: l.userId,
      erros: l.erros,
    })),
  });
}
