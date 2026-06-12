export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config-db";
import { PageHeader } from "@/components/layout/page-header";
import { getMetaAdsConfig, maskPixelId } from "@/lib/integrations/meta-ads";
import { getFunnel, getCacMatrix, LAST_SYNC_KEY } from "@/lib/pixel/metrics";
import { PixelStatusCard } from "@/components/pixel-trafego/pixel-status-card";
import { ConversionFunnel } from "@/components/pixel-trafego/conversion-funnel";
import { PixelLeadsTable } from "@/components/pixel-trafego/pixel-leads-table";
import { CacMatrixGrid } from "@/components/pixel-trafego/cac-matrix-grid";

/* F5 Meta Ads (Fase 1). Flag própria — NAV_V2 já está ligada em prod
 * e não serve de gate pra UI nova. Flag off = 404 (rota invisível). */
const PIXEL_TRAFEGO_ON = process.env.NEXT_PUBLIC_PIXEL_TRAFEGO === "true";

export default async function PixelTrafegoPage({
  searchParams,
}: {
  searchParams: Promise<{ subpersona?: string }>;
}) {
  if (!PIXEL_TRAFEGO_ON) notFound();

  const { subpersona } = await searchParams;
  const cfg = await getMetaAdsConfig();

  const agora = new Date();
  const ha7d = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
  const ha30d = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [lastSyncAt, ultimoEvento, eventCount30d, funnel, matriz, leads] =
    await Promise.all([
      getConfig(LAST_SYNC_KEY),
      prisma.trackingEvent.findFirst({
        orderBy: { occurredAt: "desc" },
        select: { occurredAt: true },
      }),
      prisma.trackingEvent.count({ where: { occurredAt: { gte: ha30d } } }),
      getFunnel(ha7d, agora),
      getCacMatrix(),
      prisma.lead.findMany({
        where: {
          firstEventId: { not: null },
          ...(subpersona ? { sourceSubpersona: subpersona } : {}),
        },
        orderBy: { enteredAt: "desc" },
        take: 20,
        select: {
          id: true,
          name: true,
          email: true,
          stage: true,
          temperature: true,
          enteredAt: true,
          sourceSubpersona: true,
          sourceDor: true,
          sourceProjeto: true,
        },
      }),
    ]);

  const subpersonas = await prisma.lead.findMany({
    where: { sourceSubpersona: { not: null } },
    distinct: ["sourceSubpersona"],
    select: { sourceSubpersona: true },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pixel & Tráfego"
        description="Piloto de tráfego pago Meta (Instagram + Facebook) — funil, leads e CAC por sub-persona. Dados sincronizados diariamente da Marketing API."
      />
      <div className="space-y-6 px-8 pb-8">
        <PixelStatusCard
          configured={!!cfg}
          pixelId={maskPixelId(cfg?.pixelId)}
          lastSyncAt={lastSyncAt ?? null}
          lastEventAt={ultimoEvento?.occurredAt?.toISOString() ?? null}
          eventCount30d={eventCount30d}
        />
        <ConversionFunnel funnel={funnel} />
        <PixelLeadsTable
          leads={leads.map((l) => ({
            ...l,
            enteredAt: l.enteredAt.toISOString(),
          }))}
          subpersonas={subpersonas
            .map((s) => s.sourceSubpersona)
            .filter((s): s is string => !!s)}
          subpersonaAtiva={subpersona}
        />
        <CacMatrixGrid matriz={matriz} />
      </div>
    </div>
  );
}
