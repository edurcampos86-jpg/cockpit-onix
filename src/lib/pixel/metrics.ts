import "server-only";
import { prisma } from "@/lib/prisma";
import { getConfig, setConfig } from "@/lib/config-db";

/**
 * F5 Meta Ads (Fase 1) — métricas do painel Pixel & Tráfego.
 *
 * Matriz de CAC e funil calculados em Postgres; o cron meta-sync
 * pré-calcula a matriz e grava em Config (PIXEL_CAC_MATRIX) — sem
 * Redis, decisão da spec. Leitores usam o cache se fresco (<24h) e
 * caem pro cálculo on-demand caso contrário.
 */

export const CAC_MATRIX_KEY = "PIXEL_CAC_MATRIX";
export const CAC_MATRIX_AT_KEY = "PIXEL_CAC_MATRIX_AT";
export const LAST_SYNC_KEY = "PIXEL_LAST_SYNC_AT";

/* Eventos que contam como lead na ponta do funil de CAC. */
const LEAD_EVENTS = ["Lead", "CompleteRegistration", "Schedule"];

export type CacCell = {
  subpersona: string | null;
  dor: string | null;
  projeto: string | null;
  leads: number;
  custoBrl: number;
  cacBrl: number | null;
};

export type CacMatrix = {
  janelaDias: number;
  celulas: CacCell[];
  computedAt: string;
};

export async function computeCacMatrix(days = 30): Promise<CacMatrix> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const grupos = await prisma.trackingEvent.groupBy({
    by: ["subpersonaTag", "dorTag", "projetoTag"],
    where: { occurredAt: { gte: since }, eventName: { in: LEAD_EVENTS } },
    _count: { id: true },
    _sum: { costBrl: true },
  });

  const celulas: CacCell[] = grupos.map((g) => {
    const leads = g._count.id;
    const custoBrl = g._sum.costBrl ?? 0;
    return {
      subpersona: g.subpersonaTag,
      dor: g.dorTag,
      projeto: g.projetoTag,
      leads,
      custoBrl: Math.round(custoBrl * 100) / 100,
      cacBrl: leads > 0 ? Math.round((custoBrl / leads) * 100) / 100 : null,
    };
  });

  return {
    janelaDias: days,
    celulas,
    computedAt: new Date().toISOString(),
  };
}

/** Recalcula e persiste a matriz no Config DB (chamado pelo cron). */
export async function refreshCacMatrixCache(): Promise<CacMatrix> {
  const matrix = await computeCacMatrix(30);
  await setConfig(CAC_MATRIX_KEY, JSON.stringify(matrix));
  await setConfig(CAC_MATRIX_AT_KEY, matrix.computedAt);
  return matrix;
}

/** Cache se fresco (<24h); senão calcula on-demand (sem gravar — GET é read-only). */
export async function getCacMatrix(): Promise<CacMatrix & { source: "cache" | "on-demand" }> {
  const [cached, at] = await Promise.all([
    getConfig(CAC_MATRIX_KEY),
    getConfig(CAC_MATRIX_AT_KEY),
  ]);
  if (cached && at) {
    const ageMs = Date.now() - new Date(at).getTime();
    if (ageMs < 24 * 60 * 60 * 1000) {
      try {
        return { ...(JSON.parse(cached) as CacMatrix), source: "cache" };
      } catch {
        // cache corrompido — cai pro on-demand
      }
    }
  }
  const fresh = await computeCacMatrix(30);
  return { ...fresh, source: "on-demand" };
}

export type FunnelStage = {
  etapa: string;
  volume: number;
  custoMedioBrl: number | null;
};

export type Funnel = {
  from: string;
  to: string;
  spendTotalBrl: number;
  etapas: FunnelStage[];
};

/**
 * Funil: impressões/cliques dos snapshots + eventos do Pixel por etapa.
 * Custo médio = spend total da janela ÷ volume da etapa.
 */
export async function getFunnel(from: Date, to: Date): Promise<Funnel> {
  const [agg, eventos] = await Promise.all([
    prisma.adCampaignSnapshot.aggregate({
      where: { date: { gte: from, lte: to } },
      _sum: { impressions: true, clicks: true, spendBrl: true },
    }),
    prisma.trackingEvent.groupBy({
      by: ["eventName"],
      where: { occurredAt: { gte: from, lte: to } },
      _count: { id: true },
    }),
  ]);

  const spendTotal = agg._sum.spendBrl ?? 0;
  const porEvento = new Map(eventos.map((e) => [e.eventName, e._count.id]));

  const custoMedio = (volume: number): number | null =>
    volume > 0 && spendTotal > 0
      ? Math.round((spendTotal / volume) * 100) / 100
      : null;

  const ordem: Array<[string, number]> = [
    ["Impressões", agg._sum.impressions ?? 0],
    ["Cliques", agg._sum.clicks ?? 0],
    ["PageView", porEvento.get("PageView") ?? 0],
    ["Lead", porEvento.get("Lead") ?? 0],
    ["CompleteRegistration", porEvento.get("CompleteRegistration") ?? 0],
    ["Schedule", porEvento.get("Schedule") ?? 0],
  ];

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    spendTotalBrl: Math.round(spendTotal * 100) / 100,
    etapas: ordem.map(([etapa, volume]) => ({
      etapa,
      volume,
      custoMedioBrl: custoMedio(volume),
    })),
  };
}
