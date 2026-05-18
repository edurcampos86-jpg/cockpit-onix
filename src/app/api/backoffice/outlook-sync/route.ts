import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { syncOutlookIcsComClientes } from "@/lib/outlook-clientes-sync";

/**
 * POST /api/backoffice/outlook-sync
 *
 * Versão manual do cron outlook-poll. Sincroniza eventos do calendário
 * Outlook publicado (ICS) com ReuniaoCliente (source="outlook-ics").
 *
 * Pré-requisito: OUTLOOK_ICS_URL configurada via Config table.
 * No Outlook: Configurações → Calendário → Calendários compartilhados →
 * Publicar calendário → copie a URL ICS.
 *
 * Query params:
 *   - lookaheadDias (default 60, max 365)
 *   - lookbackDias  (default 30, max 365)
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
    365,
  );

  const log = await prisma.btgSyncLog.create({
    data: {
      tipo: "outlook",
      trigger: "manual",
      userId: session.userId,
      resumo: `lookahead=${lookaheadDias}d lookback=${lookbackDias}d`,
    },
  });

  try {
    const result = await syncOutlookIcsComClientes({
      lookaheadDias,
      lookbackDias,
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
        {
          success: false,
          message:
            "OUTLOOK_ICS_URL não configurada. No Outlook → Configurações → Calendário → Calendários compartilhados → Publicar calendário, copie a URL ICS e salve em Config table (key=OUTLOOK_ICS_URL).",
        },
        { status: 400 },
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

    return NextResponse.json({
      success: result.erros.length === 0,
      ...result,
    });
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
