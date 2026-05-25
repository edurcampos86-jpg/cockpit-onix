import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  syncBtgMovements,
  type SyncBtgScope,
} from "@/lib/integrations/btg-sync";

/**
 * POST /api/backoffice/btg-movements-sync
 * Body: { scope?: "weekly" | "monthly" | "full" | "period", startDate?, endDate? }
 *
 * Sincroniza movimentações financeiras dos clientes BTG e armazena em MovimentacaoBtg.
 *
 * Lógica de fato vive em src/lib/integrations/btg-sync.ts — também usada pelo
 * cron semanal em /api/cron/btg-movements-poll.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, message: "Não autenticado" },
      { status: 401 },
    );
  }

  let body: {
    scope?: SyncBtgScope;
    startDate?: string;
    endDate?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* body vazio é ok */
  }

  try {
    const result = await syncBtgMovements({
      scope: body.scope,
      startDate: body.startDate,
      endDate: body.endDate,
      trigger: "manual",
      userId: session.userId,
    });
    return NextResponse.json({
      success: true,
      pending: result.pending,
      message: result.message,
      scope: result.scope,
      movimentosNovos: result.movimentosNovos,
      movimentosDuplicados: result.movimentosDuplicados,
      movimentosOrfaos: result.movimentosOrfaos,
      contasComMovimentos: result.contasComMovimentos,
      erros: result.erros.slice(0, 50),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "?";
    // scope=period sem datas é o único throw esperado da lib — vira 400 cliente
    if (msg.includes("scope=period exige")) {
      return NextResponse.json(
        { success: false, message: msg },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { success: false, message: msg },
      { status: 500 },
    );
  }
}
