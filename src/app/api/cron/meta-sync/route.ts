/**
 * GET /api/cron/meta-sync
 * Sync diário da Marketing API (janela D-1) → AdCampaignSnapshot,
 * rateio simples do spend nos TrackingEvents de D-1 e recálculo da
 * matriz de CAC (cache no Config DB). Agendado no cron.yml (00:30 Bahia).
 * Auth: Bearer CRON_SECRET (guardCron). Env Meta ausente = skip silencioso.
 */
import { NextResponse } from "next/server";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { prisma } from "@/lib/prisma";
import { setConfig } from "@/lib/config-db";
import { getMetaAdsConfig, fetchInsightsDay } from "@/lib/integrations/meta-ads";
import { refreshCacMatrixCache, LAST_SYNC_KEY } from "@/lib/pixel/metrics";
import { sendSlackMessage } from "@/lib/integrations/slack";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: Request) {
  const blocked = guardCron(req);
  if (blocked) return blocked;

  const cfg = await getMetaAdsConfig();
  if (!cfg) {
    return NextResponse.json({ ok: true, skipped: "not_configured" });
  }

  try {
    // Janela D-1 em UTC (data do snapshot = 00:00 UTC do dia)
    const ontem = new Date();
    ontem.setUTCDate(ontem.getUTCDate() - 1);
    const dateISO = ontem.toISOString().slice(0, 10);
    const dia = new Date(`${dateISO}T00:00:00.000Z`);

    const rows = await fetchInsightsDay(cfg, dateISO);

    for (const r of rows) {
      await prisma.adCampaignSnapshot.upsert({
        where: {
          date_campaignId_adsetId_adId: {
            date: dia,
            campaignId: r.campaignId,
            adsetId: r.adsetId,
            adId: r.adId,
          },
        },
        create: {
          date: dia,
          campaignId: r.campaignId,
          campaignName: r.campaignName,
          adsetId: r.adsetId,
          adId: r.adId,
          impressions: r.impressions,
          clicks: r.clicks,
          spendBrl: r.spendBrl,
          cpmBrl: r.cpmBrl,
          cpcBrl: r.cpcBrl,
          results: r.results,
          resultType: r.resultType,
        },
        update: {
          campaignName: r.campaignName,
          impressions: r.impressions,
          clicks: r.clicks,
          spendBrl: r.spendBrl,
          cpmBrl: r.cpmBrl,
          cpcBrl: r.cpcBrl,
          results: r.results,
          resultType: r.resultType,
        },
      });
    }

    // Rateio simples (spec §5): spend de D-1 ÷ eventos de D-1.
    const fimDia = new Date(`${dateISO}T23:59:59.999Z`);
    const spendD1 = rows.reduce((acc, r) => acc + r.spendBrl, 0);
    const eventosD1 = await prisma.trackingEvent.count({
      where: { occurredAt: { gte: dia, lte: fimDia } },
    });
    if (spendD1 > 0 && eventosD1 > 0) {
      const custoUnitario = Math.round((spendD1 / eventosD1) * 100) / 100;
      await prisma.trackingEvent.updateMany({
        where: { occurredAt: { gte: dia, lte: fimDia } },
        data: { costBrl: custoUnitario },
      });
    }

    const matriz = await refreshCacMatrixCache();
    await setConfig(LAST_SYNC_KEY, new Date().toISOString());

    return NextResponse.json({
      ok: true,
      date: dateISO,
      snapshots: rows.length,
      spendBrl: Math.round(spendD1 * 100) / 100,
      eventosRateados: spendD1 > 0 ? eventosD1 : 0,
      celulasMatriz: matriz.celulas.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sendSlackMessage(`⚠️ *meta-sync falhou*: ${msg.slice(0, 400)}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
