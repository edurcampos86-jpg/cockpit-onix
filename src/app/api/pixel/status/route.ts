/**
 * GET /api/pixel/status
 * Status da integração Meta Ads. Auth: sessão (proxy padrão).
 * Não configurado responde 200 { configured: false } — o card da UI
 * mostra o estado cinza, sem erro.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config-db";
import { getMetaAdsConfig, maskPixelId } from "@/lib/integrations/meta-ads";
import { LAST_SYNC_KEY } from "@/lib/pixel/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = await getMetaAdsConfig();
  if (!cfg) {
    return NextResponse.json({ configured: false });
  }

  const ha30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [lastSyncAt, ultimoEvento, eventCount30d] = await Promise.all([
    getConfig(LAST_SYNC_KEY),
    prisma.trackingEvent.findFirst({
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    }),
    prisma.trackingEvent.count({ where: { occurredAt: { gte: ha30d } } }),
  ]);

  return NextResponse.json({
    configured: true,
    pixelId: maskPixelId(cfg.pixelId),
    lastSyncAt: lastSyncAt ?? null,
    lastEventAt: ultimoEvento?.occurredAt ?? null,
    eventCount30d,
  });
}
