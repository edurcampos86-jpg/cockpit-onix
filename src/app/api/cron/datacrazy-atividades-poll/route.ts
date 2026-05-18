import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config-db";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { syncDatacrazyAtividades } from "@/lib/datacrazy-atividades-sync";

/**
 * GET /api/cron/datacrazy-atividades-poll
 *
 * Sincroniza "Atividades" do Datacrazy (reuniões marcadas/realizadas)
 * com ReuniaoCliente. Roda a cada 30min (railway.toml).
 *
 * Diferente do datacrazy-poll (mensagens WhatsApp, 5min): atividades
 * mudam menos frequentemente; 30min reduz uso de quota da API.
 *
 * Pré-requisito: DATACRAZY_TOKEN configurado (mesmo do polling de
 * mensagens). attendantId default = Eduardo (VENDEDORES_CONFIG).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

  const log = await prisma.btgSyncLog.create({
    data: { tipo: "datacrazy-atividades-poll", trigger: "cron" },
  });

  try {
    const result = await syncDatacrazyAtividades({
      token,
      lookaheadDias: 60,
      lookbackDias: 30,
    });

    await prisma.btgSyncLog.update({
      where: { id: log.id },
      data: {
        finalizado: new Date(),
        sucesso: result.erros.length === 0,
        contasProcessadas: result.reunioesUpsert + result.reunioesRemovidas,
        contasComErro: result.unmatched,
        resumo: `${result.atividadesEncontradas} ativs · ${result.reunioesUpsert} upsert · ${result.reunioesRemovidas} removidas · ${result.agregadosRecomputados} recomputados · match: ${result.matchTelefone}t/${result.matchEmail}e · ${result.unmatched} sem match · ${result.leadsConsultados} leads`,
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
