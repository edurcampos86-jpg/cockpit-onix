import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { syncGoogleCalendarComClientes } from "@/lib/google-calendar-clientes-sync";

/**
 * POST /api/backoffice/google-calendar-sync
 *
 * Sincroniza reuniões do Google Calendar com ClienteBackoffice:
 * - Eventos futuros (lookahead 60 dias) → proximaReuniaoAt
 * - Eventos passados (lookback 30 dias) → ultimaReuniaoAt (sem regredir)
 *
 * Matching robusto: e-mail do attendee/organizer primeiro, depois
 * substring do nome no título (com proteção contra sobrenomes comuns).
 *
 * Pré-requisitos:
 * - Usuario logado conectou Google em /integracoes (UserGoogleAuth)
 *   com escopo calendar.readonly (Fase 2 / Refactor 2026-05).
 *
 * Query params:
 *   - lookaheadDias (default 60, max 365)
 *   - lookbackDias (default 30, max 90)
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, message: "Não autenticado" },
      { status: 401 },
    );
  }

  const lookaheadDias = Math.min(
    Number(req.nextUrl.searchParams.get("lookaheadDias") ?? 60),
    365,
  );
  const lookbackDias = Math.min(
    Number(req.nextUrl.searchParams.get("lookbackDias") ?? 30),
    90,
  );

  const log = await prisma.btgSyncLog.create({
    data: {
      tipo: "google-calendar",
      trigger: "manual",
      userId: session.userId,
      resumo: `lookahead=${lookaheadDias}d lookback=${lookbackDias}d`,
    },
  });

  try {
    const result = await syncGoogleCalendarComClientes({
      userId: session.userId,
      lookaheadDias,
      lookbackDias,
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
        resumo: `${result.reunioesUpsert} upsert · ${result.reunioesRemovidas} removidas · ${result.agregadosRecomputados} recomputados · ${result.contatosAtualizados} contatos · match: ${result.matchEmail}e/${result.matchNomeUnico}u/${result.matchNomeSubstring}s · ${result.eventosFuturos}↑/${result.eventosPassados}↓ ev`,
        erros: result.erros.length > 0 ? result.erros : undefined,
      },
    });
    return NextResponse.json({ success: result.erros.length === 0, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "?";
    await prisma.btgSyncLog.update({
      where: { id: log.id },
      data: {
        finalizado: new Date(),
        sucesso: false,
        resumo: `Erro: ${msg}`,
      },
    });
    return NextResponse.json(
      { success: false, message: msg },
      { status: 500 },
    );
  }
}
